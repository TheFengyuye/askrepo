import { getDb } from '@/storage/db';
import StatusBadge from '../../components/StatusBadge';
import DeleteRepoButton from '../../components/DeleteRepoButton';

export const dynamic = 'force-dynamic';

export default async function RepoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(Number(id)) as
    | {
        id: number;
        name: string;
        url: string;
        status: string;
        error: string | null;
        file_count: number;
        chunk_count: number;
        created_at: string;
      }
    | undefined;

  if (!repo) {
    return <p className="text-slate-400">仓库不存在。</p>;
  }
  const languages = db
    .prepare('SELECT language, count(*) AS n FROM files WHERE repo_id = ? GROUP BY language ORDER BY n DESC LIMIT 8')
    .all(repo.id) as { language: string; n: number }[];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <a href="/" className="text-xs text-slate-400 hover:text-white">
            ← 仓库列表
          </a>
          <h1 className="mt-1 flex items-center gap-2 font-mono text-xl font-bold">
            {repo.name} <StatusBadge status={repo.status} />
          </h1>
          <p className="mt-1 text-xs text-slate-500">{repo.url}</p>
        </div>
        <div className="flex items-center gap-2">
          {repo.status === 'ready' && (
            <a
              href={`/chat/${repo.id}`}
              className="rounded-md bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-500"
            >
              去问答
            </a>
          )}
          <DeleteRepoButton id={repo.id} name={repo.name} />
        </div>
      </div>

      {repo.error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">
          {repo.error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '文件数', value: repo.file_count },
          { label: 'Chunks', value: repo.chunk_count },
          { label: '索引时间', value: repo.created_at },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className="mt-1 text-lg font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      {languages.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs text-slate-400">语言分布</div>
          <div className="flex flex-wrap gap-1.5">
            {languages.map((l) => (
              <span key={l.language} className="rounded bg-slate-800 px-2 py-1 font-mono text-[11px] text-slate-300">
                {l.language} × {l.n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
