"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenize = tokenize;
exports.buildVocabAndIdf = buildVocabAndIdf;
exports.tfidfVector = tfidfVector;
exports.cosine = cosine;
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean);
}
function buildVocabAndIdf(docs) {
    const df = new Map();
    for (const doc of docs) {
        const uniq = new Set(tokenize(doc));
        for (const t of uniq)
            df.set(t, (df.get(t) || 0) + 1);
    }
    const vocab = {};
    const terms = Array.from(df.keys()).sort();
    terms.forEach((t, i) => (vocab[t] = i));
    const N = docs.length || 1;
    const idf = new Float32Array(terms.length);
    terms.forEach((t, i) => {
        const dfi = df.get(t);
        idf[i] = Math.log((N + 1) / (dfi + 1)) + 1; // smoothed idf
    });
    return { vocab, idf };
}
function tfidfVector(text, vocab, idf) {
    const tokens = tokenize(text);
    if (Object.keys(vocab).length === 0)
        return new Float32Array(0);
    const vec = new Float32Array(idf.length);
    if (!tokens.length)
        return vec;
    // term frequency
    const tf = new Map();
    for (const t of tokens) {
        const idx = vocab[t];
        if (idx !== undefined)
            tf.set(idx, (tf.get(idx) || 0) + 1);
    }
    const maxf = Math.max(1, ...tf.values());
    for (const [i, f] of tf) {
        const tfNorm = 0.5 + 0.5 * (f / maxf); // augmented tf
        vec[i] = tfNorm * idf[i];
    }
    return vec;
}
function cosine(a, b) {
    if (a.length !== b.length)
        return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
}
