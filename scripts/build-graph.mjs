/**
 * Builds the knowledge graph that Graph RAG retrieves over.
 *
 * Run offline and commit the result, because extraction is the expensive part
 * of Graph RAG — one model call per text unit — and there is no reason to make
 * every visitor pay for it. The app ships the output as a static file.
 *
 *   node scripts/build-graph.mjs
 *
 * Needs OPENAI_API_KEY in the environment. Roughly 40 small calls.
 *
 * Extraction is deliberately anchored to character offsets in the source .txt
 * files rather than to chunks, so the graph stays valid no matter how the
 * chunking sliders are set at runtime.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = path.join(ROOT, "public", "corpus");
const OUT_FILE = path.join(ROOT, "public", "graph", "graph.json");
const MODEL = "gpt-4o-mini";

const DOCS = [
  { id: "coffee", title: "Coffee Roasting", file: "coffee-roasting.txt" },
  { id: "bees", title: "Honeybee Colonies", file: "honeybee-colonies.txt" },
  { id: "kilns", title: "Pottery Kiln Firing", file: "pottery-kiln-firing.txt" },
  { id: "marta", title: "The Hillside Workshop", file: "marta-workshop.txt" },
];

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("OPENAI_API_KEY is not set.");
  process.exit(1);
}

let calls = 0;
let inputTokens = 0;
let outputTokens = 0;

async function chat(system, user, schema) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: schema },
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  calls++;
  inputTokens += data.usage?.prompt_tokens ?? 0;
  outputTokens += data.usage?.completion_tokens ?? 0;
  return JSON.parse(data.choices[0].message.content);
}

/* ------------------------------------------------------------------ *
 * 1. Split each document into paragraphs, keeping character offsets
 * ------------------------------------------------------------------ */

function paragraphs(text) {
  const out = [];
  const re = /\n\s*\n/g;
  let start = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const end = m.index;
    if (text.slice(start, end).trim().length > 120) out.push({ start, end });
    start = re.lastIndex;
  }
  if (text.slice(start).trim().length > 120) out.push({ start, end: text.length });
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. Extract entities and relationships from each paragraph
 * ------------------------------------------------------------------ */

const EXTRACT_SYSTEM = `You extract a knowledge graph from a passage of technical prose.

Entities:
- Extract concrete, reusable things: materials, processes, equipment, organisms, measurable quantities, named people, and named techniques.
- Use the shortest natural name. Prefer "first crack" over "the first crack event". Prefer "cone 10" over "cone 10 stoneware firing".
- Normalise to lower case unless the name is a proper noun.
- Skip vague abstractions like "the process", "quality", "the result".
- At most 8 entities.

Relationships:
- Only between entities you listed.
- The relation must be a short verb phrase that reads as source -> relation -> target, such as "occurs at", "is fired in", "produces", "requires", "is a kind of".
- Only state relationships the passage actually supports.
- At most 8 relationships.`;

const EXTRACT_SCHEMA = {
  name: "graph_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: {
              type: "string",
              enum: [
                "material",
                "process",
                "equipment",
                "organism",
                "measurement",
                "person",
                "technique",
                "concept",
              ],
            },
            description: { type: "string" },
          },
          required: ["name", "type", "description"],
          additionalProperties: false,
        },
      },
      relationships: {
        type: "array",
        items: {
          type: "object",
          properties: {
            source: { type: "string" },
            target: { type: "string" },
            relation: { type: "string" },
          },
          required: ["source", "target", "relation"],
          additionalProperties: false,
        },
      },
    },
    required: ["entities", "relationships"],
    additionalProperties: false,
  },
};

const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/^the /, "");

/* ------------------------------------------------------------------ *
 * 3. Community detection by label propagation
 * ------------------------------------------------------------------ */

function detectCommunities(nodeIds, adjacency) {
  const labels = new Map(nodeIds.map((id, i) => [id, i]));
  const ordered = [...nodeIds].sort();

  for (let iter = 0; iter < 30; iter++) {
    let changed = false;
    for (const id of ordered) {
      const neighbours = adjacency.get(id);
      if (!neighbours || neighbours.size === 0) continue;
      const counts = new Map();
      for (const nb of neighbours) {
        const l = labels.get(nb);
        counts.set(l, (counts.get(l) ?? 0) + 1);
      }
      // Tie-break on the smallest label so runs are reproducible.
      let best = labels.get(id);
      let bestCount = -1;
      for (const [l, c] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
        if (c > bestCount) {
          bestCount = c;
          best = l;
        }
      }
      if (best !== labels.get(id)) {
        labels.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Renumber densely, largest community first.
  const groups = new Map();
  for (const id of ordered) {
    const l = labels.get(id);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l).push(id);
  }
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
  const result = new Map();
  sorted.forEach((members, i) => members.forEach((id) => result.set(id, i)));
  return { assignment: result, groups: sorted };
}

const SUMMARY_SYSTEM = `You summarise one cluster of a knowledge graph.

You are given the entities in the cluster and the relationships between them. Write:
- "label": a two to four word name for what this cluster is about, in title case.
- "summary": two or three sentences describing what this part of the graph covers, written so it can be read on its own without the graph.

Describe only what the entities and relationships support. Do not invent specifics.`;

const SUMMARY_SCHEMA = {
  name: "community_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      label: { type: "string" },
      summary: { type: "string" },
    },
    required: ["label", "summary"],
    additionalProperties: false,
  },
};

