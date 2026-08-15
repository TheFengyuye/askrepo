import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '@/storage/db';
import { getConfig } from '@/config';
import { languageOf } from '@/indexing/filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<NextResponse> {
  const { id } = await params;
  const filePath = new URL(req.url).searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path query param required' }, { status: 400 });

  const repo = getDb().prepare('SELECT name FROM repositories WHERE id = ?').get(Number(id)) as
    | { name: string }
    | undefined;
  if (!repo) return NextResponse.json({ error: 'repo not found' }, { status: 404 });

  const base = path.resolve(getConfig().dataDir, 'repos', repo.name);
  const abs = path.resolve(base, filePath);
  // Path-traversal guard.
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }
  try {
    const content = fs.readFileSync(abs, 'utf8');
    return NextResponse.json({ path: filePath, content, language: languageOf(filePath) });
  } catch {
    return NextResponse.json({ error: 'file not found' }, { status: 404 });
  }
}
