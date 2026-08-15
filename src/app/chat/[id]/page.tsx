import { getDb } from '@/storage/db';
import Chat from '../../components/Chat';

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = getDb().prepare('SELECT id, name, status FROM repositories WHERE id = ?').get(Number(id)) as
    | { id: number; name: string; status: string }
    | undefined;

  if (!repo) {
    return <p className="text-slate-400">仓库不存在。</p>;
  }
  if (repo.status !== 'ready') {
    return (
      <div>
        <a href="/" className="text-xs text-slate-400 hover:text-white">
          ← 仓库列表
        </a>
        <p className="mt-4 text-slate-400">
          仓库正在{repo.status === 'failed' ? '索引失败' : '索引中'}，请稍后刷新页面重试。
        </p>
      </div>
    );
  }
  return <Chat repoId={repo.id} repoName={repo.name} />;
}
