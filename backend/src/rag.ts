// import * as fs from 'fs';
// import * as path from 'path';
// import OpenAI from 'openai'; // still used for answer generation only
// import { db } from './db';
// import { tfidfVector, cosine } from '../src/verctorizer';

// const OPENAI_API_KEY = process.env['OPENAI_API_KEY']; // optional if you want LLM answers
// const MODEL_RESPONSES = process.env['MODEL_RESPONSES'] || 'gpt-4o-mini'; // pick a cheap model or replace with rules

// const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// // Load vocab/idf produced by embed.ts
// const MODEL_DIR = path.resolve(__dirname, '..');
// const VOCAB_PATH = path.join(MODEL_DIR, 'vocab.json');
// const IDF_PATH = path.join(MODEL_DIR, 'idf.bin');

// type Vocab = Record<string, number>;
// const VOCAB: Vocab = fs.existsSync(VOCAB_PATH)
//   ? JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'))
//   : {};
// const IDF = fs.existsSync(IDF_PATH)
//   ? new Float32Array(fs.readFileSync(IDF_PATH).buffer)
//   : new Float32Array(0);

// function loadEmbedding(buf: Buffer) {
//   return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
// }

// type Retrieved = { text: string; path: string; chunk_index: number };
// type ImageHit = { filename: string; caption: string; score: number };

// const IMAGE_INDEX_PATH = path.resolve(__dirname, 'image-index.json');
// const IMAGE_INDEX: { filename: string; caption: string; tags: string[] }[] =
//   fs.existsSync(IMAGE_INDEX_PATH)
//     ? JSON.parse(fs.readFileSync(IMAGE_INDEX_PATH, 'utf8'))
//     : [];

// // Preload memory
// const MEMORY = db
//   .prepare(`SELECT text, path, chunk_index, embedding FROM chunks`)
//   .all()
//   .map((r: any) => ({
//     text: r.text,
//     path: r.path,
//     chunk_index: r.chunk_index,
//     emb: loadEmbedding(r.embedding),
//   }));

// export async function retrieve(
//   query: string,
//   topK = 6
// ): Promise<{ contexts: Retrieved[]; images: ImageHit[] }> {
//   const qvec = tfidfVector(query, VOCAB, IDF);

//   const contexts = MEMORY.map((m) => ({
//     score: cosine(qvec, m.emb) as number,
//     m,
//   }))
//     .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
//     .slice(0, topK)
//     .map(({ m }) => ({
//       text: m.text,
//       path: m.path,
//       chunk_index: m.chunk_index,
//     }));

//   const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
//   const images = IMAGE_INDEX.map((img) => {
//     const hay = (img.caption + ' ' + img.tags.join(' ')).toLowerCase();
//     const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
//     return { filename: img.filename, caption: img.caption, score };
//   })
//     .filter((x) => x.score > 0)
//     .sort((a, b) => b.score - a.score)
//     .slice(0, 4);

//   return { contexts, images };
// }

// export async function answer(
//   query: string,
//   contexts: Retrieved[],
//   images: ImageHit[]
// ) {
//   const baseAnswer = `**Answer (from docs):**
// ${contexts[0]?.text || "I couldn't find a relevant passage."}

// **Why this is correct**
// - Based on the top retrieved chunk(s).
// - Ask me to cite specific sections if needed.

// **Relevant screenshots**
// ${images.map((i) => `- ${i.filename} — ${i.caption}`).join('\n')}`;

//   // If you still want LLM phrasing and you have a key:
//   if (openai) {
//     const sys = `You are an HRP product assistant. Summarize strictly using the provided CONTEXT. If unsure, say you don't know. Return a concise markdown answer followed by a short bullet list "Why this is correct".`;
//     const contextBlock = contexts
//       .map((c, i) => `[${i + 1}] (${c.path}#${c.chunk_index})\n${c.text}`)
//       .join('\n\n');
//     const imgBlock = images
//       .map((i) => `- ${i.filename}: ${i.caption}`)
//       .join('\n');

//     const chat = await openai.chat.completions.create({
//       model: MODEL_RESPONSES,
//       messages: [
//         { role: 'system', content: sys },
//         {
//           role: 'user',
//           content: `QUESTION:
// ${query}

// CONTEXT:
// ${contextBlock}

