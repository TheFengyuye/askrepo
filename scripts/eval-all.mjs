// Dev tool: run all golden evals and write docs/EVAL.md with the results.
// Usage: node scripts/eval-all.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const CASES = [
  ['express', 'docs/golden-express.json'],
  ['askrepo', 'docs/golden-askrepo.json'],
  ['demo-lib', 'docs/golden-demo-lib.json'],
  ['prettier', 'docs/golden-prettier.json'],
];

function runEval(repo, golden) {
  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', 'eval', repo, golden],
    { encoding: 'utf8', cwd: process.cwd() },
  );
  return { out: res.stdout || '', err: res.stderr || '' };
}

let table = '| 仓库 | 检索命中率 (top-8) | 说明 |\n|---|---|---|\n';
const sections = [];

for (const [repo, golden] of CASES) {
  const { out, err } = runEval(repo, golden);
  const m = out.match(/Retrieval hit rate: [^\n]+/);
  const rate = m ? m[0].replace('Retrieval hit rate: ', '').replace(' (top-8 evidence)', '') : 'N/A';
  table += `| ${repo} | ${rate} | [${golden}] |\n`;
  sections.push(`### ${repo}\n\n\`\`\`\n${out}${err}\n\`\`\`\n`);
}

const md = `# AskRepo 检索质量评测

> 由 \`npm run eval:all\` 自动生成（改写器为非确定性 LLM，数字存在运行间波动）。
> 评测方法：golden set 每题命中判定 = 期望文件出现在 top-8 检索证据中（任一匹配即命中）。

${table}

## 单次运行明细

${sections.join('\n')}
`;

fs.writeFileSync('docs/EVAL.md', md);
console.log('✅ docs/EVAL.md written');
console.log(table);
