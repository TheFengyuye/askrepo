import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config';

/**
 * M1 storage: SQLite via Node's built-in `node:sqlite` (zero install).
 * Mirrors the final PostgreSQL design (repositories/files/chunks/questions),
 * with FTS5 for keyword search and BLOB columns for float32 embeddings.
 * M2 swaps this module for a PostgreSQL + pgvector implementation behind
 * the same call sites — retrieval/indexing logic stays untouched.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS repositories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  language TEXT,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  UNIQUE (repo_id, path)
);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  symbol TEXT,
  embedding BLOB
);
CREATE INDEX IF NOT EXISTS idx_chunks_repo ON chunks (repo_id);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(content, tokenize='unicode61');

-- M3 code graph: symbols (functions/classes/methods) + call/import edges.
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  line INTEGER NOT NULL,
  end_line INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_symbols_repo_name ON symbols (repo_id, name);
CREATE INDEX IF NOT EXISTS idx_symbols_repo_file ON symbols (repo_id, file_id);

CREATE TABLE IF NOT EXISTS symbol_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  target_name TEXT NOT NULL,
  kind TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edges_repo_source ON symbol_edges (repo_id, source_name);
CREATE INDEX IF NOT EXISTS idx_edges_repo_target ON symbol_edges (repo_id, target_name);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]',
  latency_ms INTEGER,
  model TEXT,
  rating SMALLINT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const cfg = getConfig();
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  db = new DatabaseSync(path.join(cfg.dataDir, 'askrepo.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // Lightweight migrations for databases created before later schema changes.
  const qCols = db.prepare('PRAGMA table_info(questions)').all() as { name: string }[];
  if (!qCols.some((c) => c.name === 'model')) {
    db.exec('ALTER TABLE questions ADD COLUMN model TEXT');
  }
  if (!qCols.some((c) => c.name === 'rating')) {
    db.exec('ALTER TABLE questions ADD COLUMN rating SMALLINT');
  }
  return db;
}
