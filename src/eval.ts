import fs from 'node:fs';
import { resolveRepo } from './repo';
import { hybridSearch } from './retrieval/search';
import { rewriteQuestion } from './retrieval/rewrite';
import { generateAnswer } from './answer';

export interface GoldenItem {
  question: string;
  /** Expected files (or file:line) the answer should cite. */
  files: string[];
  note?: string;
}

export interface EvalOptions {
  mode: 'retrieval' | 'answer';
  topK: number;
}

function pathMatch(expected: string, actualPaths: string[]): boolean {
  const p = expected.split(':')[0]!;
  return actualPaths.some((cp) => cp === p || cp.endsWith(`/${p}`));
}

/**
 * Golden-set eval.
 * - retrieval mode (default): hit = expected file appears in top-K retrieved evidence (no API key needed)
 * - answer mode (--answer): additionally run LLM answer and check citations
 */
export async function runEval(repoRef: string, goldenFile: string, opts: EvalOptions): Promise<void> {
  const repo = resolveRepo(repoRef);
  const items = JSON.parse(fs.readFileSync(goldenFile, 'utf8')) as GoldenItem[];
  console.log(`Running ${items.length} eval questions on ${repo.name} (mode=${opts.mode}, topK=${opts.topK})\n`);

  let rewriting = false;
  try {
    await rewriteQuestion('probe'); // will throw when DEEPSEEK_API_KEY missing
    rewriting = true;
  } catch {
    rewriting = false;
  }
  if (!rewriting) {
    console.log('⚠  DEEPSEEK_API_KEY not set — running WITHOUT query rewriting (expected hit rate will be lower).\n');
  }

  let retrievalHits = 0;
  let citationHits = 0;
  for (const item of items) {
    const keywords = rewriting ? await rewriteQuestion(item.question) : undefined;
    const evidence = await hybridSearch(repo.id, item.question, opts.topK, { keywords });
    const retrievedPaths = evidence.map((h) => h.path);
    const retrievalHit = item.files.some((f) => pathMatch(f, retrievedPaths));
    if (keywords) console.log(`   keywords: ${keywords.slice(0, 140)}`);

    let citations: { file: string; line: number | null }[] = [];
    if (opts.mode === 'answer') {
      const { answer, citations: cits } = await generateAnswer(item.question, evidence);
      citations = cits;
      const citedPaths = citations.map((c) => c.file);
      if (item.files.some((f) => pathMatch(f, citedPaths))) citationHits++;
      console.log(`${retrievalHit ? '🟢' : '🔴'} ${item.question}`);
      console.log(`   expected: ${item.files.join(', ')}`);
      console.log(`   retrieved: ${retrievedPaths.slice(0, 3).join(', ') || '(none)'}`);
      console.log(`   cited: ${citedPaths.join(', ') || '(none)'}`);
      console.log(`   answer: ${answer.slice(0, 220).replace(/\n/g, ' ')}`);
    } else {
      if (retrievalHit) retrievalHits++;
      console.log(`${retrievalHit ? '🟢' : '🔴'} ${item.question}`);
      console.log(`   expected: ${item.files.join(', ')}`);
      console.log(`   retrieved: ${retrievedPaths.slice(0, 3).join(', ') || '(none)'}`);
    }
    console.log('');
  }

  const rRate = (retrievalHits / items.length) * 100;
  console.log(`Retrieval hit rate: ${retrievalHits}/${items.length} = ${rRate.toFixed(0)}% (top-${opts.topK} evidence)`);
  if (opts.mode === 'answer') {
    const cRate = (citationHits / items.length) * 100;
    console.log(`Citation hit rate:  ${citationHits}/${items.length} = ${cRate.toFixed(0)}%`);
  }
}
