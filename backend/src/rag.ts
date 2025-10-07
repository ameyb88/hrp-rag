// import { db } from './db';
// import { OpenAI } from 'openai';
// import * as fs from 'fs';
// import * as path from 'path';
// import type { Retrieved, ImageHit } from './schemas';

// const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

// // cosine similarity in SQL via dot product is tricky without extensions;
// // we'll bring embeddings to JS and compute cosine here (good enough for prototype).
// function cosine(a: Float32Array, b: Float32Array) {
//   let dot = 0,
//     na = 0,
//     nb = 0;
//   for (let i = 0; i < a.length; i++) {
//     dot += a[i] * b[i];
//     na += a[i] * a[i];
//     nb += b[i] * b[i];
//   }
//   return dot / (Math.sqrt(na) * Math.sqrt(nb));
// }

// function loadEmbedding(buf: Buffer) {
//   return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
// }

// function getAllEmbeddings(): {
//   rowid: number;
//   text: string;
//   path: string;
//   chunk_index: number;
//   emb: Float32Array;
// }[] {
//   const rows = db
//     .prepare(`SELECT rowid, text, path, chunk_index, embedding FROM chunks`)
//     .all();
//   return rows.map((r: any) => ({
//     rowid: r.rowid,
//     text: r.text,
//     path: r.path,
//     chunk_index: r.chunk_index,
//     emb: loadEmbedding(r.embedding as Buffer),
//   }));
// }

// const MEMORY = getAllEmbeddings();
// const IMAGE_INDEX_PATH = path.resolve(__dirname, 'image-index.json');
// const IMAGE_INDEX: { filename: string; caption: string; tags: string[] }[] =
//   fs.existsSync(IMAGE_INDEX_PATH)
//     ? JSON.parse(fs.readFileSync(IMAGE_INDEX_PATH, 'utf8'))
//     : [];

// export async function retrieve(
//   query: string,
//   topK = 6
// ): Promise<{ contexts: Retrieved[]; images: ImageHit[] }> {
//   const { data } = await openai.embeddings.create({
//     model: process.env['MODEL_EMBEDDINGS'] || 'text-embedding-3-large',
//     input: query,
//   });

//   const q = new Float32Array(data[0].embedding);
//   const scored = MEMORY.map((m) => ({ score: cosine(q, m.emb), m }))
//     .sort((a, b) => b.score - a.score)
//     .slice(0, topK)
//     .map(({ m }) => ({
//       text: m.text,
//       path: m.path,
//       chunk_index: m.chunk_index,
//     }));

//   // naive image retrieval: term overlap on caption/tags + simple score
//   const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
//   const imgHits = IMAGE_INDEX.map((img) => {
//     const hay = (img.caption + ' ' + img.tags.join(' ')).toLowerCase();
//     const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
//     return { filename: img.filename, caption: img.caption, score };
//   })
//     .filter((x) => x.score > 0)
//     .sort((a, b) => b.score - a.score)
//     .slice(0, 4);

//   return { contexts: scored, images: imgHits };
// }

// export async function answer(
//   query: string,
//   contexts: Retrieved[],
//   _images: ImageHit[]
// ): Promise<{
//   answer: string;
//   screenshots: string[];
//   confidence: 'low' | 'medium' | 'high';
// }> {
//   console.log('[answer] Starting answer generation for:', query);
//   console.log('[answer] OpenAI client exists?', !!openai);
//   console.log(
//     '[answer] OPENAI_API_KEY exists?',
//     !!process.env['OPENAI_API_KEY']
//   );
//   console.log(
//     '[answer] MODEL_RESPONSES:',
//     process.env['MODEL_RESPONSES'] || 'not set'
//   );

//   if (!contexts.length) {
//     console.log('[answer] No contexts found');
//     return {
//       answer:
//         "I don't have enough information in the indexed documents to answer that.",
//       screenshots: [],
//       confidence: 'low',
//     };
//   }

//   // Get score from first context (assuming Retrieved has a score property based on your retrieve function)
//   const topScore = contexts[0] ? 0.5 : 0; // Default fallback
//   const confidence: 'low' | 'medium' | 'high' =
//     topScore > 0.3 ? 'high' : topScore > 0.15 ? 'medium' : 'low';

//   // If OpenAI is disabled or misconfigured, return stitched chunks
//   if (!openai) {
//     console.log('[answer] OpenAI not available - returning stitched chunks');
//     const stitched = contexts
//       .slice(0, 3)
//       .map(
//         (c, i) =>
//           `**Source ${i + 1}** (${path.basename(c.path)} #${c.chunk_index})\n${
//             c.text
//           }`
//       )
//       .join('\n\n---\n\n');

//     return {
//       answer: `**Answer (from docs)**\n\n${stitched}`,
//       screenshots: [],
//       confidence,
//     };
//   }

//   // With OpenAI – generate concise answer grounded in context
//   const modelName = process.env['MODEL_RESPONSES'] || 'gpt-4o-mini';
//   console.log('[answer] Calling OpenAI with model:', modelName);

//   const sys = `You are a helpful product documentation assistant. Answer questions using ONLY the provided context.

