"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { chunkDocs } from "./chunking";
import { apiPost } from "./api";
import { costOf } from "./pricing";
import { cosine, fitProjector, project } from "./vector";
import { bm25Scores, buildBm25, fuse } from "./bm25";
import {
  chunksForSpans,
  expand,
  rankCommunities,
  seedNodes,
  spansOf,
} from "./graph";
import type {
  Community,
  GraphNode,
  KnowledgeGraph,
  Subgraph,
} from "./graph";
import { estimateTokens } from "./chunking";
import { collapsedSearch, traversalSearch } from "./tree";
import type { ScoredNode, SummaryTree } from "./tree";
import type {
  Chunk,
  Critique,
  Doc,
  EvalScores,
  GuardResult,
  Hop,
  PassageGrade,
  RouteDecision,
  Scored,
  Strategy,
} from "./types";
import type { RagType } from "./ragTypes";

export const DOC_MANIFEST = [
  {
    id: "coffee",
    title: "Coffee Roasting",
    file: "coffee-roasting.txt",
    blurb: "Roast phases, first and second crack, degassing, storage.",
    /** `accent` reads on cream; `plot` reads on the dark embedding panel. */
    accent: "#C2603A",
    plot: "#E8865C",
  },
  {
    id: "bees",
    title: "Honeybee Colonies",
    file: "honeybee-colonies.txt",
    blurb: "Castes, the waggle dance, thermoregulation, swarming.",
    accent: "#B0811C",
    plot: "#F2C14E",
  },
  {
    id: "kilns",
    title: "Pottery Kiln Firing",
    file: "pottery-kiln-firing.txt",
    blurb: "Cones, quartz inversion, oxidation versus reduction.",
    accent: "#B0455A",
    plot: "#DE6B80",
  },
  {
    id: "marta",
    title: "The Hillside Workshop",
    file: "marta-workshop.txt",
    blurb:
      "A fictional profile whose facts only resolve by looking them up elsewhere.",
    accent: "#5F7A4F",
    plot: "#93B07C",
  },
];

export const DOC_COLORS: Record<string, { accent: string; plot: string }> =
  Object.fromEntries(
    DOC_MANIFEST.map((d) => [d.id, { accent: d.accent, plot: d.plot }]),
  );

export interface UsageEntry {
  model: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  at: number;
}

interface RagState {
  /** Which architecture is on screen. Corpus, chunks and query persist across switches. */
  ragType: RagType;
  setRagType: (t: RagType) => void;

  apiKey: string;
  setApiKey: (k: string) => void;
  /** True when the deployment carries its own key, so no gate is required. */
  demoKeyAvailable: boolean;
  usingDemoKey: boolean;
  /** Either the visitor supplied a key, or the deployment has one. */
  canCallApi: boolean;

  docs: Doc[];
  docsLoading: boolean;
  docsError: string | null;
  activeDocIds: string[];
  toggleDoc: (id: string) => void;

  strategy: Strategy;
  setStrategy: (s: Strategy) => void;
  chunkSize: number;
  setChunkSize: (n: number) => void;
  overlap: number;
  setOverlap: (n: number) => void;
  effectiveOverlap: number;

  activeDocs: Doc[];
  chunks: Chunk[];
  chunkSignature: string;

  vectors: number[][] | null;
  embedDims: number;
  embedding: boolean;
  embedError: string | null;
  embedFromCache: boolean;
  runEmbedding: () => Promise<void>;
  vectorsStale: boolean;

  query: string;
  setQuery: (q: string) => void;
  queryVector: number[] | null;
  querying: boolean;
  queryError: string | null;
  embeddedQuery: string | null;
  runQueryEmbedding: () => Promise<void>;
  /**
   * Accepts the query without embedding it. Graph RAG seeds its walk by
   * lexical match on entity labels, so it never needs a query vector.
   */
  acceptQuery: () => void;

  topK: number;
  setTopK: (n: number) => void;
  minScore: number;
  setMinScore: (n: number) => void;
  ranked: Scored[];
  retrieved: Scored[];

