'use client';

import { useState } from 'react';

export default function DeleteRepoButton({ id, name }: { id: number; name: string }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`确定删除「${name}」及其全部索引数据？`)) return;
    setBusy(true);
    try {
      await fetch(`/api/repos/${id}`, { method: 'DELETE' });
      window.location.href = '/';
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={() => void del()}
      disabled={busy}
      className="rounded-md border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950 disabled:opacity-50"
    >
      删除仓库
    </button>
  );
}