// Rules:
// - Give concise, direct answers in markdown format
// - Start with a clear, direct answer to the question
// - Follow with a brief "Why this is correct" section with 2-3 bullet points
// - If the answer isn't in the context, say "I don't know based on the available documentation"
// - Use natural, conversational language
// - Do NOT include source citations in your answer (they're already tracked separately)`;

//   const contextBlock = contexts
//     .map(
//       (c, i) =>
//         `[${i + 1}] (${path.basename(c.path)} #${c.chunk_index})\n${c.text}`
//     )
//     .join('\n\n');

//   try {
//     console.log('[answer] Making OpenAI API call...');
//     const chat = await openai.chat.completions.create({
//       model: modelName,
//       temperature: 0.3,
//       messages: [
//         { role: 'system', content: sys },
//         {
//           role: 'user',
//           content: `QUESTION:\n${query}\n\nCONTEXT:\n${contextBlock}\n\nAnswer based only on the context above.`,
//         },
//       ],
//     });

//     console.log('[answer] OpenAI response received successfully');
//     const content = chat.choices?.[0]?.message?.content?.trim() || '';

//     if (content) {
//       console.log('[answer] Returning formatted answer from OpenAI');
//       return { answer: content, screenshots: [], confidence };
//     } else {
//       console.log('[answer] OpenAI returned empty content');
//       throw new Error('Empty response from OpenAI');
//     }
//   } catch (err: any) {
//     // Swallow model errors and fall back
//     console.error('[answer] OpenAI error:', err.message);
//     console.error('[answer] Error details:', {
//       status: err.status,
//       type: err.type,
//       code: err.code,
//       param: err.param,
//     });
//   }

//   // Fallback if OpenAI call failed
//   console.log('[answer] OpenAI failed - falling back to stitched chunks');
//   const stitched = contexts
//     .slice(0, 3)
//     .map(
//       (c, i) =>
//         `**Source ${i + 1}** (${path.basename(c.path)} #${c.chunk_index})\n${
//           c.text
//         }`
//     )
//     .join('\n\n---\n\n');

//   return {
//     answer: `**Answer (from docs)**\n\n${stitched}`,
//     screenshots: [],
//     confidence,
//   };
// }
import { db } from './db';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import type { Retrieved, ImageHit } from './schemas';
import { tfidfVector } from './verctorizer';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

// ---------- Load vocab and IDF ----------
const MODEL_DIR = path.resolve(__dirname, '..');
const VOCAB_PATH = path.join(MODEL_DIR, 'vocab.json');
const IDF_PATH = path.join(MODEL_DIR, 'idf.bin');

type Vocab = Record<string, number>;
const VOCAB: Vocab = fs.existsSync(VOCAB_PATH)
  ? JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'))
  : {};

const idfFile = fs.existsSync(IDF_PATH)
  ? fs.readFileSync(IDF_PATH)
  : Buffer.alloc(0);
const IDF = new Float32Array(
  idfFile.buffer,
  idfFile.byteOffset,
  Math.floor(idfFile.byteLength / 4)
);

console.log(`[rag] Loaded vocab with ${Object.keys(VOCAB).length} terms`);
console.log(`[rag] Loaded IDF with ${IDF.length} dimensions`);

// cosine similarity
function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function loadEmbedding(buf: Buffer) {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function getAllEmbeddings(): {
  rowid: number;
  text: string;
  path: string;
  chunk_index: number;
  emb: Float32Array;
}[] {
  const rows = db
    .prepare(`SELECT rowid, text, path, chunk_index, embedding FROM chunks`)
    .all();
  return rows.map((r: any) => ({
    rowid: r.rowid,
    text: r.text,
    path: r.path,
    chunk_index: r.chunk_index,
    emb: loadEmbedding(r.embedding as Buffer),
  }));
}

const MEMORY = getAllEmbeddings();
console.log(`[rag] Loaded ${MEMORY.length} chunks into memory`);

const IMAGE_INDEX_PATH = path.resolve(__dirname, 'image-index.json');
const IMAGE_INDEX: { filename: string; caption: string; tags: string[] }[] =
  fs.existsSync(IMAGE_INDEX_PATH)
    ? JSON.parse(fs.readFileSync(IMAGE_INDEX_PATH, 'utf8'))
    : [];

// ---------- Retrieval with improved scoring ----------
export async function retrieve(
  query: string,
  topK = 8
): Promise<{ contexts: Retrieved[]; images: ImageHit[] }> {
  const q = query.trim();
  if (!q) return { contexts: [], images: [] };

  const qvec = tfidfVector(q.toLowerCase(), VOCAB, IDF);

  // Extract important query terms
  const queryTerms = q
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 3);

  // Much larger bonus for rare/important terms
  const EXACT_BONUS = 0.5; // Increased from 0.1
  const RARE_TERM_MULTIPLIER = 2.0; // Extra boost for rare words

  // Score all chunks
  const scored = MEMORY.map((m) => {
    let score = (cosine(qvec, m.emb) as number) || 0;
    const hay = m.text.toLowerCase();

    for (const term of queryTerms) {
      if (hay.includes(term)) {
        // Check if term is rare (high IDF = rare term)
        const idx = VOCAB[term];
        const isRareTerm = idx !== undefined && IDF[idx] > 2.0;

        const bonus = isRareTerm
          ? EXACT_BONUS * RARE_TERM_MULTIPLIER
          : EXACT_BONUS;
        score += bonus;
      }
    }

    return {
      score,
      text: m.text,
      path: m.path,
      chunk_index: m.chunk_index,
    };
  });

  // Sort by score
  const hasSignal = scored.some((r) => r.score > 0);
  const sorted = hasSignal ? scored.sort((a, b) => b.score - a.score) : scored;

  // Take top K and format as Retrieved (without score)
  const contexts: Retrieved[] = sorted
    .slice(0, topK)
    .map(({ text, path, chunk_index }) => ({
      text,
      path,
      chunk_index,
    }));

  // Debug logging
  console.log('\n[retrieve]', q);
  sorted.slice(0, 3).forEach((c, i) => {
    const snippet = c.text.replace(/\s+/g, ' ').slice(0, 160);
    console.log(
      `  #${i + 1} ${path.basename(c.path)}#${
        c.chunk_index
      } score=${c.score.toFixed(3)} :: ${snippet} ...`
    );
  });

  const images: ImageHit[] = [];
  return { contexts, images };
}

