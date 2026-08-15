import { NextResponse } from 'next/server';
import { getDb } from '@/storage/db';
import { repoNameFromUrl } from '@/indexing/clone';
import { startIndexing } from '@/server/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const repos = getDb()
    .prepare(
      'SELECT id, name, url, status, error, file_count, chunk_count, created_at FROM repositories ORDER BY id DESC',
    )
    .all();
  return NextResponse.json({ repos });
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const db = getDb();
  const name = repoNameFromUrl(url);
  const existing = db.prepare('SELECT id FROM repositories WHERE url = ?').get(url) as
    | { id: number }
    | undefined;
  if (existing) {
    return NextResponse.json(
      { id: existing.id, name, message: 'already indexed; will re-index' },
      { status: 200 },
    );
  }
  const info = db.prepare('INSERT INTO repositories (url, name, status) VALUES (?, ?, ?)').run(url, name, 'pending');
  startIndexing(url);
  return NextResponse.json({ id: Number(info.lastInsertRowid), name }, { status: 202 });
}
