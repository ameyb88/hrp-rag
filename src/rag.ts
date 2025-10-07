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
): Promise<{
  answer: string;
  screenshots: string[];
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
    };
  }

  // If OpenAI is not configured, return formatted chunks
  if (!openai) {
    console.log('[answer] OpenAI not available - returning formatted chunks');
    const formattedAnswer = contexts
      .slice(0, 2)
      .map((c, i) => {
        const filename = c.path.split('/').pop() || c.path;
        return `**Source ${i + 1}** (${filename})\n\n${c.text}`;
      })
      .join('\n\n---\n\n');

    return {
      answer: `**Answer (from docs)**\n\n${formattedAnswer}`,
      screenshots: [],
    };
  }

  // Prepare context for OpenAI
  const contextBlock = contexts
    .map((c, i) => {
      const filename = c.path.split('/').pop() || c.path;
      return `[Source ${i + 1}] (${filename})\n${c.text}`;
    })
    .join('\n\n');

  const imgBlock = images.length
    ? images.map((i) => `- ${i.filename}: ${i.caption}`).join('\n')
    : 'No screenshots available.';

  const systemPrompt = `You are a helpful product documentation assistant. Answer questions using ONLY the provided context.

Rules:
- Give concise, direct answers in markdown format
- If the answer isn't in the context, say "I don't know based on the available documentation"
- Include a brief "Why this is correct" section with 2-3 bullet points
- Only mention screenshots that are actually provided
- Return your response as JSON with this structure: {"answer": "your markdown answer here", "screenshots": ["filename1.png"]}`;

  const userPrompt = `QUESTION:
${query}

CONTEXT:
${contextBlock}

AVAILABLE SCREENSHOTS:
${imgBlock}`;

  try {
    console.log('[answer] Calling OpenAI API...');
    const resp = await openai.chat.completions.create({
      model: process.env['MODEL_RESPONSES'] || 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    console.log('[answer] OpenAI response received successfully');
    const text = resp.choices[0]?.message?.content || '';

    if (!text) {
      console.log('[answer] Empty response from OpenAI');
      throw new Error('Empty response from OpenAI');
    }

    const parsed: { answer: string; screenshots: string[] } = JSON.parse(text);
    console.log('[answer] Successfully parsed JSON response');

    return {
      answer: parsed.answer || text,
      screenshots: parsed.screenshots || [],
    };
  } catch (err: any) {
    console.error('[answer] OpenAI error:', err.message);
    console.error('[answer] Error details:', {
      status: err.status,
      type: err.type,
      code: err.code,
      param: err.param,
    });

    // Fallback to formatted chunks on error
    console.log('[answer] Falling back to formatted chunks due to error');
    const formattedAnswer = contexts
      .slice(0, 2)
      .map((c, i) => {
        const filename = c.path.split('/').pop() || c.path;
        return `**Source ${i + 1}** (${filename})\n\n${c.text}`;
      })
      .join('\n\n---\n\n');

    return {
      answer: `**Answer (from docs)**\n\n${formattedAnswer}\n\n*Note: AI formatting temporarily unavailable*`,
      screenshots: [],
    };
  }
}
