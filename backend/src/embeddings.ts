/**
 * Semantic embedding engine using Xenova/transformers.
 * Runs the all-MiniLM-L6-v2 model entirely locally — no API cost.
 * First run downloads ~80MB model, cached in ~/.cache/ afterwards.
 */

let pipeline: any = null;

async function getEmbeddingPipeline() {
  if (!pipeline) {
    const { pipeline: createPipeline } = await import('@xenova/transformers');
    console.log('[embeddings] Loading embedding model (first time may take a minute)...');
    pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[embeddings] Model loaded.');
  }
  return pipeline;
}

export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return new Float32Array(output.data);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  return norm > 0 ? dot / norm : 0;
}
