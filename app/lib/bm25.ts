/**
 * BM25 lexical scoring, and score fusion with dense similarity.
 *
 * Runs entirely in the browser — no API, no cost. That is worth stating plainly
 * in the UI, because the pairing matters: embeddings are weak at exact tokens
 * ("cone 6", "second crack", a part number) and keyword search is weak at
 * paraphrase. Hybrid retrieval exists because each covers the other's blind spot.
 */

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","but","by","for","from","has","have","he",
  "in","is","it","its","of","on","or","that","the","to","was","were","will",
  "with","what","which","who","how","when","where","why","does","do","did","can",
  "this","these","those","there","their","them","then","than","so","if","not",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface Bm25Index {
  /** Term frequencies per document. */
  tf: Map<string, number>[];
  lengths: number[];
  df: Map<string, number>;
  avgdl: number;
  n: number;
}

export function buildBm25(texts: string[]): Bm25Index {
  const tf: Map<string, number>[] = [];
  const lengths: number[] = [];
  const df = new Map<string, number>();

  for (const text of texts) {
    const terms = tokenize(text);
    const counts = new Map<string, number>();
    for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
    tf.push(counts);
    lengths.push(terms.length);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const total = lengths.reduce((a, b) => a + b, 0);
  return {
    tf,
    lengths,
    df,
    avgdl: texts.length ? total / texts.length : 0,
    n: texts.length,
  };
}

const K1 = 1.5;
const B = 0.75;

/** Raw BM25 score of every indexed document against the query. */
export function bm25Scores(index: Bm25Index, query: string): number[] {
  const terms = tokenize(query);
  const scores = new Array(index.n).fill(0);
  if (!terms.length || !index.avgdl) return scores;

  for (const term of terms) {
    const df = index.df.get(term);
    if (!df) continue;
    // Probabilistic IDF, shifted by +1 so it can never go negative.
    const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));

    for (let d = 0; d < index.n; d++) {
      const f = index.tf[d].get(term);
      if (!f) continue;
      const norm = 1 - B + (B * index.lengths[d]) / index.avgdl;
      scores[d] += idf * ((f * (K1 + 1)) / (f + K1 * norm));
    }
  }
  return scores;
}

/** Min-max rescale to [0,1] so two different score scales can be blended. */
export function normalize(scores: number[]): number[] {
  if (!scores.length) return scores;
  let min = Infinity;
  let max = -Infinity;
  for (const s of scores) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const span = max - min;
  if (span <= 1e-9) return scores.map(() => (max > 0 ? 1 : 0));
  return scores.map((s) => (s - min) / span);
}

/**
 * Weighted fusion of normalised dense and sparse scores.
 * `alpha` is the weight on dense: 1 is pure semantic, 0 is pure keyword.
 */
export function fuse(dense: number[], sparse: number[], alpha: number): number[] {
  const d = normalize(dense);
  const s = normalize(sparse);
  return d.map((v, i) => alpha * v + (1 - alpha) * (s[i] ?? 0));
}
