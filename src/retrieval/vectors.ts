import { getDb } from '../storage/db';
import { embedTexts } from '../indexing/embed';

export interface Hit {
  chunkId: number;
  fileId: number;
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  symbol: string | null;
  score: number;
}

/**
 * Vector recall: embed the question, then exact cosine over the repo's
 * stored vectors. M1 scale (≤ ~100k chunks) is fine in memory; M2 swaps
 * this for pgvector HNSW.
 */
export async function vectorSearch(repoId: number, question: string, topK: number): Promise<Hit[]> {
  const db = getDb();
  const [qvec] = await embedTexts([question]);
  const rows = db
    .prepare(
      'SELECT id, file_id, content, start_line, end_line, symbol, embedding FROM chunks WHERE repo_id = ?',
    )
    .all(repoId) as any[];

  const scored: { hit: Hit; score: number }[] = [];
  for (const r of rows) {
    if (!r.embedding) continue;
    const buf = Buffer.from(r.embedding);
    const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    let dot = 0;
    for (let i = 0; i < vec.length; i++) dot += vec[i] * qvec[i]!;
    scored.push({
      hit: {
        chunkId: r.id,
        fileId: r.file_id,
        path: '',
        startLine: r.start_line,
        endLine: r.end_line,
        content: r.content,
        symbol: r.symbol,
        score: dot,
      },
      score: dot,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.hit);
}

export async function fillPaths(repoId: number, hits: Hit[]): Promise<void> {
  const db = getDb();
  const paths = new Map<number, string>();
  for (const row of db.prepare('SELECT id, path FROM files WHERE repo_id = ?').all(repoId) as any[]) {
    paths.set(row.id, row.path);
  }
  for (const h of hits) h.path = paths.get(h.fileId) ?? '';
}
