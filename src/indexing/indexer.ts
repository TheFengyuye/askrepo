import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from '../storage/db.js';
import { getConfig } from '../config.js';
import { ensureCloned, repoNameFromUrl } from './clone.js';
import { isSkippableDir, languageOf, shouldIndexFile } from './filter.js';
import { chunkFile } from './chunk.js';
import { embedTexts } from './embed.js';

export interface IndexResult {
  fileCount: number;
  chunkCount: number;
  durationMs: number;
  cloned: boolean;
}

interface IndexableFile {
  absPath: string;
  relPath: string;
  sizeBytes: number;
}

function listIndexableFiles(root: string): IndexableFile[] {
  const out: IndexableFile[] = [];
  const walk = (dir: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (isSkippableDir(e.name)) continue;
        walk(path.join(dir, e.name), relPath);
      } else if (e.isFile()) {
        const absPath = path.join(dir, e.name);
        const stat = fs.statSync(absPath);
        if (shouldIndexFile(relPath, stat.size)) {
          out.push({ absPath, relPath, sizeBytes: stat.size });
        }
      }
    }
  };
  walk(root, '');
  return out;
}

/** Clone (if needed) + chunk + embed + persist. Full re-index on repeat add (incremental = M3). */
export async function indexRepository(url: string): Promise<IndexResult> {
  const cfg = getConfig();
  const db = getDb();
  const name = repoNameFromUrl(url);
  const repoDir = path.join(cfg.dataDir, 'repos', name);
  const started = Date.now();

  const existing = db
    .prepare('SELECT id FROM repositories WHERE url = ?')
    .get(url) as { id: number } | undefined;

  let repoId: number;
  if (existing) {
    repoId = existing.id;
    // M1: full re-index — wipe old repo data.
    db.prepare('DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE repo_id = ?)').run(repoId);
    db.prepare('DELETE FROM chunks WHERE repo_id = ?').run(repoId);
    db.prepare('DELETE FROM files WHERE repo_id = ?').run(repoId);
    db.prepare('UPDATE repositories SET status = ?, error = NULL WHERE id = ?').run('indexing', repoId);
  } else {
    const info = db
      .prepare('INSERT INTO repositories (url, name, status) VALUES (?, ?, ?)')
      .run(url, name, 'indexing');
    repoId = Number(info.lastInsertRowid);
  }

  try {
    const cloned = await ensureCloned(url, repoDir);
    const files = listIndexableFiles(repoDir);

    const insertFile = db.prepare(
      'INSERT INTO files (repo_id, path, language, sha256, size_bytes) VALUES (?, ?, ?, ?, ?)',
    );
    const insertChunk = db.prepare(
      'INSERT INTO chunks (repo_id, file_id, content, start_line, end_line, symbol, embedding) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertFts = db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)');

    let fileCount = 0;
    let chunkCount = 0;
    let pending: {
      fileId: number;
      content: string;
      startLine: number;
      endLine: number;
      symbol: string | null;
    }[] = [];

    const flush = async () => {
      if (pending.length === 0) return;
      const vectors = await embedTexts(pending.map((c) => c.content));
      for (let i = 0; i < pending.length; i++) {
        const c = pending[i];
        const vec = vectors[i];
        if (!vec) continue;
        const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
        const info = insertChunk.run(repoId, c.fileId, c.content, c.startLine, c.endLine, c.symbol, buf);
        const chunkId = Number(info.lastInsertRowid);
        insertFts.run(chunkId, c.content);
        chunkCount++;
      }
      pending = [];
    };

    for (const f of files) {
      let raw: string;
      try {
        raw = fs.readFileSync(f.absPath, 'utf8');
      } catch {
        continue; // binary-ish / unreadable
      }
      const sha = crypto.createHash('sha256').update(raw).digest('hex');
      const fileInfo = insertFile.run(repoId, f.relPath, languageOf(f.relPath), sha, f.sizeBytes);
      const fileId = Number(fileInfo.lastInsertRowid);

      for (const ch of chunkFile(raw)) {
        pending.push({
          fileId,
          content: ch.content,
          startLine: ch.startLine,
          endLine: ch.endLine,
          symbol: ch.symbol,
        });
      }
      fileCount++;
      if (pending.length >= 32) await flush();
      if (fileCount % 50 === 0) {
        console.log(`  … ${fileCount}/${files.length} files, ${chunkCount} chunks embedded`);
      }
    }
    await flush();

    db.prepare(
      'UPDATE repositories SET status = ?, file_count = ?, chunk_count = ?, updated_at = datetime(\'now\') WHERE id = ?',
    ).run('ready', fileCount, chunkCount, repoId);

    return { fileCount, chunkCount, durationMs: Date.now() - started, cloned };
  } catch (err) {
    db.prepare('UPDATE repositories SET status = ?, error = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      'failed',
      err instanceof Error ? err.message.slice(0, 500) : String(err),
      repoId,
    );
    throw err;
  }
}
