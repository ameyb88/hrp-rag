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
import * as fs from 'fs';
import * as path from 'path';
import { db } from './db';
import { tfidfVector } from './verctorizer';

// --- Load model ---
const VOCAB_PATH = path.resolve(__dirname, '..', 'vocab.json');
const IDF_PATH = path.resolve(__dirname, '..', 'idf.bin');

const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
const idfBuffer = fs.readFileSync(IDF_PATH);
const idf = new Float32Array(
  idfBuffer.buffer,
  idfBuffer.byteOffset,
  idfBuffer.length / 4
);

// --- Utility: cosine similarity ---
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    na = 0,
    nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// --- Core search ---
export async function searchDocs(query: string, topK = 5) {
  const qVec = tfidfVector(query.toLowerCase(), vocab, idf);

  const rows = db
    .prepare(`SELECT doc_id, path, chunk_index, text, embedding FROM chunks`)
    .all();

  const scored = rows.map((r: any) => {
    const emb = new Float32Array(
      r.embedding.buffer,
      r.embedding.byteOffset,
      r.embedding.length / 4
    );
    const sim = cosineSimilarity(qVec, emb);
    return { ...r, score: sim };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored.slice(0, topK);
  console.log('\nTop matches for:', query);
  best.forEach((r, i) =>
    console.log(
      `${i + 1}. ${r.doc_id} (chunk ${r.chunk_index}) score=${r.score.toFixed(
        3
      )}\n   ${r.text.slice(0, 100)}...`
    )
  );

  return best;
}
