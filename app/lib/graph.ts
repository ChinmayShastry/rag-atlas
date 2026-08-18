import { tokenize } from "./bm25";
import type { Chunk, Scored } from "./types";

/**
 * Runtime side of Graph RAG. The graph itself is built offline by
 * scripts/build-graph.mjs and shipped as a static file, because extraction
 * costs one model call per paragraph and nothing about it changes per visitor.
 *
 * Entities are anchored to character offsets in the source .txt files rather
 * than to chunks, so the graph stays correct however the chunking sliders are
 * set. Mapping spans back to chunks happens here, at query time.
 */

export interface GraphSpan {
  docId: string;
  start: number;
  end: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  description: string;
  docs: string[];
  mentions: GraphSpan[];
  community: number;
  degree: number;
}

export interface GraphEdge {
  s: string;
  t: string;
  relation: string;
  docId: string;
  start: number;
  end: number;
}

export interface Community {
  id: number;
  label: string;
  summary: string;
  nodes: string[];
  size: number;
}

export interface KnowledgeGraph {
  meta: {
    model: string;
    builtAt: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  communities: Community[];
}

export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Distance in hops from the nearest seed, keyed by node id. */
  depth: Map<string, number>;
  seeds: string[];
}

export function nodeIndex(graph: KnowledgeGraph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((n) => [n.id, n]));
}

export function adjacency(graph: KnowledgeGraph): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of graph.nodes) adj.set(n.id, new Set());
  for (const e of graph.edges) {
    adj.get(e.s)?.add(e.t);
    adj.get(e.t)?.add(e.s);
  }
  return adj;
}

/**
 * Picks the entities a query is actually about, by lexical overlap with entity
 * labels. Deliberately not embedding-based: entity labels are one or two words,
 * where an embedding adds cost and little discrimination, and an exact term
 * match is what you want when the user names a thing.
 */
