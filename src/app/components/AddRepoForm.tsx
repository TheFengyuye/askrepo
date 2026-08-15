'use client';

import { useState } from 'react';

export default function AddRepoForm() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      setMsg({ kind: 'ok', text: `已开始索引 ${data.name}，完成后即可提问` });
      setUrl('');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="GitHub 仓库 URL 或本地路径，如 https://github.com/expressjs/express"
        disabled={busy}
        className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-cyan-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
      >
        {busy ? '提交中…' : '索引'}
      </button>
      {msg && (
        <span className={msg.kind === 'ok' ? 'self-center text-xs text-emerald-400' : 'self-center text-xs text-red-400'}>
          {msg.text}
        </span>
      )}
    </form>
  );
}
