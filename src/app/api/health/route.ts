import { NextResponse } from 'next/server';
import { getConfig } from '@/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const cfg = getConfig();
  return NextResponse.json({
    ok: true,
    node: process.version,
    db: 'sqlite',
    embedModel: cfg.embeddingModel,
    llm: cfg.deepseekModel,
    hasApiKey: Boolean(cfg.deepseekApiKey),
    dataDir: cfg.dataDir,
  });
}
