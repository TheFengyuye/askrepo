import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export function repoNameFromUrl(url: string): string {
  const clean = url.replace(/\.git$/, '').replace(/[/\\]+$/, '');
  const isLocal =
    /^[a-zA-Z]:[\\/]/.test(clean) || // drive letter (Windows path)
    clean.startsWith('.') ||
    clean.startsWith('/') ||
    clean.startsWith('\\') ||
    clean.includes('\\'); // backslash anywhere → Windows path
  const parts = clean.split(/[/\\]/);
  const repo = parts[parts.length - 1] ?? 'unknown';
  if (isLocal) return repo; // local paths: use the folder name only
  const owner = parts[parts.length - 2] ?? 'unknown';
  return `${owner}/${repo}`;
}

/**
 * Clone (or reuse) the repo into destDir. Returns true if a fresh clone
 * happened, false if the directory already contained a repo.
 * Works with GitHub URLs and local paths (useful for dogfooding).
 */
export async function ensureCloned(url: string, destDir: string): Promise<boolean> {
  if (fs.existsSync(path.join(destDir, '.git'))) return false;
  fs.mkdirSync(destDir, { recursive: true });
  await execFileAsync('git', ['clone', '--depth', '1', url, destDir], {
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return true;
}
