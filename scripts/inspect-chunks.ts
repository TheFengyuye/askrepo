/**
 * Dev tool: inspect indexed files / chunk contents.
 * Usage:
 *   npx tsx scripts/inspect-chunks.ts files <path-substr>   — list indexed files
 *   npx tsx scripts/inspect-chunks.ts chunks <path-substr> [limit] — show chunk heads
 */
import { getDb } from '../src/storage/db.js';

const db = getDb();
const mode = process.argv[2] ?? 'chunks';
const match = process.argv[3] ?? 'lib/router/index.js';

if (mode === 'files') {
  const rows = db
    .prepare(
      `SELECT f.id, f.path, f.size_bytes, (SELECT count(*) FROM chunks c WHERE c.file_id = f.id) AS chunks
       FROM files f WHERE f.path LIKE ? ORDER BY f.path LIMIT 60`,
    )
    .all(`%${match}%`) as any[];
  console.log(`Files matching "${match}": ${rows.length}`);
  for (const r of rows) console.log(`  ${r.id}  ${r.chunks} chunks  ${r.path}`);
} else {
  const limit = Number(process.argv[4] ?? 6);
  const rows = db
    .prepare(
      `SELECT c.id, f.path, c.start_line, c.end_line, substr(c.content, 1, 300) AS head
       FROM chunks c JOIN files f ON f.id = c.file_id
       WHERE f.path LIKE ? LIMIT ?`,
    )
    .all(`%${match}%`, limit) as any[];
  console.log(`Chunks matching "${match}": showing ${rows.length}`);
  for (const r of rows) {
    console.log(`--- ${r.path} chunk ${r.id} (lines ${r.start_line}-${r.end_line})`);
    console.log(r.head.replace(/\n/g, ' ⏎ '));
    console.log('');
  }
}
