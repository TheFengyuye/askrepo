import { getDb } from '../storage/db';
import { vectorSearch, fillPaths, type Hit } from './vectors';

/**
 * Hybrid retrieval: BM25-style keyword recall (SQLite FTS5) + vector recall,
 * merged with Reciprocal Rank Fusion.
 * - `keywords`: optional query-rewritten keywords (enables FTS on Chinese questions)
 * - `maxPerFile`: evidence diversity — cap chunks per file so one file can't flood the list
 * - symbol/path boost: rewritten tokens matching a chunk's symbol or path get a bonus
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'how', 'what', 'where', 'which',
  'why', 'does', 'do', 'in', 'on', 'of', 'to', 'for', 'with', 'this', 'that',
  'it', 'its', 'and', 'or', 'not', 'can', 'could', 'should', 'would', 'about',
  'from', 'by', 'at', 'as', 'be', 'been', 'being', 'has', 'have', 'had',
  'when', 'who', 'whose', 'than', 'then', 'there', 'their', 'them', 'they',
  'also', 'into', 'over', 'under', 'via', 'using', 'use', 'used', 'get', 'set',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Keyword recall with IDF-weighted coverage ranking, over IMPLEMENTATION files only.
 * FTS5 is used only as a candidate generator (OR query). Ranking is done in JS:
 * a chunk scores by the SUM OF IDF of the query tokens it contains, normalized
 * by total IDF. Rare tokens (dispatch, parseurl, initMiddleware) dominate over
 * common ones (router, app), so terse implementation files — which contain the
 * distinctive symbols — beat verbose files that only match common words.
 *
 * Auxiliary files (tests/examples/benchmarks/changelogs) are EXCLUDED from this
 * path: the answer to "where is X implemented" never lives in a test. The vector
 * path still covers them (at reduced weight) for questions genuinely about tests.
 */
const KW_AUX_RE = /(\/test\/|\/tests\/|\/__tests__\/|\/spec\/|\/examples?\/|\/benchmarks?\/|\/fixtures?\/)/;
const KW_AUX_FILES = new Set(['History.md', 'CONTRIBUTING.md', 'CHANGELOG.md']);

