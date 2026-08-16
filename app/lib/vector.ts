/**
 * Small linear-algebra kit for the embedding visualisation.
 *
 * OpenAI returns 1536-dimensional vectors. To draw them we need two dimensions,
 * so we run a genuine PCA — fit on the chunk vectors via power iteration, then
 * project the query through the *same* transform so distances on screen mean
 * something relative to the chunks.
 */

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/**
 * OpenAI embeddings arrive L2-normalised, so this reduces to a dot product —
 * but we divide anyway so the function is honest for any input.
 */
export function cosine(a: number[], b: number[]): number {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot(a, b) / d;
}

function normalized(v: number[]): number[] {
  const n = norm(v);
  if (n === 0) return v.slice();
  return v.map((x) => x / n);
}

/** Deterministic PRNG so the scatter plot doesn't reshuffle between renders. */
function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

/**
 * Leading right-singular vector of X, found by power iteration on X^T X
 * without ever materialising the 1536x1536 covariance matrix.
 */
function topComponent(X: number[][], iterations = 48): number[] {
  const d = X[0].length;
  const rnd = seededRandom(0x5eed);
  let v = normalized(Array.from({ length: d }, rnd));

  for (let it = 0; it < iterations; it++) {
    const u = X.map((row) => dot(row, v));
    const next = new Array(d).fill(0);
    for (let r = 0; r < X.length; r++) {
      const ur = u[r];
      if (ur === 0) continue;
      const row = X[r];
      for (let c = 0; c < d; c++) next[c] += ur * row[c];
    }
    const n = norm(next);
    if (n < 1e-12) break;
    v = next.map((x) => x / n);
  }
  return v;
}

export interface Projector {
  mean: number[];
  c1: number[];
  c2: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Fits a 2D PCA on the supplied vectors. Returns null if there is too little data. */
export function fitProjector(vectors: number[][]): Projector | null {
  if (vectors.length < 2) return null;
  const d = vectors[0].length;

  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let i = 0; i < d; i++) mean[i] += v[i];
  for (let i = 0; i < d; i++) mean[i] /= vectors.length;

  const centered = vectors.map((v) => v.map((x, i) => x - mean[i]));

  const c1 = topComponent(centered);
  // Deflate along c1 so the second pass finds an orthogonal direction.
  const deflated = centered.map((row) => {
    const p = dot(row, c1);
    return row.map((x, i) => x - p * c1[i]);
  });
  const c2 = topComponent(deflated);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const row of centered) {
    const x = dot(row, c1);
    const y = dot(row, c2);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  // Pad so points never sit flush against the panel edge.
  const padX = (maxX - minX) * 0.12 || 0.01;
  const padY = (maxY - minY) * 0.12 || 0.01;

  return {
    mean,
    c1,
    c2,
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
  };
}

/** Projects a vector into normalised [0,1] plot space using a fitted projector. */
export function project(p: Projector, v: number[]): { x: number; y: number } {
  const centered = v.map((x, i) => x - p.mean[i]);
  const rawX = dot(centered, p.c1);
  const rawY = dot(centered, p.c2);
  const spanX = p.maxX - p.minX || 1;
  const spanY = p.maxY - p.minY || 1;
  return {
    x: clamp01((rawX - p.minX) / spanX),
    y: clamp01((rawY - p.minY) / spanY),
  };
}

function clamp01(n: number): number {
  // A hair of inset so the query marker stays fully on-canvas.
  return Math.min(0.98, Math.max(0.02, n));
}

export interface RankedHit {
  index: number;
  score: number;
}

export function rankBySimilarity(
  query: number[],
  vectors: number[][],
): RankedHit[] {
  return vectors
    .map((v, index) => ({ index, score: cosine(query, v) }))
    .sort((a, b) => b.score - a.score);
}
