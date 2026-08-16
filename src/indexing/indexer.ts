import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from '../storage/db';
import { getConfig } from '../config';
import { ensureCloned, repoNameFromUrl } from './clone';
import { isSkippableDir, languageOf, shouldIndexFile } from './filter';
import { chunkFile } from './chunk';
import { embedTexts } from './embed';
import { normText } from './norm';
import { extractGraph } from '../graph/extract';

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

/**
 * Clone (or update) + chunk + embed + persist.
 * Incremental: on re-add, `git pull`, then rebuild only changed/new files
 * (sha256-compared) and drop stale rows for deleted/changed files.
 */
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
    db.prepare('UPDATE repositories SET status = ?, error = NULL WHERE id = ?').run('indexing', repoId);
  } else {
    const info = db
      .prepare('INSERT INTO repositories (url, name, status) VALUES (?, ?, ?)')
      .run(url, name, 'indexing');
    repoId = Number(info.lastInsertRowid);
  }

  try {
    const cloned = await ensureCloned(url, repoDir);
    // Update existing clones to the latest remote state (ignore offline failures).
    if (!cloned) {
      try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        await promisify(execFile)('git', ['-C', repoDir, 'pull', '--ff-only', '-q'], {
          windowsHide: true,
          timeout: 120_000,
        });
      } catch {
        // offline / no remote — continue with what we have
      }
    }
    const files = listIndexableFiles(repoDir);

    // ── Incremental diff against the files table ──────────────────────
    // Map of existing (path → {id, sha256}) for this repo.
    const existingFiles = new Map<string, { id: number; sha256: string }>();
    for (const r of db
      .prepare('SELECT id, path, sha256 FROM files WHERE repo_id = ?')
      .all(repoId) as { id: number; path: string; sha256: string }[]) {
      existingFiles.set(r.path, { id: r.id, sha256: r.sha256 });
    }

    const deleteFileData = db.prepare(
      'DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE file_id = ?)',
    );
    const deleteChunks = db.prepare('DELETE FROM chunks WHERE file_id = ?');
    const deleteSymbols = db.prepare('DELETE FROM symbols WHERE file_id = ?');
    const deleteEdges = db.prepare('DELETE FROM symbol_edges WHERE file_id = ?');
    const deleteFile = db.prepare('DELETE FROM files WHERE id = ?');

    const toProcess: IndexableFile[] = [];
    let removed = 0;
    for (const f of files) {
      const prev = existingFiles.get(f.relPath);
      if (!prev) {
        toProcess.push(f);
        continue;
      }
      existingFiles.delete(f.relPath); // still present (or changed → reprocess)
      let raw: string;
      try {
        raw = fs.readFileSync(f.absPath, 'utf8');
      } catch {
        toProcess.push(f);
        continue;
      }
      const sha = crypto.createHash('sha256').update(raw).digest('hex');
      if (sha !== prev.sha256) {
        // Changed: drop old data, reprocess.
        deleteFileData.run(prev.id);
        deleteChunks.run(prev.id);
        deleteSymbols.run(prev.id);
        deleteEdges.run(prev.id);
        deleteFile.run(prev.id);
        toProcess.push(f);
      }
    }
    // Remaining entries in existingFiles are gone from disk → delete.
    for (const [, prev] of existingFiles) {
      deleteFileData.run(prev.id);
      deleteChunks.run(prev.id);
      deleteSymbols.run(prev.id);
      deleteEdges.run(prev.id);
      deleteFile.run(prev.id);
      removed++;
    }

    const insertFile = db.prepare(
      'INSERT INTO files (repo_id, path, language, sha256, size_bytes) VALUES (?, ?, ?, ?, ?)',
    );
    const insertChunk = db.prepare(
      'INSERT INTO chunks (repo_id, file_id, content, start_line, end_line, symbol, embedding) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertFts = db.prepare('INSERT INTO chunks_fts (rowid, content, norm) VALUES (?, ?, ?)');
    const insertSymbol = db.prepare(
      'INSERT INTO symbols (repo_id, file_id, name, kind, line, end_line) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertEdge = db.prepare(
      'INSERT INTO symbol_edges (repo_id, file_id, source_name, target_name, kind) VALUES (?, ?, ?, ?, ?)',
    );

    let fileCount = 0;
    let chunkCount = 0;
    let symbolCount = 0;
    let skipped = 0;
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
        insertFts.run(chunkId, c.content, normText(c.content));
        chunkCount++;
      }
      pending = [];
    };

    for (const f of toProcess) {
      let raw: string;
      try {
        raw = fs.readFileSync(f.absPath, 'utf8');
      } catch {
        skipped++;
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

      // M3: code-graph extraction (symbols + call/import edges) via tree-sitter.
      const graph = await extractGraph(f.relPath, raw);
      for (const s of graph.symbols) {
        insertSymbol.run(repoId, fileId, s.name, s.kind, s.line, s.endLine);
        symbolCount++;
      }
      for (const e of graph.edges) {
        insertEdge.run(repoId, fileId, e.sourceName, e.targetName, e.kind);
      }

      fileCount++;
      if (pending.length >= 32) await flush();
      if (fileCount % 50 === 0) {
        console.log(
          `  … ${fileCount}/${toProcess.length} changed files, ${chunkCount} chunks, ${symbolCount} symbols`,
        );
      }
    }
    await flush();

    const totalChunks = (
      db.prepare('SELECT count(*) AS n FROM chunks WHERE repo_id = ?').get(repoId) as { n: number }
    ).n;
    const totalFiles = (
      db.prepare('SELECT count(*) AS n FROM files WHERE repo_id = ?').get(repoId) as { n: number }
    ).n;

    db.prepare(
      'UPDATE repositories SET status = ?, file_count = ?, chunk_count = ?, updated_at = datetime(\'now\') WHERE id = ?',
    ).run('ready', totalFiles, totalChunks, repoId);

    if (existing) {
      console.log(
        `  incremental: ${fileCount} changed/new files processed, ${skipped} unreadable, ${removed} stale removed (total ${totalFiles} files / ${totalChunks} chunks)`,
      );
    }
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
