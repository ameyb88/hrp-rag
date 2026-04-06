"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const rag_1 = require("./rag");
const embed_1 = require("./embed");
const db_1 = require("./db");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve static files (Angular app or admin page)
app.use('/static', express_1.default.static(path_1.default.resolve(__dirname, '..', 'public')));
// Serve the admin upload page
app.use('/admin', express_1.default.static(path_1.default.resolve(__dirname, '..', 'admin')));
// --- File upload config ---
const uploadDir = path_1.default.resolve(__dirname, '..', 'uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const upload = (0, multer_1.default)({
    dest: uploadDir,
    fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.md', '.txt'];
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 },
});
// --- Existing endpoints ---
app.get('/api/ping', (_req, res) => res.json({ ok: true }));
app.get('/healthz', (_req, res) => res.sendStatus(200));
app.post('/api/ask', async (req, res) => {
    try {
        const query = String(req.body?.query || '').trim();
        if (!query)
            return res.status(400).json({ error: 'Missing query' });
        const { contexts, images } = await (0, rag_1.retrieve)(query, 8);
        console.log('[ask] Retrieved contexts:', contexts.length);
        const out = await (0, rag_1.answer)(query, contexts, images);
        res.json(out);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: e?.message || 'ask failed' });
    }
});
// --- New: Upload & ingest documents ---
app.post('/api/upload', (req, res, next) => {
    upload.array('files', 20)(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    const files = req.files;
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }
    const results = [];
    for (const file of files) {
        try {
            const chunkCount = await (0, embed_1.ingestFile)(file.path, file.originalname);
            results.push({ file: file.originalname, chunks: chunkCount, status: 'ok' });
            // Clean up temp file
            fs_1.default.unlinkSync(file.path);
        }
        catch (err) {
            results.push({ file: file.originalname, error: err.message, status: 'error' });
        }
    }
    // Reload embeddings into memory after ingestion
    (0, rag_1.reloadMemory)();
    res.json({ results });
});
// --- New: List indexed documents ---
app.get('/api/documents', (_req, res) => {
    const docs = db_1.db.prepare('SELECT filename, file_type, chunk_count, ingested_at FROM documents ORDER BY ingested_at DESC').all();
    const totalChunks = db_1.db.prepare('SELECT COUNT(*) as count FROM chunks').get();
    res.json({ documents: docs, totalChunks: totalChunks.count });
});
// --- New: Delete a document ---
app.delete('/api/documents/:filename', (req, res) => {
    const { filename } = req.params;
    db_1.db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(filename);
    db_1.db.prepare('DELETE FROM documents WHERE filename = ?').run(filename);
    (0, rag_1.reloadMemory)();
    res.json({ message: `Deleted ${filename}` });
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(PORT, () => {
    console.log(`\n  API listening on http://localhost:${PORT}`);
    console.log(`  Admin panel: http://localhost:${PORT}/admin`);
    console.log(`  Chat API: POST http://localhost:${PORT}/api/ask\n`);
});
