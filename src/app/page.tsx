import { getDb } from '@/storage/db';
import AddRepoForm from './components/AddRepoForm';
import StatusBadge from './components/StatusBadge';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const repos = getDb()
    .prepare(
      'SELECT id, name, url, status, error, file_count, chunk_count FROM repositories ORDER BY id DESC',
    )
    .all() as {
    id: number;
    name: string;
    url: string;
    status: string;
    error: string | null;
    file_count: number;
    chunk_count: number;
  }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">代码库智能问答</h1>
        <p className="mt-1 text-sm text-slate-400">
          索引任意 GitHub 仓库，用自然语言提问，回答带文件级引用和调用链证据。
        </p>
      </div>

      <AddRepoForm />

      {repos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 p-10 text-center text-slate-500">
          还没有索引任何仓库，先在上方添加一个吧
        </p>
      ) : (
        <div className="grid gap-3">
          {repos.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-sm">{r.name}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">{r.url}</div>
                {r.error && (
                  <div className="mt-1 truncate text-xs text-red-400" title={r.error}>
                    {r.error.slice(0, 140)}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs text-slate-400">
                <span>
                  {r.file_count} 文件 · {r.chunk_count} chunks
                </span>
                {r.status === 'ready' && (
                  <a
                    href={`/chat/${r.id}`}
                    className="rounded-md bg-cyan-600 px-3 py-1.5 font-medium text-white hover:bg-cyan-500"
                  >
                    问答
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
