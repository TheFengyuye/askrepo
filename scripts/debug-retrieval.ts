/**
 * Dev tool: dump per-path (vector / keyword / hybrid) rankings for one question.
 * Usage: npx tsx scripts/debug-retrieval.ts <repo> <question...>
 */
import { resolveRepo } from '../src/repo.js';
import { vectorSearch, fillPaths } from '../src/retrieval/vectors.js';
import { keywordSearch } from '../src/retrieval/search.js';
import { rewriteQuestion } from '../src/retrieval/rewrite.js';

const repo = resolveRepo(process.argv[2]!);
const question = process.argv.slice(3).join(' ');

console.log(`Question: ${question}\n`);
const keywords = await rewriteQuestion(question);
console.log(`keywords: ${keywords}\n`);

const vec = await vectorSearch(repo.id, question, 10);
await fillPaths(repo.id, vec);
console.log('— vector top 10 —');
vec.forEach((h, i) => console.log(`  ${i + 1}. ${h.path}:${h.startLine}  (${h.score.toFixed(3)})`));

const kw = keywordSearch(repo.id, question, 20, keywords);
await fillPaths(repo.id, kw);
console.log('\n— keyword top 20 (IDF coverage) —');
kw.forEach((h, i) => console.log(`  ${i + 1}. ${h.path}:${h.startLine}  (${h.score.toFixed(2)})`));

// Raw bm25 ranking over a large pool, to see where implementation files sit.
{
  const db = (await import('../src/storage/db.js')).getDb();
  const esc = (t: string) => `"${t.replace(/"/g, '')}"`;
  const tokens = keywords.split(/[^a-z0-9_$]+/).filter((t) => t.length >= 2);
  const orQuery = tokens.map(esc).join(' OR ');
  const rows = db
    .prepare(
      `SELECT c.id AS chunk_id, c.file_id, f.path, c.start_line, bm25(chunks_fts) AS rank
       FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
       JOIN files f ON f.id = c.file_id
       WHERE chunks_fts MATCH ? AND c.repo_id = ?
       ORDER BY rank LIMIT 2000`,
    )
    .all(orQuery, repo.id) as any[];
  const libRows = rows.filter((r) => (r.path as string).startsWith('lib/'));
  console.log(`\n— raw bm25: lib/ files within top-2000 (${libRows.length}) —`);
  libRows.slice(0, 12).forEach((r, i) => console.log(`  ${i + 1}. ${r.path}:${r.start_line}  (rank ${r.rank.toFixed(1)})`));
  const histRows = rows.filter((r) => (r.path as string) === 'History.md').length;
  const testRows = rows.filter((r) => (r.path as string).startsWith('test/')).length;
  console.log(`  History.md rows in pool: ${histRows}, test/ rows in pool: ${testRows}, total pool: ${rows.length}`);
}
