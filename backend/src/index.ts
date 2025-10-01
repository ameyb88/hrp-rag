import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { retrieve, answer } from './rag';

const app = express();
app.use(cors());
app.use(express.json());

app.use('/static', express.static(path.resolve(__dirname, '..', 'public')));

app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.post('/api/ask', async (req, res) => {
  try {
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Missing query' });

    const { contexts, images } = await retrieve(query, 6);
    const out = await answer(query, contexts, images);

    // map filenames -> URLs for the frontend
    const base = '/static/screenshots/';
    out.screenshots = (out.screenshots || []).map((f) => base + f);

    res.json(out);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e?.message || 'ask failed' });
  }
});

app.listen(8080, () => console.log('API listening on http://localhost:8080'));
