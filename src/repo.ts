import { getDb } from './storage/db.js';

export interface RepoRef {
  id: number;
  name: string;
  url: string;
}

/** Resolve a user-provided repo reference (name, url, or substring) to a repo row. */
export function resolveRepo(ref: string): RepoRef {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT id, name, url FROM repositories WHERE name = ? OR url = ? OR url LIKE ? ORDER BY id LIMIT 1',
    )
    .get(ref, ref, `%${ref}%`) as { id: number; name: string; url: string } | undefined;
  if (!row) {
    throw new Error(`Repository not found: "${ref}". Run "askrepo list" to see indexed repos.`);
  }
  return { id: row.id, name: row.name, url: row.url };
}
