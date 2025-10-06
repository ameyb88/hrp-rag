import express from 'express';
import cors from 'cors';
import path from 'path';
import { retrieve, answer } from './rag';

const app = express();
app.use(cors());
app.use(express.json());

// (optional) serve static images if you have any
app.use('/static', express.static(path.resolve(__dirname, '..', 'public')));

app.get('/api/ping', (_req, res) => res.json({ ok: true }));
app.get('/healthz', (_req, res) => res.sendStatus(200));

app.post('/api/ask', async (req, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Missing query' });

    const { contexts, images } = await retrieve(query, 8);
    const out = await answer(query, contexts, images);

    res.json(out);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'ask failed' });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(PORT, () => console.log(`API listening on :${PORT}`));
