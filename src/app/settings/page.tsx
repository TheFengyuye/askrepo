import { getConfig } from '@/config';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const cfg = getConfig();
  const rows = [
    { label: 'LLM Provider', value: 'DeepSeek（OpenAI 兼容 API）' },
    { label: 'LLM 模型', value: cfg.deepseekModel },
    { label: 'API Key', value: cfg.deepseekApiKey ? `已配置 (${cfg.deepseekApiKey.slice(0, 6)}…)` : '未配置 ⚠' },
    { label: '嵌入模型', value: cfg.embeddingModel },
    { label: 'HF 镜像', value: cfg.hfEndpoint },
    { label: '数据目录', value: cfg.dataDir },
    { label: '存储', value: 'SQLite（M1/M2）→ PostgreSQL + pgvector（M3 迁移）' },
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold">设置</h1>
      <p className="mt-1 text-xs text-slate-500">配置来自项目根目录的 .env 文件。</p>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`flex items-center justify-between px-4 py-2.5 text-sm ${i % 2 ? 'bg-slate-900/40' : 'bg-slate-900/70'}`}
          >
            <span className="text-slate-400">{r.label}</span>
            <span className="max-w-[60%] truncate font-mono text-xs text-slate-200">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
