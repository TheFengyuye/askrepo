import { getDb } from './storage/db.js';

export interface RepoRef {
  id: number;
  name: string;
  url: string;
}

/** Resolve a user-provided repo reference: exact name → exact url → LIKE fallback. */
export function resolveRepo(ref: string): RepoRef {
  const db = getDb();
  const exactName = db
    .prepare('SELECT id, name, url FROM repositories WHERE name = ? LIMIT 1')
    .get(ref) as RepoRef | undefined;
  if (exactName) return exactName;
  const exactUrl = db
    .prepare('SELECT id, name, url FROM repositories WHERE url = ? LIMIT 1')
    .get(ref) as RepoRef | undefined;
  if (exactUrl) return exactUrl;
  const like = db
    .prepare(
      'SELECT id, name, url FROM repositories WHERE url LIKE ? OR name LIKE ? ORDER BY id LIMIT 1',
    )
    .get(`%${ref}%`, `%${ref}%`) as RepoRef | undefined;
  if (like) return like;
  throw new Error(`Repository not found: "${ref}". Run "askrepo list" to see indexed repos.`);
}

/** Delete a repo and all of its data (chunks, fts rows, files, questions). */
export function removeRepo(ref: string): RepoRef {
  const db = getDb();
  const repo = resolveRepo(ref);
  db.prepare('DELETE FROM questions WHERE repo_id = ?').run(repo.id);
  db.prepare('DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE repo_id = ?)').run(repo.id);
  db.prepare('DELETE FROM chunks WHERE repo_id = ?').run(repo.id);
  db.prepare('DELETE FROM files WHERE repo_id = ?').run(repo.id);
  db.prepare('DELETE FROM repositories WHERE id = ?').run(repo.id);
  return repo;
}
