"use strict";
/**
 * Document ingestion — parses PDF/MD/TXT files, chunks, embeds with local model, stores in SQLite.
 *
 * Usage:
 *   npm run ingest                           # ingest all files in data/docs/
 *   ts-node src/embed.ts path/to/file.pdf    # ingest a specific file
 */
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
exports.ingestFile = ingestFile;
require("dotenv/config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("./db");
const embeddings_1 = require("./embeddings");
const DATA_DIR = path.resolve(__dirname, '..', 'data', 'docs');
const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.pdf'];
function chunkText(text, maxChars = 800, overlap = 100) {
    const paragraphs = text.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);
    const chunks = [];
    let buffer = '';
    for (const para of paragraphs) {
        if ((buffer + '\n\n' + para).length > maxChars && buffer) {
            chunks.push(buffer.trim());
            // Keep overlap from end of previous chunk
            const words = buffer.split(/\s+/);
            const overlapWords = words.slice(-Math.min(20, Math.floor(words.length / 4)));
            buffer = overlapWords.join(' ') + '\n\n' + para;
        }
        else {
            buffer = buffer ? buffer + '\n\n' + para : para;
        }
    }
    if (buffer.trim())
        chunks.push(buffer.trim());
    return chunks.filter(c => c.length > 30);
}
async function readFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
        const pdf = require('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        const data = await pdf(buffer);
        return data.text;
    }
    // .md, .txt, or any other text file
    return fs.readFileSync(filePath, 'utf8');
}
async function ingestFile(filePath, fileName) {
    const docId = fileName || path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    console.log(`\n[ingest] Processing: ${docId}`);
    const text = await readFile(filePath);
    console.log(`  Characters: ${text.length}`);
    const chunks = chunkText(text);
    console.log(`  Chunks: ${chunks.length}`);
    // Remove old chunks for this file
    db_1.db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);
    db_1.db.prepare('DELETE FROM documents WHERE filename = ?').run(docId);
    const insert = db_1.db.prepare(`
    INSERT INTO chunks (doc_id, path, chunk_index, text, embedding)
    VALUES (@doc_id, @path, @chunk_index, @text, @embedding)
  `);
    for (let i = 0; i < chunks.length; i++) {
        if (i % 5 === 0)
            console.log(`  Embedding chunk ${i + 1}/${chunks.length}...`);
        const vec = await (0, embeddings_1.embed)(chunks[i]);
        const blob = Buffer.from(vec.buffer);
        insert.run({
            doc_id: docId,
            path: filePath,
            chunk_index: i,
            text: chunks[i],
            embedding: blob,
        });
    }
    db_1.db.prepare(`
    INSERT OR REPLACE INTO documents (filename, file_type, chunk_count)
    VALUES (?, ?, ?)
  `).run(docId, ext.replace('.', ''), chunks.length);
    console.log(`  Done: ${chunks.length} chunks indexed for ${docId}`);
    return chunks.length;
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length > 0) {
        for (const arg of args) {
            if (fs.existsSync(arg)) {
                await ingestFile(path.resolve(arg));
            }
            else {
                console.error(`File not found: ${arg}`);
            }
        }
    }
    else {
        if (!fs.existsSync(DATA_DIR)) {
            console.log(`Data directory not found: ${DATA_DIR}`);
            console.log('Create it and add .md, .txt, or .pdf files.');
            return;
        }
        const files = fs.readdirSync(DATA_DIR)
            .filter(f => SUPPORTED_EXTENSIONS.includes(path.extname(f).toLowerCase()));
        if (!files.length) {
            console.log(`No supported files found in ${DATA_DIR}`);
            return;
        }
        console.log(`Found ${files.length} file(s) to ingest`);
        for (const file of files) {
            await ingestFile(path.join(DATA_DIR, file));
        }
    }
    const totalChunks = db_1.db.prepare('SELECT COUNT(*) as count FROM chunks').get();
    const totalDocs = db_1.db.prepare('SELECT COUNT(*) as count FROM documents').get();
    console.log(`\nIngestion complete! ${totalDocs.count} documents, ${totalChunks.count} total chunks.`);
}
main().catch(console.error);
