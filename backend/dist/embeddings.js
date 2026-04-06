"use strict";
/**
 * Semantic embedding engine using Xenova/transformers.
 * Runs the all-MiniLM-L6-v2 model entirely locally — no API cost.
 * First run downloads ~80MB model, cached in ~/.cache/ afterwards.
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
exports.embed = embed;
exports.cosine = cosine;
let pipeline = null;
async function getEmbeddingPipeline() {
    if (!pipeline) {
        const { pipeline: createPipeline } = await Promise.resolve().then(() => __importStar(require('@xenova/transformers')));
        console.log('[embeddings] Loading embedding model (first time may take a minute)...');
        pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('[embeddings] Model loaded.');
    }
    return pipeline;
}
async function embed(text) {
    const pipe = await getEmbeddingPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
}
function cosine(a, b) {
    if (a.length !== b.length)
        return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const norm = Math.sqrt(na) * Math.sqrt(nb);
    return norm > 0 ? dot / norm : 0;
}
