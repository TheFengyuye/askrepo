import { getDb } from '../storage/db';
import { vectorSearch, fillPaths, type Hit } from './vectors';
import { graphSearch } from './graph';
import { expandKeywordsWithSymbols } from './expand';
import { normText } from '../indexing/norm';

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
 * Auxiliary files (tests/examples/benchmarks/changelogs/docs/config files) are
 * EXCLUDED from this path: the answer to "where is X implemented" never lives in
 * a test or a config file, and package.json/tsconfig.json/docs flood generic
 * keyword matches with common tokens (module, main, path, config). The vector
 * path still covers them (at reduced weight) for genuinely docs-oriented questions.
 */
const KW_AUX_RE =
  /(^|\/)(test|tests|__tests__|spec|e2e|examples?|benchmarks?|fixtures?|docs?)\//;
const KW_AUX_FILES = new Set([
  'History.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'package.json',
  'tsconfig.json',
  'jsconfig.json',
]);

function isKeywordAux(path: string): boolean {
  if (KW_AUX_RE.test(path) || KW_AUX_FILES.has(path)) return true;
  const base = path.split('/').pop() ?? '';
  if (/\.config\.(js|ts|mjs|cjs|json)$/.test(base)) return true;
  if (/^\.[a-z-]+rc(\.(js|json|ts))?$/.test(base)) return true;
  return false;
}

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
    (r) => !isKeywordAux(r.path as string),
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
      const lower = normText(r.content);
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

  const out = scored.slice(0, topK).map((s) => ({
    chunkId: s.r.chunk_id,
    fileId: s.r.file_id,
    path: s.r.path,
    startLine: s.r.start_line,
    endLine: s.r.end_line,
    content: s.r.content,
    symbol: s.r.symbol,
    score: s.score,
  }));

  // Path-based candidates: barrel files (index.js/printers.js/…) have little
  // content, so they never match FTS. Their PATH carries the meaning — inject
  // chunks from files whose path contains a keyword as a segment or basename.
  // index.* files of matching dirs are preferred (the dir's entry point).
  const seenIds = new Set(out.map((h) => h.chunkId));
  const escLike = (t: string) => t.replace(/[%_]/g, '\\$&');
  for (const t of tokens) {
    const rows = db
      .prepare(
        `SELECT f.id AS fid, f.path, c.id AS chunk_id, c.content, c.start_line, c.end_line, c.symbol
         FROM files f JOIN chunks c ON c.file_id = f.id
         WHERE f.repo_id = ? AND (f.path LIKE ? ESCAPE '\\' OR f.path LIKE ? ESCAPE '\\')
         ORDER BY (f.path LIKE '%/index.%') DESC, f.id, c.id
         LIMIT 60`,
      )
      .all(repoId, `%/${escLike(t)}/%`, `%/${escLike(t)}.%`) as any[];
    let injected = 0;
    const seenFiles = new Set<number>();
    for (const r of rows) {
      if (seenFiles.has(r.fid)) continue; // one chunk per file
      seenFiles.add(r.fid);
      if (seenIds.has(r.chunk_id) || isKeywordAux(r.path)) continue;
      seenIds.add(r.chunk_id);
      out.push({
        chunkId: r.chunk_id,
        fileId: r.fid,
        path: r.path,
        startLine: r.start_line,
        endLine: r.end_line,
        content: r.content,
        symbol: r.symbol,
        score: 20,
      });
      injected++;
      if (injected >= 5) break;
      if (out.length >= topK * 2) break;
    }
    if (out.length >= topK * 2) break;
  }
  return out;
}

