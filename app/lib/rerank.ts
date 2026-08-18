"use client";

/**
 * A genuine cross-encoder reranker, running in the visitor's browser.
 *
 * The distinction this stage teaches: the embedding search in earlier stages
 * uses a *bi-encoder* — query and passage are encoded separately, never seeing
 * each other, which is what makes precomputing an index possible. A
 * cross-encoder reads the pair together and is far more accurate, but cannot be
 * precomputed, so it only ever runs over a shortlist.
 *
 * Loaded via dynamic import so the ~21 MB of weights never touch the server
 * bundle, and nothing is fetched until the visitor actually asks to rerank.
 */

export const RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";

/**
 * Transformers.js is loaded from a CDN at runtime rather than bundled.
 *
 * It ships prebuilt onnxruntime `.mjs` assets that use `import.meta`, which
 * Next's minifier refuses to parse, and its Node build drags in native
 * onnxruntime binaries the browser has no use for. A runtime import marked
 * `webpackIgnore` keeps all of that out of the build entirely, and keeps the
 * app bundle small for the visitors who never open this stage.
 */
export const TRANSFORMERS_CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

/**
 * The specifier is a literal URL so webpack can see the `webpackIgnore` hint
 * and leave it for the browser. TypeScript cannot resolve a URL specifier, so
 * the module is typed loosely here rather than at every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importTransformers(): Promise<any> {
  // @ts-ignore -- resolved by the browser at runtime, not by the bundler
  return import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0");
}

export interface LoadProgress {
  stage: string;
  /** 0-100, or null while the total size is still unknown. */
  percent: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cached: { tokenizer: any; model: any; device: string } | null = null;
let loading: Promise<void> | null = null;

async function pickDevice(): Promise<"webgpu" | "wasm"> {
  try {
    // navigator.gpu exists but may still fail to hand out an adapter.
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } })
      .gpu;
    if (gpu && (await gpu.requestAdapter())) return "webgpu";
  } catch {
    /* fall through to wasm */
  }
  return "wasm";
}

export async function loadReranker(
  onProgress?: (p: LoadProgress) => void,
): Promise<string> {
  if (cached) return cached.device;
  if (loading) {
    await loading;
    return cached ? (cached as { device: string }).device : "wasm";
  }

  loading = (async () => {
    onProgress?.({ stage: "Fetching model", percent: null });

    const { AutoTokenizer, AutoModelForSequenceClassification, env } =
      await importTransformers();

    // Weights come from the Hugging Face CDN and are cached by the browser.
    env.allowLocalModels = false;

    const device = await pickDevice();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const progress = (p: any) => {
      if (p?.status === "progress" && typeof p.progress === "number") {
        onProgress?.({
          stage: `Downloading ${p.file ?? "weights"}`,
          percent: Math.round(p.progress),
        });
      } else if (p?.status === "ready") {
        onProgress?.({ stage: "Ready", percent: 100 });
      }
    };

    const tokenizer = await AutoTokenizer.from_pretrained(RERANK_MODEL, {
      progress_callback: progress,
    });

    const model = await AutoModelForSequenceClassification.from_pretrained(
      RERANK_MODEL,
      { dtype: "int8", device, progress_callback: progress },
    );

    cached = { tokenizer, model, device };
    onProgress?.({ stage: "Ready", percent: 100 });
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
  return cached ? (cached as { device: string }).device : "wasm";
}

export function rerankerLoaded(): boolean {
  return cached !== null;
}

/**
 * Relevance logit for each passage against the query. Higher is more relevant;
 * the scale is unbounded and not comparable to a cosine similarity, which is
 * exactly why the UI shows rank movement rather than raw score deltas.
 */
export async function crossEncode(
  query: string,
  passages: string[],
  batchSize = 8,
): Promise<number[]> {
  if (!cached) throw new Error("Reranker not loaded.");
  const { tokenizer, model } = cached;
  const out: number[] = [];

  for (let i = 0; i < passages.length; i += batchSize) {
    const batch = passages.slice(i, i + batchSize);
    const inputs = tokenizer(new Array(batch.length).fill(query), {
      text_pair: batch,
      padding: true,
      truncation: true,
    });
    const { logits } = await model(inputs);
    const rows = logits.tolist() as number[][];
    for (const row of rows) out.push(row[0]);
  }

  return out;
}
