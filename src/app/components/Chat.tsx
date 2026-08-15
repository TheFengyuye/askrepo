'use client';

import { useRef, useState } from 'react';
import FileViewer from './FileViewer';
import type { Citation, EvidenceRef } from '@/lib/types';

interface DonePayload {
  citations: Citation[];
  evidence: EvidenceRef[];
  questionId: number;
  latencyMs: number;
}

export default function Chat({ repoId, repoName }: { repoId: number; repoName: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [questionId, setQuestionId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [viewer, setViewer] = useState<{ path: string; lines: number[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setAnswer('');
    setCitations([]);
    setEvidence([]);
    setQuestionId(null);
    setFeedback(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId, question: q }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text.slice(0, 300));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.type === 'delta') {
            setAnswer((prev) => prev + payload.d);
          } else if (payload.type === 'done') {
            const done = payload as DonePayload;
            setCitations(done.citations);
            setEvidence(done.evidence);
            setQuestionId(done.questionId);
          } else if (payload.type === 'error') {
            setAnswer((prev) => `${prev}\n\n[错误] ${payload.message}`);
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setAnswer((prev) => `${prev}\n\n[请求失败] ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function sendFeedback(rating: 1 | -1) {
    if (!questionId) return;
    setFeedback(rating === 1 ? 'up' : 'down');
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, rating }),
      });
    } catch {
      // ignore feedback network errors
    }
  }

  function openCitation(c: Citation) {
    const ev = evidence.find((e) => e.path === c.file);
    const lines = c.line ? [c.line] : ev ? [ev.startLine] : [];
    setViewer({ path: c.file, lines });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <a href="/" className="text-xs text-slate-400 hover:text-white">
          ← 仓库列表
        </a>
        <h1 className="mt-1 truncate font-mono text-xl font-bold">{repoName}</h1>
      </div>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
          placeholder="问这个代码库：例如「请求进来后是怎么被路由分发的？」"
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        {busy ? (
          <button onClick={stop} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">
            停止
          </button>
        ) : (
          <button
            onClick={() => void ask()}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
          >
            提问
          </button>
        )}
      </div>

      {answer && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <AnswerRenderer text={answer} citations={citations} onCite={openCitation} />

          {citations.length > 0 && (
            <div className="mt-4 border-t border-slate-800 pt-3">
              <div className="mb-1.5 text-xs text-slate-400">引用（点击查看源码）</div>
              <div className="flex flex-wrap gap-1.5">
                {citations.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => openCitation(c)}
                    className="rounded bg-slate-800 px-2 py-1 font-mono text-[11px] text-cyan-300 hover:bg-slate-700"
                  >
                    {c.file}
                    {c.line ? `:${c.line}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {questionId && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              这个回答有用吗？
              <button
                onClick={() => void sendFeedback(1)}
                className={feedback === 'up' ? 'text-emerald-400' : 'hover:text-white'}
              >
                👍 有用
              </button>
              <button
                onClick={() => void sendFeedback(-1)}
                className={feedback === 'down' ? 'text-red-400' : 'hover:text-white'}
              >
                👎 没用
              </button>
            </div>
          )}
        </div>
      )}

      {viewer && (
        <FileViewer repoId={repoId} path={viewer.path} highlights={viewer.lines} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

/** Minimal markdown-lite renderer: code fences + inline citations. */
function AnswerRenderer({
  text,
  citations,
  onCite,
}: {
  text: string;
  citations: Citation[];
  onCite: (c: Citation) => void;
}) {
  const blocks = text.split(/```/);
  return (
    <div className="space-y-3 text-sm leading-6">
      {blocks.map((b, i) => {
        if (i % 2 === 1) {
          const nl = b.indexOf('\n');
          const lang = nl >= 0 ? b.slice(0, nl).trim() : '';
          const code = nl >= 0 ? b.slice(nl + 1) : b;
          return (
            <pre key={i} className="overflow-x-auto rounded-md bg-black/50 p-3 font-mono text-xs leading-5">
              {lang && <div className="mb-1 text-[10px] uppercase text-slate-500">{lang}</div>}
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(b, citations, onCite)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string, citations: Citation[], onCite: (c: Citation) => void): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\[([^\[\]\s:]+)(?::(\d+))?\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    const file = m[1]!;
    const line = m[2] ? Number(m[2]) : null;
    const cit = citations.find((c) => c.file === file && (line == null || c.line === line)) ?? {
      file,
      line,
    };
    parts.push(
      <button
        key={k++}
        onClick={() => onCite(cit)}
        className="mx-0.5 rounded bg-cyan-500/15 px-1 font-mono text-[11px] text-cyan-300 hover:bg-cyan-500/30"
      >
        [{file}
        {line ? `:${line}` : ''}]
      </button>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}