export interface HybridOptions {
  /** Query-rewritten keywords (English symbols/terms) — enables FTS on Chinese questions. */
  keywords?: string;
  /** Max chunks allowed per file in the final list. Default 3. */
  maxPerFile?: number;
  /** Boost chunks whose symbol/path matches rewritten tokens. Default true. */
  symbolBoost?: boolean;
  /** Second keyword pass with graph-symbol expansion (pseudo-relevance feedback). Default true. */
  symbolExpand?: boolean;
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

/** Vector + keyword (+graph), RRF-fused, symbol-expanded, file-diversity-capped. */
export async function hybridSearch(
  repoId: number,
  question: string,
  topK = 8,
  opts: HybridOptions = {},
): Promise<Hit[]> {
  const { keywords, maxPerFile = 3, symbolBoost = true, symbolExpand = true } = opts;
  const db = getDb();

  // Path map is needed early for the auxiliary-file penalty.
  const pathMap = new Map<number, string>();
  for (const row of db.prepare('SELECT id, path FROM files WHERE repo_id = ?').all(repoId) as any[]) {
    pathMap.set(row.id, row.path);
  }

  /**
   * Auxiliary-file penalty: for "how/where is X implemented" questions the
   * answer lives in implementation code, not tests/examples/benchmarks/docs.
   * These paths get a lower fusion weight (a retrieval prior, not a golden-set hack).
   */
  const AUX_RE = /(^|\/)(test|tests|__tests__|spec|e2e|examples?|benchmarks?|fixtures?|docs?)\//;
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

  const rank = () => {
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
    return picked.map((s) => s.hit);
  };

  // ── Pass 1: vector + keyword + graph ───────────────────────────────
  const vec = await vectorSearch(repoId, question, topK * 3);
  let kw = keywordSearch(repoId, question, topK * 5, keywords);
  addList(vec, 1);
  addList(kw, 1.2);
  let graph = graphSearch(repoId, [...vec.slice(0, 4), ...kw.slice(0, 4)], topK * 3);
  addList(graph, 0.9);

  applyBoosts(fused, question, keywords, symbolBoost, pathMap);

  let pass1 = rank();

  // ── Pass 2: pseudo-relevance feedback via graph symbols ────────────
  if (symbolExpand) {
    const baseTokens = new Set(tokenize(keywords ?? ''));
    const syms = expandKeywordsWithSymbols(repoId, pass1).filter(
      (s) => !baseTokens.has(s.toLowerCase()),
    );
    if (syms.length > 0) {
      const kw2 = keywordSearch(repoId, question, topK * 5, `${keywords ?? ''} ${syms.join(' ')}`);
      addList(kw2, 1.0);
      applyBoosts(fused, question, `${keywords ?? ''} ${syms.join(' ')}`, symbolBoost, pathMap);
      graph = graphSearch(repoId, [...pass1.slice(0, 4), ...kw2.slice(0, 4)], topK * 3);
      addList(graph, 0.9);
      pass1 = rank();
    }
  }

  await fillPaths(repoId, pass1);
  return pass1;
}

/** Shared rank boosts: literal identifiers, path segments, basename stems, symbols. */
function applyBoosts(
  fused: Map<number, { hit: Hit; rrf: number }>,
  question: string,
  keywords: string | undefined,
  symbolBoost: boolean,
  pathMap: Map<number, string>,
): void {
  // Literal-identifier boost: chunks containing an exact identifier from the
  // RAW question (e.g. `res.json`) get a strong bump.
  const rawIds = questionIdentifiers(question);
  for (const entry of fused.values()) {
    const h = entry.hit;
    const lower = h.content.toLowerCase();
    const matched = rawIds.filter((id) => lower.includes(id));
    if (matched.length > 0) entry.rrf += 0.6 * matched.length;
  }

  if (symbolBoost && keywords) {
    const kws = tokenize(keywords);
    // Generic basename stems that would over-match (index.js/main.js/utils.js…).
    const GENERIC_STEMS = new Set([
      'index', 'main', 'utils', 'util', 'lib', 'types', 'type', 'config',
      'options', 'option', 'common', 'shared', 'test',
    ]);
    for (const entry of fused.values()) {
      const h = entry.hit;
      const p = (pathMap.get(h.fileId) ?? '').toLowerCase();
      const segments = p.split('/');
      const base = segments[segments.length - 1] ?? '';
      const baseStem = base.replace(/\.[a-z0-9]+$/, '');
      let boost = 0;
      for (const t of kws) {
        // Exact path-segment match (handles barrel files like document/builders/index.js).
        if (segments.includes(t)) boost += 1.5;
        // Dir-index bonus: keyword matches the parent dir AND this is the dir's index.*
        // (independent of the segment match above — stacks to 3.0 for dir/index files)
        if (baseStem === 'index' && segments.slice(0, -1).includes(t)) boost += 1.5;
        // Exact basename-stem match (handles core.js, multiparser.js, printers.js).
        if (baseStem === t && !GENERIC_STEMS.has(t)) boost += 1.5;
        // Symbol-name containment.
        if (h.symbol && h.symbol.toLowerCase().includes(t)) boost += 0.35;
      }
      entry.rrf += boost;
    }
  }
}
