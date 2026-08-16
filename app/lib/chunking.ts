import type { Chunk, Doc, Strategy } from "./types";

interface Span {
  start: number;
  end: number;
}

/**
 * Rough token estimate. Good enough for the pre-flight display; every real API
 * call reports its true usage, which is what the cost meter actually bills.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}

/* ------------------------------------------------------------------ *
 * Strategy 1 — fixed-size character windows
 * ------------------------------------------------------------------ */

function fixedSpans(text: string, size: number, overlap: number): Span[] {
  const step = Math.max(1, size - overlap);
  const out: Span[] = [];
  for (let s = 0; s < text.length; s += step) {
    const e = Math.min(text.length, s + size);
    out.push({ start: s, end: e });
    if (e >= text.length) break;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Strategy 2 — sentence boundaries
 * ------------------------------------------------------------------ */

/**
 * Naive sentence scanner. It splits on terminal punctuation followed by
 * whitespace, and on blank lines. It has no abbreviation dictionary, so
 * "e.g." would fool it — a real limitation of sentence splitting that the
 * UI is happy to let you discover.
 */
function sentenceSpans(text: string): Span[] {
  const out: Span[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === "\n" && text[i + 1] === "\n") {
      let j = i;
      while (j < text.length && text[j] === "\n") j++;
      out.push({ start, end: j });
      start = j;
      i = j - 1;
      continue;
    }

    if (c === "." || c === "!" || c === "?") {
      let j = i + 1;
      // absorb trailing closing quotes/brackets
      while (j < text.length && `"')]`.includes(text[j])) j++;
      if (j >= text.length || /\s/.test(text[j])) {
        // absorb the separating whitespace so spans stay contiguous
        while (j < text.length && /[ \t]/.test(text[j])) j++;
        out.push({ start, end: j });
        start = j;
        i = j - 1;
      }
    }
  }

  if (start < text.length) out.push({ start, end: text.length });
  return out.filter((s) => text.slice(s.start, s.end).trim().length > 0);
}

/* ------------------------------------------------------------------ *
 * Strategy 3 — recursive separator descent
 * ------------------------------------------------------------------ */

const SEPARATORS = ["\n\n", "\n", ". ", " "];

/**
 * Walks a ladder of separators from coarsest to finest, only descending when a
 * segment is still larger than the target. This keeps paragraphs whole where it
 * can and degrades gracefully to sentences, then words, then a hard cut.
 */
function recursiveSpans(text: string, size: number): Span[] {
  const out: Span[] = [];

  const walk = (s: number, e: number, depth: number) => {
    if (e - s <= size) {
      out.push({ start: s, end: e });
      return;
    }
    if (depth >= SEPARATORS.length) {
      for (let p = s; p < e; p += size) {
        out.push({ start: p, end: Math.min(e, p + size) });
      }
      return;
    }

    const sep = SEPARATORS[depth];
    const seg = text.slice(s, e);
    if (!seg.includes(sep)) {
      walk(s, e, depth + 1);
      return;
    }

    let cursor = s;
    let from = 0;
    let idx = seg.indexOf(sep, from);
    while (idx !== -1) {
      const cut = s + idx + sep.length;
      if (cut > cursor) walk(cursor, cut, depth + 1);
      cursor = cut;
      from = idx + sep.length;
      idx = seg.indexOf(sep, from);
    }
    if (cursor < e) walk(cursor, e, depth + 1);
  };

  walk(0, text.length, 0);
  return out.filter((s) => text.slice(s.start, s.end).trim().length > 0);
}

/* ------------------------------------------------------------------ *
 * Merge atomic spans into size-bounded chunks with overlap
 * ------------------------------------------------------------------ */

function mergeSpans(spans: Span[], size: number, overlap: number): Span[] {
  const chunks: Span[] = [];
  let i = 0;

  while (i < spans.length) {
    const start = spans[i].start;
    let end = spans[i].end;
    let j = i + 1;

    // Always take at least one span, even if it alone exceeds the target.
    while (j < spans.length && spans[j].end - start <= size) {
      end = spans[j].end;
      j++;
    }

    chunks.push({ start, end });
    if (j >= spans.length) break;

    // Walk backwards to re-include trailing spans worth ~`overlap` characters.
    let k = j;
    let acc = 0;
    while (k - 1 > i && acc + (spans[k - 1].end - spans[k - 1].start) <= overlap) {
      k--;
      acc += spans[k].end - spans[k].start;
    }
    i = Math.max(k, i + 1);
  }

  return chunks;
}

/* ------------------------------------------------------------------ */

export function chunkDocs(
  docs: Doc[],
  strategy: Strategy,
  size: number,
  overlap: number,
): Chunk[] {
  const safeOverlap = Math.min(overlap, Math.max(0, size - 40));
  const chunks: Chunk[] = [];
  let running = 0;

  for (const doc of docs) {
    const text = doc.text;
    let spans: Span[];

    if (strategy === "fixed") {
      spans = fixedSpans(text, size, safeOverlap);
    } else {
      const atoms =
        strategy === "sentence"
          ? sentenceSpans(text)
          : recursiveSpans(text, size);
      spans = mergeSpans(atoms, size, safeOverlap);
    }

    spans.forEach((sp, localIndex) => {
      const raw = text.slice(sp.start, sp.end);
      const body = raw.trim();
      if (!body) return;
      chunks.push({
        id: `${doc.id}#${localIndex}`,
        docId: doc.id,
        docTitle: doc.title,
        index: running++,
        localIndex,
        text: body,
        start: sp.start,
        end: sp.end,
        tokens: estimateTokens(body),
      });
    });
  }

  return chunks;
}

export const STRATEGY_INFO: Record<
  Strategy,
  { name: string; tagline: string; detail: string }
> = {
  fixed: {
    name: "Fixed window",
    tagline: "Cut every N characters, no exceptions.",
    detail:
      "Fast and perfectly predictable, but it slices straight through sentences and even words. Overlap is the only thing saving a fact that lands on a boundary.",
  },
  sentence: {
    name: "Sentence-aware",
    tagline: "Pack whole sentences until the budget runs out.",
    detail:
      "Every chunk ends on a real sentence boundary, so retrieved text always reads cleanly. Chunk sizes come out uneven, and one very long sentence can blow past the target.",
  },
  recursive: {
    name: "Recursive",
    tagline: "Try paragraphs, then sentences, then words.",
    detail:
      "Descends a ladder of separators, only splitting finer when a piece is still too big. Keeps related text together better than the other two, which is why it is the common production default.",
  },
};