/* ------------------------------------------------------------------ */

async function main() {
  const nodes = new Map(); // normalised name -> node
  const edges = [];

  for (const doc of DOCS) {
    const text = fs.readFileSync(path.join(CORPUS_DIR, doc.file), "utf8").trim();
    const paras = paragraphs(text);
    console.log(`\n${doc.title}: ${paras.length} paragraphs`);

    for (let i = 0; i < paras.length; i++) {
      const { start, end } = paras[i];
      const passage = text.slice(start, end);
      let result;
      try {
        result = await chat(EXTRACT_SYSTEM, passage, EXTRACT_SCHEMA);
      } catch (err) {
        console.error(`  para ${i}: ${err.message}`);
        continue;
      }

      const localNames = new Map();
      for (const e of result.entities ?? []) {
        const id = norm(e.name);
        if (!id || id.length < 2) continue;
        localNames.set(norm(e.name), id);
        const existing = nodes.get(id);
        if (existing) {
          existing.mentions.push({ docId: doc.id, start, end });
          if (!existing.docs.includes(doc.id)) existing.docs.push(doc.id);
        } else {
          nodes.set(id, {
            id,
            label: e.name.trim(),
            type: e.type,
            description: e.description,
            docs: [doc.id],
            mentions: [{ docId: doc.id, start, end }],
          });
        }
      }

      for (const r of result.relationships ?? []) {
        const s = localNames.get(norm(r.source)) ?? norm(r.source);
        const t = localNames.get(norm(r.target)) ?? norm(r.target);
        if (!nodes.has(s) || !nodes.has(t) || s === t) continue;
        edges.push({
          s,
          t,
          relation: r.relation.trim(),
          docId: doc.id,
          start,
          end,
        });
      }
      process.stdout.write(`  para ${i + 1}/${paras.length}\r`);
    }
  }

  // Drop duplicate edges, keeping the first occurrence.
  const seen = new Set();
  const uniqueEdges = edges.filter((e) => {
    const k = `${e.s}|${e.t}|${e.relation.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const adjacency = new Map();
  for (const id of nodes.keys()) adjacency.set(id, new Set());
  for (const e of uniqueEdges) {
    adjacency.get(e.s)?.add(e.t);
    adjacency.get(e.t)?.add(e.s);
  }

  const { assignment, groups } = detectCommunities([...nodes.keys()], adjacency);

  console.log(`\n\n${nodes.size} entities, ${uniqueEdges.length} relationships`);
  console.log(`${groups.filter((g) => g.length > 1).length} communities`);

  const communities = [];
  for (let i = 0; i < groups.length; i++) {
    const members = groups[i];
    if (members.length < 2) continue;
    const inside = uniqueEdges.filter(
      (e) => assignment.get(e.s) === i && assignment.get(e.t) === i,
    );
    const brief = [
      `ENTITIES: ${members.map((m) => `${nodes.get(m).label} (${nodes.get(m).type})`).join(", ")}`,
      `RELATIONSHIPS: ${inside.map((e) => `${nodes.get(e.s).label} -> ${e.relation} -> ${nodes.get(e.t).label}`).join("; ") || "none"}`,
    ].join("\n");

    let summary;
    try {
      summary = await chat(SUMMARY_SYSTEM, brief, SUMMARY_SCHEMA);
    } catch (err) {
      console.error(`  community ${i}: ${err.message}`);
      summary = { label: `Cluster ${i + 1}`, summary: "" };
    }
    communities.push({
      id: i,
      label: summary.label,
      summary: summary.summary,
      nodes: members,
      size: members.length,
    });
    console.log(`  community ${i}: ${summary.label} (${members.length} entities)`);
  }

  const out = {
    meta: {
      model: MODEL,
      builtAt: new Date().toISOString(),
      calls,
      inputTokens,
      outputTokens,
      estimatedCostUsd:
        (inputTokens * 0.15) / 1e6 + (outputTokens * 0.6) / 1e6,
    },
    nodes: [...nodes.values()].map((n) => ({
      ...n,
      community: assignment.get(n.id) ?? -1,
      degree: adjacency.get(n.id)?.size ?? 0,
    })),
    edges: uniqueEdges,
    communities,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1));

  console.log(`\nWrote ${path.relative(ROOT, OUT_FILE)}`);
  console.log(
    `${calls} calls · ${inputTokens} in · ${outputTokens} out · ~$${out.meta.estimatedCostUsd.toFixed(4)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
