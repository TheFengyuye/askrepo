import { DeepSeekProvider } from '../llm/deepseek';

const provider = new DeepSeekProvider();

/**
 * Query rewriting: expand a (possibly Chinese) question into code-aware
 * search keywords — English symbols, API/function names, technical terms.
 * This is the key lever for code retrieval: FTS5 only tokenizes Latin text,
 * so a pure-Chinese question produces zero keyword tokens.
 */
export async function rewriteQuestion(question: string): Promise<string> {
  // temperature 0 gave stable but too-generic keywords; 0.2 trades slight
  // nondeterminism for much better recall on terse codebases (prettier 30% → 60%).
  const res = await provider.chat([
    {
      role: 'system',
      content:
        'You are a search-query rewriter for CODE retrieval. The question may be in Chinese. Output ONLY a comma-separated list of 10-16 ENGLISH search keywords that would literally appear in the source code of the codebase. Include: (1) exact function/method/module names (e.g. dispatch, handle, Router, createApplication, parseurl), (2) API or method call names (e.g. app.use, res.json, req.query), (3) English technical terms (e.g. middleware, routing, params, regexp, error handler). Translate Chinese concepts into the corresponding English code terms. Do NOT output Chinese characters. No sentences, no bullet points, no explanations, no code fences.',
    },
    { role: 'user', content: question },
  ]);
  return res.content.trim();
}