  /* ---- Advanced RAG ---- */
  /** HyDE: a model-written hypothetical passage, embedded and searched with. */
  hydeText: string;
  setHydeText: (s: string) => void;
  hydeVector: number[] | null;
  hydeEmbedding: boolean;
  runHydeEmbedding: (text: string) => Promise<void>;
  useHyde: boolean;
  setUseHyde: (b: boolean) => void;
  /** Weight on dense similarity: 1 pure semantic, 0 pure keyword. */
  hybridAlpha: number;
  setHybridAlpha: (n: number) => void;
  denseScores: number[] | null;
  sparseScores: number[];
  baseRanked: Scored[];
  candidates: Scored[];
  candidateK: number;
  setCandidateK: (n: number) => void;
  rerankScores: Map<string, number> | null;
  setRerankScores: (m: Map<string, number> | null) => void;
  /** Minimum cross-encoder logit to reach the prompt. Roughly calibrated: >0 is relevant. */
  rerankFloor: number;
  setRerankFloor: (n: number) => void;
  /** Shortlist entries the floor rejected, kept for display. */
  rerankRejected: Scored[];

  /* ---- Multi-hop RAG ---- */
  hops: Hop[];
  setHops: React.Dispatch<React.SetStateAction<Hop[]>>;
  planReasoning: string;
  setPlanReasoning: (s: string) => void;
  /** Embeds one piece of text and returns the vector, without touching global state. */
  embedOne: (text: string, kind: "query" | "hyde") => Promise<number[]>;
  /** Cosine-ranks all chunks against an arbitrary vector. */
  rankAgainst: (vector: number[]) => Scored[];

  /* ---- Agentic RAG ---- */
  routeDecision: RouteDecision | null;
  setRouteDecision: (d: RouteDecision | null) => void;
  grades: Map<string, PassageGrade> | null;
  setGrades: (g: Map<string, PassageGrade> | null) => void;
  correctedQuery: string | null;
  setCorrectedQuery: (s: string | null) => void;
  correctionStrategy: string;
  setCorrectionStrategy: (s: string) => void;
  /** Replaces the retrieved set after a corrective re-search. */
  correctedHits: Scored[] | null;
  setCorrectedHits: (s: Scored[] | null) => void;
  critique: Critique | null;
  setCritique: (c: Critique | null) => void;
  /** What agentic retrieval produced before grading removed anything. */
  agenticBase: Scored[];

  /* ---- Graph RAG ---- */
  graph: KnowledgeGraph | null;
  graphLoading: boolean;
  graphError: string | null;
  graphMode: "local" | "global";
  setGraphMode: (m: "local" | "global") => void;
  graphHops: number;
  setGraphHops: (n: number) => void;
  graphSeeds: { node: GraphNode; score: number }[];
  subgraph: Subgraph | null;
  graphCommunities: { community: Community; score: number }[];

  /* ---- Hierarchical RAPTOR ---- */
  tree: SummaryTree | null;
  treeLoading: boolean;
  treeError: string | null;
  /** Node id -> embedding. Computed once, on demand. */
  treeVectors: Map<string, number[]> | null;
  treeEmbedding: boolean;
  runTreeEmbedding: () => Promise<void>;
  treeMode: "collapsed" | "traversal";
  setTreeMode: (m: "collapsed" | "traversal") => void;
  treeKeepPerLevel: number;
  setTreeKeepPerLevel: (n: number) => void;
  treeHits: ScoredNode[];
  treeTraversal: { levels: ScoredNode[][]; selected: ScoredNode[] } | null;

  plot: { chunk: Chunk; x: number; y: number }[];
  queryPoint: { x: number; y: number } | null;

  hovered: string | null;
  setHovered: (id: string | null) => void;

  answer: string;
  setAnswer: (s: string) => void;
  baselineAnswer: string;
  setBaselineAnswer: (s: string) => void;
  temperature: number;
  setTemperature: (n: number) => void;

  scores: EvalScores | null;
  setScores: (s: EvalScores | null) => void;

  serverGuards: GuardResult[];
  setServerGuards: (g: GuardResult[]) => void;
  groundednessThreshold: number;
  setGroundednessThreshold: (n: number) => void;

  usage: UsageEntry[];
  addUsage: (e: Omit<UsageEntry, "at">) => void;
  totalCost: number;
  totalTokens: number;

  furthestStep: number;
  reachStep: (n: number) => void;
}

const Ctx = createContext<RagState | null>(null);

export function useRag(): RagState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRag must be used inside <RagProvider>");
  return ctx;
}

