import { NextResponse } from 'next/server';
import { getDb } from '@/storage/db';
import { removeRepoById } from '@/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  const db = getDb();
  const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(Number(id));
  if (!repo) return NextResponse.json({ error: 'repo not found' }, { status: 404 });
  const languages = db
    .prepare('SELECT language, count(*) AS n FROM files WHERE repo_id = ? GROUP BY language ORDER BY n DESC LIMIT 8')
    .all(Number(id));
  return NextResponse.json({ repo, languages });
}

export async function DELETE(_req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  const removed = removeRepoById(Number(id));
  if (!removed) return NextResponse.json({ error: 'repo not found' }, { status: 404 });
  return NextResponse.json({ removed });
}
