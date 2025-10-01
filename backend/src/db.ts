import Database from 'better-sqlite3';

export const db = new Database('rag.sqlite');

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
`);
