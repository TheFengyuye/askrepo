import { getDb } from './storage/db';
import { indexRepository } from './indexing/indexer';
import { hybridSearch } from './retrieval/search';
import { agenticRetrieval } from './agent/loop';
import { rewriteQuestion } from './retrieval/rewrite';
import { generateAnswer } from './answer';
import { resolveRepo, removeRepo } from './repo';
import { runEval } from './eval';
import { getConfig } from './config';

function usage(): never {
  console.log(
    `AskRepo — codebase Q&A (M1 CLI)

Usage:
  askrepo add <url|local-path>        Clone + index a repository
  askrepo list                        List indexed repositories
  askrepo ask <repo> <question...>    Ask a question (needs DEEPSEEK_API_KEY)
  askrepo search <repo> <q...> [k]    Retrieval only, no LLM (debug/eval)
  askrepo eval <repo> <golden.json>   Run golden-set eval, print hit rate
`,
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case 'add': {
      const url = args[0];
      if (!url) usage();
      console.log(`Indexing ${url} …`);
      const started = Date.now();
      const r = await indexRepository(url);
      console.log(
        `✅ ${r.fileCount} files → ${r.chunkCount} chunks in ${((Date.now() - started) / 1000).toFixed(1)}s` +
          (r.cloned ? '' : ' (reused existing clone)'),
      );
      break;
    }

    case 'list': {
      const rows = getDb()
        .prepare(
          'SELECT id, name, status, file_count AS files, chunk_count AS chunks, error FROM repositories ORDER BY id',
        )
        .all();
      if (rows.length === 0) {
        console.log('No repositories indexed yet. Try: askrepo add <github-url>');
      } else {
        console.table(rows);
      }
      break;
    }

    case 'ask': {
      const repoRef = args[0];
      const question = args.slice(1).join(' ');
      if (!repoRef || !question) usage();
      const repo = resolveRepo(repoRef);
      const cfg = getConfig();
      if (!cfg.deepseekApiKey) {
        console.error(
          'DEEPSEEK_API_KEY not set. Copy .env.example to .env and add your key from https://platform.deepseek.com',
        );
        process.exit(1);
      }
      console.log(`\nQ: ${question}\n`);
      const keywords = await rewriteQuestion(question);
      const { hits: evidence, trace } = await agenticRetrieval(repo.id, question, keywords, { maxHops: 3 });
      if (trace.length > 0) {
        console.log(`(检索过程: ${trace.map((t) => `hop${t.hop} ${t.action}`).join(' → ')})`);
      }
      const { answer, citations, latencyMs } = await generateAnswer(question, evidence);
      console.log(answer);
      console.log(`\n— cited ${citations.length} grounded locations (${latencyMs}ms)`);
      for (const c of citations) {
        console.log(`  ${c.file}${c.line ? `:${c.line}` : ''}`);
      }
      break;
    }

    case 'search': {
      const repoRef = args[0];
      const rest = args.slice(1);
      const k = Number(rest[rest.length - 1]);
      const question = Number.isFinite(k) && rest.length > 1 ? rest.slice(0, -1).join(' ') : rest.join(' ');
      const topK = Number.isFinite(k) ? k : 8;
      if (!repoRef || !question) usage();
      const repo = resolveRepo(repoRef);
      const hits = await hybridSearch(repo.id, question, topK);
      console.log(`Top ${hits.length} evidence for: "${question}"\n`);
      hits.forEach((h, i) => {
        console.log(
          `[${i + 1}] ${h.path}:${h.startLine}-${h.endLine}  (score ${h.score.toFixed(3)})${h.symbol ? `  <${h.symbol}>` : ''}`,
        );
        console.log(`    ${h.content.slice(0, 120).replace(/\n/g, ' ')}`);
      });
      break;
    }

    case 'remove': {
      const repoRef = args[0];
      if (!repoRef) usage();
      const repo = removeRepo(repoRef);
      console.log(`Removed ${repo.name} and all its data.`);
      break;
    }

    case 'eval': {
      const repoRef = args[0];
      const rest = args.slice(1);
      const goldenFile = rest.find((a) => !a.startsWith('--'));
      const mode = rest.includes('--answer') ? 'answer' : 'retrieval';
      const topKArg = rest.find((a) => a.startsWith('--topk='));
      const topK = topKArg ? Number(topKArg.split('=')[1]) || 8 : 8;
      if (!repoRef || !goldenFile) usage();
      await runEval(repoRef, goldenFile, { mode, topK });
      break;
    }

    default:
      usage();
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
