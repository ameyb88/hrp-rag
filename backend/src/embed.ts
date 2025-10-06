// import * as fs from 'fs';
// import * as path from 'path';
// import { db } from './db';
// import { buildVocabAndIdf, tfidfVector } from '../src/verctorizer';
// const pdf = require('pdf-parse');

// const DATA_DIR = path.resolve(__dirname, '..', 'data', 'docs');
// const MODEL_DIR = path.resolve(__dirname, '..'); // where we’ll save vocab/idf
// const VOCAB_PATH = path.join(MODEL_DIR, 'vocab.json');
// const IDF_PATH = path.join(MODEL_DIR, 'idf.bin'); // Float32Array

// function chunkText(text: string, max = 1200) {
//   const paras = text.split(/\n{2,}/g);
//   const chunks: string[] = [];
//   let buf = '';
//   for (const p of paras) {
//     if ((buf + '\n\n' + p).length > max && buf) {
//       chunks.push(buf.trim());
//       buf = p;
//     } else {
//       buf = buf ? buf + '\n\n' + p : p;
//     }
//   }
//   if (buf) chunks.push(buf.trim());
//   return chunks;
// }

// async function embedAll() {
//   // 1) Read docs and chunk
//   const files = fs.existsSync(DATA_DIR)
//     ? fs
//         .readdirSync(DATA_DIR)
//         .filter((f) => f.endsWith('.md') || f.endsWith('.pdf'))
//     : [];
//   if (!files.length) {
//     console.log('No .md files in', DATA_DIR);
//     return;
//   }

//   const allChunks: { file: string; full: string; idx: number; text: string }[] =
//     [];
//   for (const file of files) {
//     const full = path.join(DATA_DIR, file);
//     let text = '';
//     if (file.endsWith('.pdf')) {
//       const dataBuffer = fs.readFileSync(full);
//       const pdfData = await pdf(dataBuffer); // ✅ call directly, no .default
//       text = pdfData.text;
//     } else {
//       text = fs.readFileSync(full, 'utf8');
//     }
//     const chunks = chunkText(text);
//     chunks.forEach((t, i) => allChunks.push({ file, full, idx: i, text: t }));
//   }

//   // 2) Build vocab + idf over all chunks
//   const { vocab, idf } = buildVocabAndIdf(allChunks.map((c) => c.text));
//   fs.writeFileSync(VOCAB_PATH, JSON.stringify(vocab), 'utf8');
//   fs.writeFileSync(IDF_PATH, Buffer.from(new Float32Array(idf).buffer));

//   // 3) Store TF-IDF vectors in SQLite (BLOB) like before
//   const insert = db.prepare(`
//     INSERT INTO chunks (doc_id, path, chunk_index, text, embedding)
//     VALUES (@doc_id, @path, @chunk_index, @text, @embedding)
//   `);
//   const clear = db.prepare(`DELETE FROM chunks`);
//   clear.run();

//   for (const c of allChunks) {
//     const vec = tfidfVector(c.text, vocab, idf);
//     const buf = Buffer.from(new Float32Array(vec).buffer);
//     insert.run({
//       doc_id: c.file,
//       path: c.full,
//       chunk_index: c.idx,
//       text: c.text,
//       embedding: buf,
//     });
//   }

//   console.log(`Indexed ${allChunks.length} chunks. Vocab size: ${idf.length}.`);
// }

// embedAll().catch((e) => {
//   console.error(e);
//   process.exit(1);
// });

// backend/src/embed.ts
import { db } from './db';
import { tfidfVector } from './verctorizer';
import * as fs from 'fs';
import * as path from 'path';

// Load vocab and idf
const VOCAB_PATH = path.resolve(__dirname, '..', 'vocab.json');
const IDF_PATH = path.resolve(__dirname, '..', 'idf.bin');

const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
const idfBuffer = fs.readFileSync(IDF_PATH);
const idf = new Float32Array(
  idfBuffer.buffer,
  idfBuffer.byteOffset,
  idfBuffer.length / 4
);