export function RagProvider({
  children,
  demoKeyAvailable,
}: {
  children: React.ReactNode;
  /**
   * Supplied by the server render. Deliberately not fetched from the client:
   * an extra round-trip for this would be blockable by privacy extensions and
   * would gate first paint on a request that can hang.
   */
  demoKeyAvailable: boolean;
}) {
  const [ragType, setRagType] = useState<RagType>("naive");
  const [apiKey, setApiKey] = useState("");

  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [activeDocIds, setActiveDocIds] = useState<string[]>(
    DOC_MANIFEST.map((d) => d.id),
  );

  const [strategy, setStrategy] = useState<Strategy>("recursive");
  const [chunkSize, setChunkSize] = useState(600);
  const [overlap, setOverlap] = useState(80);

  const [vectors, setVectors] = useState<number[][] | null>(null);
  const [vectorSig, setVectorSig] = useState<string | null>(null);
  const [embedDims, setEmbedDims] = useState(0);
  const [embedding, setEmbedding] = useState(false);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [embedFromCache, setEmbedFromCache] = useState(false);

  const [query, setQuery] = useState("");
  const [queryVector, setQueryVector] = useState<number[] | null>(null);
  const [embeddedQuery, setEmbeddedQuery] = useState<string | null>(null);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [topK, setTopK] = useState(4);
  const [minScore, setMinScore] = useState(0);

  const [hydeText, setHydeText] = useState("");
  const [hydeVector, setHydeVector] = useState<number[] | null>(null);
  const [hydeEmbedding, setHydeEmbedding] = useState(false);
  const [useHyde, setUseHyde] = useState(true);
  const [hybridAlpha, setHybridAlpha] = useState(0.6);
  const [candidateK, setCandidateK] = useState(15);
  const [rerankScores, setRerankScores] = useState<Map<string, number> | null>(
    null,
  );
  const [rerankFloor, setRerankFloor] = useState(0);
  const [hops, setHops] = useState<Hop[]>([]);
  const [planReasoning, setPlanReasoning] = useState("");
  const [routeDecision, setRouteDecision] = useState<RouteDecision | null>(null);
  const [grades, setGrades] = useState<Map<string, PassageGrade> | null>(null);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const [correctionStrategy, setCorrectionStrategy] = useState("");
  const [correctedHits, setCorrectedHits] = useState<Scored[] | null>(null);
  const [critique, setCritique] = useState<Critique | null>(null);

  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphMode, setGraphMode] = useState<"local" | "global">("local");
  const [graphHops, setGraphHops] = useState(1);

  const [tree, setTree] = useState<SummaryTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [treeVectors, setTreeVectors] = useState<Map<string, number[]> | null>(
    null,
  );
  const [treeEmbedding, setTreeEmbedding] = useState(false);
  const [treeMode, setTreeMode] = useState<"collapsed" | "traversal">(
    "collapsed",
  );
  const [treeKeepPerLevel, setTreeKeepPerLevel] = useState(2);

  const [hovered, setHovered] = useState<string | null>(null);

  const [answer, setAnswer] = useState("");
  const [baselineAnswer, setBaselineAnswer] = useState("");
  const [temperature, setTemperature] = useState(0.2);

  const [scores, setScores] = useState<EvalScores | null>(null);
  const [serverGuards, setServerGuards] = useState<GuardResult[]>([]);
  const [groundednessThreshold, setGroundednessThreshold] = useState(70);

  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [furthestStep, setFurthestStep] = useState(1);

  // Caches: dragging a slider back to a previous value costs nothing.
  const chunkCache = useRef(new Map<string, number[][]>());
  const queryCache = useRef(new Map<string, number[]>());

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DOC_MANIFEST.map(async (meta) => {
        const res = await fetch(`/corpus/${meta.file}`);
        if (!res.ok) throw new Error(`${meta.file} returned ${res.status}`);
        const text = await res.text();
        return { ...meta, text: text.trim() };
      }),
    )
      .then((loaded) => {
        if (cancelled) return;
        setDocs(loaded);
        setDocsError(null);
        setDocsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Without this the corpus stage renders empty with no explanation.
        setDocsError(
          `Could not load the source documents (${err instanceof Error ? err.message : "network error"}). The server may have stopped — reload once it is running.`,
        );
        setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleDoc = useCallback((id: string) => {
    setActiveDocIds((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((d) => d !== id)
          : prev
        : [...prev, id],
    );
  }, []);

  const activeDocs = useMemo(
    () => docs.filter((d) => activeDocIds.includes(d.id)),
    [docs, activeDocIds],
  );

  const effectiveOverlap = Math.min(overlap, Math.floor(chunkSize / 2));

  const chunks = useMemo(
    () => chunkDocs(activeDocs, strategy, chunkSize, effectiveOverlap),
    [activeDocs, strategy, chunkSize, effectiveOverlap],
  );

  const chunkSignature = `${strategy}|${chunkSize}|${effectiveOverlap}|${activeDocIds
    .slice()
    .sort()
    .join(",")}`;

  const vectorsStale = vectorSig !== null && vectorSig !== chunkSignature;

  const addUsage = useCallback((e: Omit<UsageEntry, "at">) => {
    setUsage((prev) => [...prev, { ...e, at: Date.now() }]);
  }, []);

  const runEmbedding = useCallback(async () => {
    if (!chunks.length) return;
    setEmbedError(null);

    const cached = chunkCache.current.get(chunkSignature);
    if (cached) {
      setVectors(cached);
      setVectorSig(chunkSignature);
      setEmbedDims(cached[0]?.length ?? 0);
      setEmbedFromCache(true);
      return;
    }

    setEmbedding(true);
    setEmbedFromCache(false);
    try {
      const data = await apiPost<{
        vectors: number[][];
        dimensions: number;
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/embed", apiKey, {
        kind: "chunks",
        texts: chunks.map((c) => c.text),
      });

      chunkCache.current.set(chunkSignature, data.vectors);
      setVectors(data.vectors);
      setVectorSig(chunkSignature);
      setEmbedDims(data.dimensions);
      addUsage({
        model: "text-embedding-3-small",
        label: `Embedded ${chunks.length} chunks`,
        inputTokens: data.usage.inputTokens,
        outputTokens: 0,
      });
    } catch (err) {
      setEmbedError(err instanceof Error ? err.message : "Embedding failed.");
    } finally {
      setEmbedding(false);
    }
  }, [chunks, chunkSignature, apiKey, addUsage]);

  const runQueryEmbedding = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setQueryError(null);

    const cached = queryCache.current.get(q);
    if (cached) {
      setQueryVector(cached);
      setEmbeddedQuery(q);
      return;
    }

    setQuerying(true);
    try {
      const data = await apiPost<{
        vectors: number[][];
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/embed", apiKey, { kind: "query", texts: [q] });

      queryCache.current.set(q, data.vectors[0]);
      setQueryVector(data.vectors[0]);
      setEmbeddedQuery(q);
      addUsage({
        model: "text-embedding-3-small",
        label: "Embedded query",
        inputTokens: data.usage.inputTokens,
        outputTokens: 0,
      });
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : "Query embedding failed.");
    } finally {
      setQuerying(false);
    }
  }, [query, apiKey, addUsage]);

  /**
   * Advanced RAG searches with the HyDE passage when one has been embedded,
   * on the theory that a passage matches passages better than a question does.
   */
  const retrievalVector =
    ragType === "advanced" && useHyde && hydeVector ? hydeVector : queryVector;

  const denseScores: number[] | null = useMemo(() => {
    if (!vectors || !retrievalVector || vectorsStale) return null;
    if (vectors.length !== chunks.length) return null;
    return vectors.map((v) => cosine(retrievalVector, v));
  }, [vectors, retrievalVector, chunks.length, vectorsStale]);

  // Lexical index over the current chunks — pure client-side, no cost.
  const bm25Index = useMemo(
    () => buildBm25(chunks.map((c) => c.text)),
    [chunks],
  );

  const sparseScores: number[] = useMemo(() => {
    if (!embeddedQuery) return new Array(chunks.length).fill(0);
    return bm25Scores(bm25Index, embeddedQuery);
  }, [bm25Index, embeddedQuery, chunks.length]);

  /** Ranking before any reranking is applied. Naive uses dense only. */
  const baseRanked: Scored[] = useMemo(() => {
    if (!denseScores) return [];
    const scores =
      ragType === "advanced"
        ? fuse(denseScores, sparseScores, hybridAlpha)
        : denseScores;
    return chunks
      .map((chunk, i) => ({ chunk, score: scores[i] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }, [denseScores, sparseScores, hybridAlpha, chunks, ragType]);

  /** The shortlist a cross-encoder would be run over. */
  const candidates = useMemo(
    () => baseRanked.slice(0, candidateK),
    [baseRanked, candidateK],
  );

  const runHydeEmbedding = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      setHydeEmbedding(true);
      try {
        const data = await apiPost<{
          vectors: number[][];
          usage: { inputTokens: number; outputTokens: number };
        }>("/api/embed", apiKey, { kind: "hyde", texts: [t] });
        setHydeVector(data.vectors[0]);
        addUsage({
          model: "text-embedding-3-small",
          label: "Embedded HyDE passage",
          inputTokens: data.usage.inputTokens,
          outputTokens: 0,
        });
      } catch {
        setHydeVector(null);
      } finally {
        setHydeEmbedding(false);
      }
    },
    [apiKey, addUsage],
  );

  const embedOne = useCallback(
    async (text: string, kind: "query" | "hyde") => {
      const data = await apiPost<{
        vectors: number[][];
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/embed", apiKey, { kind, texts: [text.trim()] });
      addUsage({
        model: "text-embedding-3-small",
        label: "Embedded hop query",
        inputTokens: data.usage.inputTokens,
        outputTokens: 0,
      });
      return data.vectors[0];
    },
    [apiKey, addUsage],
  );

  const rankAgainst = useCallback(
    (vector: number[]): Scored[] => {
      if (!vectors || vectors.length !== chunks.length) return [];
      return chunks
        .map((chunk, i) => ({ chunk, score: cosine(vector, vectors[i]) }))
        .sort((a, b) => b.score - a.score);
    },
    [vectors, chunks],
  );

  const acceptQuery = useCallback(() => {
    const q = query.trim();
    if (q) setEmbeddedQuery(q);
  }, [query]);

  const ranked: Scored[] = useMemo(() => {
    if (ragType !== "advanced" || !rerankScores) return baseRanked;
    const reordered = candidates
      .map((c) => ({ chunk: c.chunk, score: rerankScores.get(c.chunk.id) ?? -99 }))
      .sort((a, b) => b.score - a.score);
    // Anything outside the shortlist never reached the cross-encoder.
    const seen = new Set(reordered.map((r) => r.chunk.id));
    return [...reordered, ...baseRanked.filter((r) => !seen.has(r.chunk.id))];
  }, [ragType, rerankScores, candidates, baseRanked]);

  const reranked = ragType === "advanced" && rerankScores;

  /**
   * Once a cross-encoder has run, only the passages it actually scored are
   * eligible. The rest of `ranked` still carries fused similarity scores on a
   * 0-1 scale, which would sail past a logit floor without ever having been
   * judged.
   */
  const rerankedPool = useMemo(
    () => (reranked ? ranked.filter((r) => rerankScores!.has(r.chunk.id)) : []),
    [reranked, ranked, rerankScores],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/graph/graph.json")
      .then((r) => {
        if (!r.ok) throw new Error(`graph.json returned ${r.status}`);
        return r.json();
      })
      .then((g: KnowledgeGraph) => {
        if (cancelled) return;
        setGraph(g);
        setGraphError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setGraphError(
          `Could not load the knowledge graph (${err instanceof Error ? err.message : "network error"}). Rebuild it with: node scripts/build-graph.mjs`,
        );
      })
      .finally(() => !cancelled && setGraphLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/tree/tree.json")
      .then((r) => {
        if (!r.ok) throw new Error(`tree.json returned ${r.status}`);
        return r.json();
      })
      .then((t: SummaryTree) => {
        if (cancelled) return;
        setTree(t);
        setTreeError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setTreeError(
          `Could not load the summary tree (${err instanceof Error ? err.message : "network error"}). Rebuild it with: node scripts/build-tree.mjs`,
        );
      })
      .finally(() => !cancelled && setTreeLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const runTreeEmbedding = useCallback(async () => {
    if (!tree || treeVectors) return;
    setTreeEmbedding(true);
    try {
      const data = await apiPost<{
        vectors: number[][];
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/embed", apiKey, {
        kind: "chunks",
        texts: tree.nodes.map((n) => n.text),
      });
      const map = new Map<string, number[]>();
      tree.nodes.forEach((n, i) => map.set(n.id, data.vectors[i]));
      setTreeVectors(map);
      addUsage({
        model: "text-embedding-3-small",
        label: `Embedded ${tree.nodes.length} tree nodes`,
        inputTokens: data.usage.inputTokens,
        outputTokens: 0,
      });
    } catch {
      /* surfaced by the stage's own error handling */
    } finally {
      setTreeEmbedding(false);
    }
  }, [tree, treeVectors, apiKey, addUsage]);

  const treeHits = useMemo(() => {
    if (!tree || !treeVectors || !queryVector) return [];
    return collapsedSearch(tree, treeVectors, queryVector, topK);
  }, [tree, treeVectors, queryVector, topK]);

  const treeTraversal = useMemo(() => {
    if (!tree || !treeVectors || !queryVector) return null;
    return traversalSearch(tree, treeVectors, queryVector, treeKeepPerLevel);
  }, [tree, treeVectors, queryVector, treeKeepPerLevel]);

  const graphSeeds = useMemo(
    () => (graph && embeddedQuery ? seedNodes(embeddedQuery, graph) : []),
    [graph, embeddedQuery],
  );

  const subgraph = useMemo(() => {
    if (!graph || graphSeeds.length === 0) return null;
    return expand(
      graph,
      graphSeeds.map((s) => s.node.id),
      graphHops,
    );
  }, [graph, graphSeeds, graphHops]);

  const graphCommunities = useMemo(
    () => (graph && embeddedQuery ? rankCommunities(embeddedQuery, graph) : []),
    [graph, embeddedQuery],
  );

  /** Agentic retrieval before grading prunes anything. */
  const agenticBase = useMemo(
    () =>
      correctedHits ?? ranked.filter((r) => r.score >= minScore).slice(0, topK),
    [correctedHits, ranked, minScore, topK],
  );

  const retrieved = useMemo(() => {
    if (ragType === "hierarchical") {
      // Tree nodes become passages directly: leaves carry source text, higher
      // levels carry summaries of everything beneath them.
      const picked =
        treeMode === "collapsed"
          ? treeHits
          : (treeTraversal?.selected ?? []);
      return picked.map(({ node, score }) => ({
        chunk: {
          id: `tree-${node.id}`,
          docId: node.level === 0 ? (node.span?.docId ?? "tree") : "tree",
          docTitle:
            node.level === 0 ? node.title : `L${node.level} · ${node.title}`,
          index: -1,
          localIndex: node.level,
          text: node.text,
          start: node.span?.start ?? 0,
          end: node.span?.end ?? node.text.length,
          tokens: estimateTokens(node.text),
        },
        score,
      }));
    }
    if (ragType === "graph") {
      // Global mode answers from community summaries rather than passages —
      // the whole point being that no single passage describes a theme.
      if (graphMode === "global") {
        return graphCommunities.map(({ community, score }) => ({
          chunk: {
            id: `community-${community.id}`,
            docId: "graph",
            docTitle: `Community · ${community.label}`,
            index: -1,
            localIndex: community.id,
            text: community.summary,
            start: 0,
            end: community.summary.length,
            tokens: estimateTokens(community.summary),
          },
          score,
        }));
      }
      if (!subgraph) return [];
      return chunksForSpans(spansOf(subgraph), chunks).slice(0, topK);
    }
    // Agentic drops whatever the grader called irrelevant, so a bad passage
    // never reaches the generator in the first place.
    if (ragType === "agentic") {
      if (routeDecision && routeDecision.decision !== "retrieve") return [];
      return agenticBase.filter(
        (r) => grades?.get(r.chunk.id)?.verdict !== "incorrect",
      );
    }
    // Multi-hop hands the generator everything its chain gathered, in hop order
    // and deduplicated — the union is the point, not any single hop's top-K.
    if (ragType === "multihop") {
      const seen = new Set<string>();
      const union: Scored[] = [];
      for (const hop of hops) {
        for (const r of hop.retrieved) {
          if (seen.has(r.chunk.id)) continue;
          seen.add(r.chunk.id);
          union.push(r);
        }
      }
      return union;
    }
    if (reranked) return rerankedPool.filter((r) => r.score >= rerankFloor).slice(0, topK);
    return ranked.filter((r) => r.score >= minScore).slice(0, topK);
  }, [
    ragType,
    treeMode,
    treeHits,
    treeTraversal,
    graphMode,
    graphCommunities,
    subgraph,
    chunks,
    hops,
    routeDecision,
    agenticBase,
    grades,
    reranked,
    rerankedPool,
    rerankFloor,
    ranked,
    minScore,
    topK,
  ]);

  const rerankRejected = useMemo(
    () => (reranked ? rerankedPool.filter((r) => r.score < rerankFloor) : []),
    [reranked, rerankedPool, rerankFloor],
  );

  const projector = useMemo(() => {
    if (!vectors || vectorsStale || vectors.length < 2) return null;
    return fitProjector(vectors);
  }, [vectors, vectorsStale]);

  const plot = useMemo(() => {
    if (!projector || !vectors || vectors.length !== chunks.length) return [];
    return chunks.map((chunk, i) => {
      const p = project(projector, vectors[i]);
      return { chunk, x: p.x, y: p.y };
    });
  }, [projector, vectors, chunks]);

  const queryPoint = useMemo(() => {
    if (!projector || !queryVector) return null;
    return project(projector, queryVector);
  }, [projector, queryVector]);

  const totalCost = useMemo(
    () =>
      usage.reduce(
        (sum, u) => sum + costOf(u.model, u.inputTokens, u.outputTokens),
        0,
      ),
    [usage],
  );

  const totalTokens = useMemo(
    () => usage.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0),
    [usage],
  );

  const reachStep = useCallback((n: number) => {
    setFurthestStep((prev) => (n > prev ? n : prev));
  }, []);

  const value: RagState = {
    ragType,
    setRagType,
    apiKey,
    setApiKey,
    demoKeyAvailable,
    usingDemoKey: demoKeyAvailable && !apiKey,
    canCallApi: !!apiKey || demoKeyAvailable,
    docs,
    docsLoading,
    docsError,
    activeDocIds,
    toggleDoc,
    strategy,
    setStrategy,
    chunkSize,
    setChunkSize,
    overlap,
    setOverlap,
    effectiveOverlap,
    activeDocs,
    chunks,
    chunkSignature,
    vectors: vectorsStale ? null : vectors,
    embedDims,
    embedding,
    embedError,
    embedFromCache,
    runEmbedding,
    vectorsStale,
    query,
    setQuery,
    queryVector,
    querying,
    queryError,
    embeddedQuery,
    runQueryEmbedding,
    acceptQuery,
    topK,
    setTopK,
    minScore,
    setMinScore,
    ranked,
    retrieved,
    hydeText,
    setHydeText,
    hydeVector,
    hydeEmbedding,
    runHydeEmbedding,
    useHyde,
    setUseHyde,
    hybridAlpha,
    setHybridAlpha,
    denseScores,
    sparseScores,
    baseRanked,
    candidates,
    candidateK,
    setCandidateK,
    rerankScores,
    setRerankScores,
    rerankFloor,
    setRerankFloor,
    rerankRejected,
    hops,
    setHops,
    planReasoning,
    setPlanReasoning,
    embedOne,
    rankAgainst,
    routeDecision,
    setRouteDecision,
    grades,
    setGrades,
    correctedQuery,
    setCorrectedQuery,
    correctionStrategy,
    setCorrectionStrategy,
    correctedHits,
    setCorrectedHits,
    critique,
    setCritique,
    agenticBase,
    graph,
    graphLoading,
    graphError,
    graphMode,
    setGraphMode,
    graphHops,
    setGraphHops,
    graphSeeds,
    subgraph,
    graphCommunities,
    tree,
    treeLoading,
    treeError,
    treeVectors,
    treeEmbedding,
    runTreeEmbedding,
    treeMode,
    setTreeMode,
    treeKeepPerLevel,
    setTreeKeepPerLevel,
    treeHits,
    treeTraversal,
    plot,
    queryPoint,
    hovered,
    setHovered,
    answer,
    setAnswer,
    baselineAnswer,
    setBaselineAnswer,
    temperature,
    setTemperature,
    scores,
    setScores,
    serverGuards,
    setServerGuards,
    groundednessThreshold,
    setGroundednessThreshold,
    usage,
    addUsage,
    totalCost,
    totalTokens,
    furthestStep,
    reachStep,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
