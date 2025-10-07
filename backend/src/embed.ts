// import * as fs from 'fs';
// import * as path from 'path';
// import { db } from './db';
// import { buildVocabAndIdf, tfidfVector } from '../src/verctorizer';
// const pdf = require('pdf-parse');

// const DATA_DIR = path.resolve(__dirname, '..', 'data', 'docs');
// const MODEL_DIR = path.resolve(__dirname, '..'); // where we’ll save vocab/idf
// const VOCAB_PATH = path.join(MODEL_DIR, 'vocab.json');
// const IDF_PATH = path.join(MODEL_DIR, 'idf.bin'); // Float32Array

// function chunkText(text: string, max = 1200) {
//   const paras = text.split(/\n{2,}/g);
//   const chunks: string[] = [];
//   let buf = '';
//   for (const p of paras) {
//     if ((buf + '\n\n' + p).length > max && buf) {
//       chunks.push(buf.trim());
//       buf = p;
//     } else {
//       buf = buf ? buf + '\n\n' + p : p;
//     }
//   }
//   if (buf) chunks.push(buf.trim());
//   return chunks;
// }

// async function embedAll() {
//   // 1) Read docs and chunk
//   const files = fs.existsSync(DATA_DIR)
//     ? fs
//         .readdirSync(DATA_DIR)
//         .filter((f) => f.endsWith('.md') || f.endsWith('.pdf'))
//     : [];
//   if (!files.length) {
//     console.log('No .md files in', DATA_DIR);
//     return;
//   }

//   const allChunks: { file: string; full: string; idx: number; text: string }[] =
//     [];
//   for (const file of files) {
//     const full = path.join(DATA_DIR, file);
//     let text = '';
//     if (file.endsWith('.pdf')) {
//       const dataBuffer = fs.readFileSync(full);
//       const pdfData = await pdf(dataBuffer); // ✅ call directly, no .default
//       text = pdfData.text;
//     } else {
//       text = fs.readFileSync(full, 'utf8');
//     }
//     const chunks = chunkText(text);
//     chunks.forEach((t, i) => allChunks.push({ file, full, idx: i, text: t }));
//   }

//   // 2) Build vocab + idf over all chunks
//   const { vocab, idf } = buildVocabAndIdf(allChunks.map((c) => c.text));
//   fs.writeFileSync(VOCAB_PATH, JSON.stringify(vocab), 'utf8');
//   fs.writeFileSync(IDF_PATH, Buffer.from(new Float32Array(idf).buffer));

//   // 3) Store TF-IDF vectors in SQLite (BLOB) like before
//   const insert = db.prepare(`
//     INSERT INTO chunks (doc_id, path, chunk_index, text, embedding)
//     VALUES (@doc_id, @path, @chunk_index, @text, @embedding)
//   `);
//   const clear = db.prepare(`DELETE FROM chunks`);
//   clear.run();

//   for (const c of allChunks) {
//     const vec = tfidfVector(c.text, vocab, idf);
//     const buf = Buffer.from(new Float32Array(vec).buffer);
//     insert.run({
//       doc_id: c.file,
//       path: c.full,
//       chunk_index: c.idx,
//       text: c.text,
//       embedding: buf,
//     });
//   }

//   console.log(`Indexed ${allChunks.length} chunks. Vocab size: ${idf.length}.`);
// }

// embedAll().catch((e) => {
//   console.error(e);
//   process.exit(1);
// });

// backend/src/embed.ts
// backend/src/search.ts
// backend/src/embed.ts
import * as fs from 'fs';
import * as path from 'path';
import { db } from './db';

/**
 * VERBOSE, SELF-CONTAINED INDEXER
 * - Finds .md files in backend/data/docs
 * - Chunks them
 * - Builds vocab + IDF
 * - Writes vocab.json + idf.bin
 * - Stores TF-IDF vectors in SQLite (chunks table)
 */

// ---------- Paths ----------
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'docs');
const VOCAB_PATH = path.join(ROOT, 'vocab.json');
const IDF_PATH = path.join(ROOT, 'idf.bin');

// ---------- Helpers ----------
function log(...args: any[]) {
  console.log('[embed]', ...args);
}

function assertDir(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(`Directory not found: ${p}`);
  }
}

