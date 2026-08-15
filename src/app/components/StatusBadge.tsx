const MAP: Record<string, string> = {
  pending: 'bg-slate-700 text-slate-200',
  cloning: 'bg-amber-500/20 text-amber-300',
  indexing: 'bg-amber-500/20 text-amber-300',
  ready: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-red-500/20 text-red-300',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${MAP[status] ?? 'bg-slate-700 text-slate-200'}`}
    >
      {status}
    </span>
  );
}
