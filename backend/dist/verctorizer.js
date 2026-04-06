"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenize = tokenize;
exports.buildVocabAndIdf = buildVocabAndIdf;
exports.tfidfVector = tfidfVector;
exports.cosine = cosine;
exports.bm25Score = bm25Score;
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
    const norm = Math.sqrt(na) * Math.sqrt(nb);
    return norm > 0 ? dot / norm : 0;
}
// Add BM25 scoring function
function bm25Score(queryTerms, docText, vocab, idf, k1 = 1.5, // term frequency saturation
b = 0.75 // length normalization
) {
    const docTokens = tokenize(docText);
    const docLength = docTokens.length;
    const avgDocLength = 100; // approximate average chunk size
    // Term frequencies in document
    const termFreq = new Map();
    for (const token of docTokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    let score = 0;
    for (const term of queryTerms) {
        const idx = vocab[term];
        if (idx === undefined)
            continue;
        const tf = termFreq.get(term) || 0;
        if (tf === 0)
            continue;
        // BM25 formula
        const idfScore = idf[idx];
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * (docLength / avgDocLength));
        score += idfScore * (numerator / denominator);
    }
    return score;
}