function chunkText(text: string, max = 600): string[] {
  // Changed from 900 to 600
  const paras = text
    .split(/\n{1,2}/g)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paras) {
    if ((buf + '\n' + p).length > max && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + '\n' + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

type Vocab = Record<string, number>;

function buildVocabAndIdf(allDocs: string[]): {
  vocab: Vocab;
  idf: Float32Array;
} {
  const vocab: Vocab = {};
  const dfs: number[] = []; // document frequencies by term index

  // 1) build vocab + DF
  allDocs.forEach((doc) => {
    const terms = new Set(tokenize(doc));
    terms.forEach((term) => {
      let idx = vocab[term];
      if (idx === undefined) {
        idx = Object.keys(vocab).length;
        vocab[term] = idx;
        dfs[idx] = 0;
      }
      dfs[idx] += 1;
    });
  });

  const N = allDocs.length;
  const idf = new Float32Array(Object.keys(vocab).length);
  for (const [term, idx] of Object.entries(vocab)) {
    const df = dfs[idx] || 0;
    // smooth IDF
    idf[idx] = Math.log((N + 1) / (df + 1)) + 1;
  }
  return { vocab, idf };
}

function tfidfVector(
  text: string,
  vocab: Vocab,
  idf: Float32Array
): Float32Array {
  const vec = new Float32Array(idf.length);
  const toks = tokenize(text);
  if (!toks.length) return vec;

  // term frequency
  const tf = new Map<number, number>();
  toks.forEach((t) => {
    const idx = vocab[t];
    if (idx !== undefined) tf.set(idx, (tf.get(idx) || 0) + 1);
  });

  // L2-normalized TF-IDF
  let norm = 0;
  tf.forEach((count, idx) => {
    const val = (count / toks.length) * idf[idx];
    vec[idx] = val;
    norm += val * val;
  });
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm;

  return vec;
}

// ---------- Ensure schema ----------
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
`);

// ---------- Main ----------
(async function main() {
  try {
    log('Starting indexer...');
    assertDir(DATA_DIR);

    const allFiles = fs.readdirSync(DATA_DIR);
    log('DATA_DIR =', DATA_DIR);
    log('All files in data/docs:', allFiles);

    // Only .md for now (skip giant PDFs)
    const files = allFiles.filter((f) => f.toLowerCase().endsWith('.md'));
    if (!files.length) {
      log('No .md files found. Add markdown files to data/docs and re-run.');
      return;
    }

    const allChunks: {
      file: string;
      full: string;
      idx: number;
      text: string;
    }[] = [];

    for (const file of files) {
      const full = path.join(DATA_DIR, file);
      const text = fs.readFileSync(full, 'utf8');
      const chunks = chunkText(text, 900);
      log(`Indexing file: ${file} -> ${chunks.length} chunks`);
      chunks.forEach((t, i) => allChunks.push({ file, full, idx: i, text: t }));
    }

    // Build vocab + idf over all chunks' text
    const { vocab, idf } = buildVocabAndIdf(allChunks.map((c) => c.text));
    fs.writeFileSync(VOCAB_PATH, JSON.stringify(vocab), 'utf8');
    fs.writeFileSync(IDF_PATH, Buffer.from(new Float32Array(idf).buffer));
    log(
      `Wrote vocab.json (${Object.keys(vocab).length} terms) and idf.bin (${
        idf.length
      }).`
    );

    // Clear table and insert vectors
    db.prepare(`DELETE FROM chunks`).run();
    const insert = db.prepare(`
      INSERT INTO chunks (doc_id, path, chunk_index, text, embedding)
      VALUES (@doc_id, @path, @chunk_index, @text, @embedding)
    `);

    let inserted = 0;
    for (const c of allChunks) {
      const vec = tfidfVector(c.text, vocab, idf);
      const blob = Buffer.from(new Float32Array(vec).buffer);
      insert.run({
        doc_id: c.file,
        path: c.full,
        chunk_index: c.idx,
        text: c.text,
        embedding: blob,
      });
      inserted++;
    }

    log(`Indexed ${inserted} chunks. Done.`);
  } catch (e: any) {
    console.error('[embed] ERROR:', e?.message || e);
    console.error(e);
    process.exit(1);
  }
})();