// CANDIDATE SCREENSHOTS:
// ${imgBlock}`,
//         },
//       ],
//     });
//     const out = chat.choices[0]?.message?.content?.trim() || baseAnswer;
//     return { answer: out, screenshots: images.map((i) => i.filename) };
//   }

//   // No API key: return the base retrieval-only answer
//   return { answer: baseAnswer, screenshots: images.map((i) => i.filename) };
// }

import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { db } from './db';
import { tfidfVector, cosine } from '../src/verctorizer';

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const MODEL_RESPONSES = process.env['MODEL_RESPONSES'] || 'gpt-4o-mini';

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Load vocab/idf
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

type Retrieved = {
  text: string;
  path: string;
  chunk_index: number;
  score: number;
};
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

console.log(`Loaded ${MEMORY.length} chunks into memory`);

// ====== IMPROVED QUERY EXPANSION ======
function expandQuery(query: string): string {
  const expansions: Record<string, string[]> = {
    overheat: [
      'overheat',
      'overheating',
      'overheated',
      'high temperature',
      'excessive heat',
      'too hot',
      'temperature warning',
      'coolant hot',
    ],
    engine: ['engine', 'motor', 'powertrain', 'diesel'],
    temperature: ['temperature', 'temp', 'heat', 'thermal', 'hot'],
    coolant: ['coolant', 'cooling', 'radiator', 'antifreeze', 'coolant level'],
    pressure: ['pressure', 'psi', 'high pressure', 'low pressure'],
    problem: [
      'problem',
      'issue',
      'trouble',
      'fault',
      'error',
      'malfunction',
      'failure',
    ],
    fix: ['fix', 'repair', 'solve', 'troubleshoot', 'remedy', 'correct'],
    procedure: [
      'procedure',
      'steps',
      'process',
      'instructions',
      'how to',
      'what to do',
    ],
    warning: ['warning', 'alert', 'caution', 'notice', 'indicator'],
    check: ['check', 'inspect', 'examine', 'verify', 'test', 'monitor'],
  };

  const queryLower = query.toLowerCase();
  const expandedTerms = new Set<string>();

  // Add original query
  expandedTerms.add(query);

  // Add expansions for matched terms
  Object.entries(expansions).forEach(([key, values]) => {
    if (queryLower.includes(key)) {
      values.forEach((v) => expandedTerms.add(v));
    }
  });

  return Array.from(expandedTerms).join(' ');
}