export function seedNodes(
  query: string,
  graph: KnowledgeGraph,
  limit = 6,
): { node: GraphNode; score: number }[] {
  const terms = new Set(tokenize(query));
  if (terms.size === 0) return [];

  const scored: { node: GraphNode; score: number }[] = [];
  for (const node of graph.nodes) {
    const labelTerms = tokenize(node.label);
    if (labelTerms.length === 0) continue;
    let hits = 0;
    for (const t of labelTerms) if (terms.has(t)) hits++;
    if (hits === 0) continue;
    // Favour entities matched in full, then better-connected ones.
    const coverage = hits / labelTerms.length;
    scored.push({
      node,
      score: coverage * 2 + hits + Math.min(node.degree, 8) * 0.15,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Breadth-first expansion from the seeds, out to `hops` edges. */
export function expand(
  graph: KnowledgeGraph,
  seeds: string[],
  hops: number,
  maxNodes = 60,
): Subgraph {
  const index = nodeIndex(graph);
  const adj = adjacency(graph);
  const depth = new Map<string, number>();
  const queue: string[] = [];

  for (const s of seeds) {
    if (!index.has(s)) continue;
    depth.set(s, 0);
    queue.push(s);
  }

  let head = 0;
  while (head < queue.length && depth.size < maxNodes) {
    const id = queue[head++];
    const d = depth.get(id) ?? 0;
    if (d >= hops) continue;
    for (const nb of adj.get(id) ?? []) {
      if (depth.has(nb)) continue;
      depth.set(nb, d + 1);
      queue.push(nb);
      if (depth.size >= maxNodes) break;
    }
  }

  const nodes = [...depth.keys()]
    .map((id) => index.get(id))
    .filter((n): n is GraphNode => !!n);
  const inSet = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => inSet.has(e.s) && inSet.has(e.t));

  return { nodes, edges, depth, seeds };
}

/** Every source span the subgraph touches, from both entities and relations. */
export function spansOf(sub: Subgraph): GraphSpan[] {
  const spans: GraphSpan[] = [];
  for (const n of sub.nodes) spans.push(...n.mentions);
  for (const e of sub.edges)
    spans.push({ docId: e.docId, start: e.start, end: e.end });
  return spans;
}

/**
 * Maps source spans onto whichever chunks currently overlap them. The score is
 * how many spans a chunk covers, so a chunk the walk touched repeatedly ranks
 * above one it grazed.
 */
export function chunksForSpans(spans: GraphSpan[], chunks: Chunk[]): Scored[] {
  const hits = new Map<string, { chunk: Chunk; count: number }>();
  for (const span of spans) {
    for (const chunk of chunks) {
      if (chunk.docId !== span.docId) continue;
      if (chunk.start >= span.end || chunk.end <= span.start) continue;
      const existing = hits.get(chunk.id);
      if (existing) existing.count++;
      else hits.set(chunk.id, { chunk, count: 1 });
    }
  }
  const max = Math.max(1, ...[...hits.values()].map((h) => h.count));
  return [...hits.values()]
    .map((h) => ({ chunk: h.chunk, score: h.count / max }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Selects community summaries for a whole-corpus question.
 *
 * Deliberately does NOT require a lexical match. Global questions — "what
 * themes run through these documents?" — share no vocabulary with any single
 * community name, so filtering on overlap returns the clusters least able to
 * answer them. The published method map-reduces over *every* community summary
 * for exactly this reason; this is a cheap approximation of that, biased toward
 * the larger communities, with lexical overlap only breaking ties.
 */
export function rankCommunities(
  query: string,
  graph: KnowledgeGraph,
  limit = 6,
): { community: Community; score: number }[] {
  const terms = new Set(tokenize(query));
  const maxSize = Math.max(1, ...graph.communities.map((c) => c.size));

  return graph.communities
    .map((community) => {
      const text = tokenize(`${community.label} ${community.summary}`);
      let hits = 0;
      for (const t of text) if (terms.has(t)) hits++;
      // Size dominates so a thematic query still gets broad coverage; lexical
      // overlap lifts a directly relevant cluster above an equally large one.
      return {
        community,
        score: (community.size / maxSize) * 2 + hits * 0.6,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ *
 * Deterministic force-directed layout
 * ------------------------------------------------------------------ */

export interface Positioned {
  node: GraphNode;
  x: number;
  y: number;
}

/**
 * Small spring/repulsion simulation, seeded so the same subgraph always draws
 * the same way. Runs on the handful of nodes actually being displayed, not the
 * whole graph.
 */
export function forceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  iterations = 260,
): Positioned[] {
  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) return [{ node: nodes[0], x: 0.5, y: 0.5 }];

  let seed = 0x2f6e2b1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const idx = new Map(nodes.map((node, i) => [node.id, i]));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Start on a ring so the simulation never begins fully degenerate.
    const a = (i / n) * Math.PI * 2;
    xs[i] = Math.cos(a) * 0.3 + (rnd() - 0.5) * 0.05;
    ys[i] = Math.sin(a) * 0.3 + (rnd() - 0.5) * 0.05;
  }

  const links = edges
    .map((e) => [idx.get(e.s), idx.get(e.t)] as [number | undefined, number | undefined])
    .filter((p): p is [number, number] => p[0] !== undefined && p[1] !== undefined);

  const repulsion = 0.0055;
  const springLength = 0.22;
  const springStrength = 0.045;

  for (let it = 0; it < iterations; it++) {
    const cooling = 1 - it / iterations;
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = xs[i] - xs[j];
        let dy = ys[i] - ys[j];
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) {
          dx = (rnd() - 0.5) * 1e-3;
          dy = (rnd() - 0.5) * 1e-3;
          d2 = dx * dx + dy * dy;
        }
        const f = repulsion / d2;
        const d = Math.sqrt(d2);
        fx[i] += (dx / d) * f;
        fy[i] += (dy / d) * f;
        fx[j] -= (dx / d) * f;
        fy[j] -= (dy / d) * f;
      }
    }

    for (const [a, b] of links) {
      const dx = xs[b] - xs[a];
      const dy = ys[b] - ys[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const f = (d - springLength) * springStrength;
      fx[a] += (dx / d) * f;
      fy[a] += (dy / d) * f;
      fx[b] -= (dx / d) * f;
      fy[b] -= (dy / d) * f;
    }

    for (let i = 0; i < n; i++) {
      // Gentle pull to centre keeps disconnected pieces from drifting away.
      fx[i] -= xs[i] * 0.012;
      fy[i] -= ys[i] * 0.012;
      xs[i] += Math.max(-0.05, Math.min(0.05, fx[i])) * cooling;
      ys[i] += Math.max(-0.05, Math.min(0.05, fy[i])) * cooling;
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  return nodes.map((node, i) => ({
    node,
    x: 0.06 + ((xs[i] - minX) / spanX) * 0.88,
    y: 0.06 + ((ys[i] - minY) / spanY) * 0.88,
  }));
}

export const TYPE_COLORS: Record<string, string> = {
  material: "#E8865C",
  process: "#C1553A",
  equipment: "#B0455A",
  organism: "#F2C14E",
  measurement: "#B0811C",
  person: "#93B07C",
  technique: "#DE6B80",
  concept: "#9C8674",
};