export function keywordSearch(repoId: number, question: string, topK: number, keywords?: string): Hit[] {
  const db = getDb();
  const tokens = tokenize(keywords ?? question);
  if (tokens.length === 0) return [];

  const esc = (t: string) => `"${t.replace(/"/g, '')}"`;
  const orQuery = tokens.map(esc).join(' OR ');
  const rows = db
    .prepare(
      `SELECT c.id AS chunk_id, c.file_id, f.path, c.content, c.start_line, c.end_line, c.symbol,
              bm25(chunks_fts) AS rank
       FROM chunks_fts
       JOIN chunks c ON c.id = chunks_fts.rowid
       JOIN files f ON f.id = c.file_id
       WHERE chunks_fts MATCH ? AND c.repo_id = ?
       ORDER BY rank
       LIMIT 4000`,
    )
    .all(orQuery, repoId) as any[];

  const pool = rows.filter(
    (r) => !KW_AUX_RE.test(r.path as string) && !KW_AUX_FILES.has(r.path as string),
  );

  // IDF per token over the whole repo.
  const total = db.prepare('SELECT count(*) AS n FROM chunks WHERE repo_id = ?').get(repoId) as { n: number };
  const N = Math.max(1, total.n);
  const idf = new Map<string, number>();
  for (const t of tokens) {
    const r = db.prepare('SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?').get(esc(t)) as {
      n: number;
    };
    idf.set(t, Math.log((N + 1) / (Math.max(1, r.n) + 1)) + 1);
  }
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0) || 1;

  const scored = pool
    .map((r) => {
      const lower = r.content.toLowerCase();
      let matched = 0;
      let sum = 0;
      for (const t of tokens) {
        if (lower.includes(t)) {
          matched++;
          sum += idf.get(t)!;
        }
      }
      return { r, score: (sum / idfSum) * 100 + Math.min(5, matched) };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((s) => ({
    chunkId: s.r.chunk_id,
    fileId: s.r.file_id,
    path: s.r.path,
    startLine: s.r.start_line,
    endLine: s.r.end_line,
    content: s.r.content,
    symbol: s.r.symbol,
    score: s.score,
  }));
}

export interface HybridOptions {
  /** Query-rewritten keywords (English symbols/terms) — enables FTS on Chinese questions. */
  keywords?: string;
  /** Max chunks allowed per file in the final list. Default 3. */
  maxPerFile?: number;
  /** Boost chunks whose symbol/path matches rewritten tokens. Default true. */
  symbolBoost?: boolean;
}

/** Extract precise identifiers from the raw question (e.g. `res.json`, `createServer`). */
function questionIdentifiers(question: string): string[] {
  const ids = question.match(/[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+|[A-Za-z_$][\w$]{3,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const lower = id.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out.slice(0, 12);
}

/** Vector + keyword, RRF-fused, file-diversity-capped. Returns top-K hits with paths filled. */
export async function hybridSearch(
  repoId: number,
  question: string,
  topK = 8,
  opts: HybridOptions = {},
): Promise<Hit[]> {
  const { keywords, maxPerFile = 3, symbolBoost = true } = opts;
  const vec = await vectorSearch(repoId, question, topK * 3);
  const kw = keywordSearch(repoId, question, topK * 5, keywords);

  // Path map is needed early for the auxiliary-file penalty.
  const db = getDb();
  const pathMap = new Map<number, string>();
  for (const row of db.prepare('SELECT id, path FROM files WHERE repo_id = ?').all(repoId) as any[]) {
    pathMap.set(row.id, row.path);
  }

  /**
   * Auxiliary-file penalty: for "how/where is X implemented" questions the
   * answer lives in implementation code, not tests/examples/benchmarks/docs.
   * These paths get a lower fusion weight (a retrieval prior, not a golden-set hack).
   */
  const AUX_RE =
    /(\/test\/|\/tests\/|\/__tests__\/|\/spec\/|\/examples?\/|\/benchmarks?\/|\/docs\/|\/fixtures?\/)/;
  const AUX_FILES = new Set(['History.md', 'CONTRIBUTING.md']);
  const auxFactor = (fileId: number): number => {
    const p = pathMap.get(fileId) ?? '';
    return AUX_RE.test(p) || AUX_FILES.has(p) ? 0.35 : 1;
  };

  const fused = new Map<number, { hit: Hit; rrf: number }>();
  const addList = (list: Hit[], weight: number) => {
    list.forEach((h, idx) => {
      const entry = fused.get(h.chunkId) ?? { hit: h, rrf: 0 };
      entry.rrf += (weight * auxFactor(h.fileId)) / (60 + idx);
      fused.set(h.chunkId, entry);
    });
  };
  addList(vec, 1);
  addList(kw, 1.2);

  // Literal-identifier boost: chunks containing an exact identifier from the
  // RAW question (e.g. `res.json`) get a strong bump. Rewritten keywords can
  // be too generic ("json" also matches res.format), but the raw symbol is precise.
  const rawIds = questionIdentifiers(question);
  for (const entry of fused.values()) {
    const h = entry.hit;
    const lower = h.content.toLowerCase();
    const matched = rawIds.filter((id) => lower.includes(id));
    if (matched.length > 0) entry.rrf += 0.6 * matched.length;
  }

  if (symbolBoost && keywords) {
    const kws = tokenize(keywords);
    for (const entry of fused.values()) {
      const h = entry.hit;
      const haystack = `${h.symbol ?? ''} ${pathMap.get(h.fileId) ?? ''}`.toLowerCase();
      if (kws.some((t) => haystack.includes(t))) entry.rrf += 0.35;
    }
  }

  const sorted = [...fused.values()].sort((a, b) => b.rrf - a.rrf);
  const picked: { hit: Hit; rrf: number }[] = [];
  const perFile = new Map<number, number>();
  for (const s of sorted) {
    const n = perFile.get(s.hit.fileId) ?? 0;
    if (n >= maxPerFile) continue;
    perFile.set(s.hit.fileId, n + 1);
    picked.push(s);
    if (picked.length >= topK) break;
  }

  const hits = picked.map((s) => s.hit);
  await fillPaths(repoId, hits);
  return hits;
}
