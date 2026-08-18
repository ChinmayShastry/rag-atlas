import fs from "node:fs";
import path from "node:path";

/**
 * Server-side view of the corpus, used to prove that text submitted to the
 * paid endpoints actually came from our own documents.
 *
 * This is the main thing stopping the deployed demo from being usable as a
 * general-purpose LLM proxy: with the server key in play, the model can only
 * ever be shown text that already exists in these three files.
 */

const FILES = [
  "coffee-roasting.txt",
  "honeybee-colonies.txt",
  "pottery-kiln-firing.txt",
  "marta-workshop.txt",
];

let cache: string[] | null = null;
let summaryCache: string[] | null = null;

/** Collapse all whitespace so CRLF/LF differences cannot cause false rejections. */
function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function loadCorpus(): string[] {
  if (cache) return cache;
  const dir = path.join(process.cwd(), "public", "corpus");
  const out: string[] = [];
  for (const file of FILES) {
    try {
      out.push(normalize(fs.readFileSync(path.join(dir, file), "utf8")));
    } catch {
      // A missing file must not take the app down; see corpusAvailable().
    }
  }
  cache = out;
  return out;
}

/**
 * False when the corpus could not be read at all. Callers fall back to length
 * caps and rate limiting rather than rejecting every request.
 */
export function corpusAvailable(): boolean {
  return loadCorpus().length > 0;
}

/**
 * Graph RAG's global mode retrieves community summaries, and RAPTOR retrieves
 * tree-node summaries. Both are model-written, so neither is a substring of any
 * source document — but both are our own build output, generated offline and
 * committed, so they belong on the allowlist alongside the corpus itself.
 */
function loadSummaries(): string[] {
  if (summaryCache) return summaryCache;
  const out: string[] = [];

  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "public", "graph", "graph.json"),
      "utf8",
    );
    const graph = JSON.parse(raw) as { communities?: { summary?: string }[] };
    for (const c of graph.communities ?? []) {
      const s = normalize(c.summary ?? "");
      if (s) out.push(s);
    }
  } catch {
    /* graph not built */
  }

  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "public", "tree", "tree.json"),
      "utf8",
    );
    const tree = JSON.parse(raw) as { nodes?: { level?: number; text?: string }[] };
    for (const n of tree.nodes ?? []) {
      // Leaves are verbatim source text and are covered by the corpus check.
      if ((n.level ?? 0) === 0) continue;
      const s = normalize(n.text ?? "");
      if (s) out.push(s);
    }
  } catch {
    /* tree not built */
  }

  summaryCache = out;
  return summaryCache;
}

export function isFromCorpus(passage: string): boolean {
  const docs = loadCorpus();
  if (docs.length === 0) return true;
  const needle = normalize(passage);
  if (needle.length < 12) return false;
  if (docs.some((doc) => doc.includes(needle))) return true;
  return loadSummaries().some((s) => s.includes(needle));
}

export interface Passage {
  title: string;
  text: string;
}

export const LIMITS = {
  maxQuestionChars: 400,
  /** HyDE passages are model-written and longer than a question. */
  maxHydeChars: 1500,
  maxPassages: 12,
  maxPassageChars: 4000,
  maxGuardrailChars: 2000,
  maxEmbedChunks: 300,
  maxEmbedChars: 200_000,
};

/**
 * Validates caller-supplied passages. Returns an error string, or null if the
 * passages are all genuine excerpts of the corpus.
 */
export function validatePassages(passages: unknown): string | null {
  if (!Array.isArray(passages)) return "Expected an array of passages.";
  if (passages.length === 0) return "No passages supplied.";
  if (passages.length > LIMITS.maxPassages) {
    return `Too many passages (max ${LIMITS.maxPassages}).`;
  }

  for (const p of passages) {
    if (typeof p?.text !== "string") return "Each passage needs a text field.";
    if (p.text.length > LIMITS.maxPassageChars) {
      return `A passage exceeded ${LIMITS.maxPassageChars} characters.`;
    }
    if (!isFromCorpus(p.text)) {
      return "A passage did not come from this site's documents. The shared demo key only answers questions about the bundled corpus — use your own API key to run arbitrary text.";
    }
  }
  return null;
}
