import { NextResponse } from 'next/server';
import { getDb } from '@/storage/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  let body: { questionId?: unknown; rating?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const questionId = Number(body.questionId);
  const rating = Number(body.rating);
  if (!Number.isInteger(questionId) || ![1, -1].includes(rating)) {
    return NextResponse.json({ error: 'questionId (int) and rating (1|-1) required' }, { status: 400 });
  }
  const db = getDb();
  const row = db.prepare('SELECT id FROM questions WHERE id = ?').get(questionId);
  if (!row) return NextResponse.json({ error: 'question not found' }, { status: 404 });
  db.prepare('UPDATE questions SET rating = ? WHERE id = ?').run(rating, questionId);
  if (typeof body.note === 'string' && body.note.trim()) {
    db.prepare(
      'INSERT INTO feedback (id, note) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET note = excluded.note',
    ).run(questionId, body.note.trim());
  }
  return NextResponse.json({ ok: true });
}
