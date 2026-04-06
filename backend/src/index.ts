import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { retrieve, answer, reloadMemory } from './rag';
import { ingestFile } from './embed';
import { db } from './db';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (Angular app or admin page)
app.use('/static', express.static(path.resolve(__dirname, '..', 'public')));

// Serve the admin upload page
app.use('/admin', express.static(path.resolve(__dirname, '..', 'admin')));

// --- File upload config ---
const uploadDir = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.md', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`,
        ),
      );
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
    if (!query) return res.status(400).json({ error: 'Missing query' });

    const { contexts, images } = await retrieve(query, 8);
    console.log('[ask] Retrieved contexts:', contexts.length);
    const out = await answer(query, contexts, images);
    res.json(out);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'ask failed' });
  }
});

// --- New: Upload & ingest documents ---
app.post('/api/upload', upload.array('files', 20), async (req: any, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const results = [];
  for (const file of files) {
    try {
      const chunkCount = await ingestFile(file.path, file.originalname);
      results.push({
        file: file.originalname,
        chunks: chunkCount,
        status: 'ok',
      });
      // Clean up temp file
      fs.unlinkSync(file.path);
    } catch (err: any) {
      results.push({
        file: file.originalname,
        error: err.message,
        status: 'error',
      });
    }
  }

  // Reload embeddings into memory after ingestion
  reloadMemory();

  res.json({ results });
});

// --- New: List indexed documents ---
app.get('/api/documents', (_req, res) => {
  const docs = db
    .prepare(
      'SELECT filename, file_type, chunk_count, ingested_at FROM documents ORDER BY ingested_at DESC',
    )
    .all();
  const totalChunks = db
    .prepare('SELECT COUNT(*) as count FROM chunks')
    .get() as any;
  res.json({ documents: docs, totalChunks: totalChunks.count });
});

// --- New: Delete a document ---
app.delete('/api/documents/:filename', (req, res) => {
  const { filename } = req.params;
  db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(filename);
  db.prepare('DELETE FROM documents WHERE filename = ?').run(filename);
  reloadMemory();
  res.json({ message: `Deleted ${filename}` });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(PORT, () => {
  console.log(`\n  API listening on http://localhost:${PORT}`);
  console.log(`  Admin panel: http://localhost:${PORT}/admin`);
  console.log(`  Chat API: POST http://localhost:${PORT}/api/ask\n`);
});
