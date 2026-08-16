import { getDb } from '../storage/db';
import type { Hit } from './vectors';

/**
 * M3 graph recall: from the symbols of the top lexical hits, follow
 * call/import edges 1 hop to find related symbols (callers/callees), then
 * resolve each related symbol to its defining chunk by line containment.
 * This surfaces cross-file causation that pure lexical/semantic retrieval
 * misses — e.g. "who calls res.json?" needs the caller, not just the definition.
 */
export function graphSearch(repoId: number, seedHits: Hit[], topK: number): Hit[] {
  const db = getDb();
  if (seedHits.length === 0) return [];

  // Collect seed symbol names: from chunk.symbol + symbols overlapping the chunk range.
  const seedNames = new Set<string>();
  for (const h of seedHits) {
    if (h.symbol) seedNames.add(h.symbol);
    const overlap = db
      .prepare(
        `SELECT DISTINCT s.name FROM symbols s
         WHERE s.repo_id = ? AND s.file_id = ? AND s.line <= ? AND s.end_line >= ? LIMIT 6`,
      )
      .all(repoId, h.fileId, h.endLine, h.startLine) as { name: string }[];
    for (const r of overlap) seedNames.add(r.name);
  }
  seedNames.delete('');
  if (seedNames.size === 0) return [];

  // 1-hop neighbors via call/import edges.
  const ph = [...seedNames].map(() => '?').join(',');
  const related = new Map<string, string>();
  const edges = db
    .prepare(
      `SELECT source_name, target_name, kind FROM symbol_edges
       WHERE repo_id = ? AND (source_name IN (${ph}) OR target_name IN (${ph})) LIMIT 400`,
    )
    .all(repoId, ...seedNames, ...seedNames) as { source_name: string; target_name: string; kind: string }[];
  for (const e of edges) {
    if (seedNames.has(e.source_name)) related.set(e.target_name, e.kind);
    if (seedNames.has(e.target_name)) related.set(e.source_name, e.kind);
  }
  for (const n of seedNames) related.delete(n);

  // Resolve each related symbol to its defining chunk (first match).
  const hits: Hit[] = [];
  for (const [name] of related) {
    if (hits.length >= topK) break;
    const syms = db
      .prepare('SELECT file_id, line FROM symbols WHERE repo_id = ? AND name = ? LIMIT 3')
      .all(repoId, name) as { file_id: number; line: number }[];
    for (const s of syms) {
      const chunk = db
        .prepare(
          `SELECT id, file_id, content, start_line, end_line, symbol FROM chunks
           WHERE repo_id = ? AND file_id = ? AND start_line <= ? AND end_line >= ? LIMIT 1`,
        )
        .get(repoId, s.file_id, s.line, s.line) as
        | { id: number; file_id: number; content: string; start_line: number; end_line: number; symbol: string | null }
        | undefined;
      if (chunk) {
        hits.push({
          chunkId: chunk.id,
          fileId: chunk.file_id,
          path: '',
          startLine: chunk.start_line,
          endLine: chunk.end_line,
          content: chunk.content,
          symbol: chunk.symbol,
          score: 1,
        });
        break;
      }
    }
  }
  return hits;
}
