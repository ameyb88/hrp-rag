"use strict";
// import * as fs from 'fs';
// import * as path from 'path';
// import OpenAI from 'openai'; // still used for answer generation only
// import { db } from './db';
// import { tfidfVector, cosine } from '../src/verctorizer';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieve = retrieve;
exports.answer = answer;
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
// backend/src/rag.ts
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const openai_1 = __importDefault(require("openai"));
const db_1 = require("./db");
const verctorizer_1 = require("./verctorizer"); // or './vectorizer'
// ---------- Config ----------
const OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
const MODEL_RESPONSES = process.env['MODEL_RESPONSES'] || 'gpt-4o-mini';
// OpenAI client only if key exists
const openai = OPENAI_API_KEY ? new openai_1.default({ apiKey: OPENAI_API_KEY }) : null;
// ---------- Model artifacts ----------
const MODEL_DIR = path.resolve(__dirname, '..');
const VOCAB_PATH = path.join(MODEL_DIR, 'vocab.json');
const IDF_PATH = path.join(MODEL_DIR, 'idf.bin');
const VOCAB = fs.existsSync(VOCAB_PATH)
    ? JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'))
    : {};
const idfFile = fs.existsSync(IDF_PATH)
    ? fs.readFileSync(IDF_PATH)
    : Buffer.alloc(0);
const IDF = new Float32Array(idfFile.buffer, idfFile.byteOffset, Math.floor(idfFile.byteLength / 4));
// ---------- Load chunk memory ----------
function loadEmbedding(buf) {
    return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}
const MEMORY = db_1.db
    .prepare(`SELECT text, path, chunk_index, embedding FROM chunks`)
    .all().map((r) => ({
    text: r.text,
    path: r.path,
    chunk_index: r.chunk_index,
    emb: loadEmbedding(r.embedding),
}));
console.log(`Loaded ${MEMORY.length} chunks into memory.`);
// ---------- Retrieval ----------
async function retrieve(query, topK = 8) {
    const q = query.trim();
    if (!q)
        return { contexts: [], images: [] };
    // Build TF-IDF vector for the exact user query (lowercased)
    const qvec = (0, verctorizer_1.tfidfVector)(q.toLowerCase(), VOCAB, IDF);
    // Small exact-term bonus helps TF-IDF when wording is identical
    const terms = q
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length >= 3);
    const EXACT_BONUS = 0.1;
    const scored = MEMORY.map((m) => {
        let score = (0, verctorizer_1.cosine)(qvec, m.emb) || 0;
        const hay = m.text.toLowerCase();
        for (const t of terms) {
            if (hay.includes(t))
                score += EXACT_BONUS;
        }
        return {
            text: m.text,
            path: m.path,
            chunk_index: m.chunk_index,
            score: score ?? 0,
        };
    });
    scored.sort((a, b) => b.score - a.score);
    const contexts = scored.slice(0, topK);
    // If you have an image index file you want to keep using, you can wire it back here.
    // For now, we return no screenshots to avoid 404s/CORS confusion.
    const images = [];
    // Debug peek
    console.log('\n[retrieve]', q);
    contexts.slice(0, 3).forEach((c, i) => {
        const snippet = c.text.replace(/\s+/g, ' ').slice(0, 160);
        console.log(`  #${i + 1} ${path.basename(c.path)}#${c.chunk_index} score=${c.score.toFixed(3)} :: ${snippet} ...`);
    });
    return { contexts, images };
}
// ---------- Answering ----------
async function answer(query, contexts, images) {
    if (!contexts.length) {
        return {
            answer: "I don't have enough information in the indexed documents to answer that.",
            screenshots: [],
            confidence: 'low',
        };
    }
    const top = contexts[0].score;
    const confidence = top > 0.3 ? 'high' : top > 0.15 ? 'medium' : 'low';
    // If no OpenAI key, return a simple stitched answer from top chunks
    if (!openai) {
        const stitched = contexts
            .slice(0, 3)
            .map((c, i) => `**Source ${i + 1}** (${path.basename(c.path)} #${c.chunk_index}, relevance: ${(c.score * 100).toFixed(1)}%)\n${c.text}`)
            .join('\n\n---\n\n');
        return {
            answer: `**Answer (from docs)**\n\n${stitched}`,
            screenshots: [],
            confidence,
        };
    }
    // With OpenAI — generate a concise answer grounded in context
    const sys = 'You are a precise product/manual Q&A assistant. Answer ONLY from the provided CONTEXT. ' +
        'If the answer is not present, say you do not know. Keep answers concise and actionable.';
    const contextBlock = contexts
        .map((c, i) => `[${i + 1}] (${path.basename(c.path)} #${c.chunk_index}, score ${c.score.toFixed(3)})\n${c.text}`)
        .join('\n\n');
    const chat = await openai.chat.completions.create({
        model: MODEL_RESPONSES,
        temperature: 0.3,
        messages: [
            { role: 'system', content: sys },
            {
                role: 'user',
                content: `QUESTION:\n${query}\n\nCONTEXT:\n${contextBlock}\n\nAnswer based only on the context.`,
            },
        ],
    });
    const content = chat.choices?.[0]?.message?.content?.trim() || 'No answer.';
    return { answer: content, screenshots: [], confidence };
}
