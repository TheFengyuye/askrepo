'use client';

import { useEffect, useState } from 'react';

export default function FileViewer({
  repoId,
  path,
  highlights,
  onClose,
}: {
  repoId: number;
  path: string;
  highlights: number[];
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    fetch(`/api/repos/${repoId}/file?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setContent(d.content);
      })
      .catch((e) => setError(String(e)));
  }, [repoId, path]);

  const lines = content?.split('\n') ?? [];
  const hl = new Set(highlights);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex h-[80vh] w-[92vw] max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
          <span className="truncate font-mono text-xs text-slate-300">{path}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        {error ? (
          <div className="p-6 text-sm text-red-400">{error}</div>
        ) : !content ? (
          <div className="p-6 text-sm text-slate-500">加载中…</div>
        ) : (
          <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-5">
            {lines.map((l, i) => (
              <div key={i} className={hl.has(i + 1) ? 'bg-cyan-500/20' : ''}>
                <span className="mr-3 inline-block w-8 select-none text-right text-slate-600">{i + 1}</span>
                {l || ' '}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
