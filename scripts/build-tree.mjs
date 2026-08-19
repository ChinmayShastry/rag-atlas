/**
 * Builds the RAPTOR summary tree.
 *
 *   node scripts/build-tree.mjs
 *
 * Leaves are spans of the source documents. Each level above is produced by
 * clustering the level below and summarising each cluster, recursively, until
 * the level is small enough to stop. Retrieval then searches every level at
 * once, so a detail question matches a leaf and a broad question matches a
 * summary through the same mechanism.
 *
 * Embeddings are computed here to drive clustering but deliberately not stored:
 * at 1536 floats per node the JSON would dwarf the corpus. The app re-embeds
 * the tree once at runtime instead, which is a single cheap batch call.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = path.join(ROOT, "public", "corpus");
const OUT_FILE = path.join(ROOT, "public", "tree", "tree.json");
const CHAT_MODEL = "gpt-4o-mini";
const EMBED_MODEL = "text-embedding-3-small";
const LEAF_TARGET = 700;
const MAX_LEVELS = 3;

const DOCS = JSON.parse(
  fs.readFileSync(path.join(CORPUS_DIR, "manifest.json"), "utf8"),
);

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("OPENAI_API_KEY is not set.");
  process.exit(1);
}

let calls = 0;
let inputTokens = 0;
let outputTokens = 0;

async function embed(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`);
  const data = await res.json();
  calls++;
  inputTokens += data.usage?.prompt_tokens ?? 0;
  const out = new Array(texts.length);
  for (const item of data.data) out[item.index] = item.embedding;
  return out;
}

const SUMMARY_SYSTEM = `You write one summary of several related passages, for a retrieval index.

Rules:
- Cover what the passages collectively say. Do not focus on only one of them.
- Preserve specific figures, temperatures, durations and names where they appear. A summary that drops the numbers is useless for retrieval.
- Write plain declarative prose, not a list, and do not refer to "the passages" or "this text".
- Three to five sentences.
- Also give a short title of three to six words naming what this group is about.`;

const SUMMARY_SCHEMA = {
  name: "cluster_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
    },
    required: ["title", "summary"],
    additionalProperties: false,
  },
};

async function summarise(texts) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM },
        {
          role: "user",
          content: texts.map((t, i) => `PASSAGE ${i + 1}:\n${t}`).join("\n\n"),
        },
      ],
      response_format: { type: "json_schema", json_schema: SUMMARY_SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}: ${await res.text()}`);
  const data = await res.json();
  calls++;
  inputTokens += data.usage?.prompt_tokens ?? 0;
  outputTokens += data.usage?.completion_tokens ?? 0;
  return JSON.parse(data.choices[0].message.content);
}

/* ------------------------------------------------------------------ *
 * Leaves: split each document on paragraph then sentence boundaries
 * ------------------------------------------------------------------ */

function leafSpans(text, target) {
  const spans = [];
  const paras = [];
  const re = /\n\s*\n/g;
  let start = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    paras.push({ start, end: m.index });
    start = re.lastIndex;
  }
  paras.push({ start, end: text.length });

  for (const p of paras) {
    const len = p.end - p.start;
    if (len < 40) continue;
    if (len <= target * 1.4) {
      spans.push(p);
      continue;
    }
    // Long paragraph: break on sentence ends near the target size.
    let s = p.start;
    while (s < p.end) {
      let e = Math.min(p.end, s + target);
      if (e < p.end) {
        const dot = text.lastIndexOf(". ", e);
        if (dot > s + target * 0.4) e = dot + 1;
      }
      spans.push({ start: s, end: e });
      s = e;
    }
  }
  return spans;
}

/* ------------------------------------------------------------------ *
 * Deterministic k-means over cosine distance
 * ------------------------------------------------------------------ */

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function kmeans(vectors, k, seedValue = 12345) {
  const n = vectors.length;
  if (k >= n) return vectors.map((_, i) => i);

  let seed = seedValue >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // k-means++ seeding, so the starting centres are spread out.
  const centres = [vectors[Math.floor(rnd() * n)]];
  while (centres.length < k) {
    const d2 = vectors.map((v) => {
      let best = Infinity;
      for (const c of centres) best = Math.min(best, 1 - dot(v, c));
      return best * best;
    });
    const total = d2.reduce((a, b) => a + b, 0) || 1;
    let r = rnd() * total;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      r -= d2[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centres.push(vectors[pick]);
  }

  let assign = new Array(n).fill(0);
  for (let iter = 0; iter < 40; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < centres.length; c++) {
        const sim = dot(vectors[i], centres[c]);
        if (sim > bestSim) {
          bestSim = sim;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    for (let c = 0; c < centres.length; c++) {
      const members = vectors.filter((_, i) => assign[i] === c);
      if (members.length === 0) continue;
      const mean = new Array(vectors[0].length).fill(0);
      for (const v of members) for (let d = 0; d < v.length; d++) mean[d] += v[d];
      const norm = Math.sqrt(dot(mean, mean)) || 1;
      centres[c] = mean.map((x) => x / norm);
    }
    if (!changed) break;
  }
  return assign;
}

/* ------------------------------------------------------------------ */

async function main() {
  const nodes = [];
  let nextId = 0;

  // Level 0 — the leaves.
  let current = [];
  for (const doc of DOCS) {
    const text = fs.readFileSync(path.join(CORPUS_DIR, doc.file), "utf8").trim();
    for (const span of leafSpans(text, LEAF_TARGET)) {
      const body = text.slice(span.start, span.end).trim();
      if (body.length < 40) continue;
      const node = {
        id: `n${nextId++}`,
        level: 0,
        title: doc.title,
        text: body,
        docs: [doc.id],
        children: [],
        span: { docId: doc.id, start: span.start, end: span.end },
      };
      nodes.push(node);
      current.push(node);
    }
  }
  console.log(`level 0: ${current.length} leaves`);

  let level = 0;
  while (level < MAX_LEVELS && current.length > 3) {
    const vectors = await embed(current.map((c) => c.text));
    const k = Math.max(2, Math.ceil(current.length / 4));
    const assign = kmeans(vectors, k);

    const groups = new Map();
    assign.forEach((c, i) => {
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(current[i]);
    });

    level++;
    const next = [];
    for (const [, members] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      if (members.length === 0) continue;
      const { title, summary } = await summarise(members.map((m) => m.text));
      const docs = [...new Set(members.flatMap((m) => m.docs))];
      const node = {
        id: `n${nextId++}`,
        level,
        title,
        text: summary,
        docs,
        children: members.map((m) => m.id),
      };
      nodes.push(node);
      next.push(node);
      process.stdout.write(`  level ${level}: ${next.length}/${groups.size}\r`);
    }
    console.log(`level ${level}: ${next.length} summaries          `);
    current = next;
  }

  const out = {
    meta: {
      chatModel: CHAT_MODEL,
      embedModel: EMBED_MODEL,
      builtAt: new Date().toISOString(),
      leafTarget: LEAF_TARGET,
      levels: level + 1,
      calls,
      inputTokens,
      outputTokens,
      estimatedCostUsd:
        (inputTokens * 0.15) / 1e6 + (outputTokens * 0.6) / 1e6,
    },
    nodes,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1));

  console.log(`\n${nodes.length} nodes across ${level + 1} levels`);
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
  console.log(
    `${calls} calls · ~$${out.meta.estimatedCostUsd.toFixed(4)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