// Calculate cosine similarity
function cosineSimilarity(
  vecA: Float32Array | number[],
  vecB: Float32Array | number[]
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  const length = Math.min(vecA.length, vecB.length);

  for (let i = 0; i < length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Expand query with synonyms and related terms
function expandQuery(query: string): string[] {
  const expansions: Record<string, string[]> = {
    overheat: [
      'overheat',
      'overheating',
      'overheated',
      'high temperature',
      'excessive heat',
      'too hot',
      'temperature warning',
    ],
    engine: ['engine', 'motor', 'powertrain', 'diesel'],
    temperature: ['temperature', 'temp', 'heat', 'thermal', 'hot', 'warm'],
    coolant: ['coolant', 'cooling', 'radiator', 'antifreeze'],
    pressure: ['pressure', 'psi'],
    problem: ['problem', 'issue', 'trouble', 'fault', 'error', 'malfunction'],
    fix: ['fix', 'repair', 'solve', 'troubleshoot', 'remedy'],
    procedure: ['procedure', 'steps', 'process', 'instructions', 'how to'],
    warning: ['warning', 'alert', 'caution', 'notice'],
    check: ['check', 'inspect', 'examine', 'verify', 'test'],
  };

  const queryLower = query.toLowerCase();
  const terms = new Set<string>();

  // Add original query terms
  queryLower.split(/\s+/).forEach((term) => {
    if (term.length > 2) terms.add(term);
  });

  // Add expansions
  Object.entries(expansions).forEach(([key, values]) => {
    if (queryLower.includes(key)) {
      values.forEach((v) => terms.add(v));
    }
  });

  return Array.from(terms);
}

// Enhanced search with query expansion and reranking
export async function search(query: string, topK: number = 5): Promise<any[]> {
  console.log('\n--- Search Query ---');
  console.log('Original query:', query);

  // Expand query
  const expandedTerms = expandQuery(query);
  const expandedQuery = expandedTerms.join(' ');
  console.log('Expanded query:', expandedQuery);

  // Create TF-IDF vector for expanded query
  const queryVec = tfidfVector(expandedQuery, vocab, idf);

  // Get all chunks (we'll filter in memory for better control)
  const allChunks = db
    .prepare(
      `
    SELECT id, doc_id, page_num, chunk_index, text, enhanced_text, embedding
    FROM chunks
  `
    )
    .all();

  console.log(`Searching across ${allChunks.length} chunks...`);

  // Calculate similarities
  const results = allChunks.map((chunk: any) => {
    const chunkVec = new Float32Array(
      chunk.embedding.buffer,
      chunk.embedding.byteOffset,
      chunk.embedding.length / 4
    );

    const similarity = cosineSimilarity(queryVec, chunkVec);

    // Additional scoring factors
    let bonusScore = 0;
    const textLower = chunk.text.toLowerCase();
    const enhancedLower = (chunk.enhanced_text || '').toLowerCase();

    // Boost if query terms appear in text
    expandedTerms.forEach((term) => {
      if (textLower.includes(term)) {
        bonusScore += 0.05;
      }
    });

    // Boost for procedure-related content
    if (
      textLower.includes('procedure') ||
      textLower.includes('steps') ||
      textLower.includes('follow') ||
      textLower.includes('instructions')
    ) {
      bonusScore += 0.1;
    }

    // Boost for warning/caution content
    if (
      textLower.includes('warning') ||
      textLower.includes('caution') ||
      textLower.includes('important')
    ) {
      bonusScore += 0.05;
    }

    return {
      ...chunk,
      similarity: similarity + bonusScore,
      rawSimilarity: similarity,
      bonusScore,
    };
  });

  // Sort by similarity and get top K
  results.sort((a, b) => b.similarity - a.similarity);
  const topResults = results.slice(0, topK);

  console.log('\n--- Top Results ---');
  topResults.forEach((r, idx) => {
    console.log(
      `${idx + 1}. ${r.doc_id} (chunk ${
        r.chunk_index
      }) - Score: ${r.similarity.toFixed(4)} (base: ${r.rawSimilarity.toFixed(
        4
      )}, bonus: ${r.bonusScore.toFixed(4)})`
    );
    console.log(`   Preview: ${r.text.substring(0, 100)}...`);
  });

  return topResults;
}

// Keyword-based fallback search (when semantic search returns low scores)
export function keywordSearch(query: string, topK: number = 5): any[] {
  const expandedTerms = expandQuery(query);

  // Build a SQL LIKE query for each term
  const conditions = expandedTerms
    .map(() => `lower(enhanced_text) LIKE ?`)
    .join(' OR ');
  const params = expandedTerms.map((term) => `%${term}%`);

  const results = db
    .prepare(
      `
    SELECT id, doc_id, page_num, chunk_index, text, enhanced_text
    FROM chunks
    WHERE ${conditions}
    LIMIT ?
  `
    )
    .all(...params, topK);

  console.log(`\nKeyword search found ${results.length} results`);

  return results;
}

// Combined search: try semantic first, fall back to keyword if needed
export async function hybridSearch(
  query: string,
  topK: number = 5
): Promise<any[]> {
  const semanticResults = await search(query, topK);

  // If top result has very low similarity, try keyword search
  if (semanticResults.length === 0 || semanticResults[0].similarity < 0.1) {
    console.log(
      '\n⚠️  Semantic search confidence low, trying keyword search...'
    );
    const keywordResults = keywordSearch(query, topK);

    if (keywordResults.length > 0) {
      console.log('✓ Keyword search found results');
      return keywordResults;
    }
  }

  return semanticResults;
}

// Format results for response
export function formatAnswer(
  query: string,
  results: any[]
): {
  answer: string;
  sources: string[];
  confidence: 'high' | 'medium' | 'low';
} {
  if (results.length === 0) {
    return {
      answer: "I don't have information about that in the available documents.",
      sources: [],
      confidence: 'low',
    };
  }

  // Check confidence based on similarity scores
  const topScore = results[0].similarity || 0;
  const confidence =
    topScore > 0.3 ? 'high' : topScore > 0.15 ? 'medium' : 'low';

  // Combine top results into context
  const context = results
    .slice(0, 3)
    .map((r) => r.text)
    .join('\n\n');

  // Extract sources
  const sources = results.map(
    (r) => `${r.doc_id}${r.page_num > 0 ? ` (chunk ${r.chunk_index})` : ''}`
  );

  return {
    answer: context,
    sources: Array.from(new Set(sources)), // deduplicate
    confidence,
  };
}

// Example usage
if (require.main === module) {
  (async () => {
    const testQuery = 'what should I do if the engine is overheating?';
    console.log('Testing search with query:', testQuery);

    const results = await hybridSearch(testQuery, 5);
    const formatted = formatAnswer(testQuery, results);

    console.log('\n--- Formatted Answer ---');
    console.log('Confidence:', formatted.confidence);
    console.log('Sources:', formatted.sources);
    console.log('\nAnswer:');
    console.log(formatted.answer);
  })();
}
