import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config';
import { repoNameFromUrl } from '../indexing/clone';

/**
 * M3 indexing queue: runs the CLI indexer as a DETACHED child process.
 *
 * Why a child process instead of in-process async? The indexer depends on
 * web-tree-sitter (WASM code-graph extraction), whose CJS/ESM shape Turbopack
 * cannot bundle into the Next.js server. Spawning `node --import tsx cli.ts`
 * keeps ML/graph tooling out of the web bundle entirely — the web server only
 * reads/writes the SQLite DB, which is shared by all processes (WAL mode).
 * This also isolates long CPU-bound indexing from request handling.
 */
export function startIndexing(url: string): void {
  const cfg = getConfig();
  const logsDir = path.join(cfg.dataDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const name = repoNameFromUrl(url).replace(/[/\\]/g, '_');
  const logPath = path.join(logsDir, `index-${name}.log`);
  const logFile = fs.openSync(logPath, 'a');
  const cliPath = path.join(process.cwd(), 'src', 'cli.ts');

  const child = spawn(
    process.execPath,
    ['--import', 'tsx', cliPath, 'add', url],
    {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFile, logFile],
    },
  );
  child.unref();
  child.on('error', (err) => {
    console.error(`[askrepo] failed to spawn indexer for ${url}:`, err.message);
    fs.closeSync(logFile);
  });
  child.on('close', () => fs.closeSync(logFile));
  console.log(`[askrepo] indexing ${url} in background (pid ${child.pid}), log: ${path.basename(logPath)}`);
}
