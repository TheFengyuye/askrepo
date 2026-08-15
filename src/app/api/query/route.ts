import { NextResponse } from 'next/server';
import { getDb } from '@/storage/db';
import { getConfig } from '@/config';
import { rewriteQuestion } from '@/retrieval/rewrite';
import { hybridSearch } from '@/retrieval/search';
import { buildPrompt, parseCitations } from '@/answer';
import { DeepSeekProvider } from '@/llm/deepseek';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/query — grounded Q&A over SSE:
 *   data: {"type":"keywords","keywords":"..."}
 *   data: {"type":"delta","d":"..."}          (repeated)
 *   data: {"type":"done","answer":"...","citations":[...],"evidence":[...],"questionId":N,"latencyMs":N}
 *   data: {"type":"error","message":"..."}
 */
export async function POST(req: Request): Promise<Response> {
  let body: { repoId?: unknown; question?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const repoId = Number(body.repoId);
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!Number.isInteger(repoId) || !question) {
    return NextResponse.json({ error: 'repoId and question required' }, { status: 400 });
  }
  const repo = getDb().prepare('SELECT id, name FROM repositories WHERE id = ?').get(repoId) as
    | { id: number; name: string }
    | undefined;
  if (!repo) return NextResponse.json({ error: 'repo not found' }, { status: 404 });
  if (!getConfig().deepseekApiKey) {
    return NextResponse.json({ error: 'DEEPSEEK_API_KEY is not set (see .env)' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const started = Date.now();
      try {
        const keywords = await rewriteQuestion(question);
        send({ type: 'keywords', keywords });
        const evidence = await hybridSearch(repoId, question, 8, { keywords });
        const { system, user } = buildPrompt(question, evidence);
        const provider = new DeepSeekProvider();
        let full = '';
        for await (const delta of await provider.chatStream([
          { role: 'system', content: system },
          { role: 'user', content: user },
        ])) {
          full += delta;
          send({ type: 'delta', d: delta });
        }
        const citations = parseCitations(full, evidence);
        const latencyMs = Date.now() - started;
        const info = getDb()
          .prepare(
            'INSERT INTO questions (repo_id, question, answer, citations, latency_ms, model) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(repoId, question, full, JSON.stringify(citations), latencyMs, getConfig().deepseekModel);
        send({
          type: 'done',
          answer: full,
          citations,
          questionId: Number(info.lastInsertRowid),
          latencyMs,
          evidence: evidence.map((e) => ({ path: e.path, startLine: e.startLine, endLine: e.endLine })),
        });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
