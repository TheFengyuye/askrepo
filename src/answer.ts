import type { Hit } from './retrieval/vectors';
import { DeepSeekProvider } from './llm/deepseek';
import type { LLMProvider } from './llm/provider';

export interface Citation {
  file: string;
  line: number | null;
}

export interface AnswerResult {
  answer: string;
  citations: Citation[];
  latencyMs: number;
}

/** Matches [file], [file:line], and [file:start-end] citation forms. */
const CITE_RE = /\[([^\[\]\s:]+)(?::(\d+)(?:-\d+)?)?\]/g;

/** Build the grounded-answer prompt (shared by CLI, eval and the web API). */
export function buildPrompt(question: string, evidence: Hit[]): { system: string; user: string } {
  const evidenceBlock = evidence
    .map(
      (h, i) =>
        `[${i}] ${h.path}:${h.startLine}-${h.endLine}\n\`\`\`\n${truncate(h.content, 4000)}\n\`\`\``,
    )
    .join('\n\n');

  const system =
    'You are AskRepo, a codebase Q&A assistant. Answer the user\'s question about a codebase using ONLY the evidence snippets provided.\n' +
    'Rules:\n' +
    '1. Base your answer strictly on the evidence. If the evidence is insufficient to answer, state that clearly.\n' +
    '2. Whenever you reference a specific location, cite it inline as [path:line] (e.g. [src/app.ts:42]). Only cite paths that appear in the evidence.\n' +
    '3. Explain the how and why, not just "it is in file X".\n' +
    '4. Answer in the same language as the question.';

  const user = `Evidence:\n${evidenceBlock}\n\nQuestion: ${question}\n\nAnswer:`;
  return { system, user };
}

/** Grounded answer generation: evidence → LLM → answer with validated citations. */
export async function generateAnswer(
  question: string,
  evidence: Hit[],
  provider: LLMProvider = new DeepSeekProvider(),
): Promise<AnswerResult> {
  const started = Date.now();
  const { system, user } = buildPrompt(question, evidence);
  const res = await provider.chat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);

  return {
    answer: res.content,
    citations: parseCitations(res.content, evidence),
    latencyMs: Date.now() - started,
  };
}

/** Extract [path:line] citations and keep only those grounded in the evidence. */
export function parseCitations(answer: string, evidence: Hit[]): Citation[] {
  const validPaths = new Set(evidence.map((h) => h.path));
  const out: Citation[] = [];
  for (const m of answer.matchAll(CITE_RE)) {
    const file = m[1]!;
    const line = m[2] ? Number(m[2]) : null;
    const grounded = validPaths.has(file) || [...validPaths].some((p) => p.endsWith(`/${file}`));
    if (grounded) out.push({ file, line });
  }
  return out.filter(
    (c, i, arr) => arr.findIndex((x) => x.file === c.file && x.line === c.line) === i,
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}\n…` : s;
}
