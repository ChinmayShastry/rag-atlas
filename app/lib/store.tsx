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
import { fitProjector, project, rankBySimilarity } from "./vector";
import type {
  Chunk,
  Doc,
  EvalScores,
  GuardResult,
  Scored,
  Strategy,
} from "./types";

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
  apiKey: string;
  setApiKey: (k: string) => void;
  /** True when the deployment carries its own key, so no gate is required. */
  demoKeyAvailable: boolean;
  usingDemoKey: boolean;
  configLoaded: boolean;
  /** Either the visitor supplied a key, or the deployment has one. */
  canCallApi: boolean;

  docs: Doc[];
  docsLoading: boolean;
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

  topK: number;
  setTopK: (n: number) => void;
  minScore: number;
  setMinScore: (n: number) => void;
  ranked: Scored[];
  retrieved: Scored[];

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

export function RagProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState("");
  const [demoKeyAvailable, setDemoKeyAvailable] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
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
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setDemoKeyAvailable(!!d.demoKeyAvailable);
      })
      .catch(() => {})
      .finally(() => !cancelled && setConfigLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      DOC_MANIFEST.map(async (meta) => {
        const res = await fetch(`/corpus/${meta.file}`);
        const text = await res.text();
        return { ...meta, text: text.trim() };
      }),
    )
      .then((loaded) => {
        if (cancelled) return;
        setDocs(loaded);
        setDocsLoading(false);
      })
      .catch(() => !cancelled && setDocsLoading(false));
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

  const ranked: Scored[] = useMemo(() => {
    if (!vectors || !queryVector || vectorsStale) return [];
    if (vectors.length !== chunks.length) return [];
    return rankBySimilarity(queryVector, vectors).map((hit) => ({
      chunk: chunks[hit.index],
      score: hit.score,
    }));
  }, [vectors, queryVector, chunks, vectorsStale]);

  const retrieved = useMemo(
    () => ranked.filter((r) => r.score >= minScore).slice(0, topK),
    [ranked, topK, minScore],
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
    apiKey,
    setApiKey,
    demoKeyAvailable,
    usingDemoKey: demoKeyAvailable && !apiKey,
    configLoaded,
    canCallApi: !!apiKey || demoKeyAvailable,
    docs,
    docsLoading,
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
    topK,
    setTopK,
    minScore,
    setMinScore,
    ranked,
    retrieved,
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
