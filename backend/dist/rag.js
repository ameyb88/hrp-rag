"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.reloadMemory = reloadMemory;
exports.retrieve = retrieve;
exports.answer = answer;
const db_1 = require("./db");
const openai_1 = require("openai");
const path = __importStar(require("path"));
const embeddings_1 = require("./embeddings");
const openai = new openai_1.OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
// Load all embeddings into memory for fast search
function loadEmbedding(buf) {
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
let MEMORY = [];
function reloadMemory() {
    const rows = db_1.db
        .prepare('SELECT rowid, text, path, doc_id, chunk_index, embedding FROM chunks')
        .all();
    MEMORY = rows.map((r) => ({
        rowid: r.rowid,
        text: r.text,
        path: r.path,
        doc_id: r.doc_id,
        chunk_index: r.chunk_index,
        emb: loadEmbedding(r.embedding),
    }));
    console.log(`[rag] Loaded ${MEMORY.length} chunks into memory`);
}
// Initial load
reloadMemory();
async function retrieve(query, topK = 8) {
    const q = query.trim();
    if (!q || MEMORY.length === 0)
        return { contexts: [], images: [] };
    // Embed the query using the same model
    const queryVec = await (0, embeddings_1.embed)(q);
    // Score all chunks by cosine similarity
    const scored = MEMORY.map((m) => ({
        score: (0, embeddings_1.cosine)(queryVec, m.emb),
        text: m.text,
        path: m.path,
        doc_id: m.doc_id,
        chunk_index: m.chunk_index,
    }));
    scored.sort((a, b) => b.score - a.score);
    const contexts = scored
        .slice(0, topK)
        .filter(c => c.score > 0.15) // minimum relevance threshold
        .map(({ text, path: p, chunk_index }) => ({
        text,
        path: p,
        chunk_index,
    }));
    // Debug logging
    console.log('\n[retrieve]', q);
    scored.slice(0, 3).forEach((c, i) => {
        const snippet = c.text.replace(/\s+/g, ' ').slice(0, 120);
        console.log(`  #${i + 1} ${c.doc_id}#${c.chunk_index} score=${c.score.toFixed(3)} :: ${snippet}...`);
    });
    return { contexts, images: [] };
}
async function answer(query, contexts, _images) {
    if (!contexts.length) {
        return {
            answer: "I don't have enough information in the uploaded documents to answer that.",
            screenshots: [],
            confidence: 'low',
        };
    }
    const confidence = contexts.length >= 3 ? 'high' : contexts.length >= 1 ? 'medium' : 'low';
    const modelName = process.env['MODEL_RESPONSES'] || 'gpt-4o-mini';
    console.log('[answer] Using model:', modelName);
    const sys = `You are a helpful product documentation assistant. Answer questions using ONLY the provided context.

Rules:
- Give concise, direct answers in markdown format
- Start with a clear, direct answer to the question
- Follow with a brief "Details:" section with 2-3 bullet points
- If the answer isn't in the context, say "I don't know based on the available documentation"
- Use natural, conversational language
- Do NOT include source citations in your answer (they're already tracked separately)`;
    const contextBlock = contexts
        .map((c, i) => `[${i + 1}] (${path.basename(c.path)} #${c.chunk_index})\n${c.text}`)
        .join('\n\n');
    try {
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
        const content = chat.choices?.[0]?.message?.content?.trim() || '';
        if (content) {
            return { answer: content, screenshots: [], confidence };
        }
        throw new Error('Empty response from OpenAI');
    }
    catch (err) {
        console.error('[answer] OpenAI error:', err.message);
    }
    // Fallback: return stitched chunks
    const stitched = contexts
        .slice(0, 3)
        .map((c, i) => `**Source ${i + 1}** (${path.basename(c.path)} #${c.chunk_index})\n${c.text}`)
        .join('\n\n---\n\n');
    return {
        answer: `**Answer (from docs)**\n\n${stitched}`,
        screenshots: [],
        confidence,
    };
}
