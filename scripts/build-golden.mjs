// Dev tool: turn rated user feedback into a golden-set draft.
// Reads questions with rating=1 (useful answers) and emits a golden JSON
// where expected files = the files the (validated) answer cited.
// Usage: node scripts/build-golden.mjs [repoId] [outFile]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const repoId = process.argv[2] ? Number(process.argv[2]) : null;
const outFile = process.argv[3] ?? 'docs/golden-from-feedback.json';

const script = `
import { getDb } from './src/storage/db.ts';
const db = getDb();
const where = ${repoId ? 'WHERE q.repo_id = ' + repoId : ''};
const rows = db.prepare(\`
  SELECT q.id, q.question, q.citations, q.rating, q.repo_id,
         (SELECT r.name FROM repositories r WHERE r.id = q.repo_id) AS repo
  FROM questions q \${where} AND q.rating = 1 ORDER BY q.id
\`).all();
console.log(JSON.stringify(rows));
`;
const res = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
  encoding: 'utf8',
  cwd: process.cwd(),
});
if (res.status !== 0) {
  console.error(res.stderr || res.stdout);
  process.exit(1);
}
const rows = JSON.parse(res.stdout.trim().split('\n').pop());

const items = rows
  .map((r) => {
    let citations;
    try {
      citations = JSON.parse(r.citations);
    } catch {
      return null;
    }
    const files = [...new Set(citations.map((c) => c.file))];
    if (!r.question || files.length === 0) return null;
    return { question: r.question, files, repo: r.repo };
  })
  .filter(Boolean);

fs.writeFileSync(outFile, JSON.stringify(items, null, 2));
console.log(`✅ ${items.length} questions with feedback written to ${outFile}`);
