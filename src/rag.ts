import { db } from '../backend/src/db';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import type { Retrieved, ImageHit } from './schemas';

const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

// cosine similarity in SQL via dot product is tricky without extensions;
// we'll bring embeddings to JS and compute cosine here (good enough for prototype).
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
const IMAGE_INDEX_PATH = path.resolve(__dirname, 'image-index.json');
const IMAGE_INDEX: { filename: string; caption: string; tags: string[] }[] =
  fs.existsSync(IMAGE_INDEX_PATH)
    ? JSON.parse(fs.readFileSync(IMAGE_INDEX_PATH, 'utf8'))
    : [];

export async function retrieve(
  query: string,
  topK = 6
): Promise<{ contexts: Retrieved[]; images: ImageHit[] }> {
  const { data } = await openai.embeddings.create({
    model: process.env['MODEL_EMBEDDINGS'] || 'text-embedding-3-large',
    input: query,
  });

  const q = new Float32Array(data[0].embedding);
  const scored = MEMORY.map((m) => ({ score: cosine(q, m.emb), m }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ m }) => ({
      text: m.text,
      path: m.path,
      chunk_index: m.chunk_index,
    }));

  // naive image retrieval: term overlap on caption/tags + simple score
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const imgHits = IMAGE_INDEX.map((img) => {
    const hay = (img.caption + ' ' + img.tags.join(' ')).toLowerCase();
    const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
    return { filename: img.filename, caption: img.caption, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return { contexts: scored, images: imgHits };
}

export async function answer(
  query: string,
  contexts: Retrieved[],
  images: ImageHit[]
) {
  const sys = `You are an HRP product assistant. Answer strictly using the provided CONTEXT.
If you are unsure or the answer is outside CONTEXT, say you don't know.
When helpful, reference the most relevant screenshot IDs returned by the server.
Format:
- Start with a concise answer.
- Then "Why this is correct" with bullet points.
- Then "Relevant screenshots" with up to 4 filenames (no made-up images).`;

  const contextBlock = contexts
    .map((c, i) => `[${i + 1}] (${c.path}#${c.chunk_index})\n${c.text}`)
    .join('\n\n');

  const imgBlock = images
    .map((i) => `- ${i.filename}: ${i.caption}`)
    .join('\n');

  // Use chat.completions instead of responses (responses API doesn't support response_format)
  const resp = await openai.chat.completions.create({
    model: process.env['MODEL_RESPONSES'] || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: `QUESTION:
${query}

CONTEXT:
${contextBlock}

CANDIDATE SCREENSHOTS:
${imgBlock}

Return JSON with:
{"answer": "...markdown...", "screenshots": ["file1.png", "..."]}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  const text = resp.choices[0]?.message?.content || '';
  let parsed: { answer: string; screenshots: string[] } = {
    answer: text,
    screenshots: [],
  };
  try {
    parsed = JSON.parse(text);
  } catch {}
  return parsed;
}