export async function answer(
  query: string,
  contexts: Retrieved[],
  _images: ImageHit[]
): Promise<{
  answer: string;
  screenshots: string[];
  confidence: 'low' | 'medium' | 'high';
}> {
  console.log('[answer] Starting answer generation for:', query);
  console.log('[answer] OpenAI client exists?', !!openai);
  console.log(
    '[answer] OPENAI_API_KEY exists?',
    !!process.env['OPENAI_API_KEY']
  );
  console.log(
    '[answer] MODEL_RESPONSES:',
    process.env['MODEL_RESPONSES'] || 'not set'
  );

  if (!contexts.length) {
    console.log('[answer] No contexts found');
    return {
      answer:
        "I don't have enough information in the indexed documents to answer that.",
      screenshots: [],
      confidence: 'low',
    };
  }

  const confidence: 'low' | 'medium' | 'high' = 'medium'; // Default since we don't have scores in Retrieved

  // If OpenAI is disabled or misconfigured, return stitched chunks
  if (!openai) {
    console.log('[answer] OpenAI not available - returning stitched chunks');
    const stitched = contexts
      .slice(0, 3)
      .map(
        (c, i) =>
          `**Source ${i + 1}** (${path.basename(c.path)} #${c.chunk_index})\n${
            c.text
          }`
      )
      .join('\n\n---\n\n');

    return {
      answer: `**Answer (from docs)**\n\n${stitched}`,
      screenshots: [],
      confidence,
    };
  }

  // With OpenAI – generate concise answer grounded in context
  const modelName = process.env['MODEL_RESPONSES'] || 'gpt-4o-mini';
  console.log('[answer] Calling OpenAI with model:', modelName);

  const sys = `You are a helpful product documentation assistant. Answer questions using ONLY the provided context.

Rules:
- Give concise, direct answers in markdown format
- Start with a clear, direct answer to the question
- Follow with a brief "Why this is correct" section with 2-3 bullet points
- If the answer isn't in the context, say "I don't know based on the available documentation"
- Use natural, conversational language
- Do NOT include source citations in your answer (they're already tracked separately)`;

  const contextBlock = contexts
    .map(
      (c, i) =>
        `[${i + 1}] (${path.basename(c.path)} #${c.chunk_index})\n${c.text}`
    )
    .join('\n\n');

  try {
    console.log('[answer] Making OpenAI API call...');
    const chat = await openai.chat.completions.create({
      model: modelName,
      temperature: 0.3,
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: `QUESTION:\n${query}\n\nCONTEXT:\n${contextBlock}\n\nAnswer based only on the context above.`,
        },
      ],
    });

    console.log('[answer] OpenAI response received successfully');
    const content = chat.choices?.[0]?.message?.content?.trim() || '';

    if (content) {
      console.log('[answer] Returning formatted answer from OpenAI');
      return { answer: content, screenshots: [], confidence };
    } else {
      console.log('[answer] OpenAI returned empty content');
      throw new Error('Empty response from OpenAI');
    }
  } catch (err: any) {
    console.error('[answer] OpenAI error:', err.message);
    console.error('[answer] Error details:', {
      status: err.status,
      type: err.type,
      code: err.code,
      param: err.param,
    });
  }

  // Fallback if OpenAI call failed
  console.log('[answer] OpenAI failed - falling back to stitched chunks');
  const stitched = contexts
    .slice(0, 3)
    .map(
      (c, i) =>
        `**Source ${i + 1}** (${path.basename(c.path)} #${c.chunk_index})\n${
          c.text
        }`
    )
    .join('\n\n---\n\n');

  return {
    answer: `**Answer (from docs)**\n\n${stitched}`,
    screenshots: [],
    confidence,
  };
}