// ====== ENHANCED RETRIEVE WITH QUERY EXPANSION ======
export async function retrieve(
  query: string,
  topK = 10 // Increased from 6 to get more candidates
): Promise<{ contexts: Retrieved[]; images: ImageHit[] }> {
  console.log('\n--- Retrieve Query ---');
  console.log('Original:', query);

  // Expand query with synonyms
  const expandedQuery = expandQuery(query);
  console.log('Expanded:', expandedQuery);

  // Create vector from expanded query
  const qvec = tfidfVector(expandedQuery, VOCAB, IDF);

  // Calculate similarities
  const scored = MEMORY.map((m) => ({
    score: cosine(qvec, m.emb) as number,
    m,
  }));

  // Add keyword-based bonus scoring
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  scored.forEach((item) => {
    const textLower = item.m.text.toLowerCase();
    let bonusScore = 0;

    // Boost if exact query terms appear
    queryTerms.forEach((term) => {
      if (textLower.includes(term)) {
        bonusScore += 0.1;
      }
    });

    // Boost for procedural content
    if (
      textLower.includes('procedure') ||
      textLower.includes('step') ||
      textLower.includes('follow') ||
      textLower.includes('instructions')
    ) {
      bonusScore += 0.15;
    }

    // Boost for warning/safety content
    if (
      textLower.includes('warning') ||
      textLower.includes('caution') ||
      textLower.includes('important') ||
      textLower.includes('danger')
    ) {
      bonusScore += 0.1;
    }

    // Boost for troubleshooting content
    if (
      textLower.includes('if') &&
      (textLower.includes('check') ||
        textLower.includes('inspect') ||
        textLower.includes('verify'))
    ) {
      bonusScore += 0.1;
    }

    item.score = (item.score || 0) + bonusScore;
  });

  // Sort and get top K
  const contexts = scored
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
    .slice(0, topK)
    .map(({ score, m }) => ({
      text: m.text,
      path: m.path,
      chunk_index: m.chunk_index,
      score: score || 0,
    }));

  // Log top results
  console.log('\n--- Top Results ---');
  contexts.slice(0, 3).forEach((ctx, idx) => {
    console.log(`${idx + 1}. Score: ${ctx.score.toFixed(4)}`);
    console.log(`   Source: ${ctx.path} (chunk ${ctx.chunk_index})`);
    console.log(`   Preview: ${ctx.text.substring(0, 120)}...`);
  });

  // Find relevant images
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

// ====== IMPROVED ANSWER GENERATION ======
export async function answer(
  query: string,
  contexts: Retrieved[],
  images: ImageHit[]
) {
  if (contexts.length === 0 || contexts[0].score < 0.05) {
    return {
      answer:
        "I don't have enough information in the provided documents to answer this question confidently. The documents may not cover this topic, or the question may need to be rephrased.",
      screenshots: [],
      confidence: 'low',
    };
  }

  // Determine confidence
  const topScore = contexts[0].score;
  const confidence =
    topScore > 0.3 ? 'high' : topScore > 0.15 ? 'medium' : 'low';

  // Use OpenAI if available
  if (openai) {
    const sys = `You are a technical documentation assistant specializing in Kenworth vehicle manuals.

Your task:
1. Answer the user's question ONLY using the provided CONTEXT chunks
2. If the context contains step-by-step procedures, present them clearly
3. If the context has warnings or cautions, include them prominently
4. Be specific and technical - use exact terminology from the manual
5. If the context doesn't fully answer the question, say so explicitly
6. Never make up information not in the CONTEXT

Format your answer as:
- A direct answer to the question
- Relevant procedures or steps (if applicable)
- Important warnings or notes (if applicable)
- Source references (chunk numbers)`;

    const contextBlock = contexts
      .map(
        (c, i) => `[Chunk ${i + 1}] (${path.basename(c.path)} - chunk ${
          c.chunk_index
        }, score: ${c.score.toFixed(3)})
${c.text}`
      )
      .join('\n\n---\n\n');

    const imgBlock = images
      .map((i) => `- ${i.filename}: ${i.caption}`)
      .join('\n');

    try {
      const chat = await openai.chat.completions.create({
        model: MODEL_RESPONSES,
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content: `QUESTION: ${query}

CONTEXT (ranked by relevance):
${contextBlock}

${imgBlock ? `AVAILABLE SCREENSHOTS:\n${imgBlock}` : ''}

Please answer the question based on the context above.`,
          },
        ],
        temperature: 0.3, // Lower temperature for more factual responses
      });

      const answer =
        chat.choices[0]?.message?.content?.trim() ||
        "I couldn't generate an answer. Please try rephrasing your question.";

      return {
        answer,
        screenshots: images.map((i) => i.filename),
        confidence,
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      // Fall through to base answer
    }
  }

  // Fallback: no OpenAI or API error
  const baseAnswer = `Based on the available documentation:

${contexts
  .slice(0, 3)
  .map(
    (c, i) =>
      `**Source ${i + 1}** (${path.basename(c.path)}, chunk ${
        c.chunk_index
      }, relevance: ${(c.score * 100).toFixed(1)}%):\n${c.text}`
  )
  .join('\n\n---\n\n')}

${
  images.length > 0
    ? `\n**Related Screenshots:**\n${images
        .map((i) => `- ${i.filename}: ${i.caption}`)
        .join('\n')}`
    : ''
}`;

  return {
    answer: baseAnswer,
    screenshots: images.map((i) => i.filename),
    confidence,
  };
}

// ====== TEST FUNCTION ======
if (require.main === module) {
  (async () => {
    const testQueries = [
      'What should I do if the engine is overheating?',
      'How do I check coolant levels?',
      'Engine temperature warning procedures',
    ];

    for (const query of testQueries) {
      console.log('\n========================================');
      console.log(`Testing: "${query}"`);
      console.log('========================================');

      const { contexts, images } = await retrieve(query, 10);
      const result = await answer(query, contexts, images);

      console.log('\n--- Final Answer ---');
      console.log('Confidence:', result.confidence);
      console.log('\n', result.answer);
      console.log('\nScreenshots:', result.screenshots);
    }
  })();
}
