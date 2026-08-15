import { getDb } from '../storage/db.js';
import { vectorSearch, fillPaths, type Hit } from './vectors.js';

/**
 * Hybrid retrieval: BM25-style keyword recall (SQLite FTS5) + vector recall,
 * merged with Reciprocal Rank Fusion. Full BM25 + code-graph recall arrive in M3.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'how', 'what', 'where', 'which',
  'why', 'does', 'do', 'in', 'on', 'of', 'to', 'for', 'with', 'this', 'that',
  'it', 'its', 'and', 'or', 'not', 'can', 'could', 'should', 'would', 'about',
  'from', 'by', 'at', 'as', 'be', 'been', 'being', 'has', 'have', 'had',
]);

export function keywordSearch(repoId: number, question: string, topK: number): Hit[] {
  const db = getDb();
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  if (tokens.length === 0) return [];

  const query = tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
  const rows = db
    .prepare(
      `SELECT c.id AS chunk_id, c.file_id, c.content, c.start_line, c.end_line, c.symbol,
              bm25(chunks_fts) AS rank
       FROM chunks_fts
       JOIN chunks c ON c.id = chunks_fts.rowid
       WHERE chunks_fts MATCH ? AND c.repo_id = ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(query, repoId, topK) as any[];

  return rows.map((r) => ({
    chunkId: r.chunk_id,
    fileId: r.file_id,
    path: '',
    startLine: r.start_line,
    endLine: r.end_line,
    content: r.content,
    symbol: r.symbol,
    score: -(r.rank as number), // bm25() is negative; smaller = better
  }));
}

/** Vector + keyword, RRF-fused. Returns top-K hits with paths filled. */
export async function hybridSearch(repoId: number, question: string, topK = 8): Promise<Hit[]> {
  const vec = await vectorSearch(repoId, question, topK * 3);
  const kw = keywordSearch(repoId, question, topK * 3);

  const fused = new Map<number, { hit: Hit; rrf: number }>();
  const addList = (list: Hit[], weight: number) => {
    list.forEach((h, idx) => {
      const entry = fused.get(h.chunkId) ?? { hit: h, rrf: 0 };
      entry.rrf += weight / (60 + idx);
      fused.set(h.chunkId, entry);
    });
  };
  addList(vec, 1);
  addList(kw, 1.2);

  const sorted = [...fused.values()].sort((a, b) => b.rrf - a.rrf).slice(0, topK);
  const hits = sorted.map((s) => s.hit);
  await fillPaths(repoId, hits);
  return hits;
}
