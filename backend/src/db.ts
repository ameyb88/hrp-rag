import Database from 'better-sqlite3';
import * as path from 'path';

const DB_PATH = path.resolve(__dirname, '..', 'rag.sqlite');
export const db = new Database(DB_PATH);

// Create schema if it doesn't exist
db.exec(`
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY,
  doc_id TEXT,
  path TEXT,
  chunk_index INTEGER,
  text TEXT,
  embedding BLOB
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  filename TEXT UNIQUE,
  file_type TEXT,
  chunk_count INTEGER,
  ingested_at TEXT DEFAULT (datetime('now'))
);
`);
