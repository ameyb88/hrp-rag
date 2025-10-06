"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const rag_1 = require("./rag");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// (optional) serve static images if you have any
app.use('/static', express_1.default.static(path_1.default.resolve(__dirname, '..', 'public')));
app.get('/api/ping', (_req, res) => res.json({ ok: true }));
app.get('/healthz', (_req, res) => res.sendStatus(200));
app.post('/api/ask', async (req, res) => {
    try {
        const query = String(req.body?.query || '').trim();
        if (!query)
            return res.status(400).json({ error: 'Missing query' });
        const { contexts, images } = await (0, rag_1.retrieve)(query, 8);
        const out = await (0, rag_1.answer)(query, contexts, images);
        res.json(out);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: e?.message || 'ask failed' });
    }
});
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(PORT, () => console.log(`API listening on :${PORT}`));
