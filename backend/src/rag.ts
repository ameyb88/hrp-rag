import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai'; // still used for answer generation only
import { db } from './db';
import { tfidfVector, cosine } from '../src/verctorizer';

const OPENAI_API_KEY = process.env['OPENAI_API_KEY']; // optional if you want LLM answers
const MODEL_RESPONSES = process.env['MODEL_RESPONSES'] || 'gpt-4o-mini'; // pick a cheap model or replace with rules

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Load vocab/idf produced by embed.ts
const MODEL_DIR = path.resolve(__dirname, '..');
const VOCAB_PATH = path.join(MODEL_DIR, 'vocab.json');
const IDF_PATH = path.join(MODEL_DIR, 'idf.bin');

type Vocab = Record<string, number>;
const VOCAB: Vocab = fs.existsSync(VOCAB_PATH)
  ? JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'))
  : {};
const IDF = fs.existsSync(IDF_PATH)
  ? new Float32Array(fs.readFileSync(IDF_PATH).buffer)
  : new Float32Array(0);

function loadEmbedding(buf: Buffer) {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

type Retrieved = { text: string; path: string; chunk_index: number };
type ImageHit = { filename: string; caption: string; score: number };

const IMAGE_INDEX_PATH = path.resolve(__dirname, 'image-index.json');
const IMAGE_INDEX: { filename: string; caption: string; tags: string[] }[] =
  fs.existsSync(IMAGE_INDEX_PATH)
    ? JSON.parse(fs.readFileSync(IMAGE_INDEX_PATH, 'utf8'))
    : [];

// Preload memory
const MEMORY = db
  .prepare(`SELECT text, path, chunk_index, embedding FROM chunks`)
  .all()
  .map((r: any) => ({
    text: r.text,
    path: r.path,
    chunk_index: r.chunk_index,
    emb: loadEmbedding(r.embedding),
  }));

export async function retrieve(
  query: string,
  topK = 6
): Promise<{ contexts: Retrieved[]; images: ImageHit[] }> {
  const qvec = tfidfVector(query, VOCAB, IDF);

  const contexts = MEMORY.map((m) => ({
    score: cosine(qvec, m.emb) as number,
    m,
  }))
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
    .slice(0, topK)
    .map(({ m }) => ({
      text: m.text,
      path: m.path,
      chunk_index: m.chunk_index,
    }));

  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const images = IMAGE_INDEX.map((img) => {
    const hay = (img.caption + ' ' + img.tags.join(' ')).toLowerCase();
    const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
    return { filename: img.filename, caption: img.caption, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return { contexts, images };
}

export async function answer(
  query: string,
  contexts: Retrieved[],
  images: ImageHit[]
) {
  const baseAnswer = `**Answer (from docs):**
${contexts[0]?.text || "I couldn't find a relevant passage."}

**Why this is correct**
- Based on the top retrieved chunk(s).
- Ask me to cite specific sections if needed.

**Relevant screenshots**
${images.map((i) => `- ${i.filename} — ${i.caption}`).join('\n')}`;

  // If you still want LLM phrasing and you have a key:
  if (openai) {
    const sys = `You are an HRP product assistant. Summarize strictly using the provided CONTEXT. If unsure, say you don't know. Return a concise markdown answer followed by a short bullet list "Why this is correct".`;
    const contextBlock = contexts
      .map((c, i) => `[${i + 1}] (${c.path}#${c.chunk_index})\n${c.text}`)
      .join('\n\n');
    const imgBlock = images
      .map((i) => `- ${i.filename}: ${i.caption}`)
      .join('\n');

    const chat = await openai.chat.completions.create({
      model: MODEL_RESPONSES,
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: `QUESTION:
${query}

CONTEXT:
${contextBlock}

CANDIDATE SCREENSHOTS:
${imgBlock}`,
        },
      ],
    });
    const out = chat.choices[0]?.message?.content?.trim() || baseAnswer;
    return { answer: out, screenshots: images.map((i) => i.filename) };
  }

  // No API key: return the base retrieval-only answer
  return { answer: baseAnswer, screenshots: images.map((i) => i.filename) };
}
