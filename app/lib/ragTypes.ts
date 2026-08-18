/**
 * The six RAG architectures the site teaches, and the stage flow each one runs.
 *
 * Flows deliberately share stage ids. Corpus, chunking, embedding, generation,
 * evaluation and guardrails are identical whichever architecture you pick — only
 * the retrieval middle really differs — so the same components are reused and the
 * stage *number* comes from position in the flow rather than being hardcoded.
 */

export type RagType =
  | "naive"
  | "advanced"
  | "agentic"
  | "multihop"
  | "graph"
  | "hierarchical";

export interface StageMeta {
  /** Anchor id and component key. */
  short: string;
}

/** Nav labels for every stage any flow can contain. */
export const STAGE_META: Record<string, StageMeta> = {
  corpus: { short: "Corpus" },
  chunking: { short: "Chunking" },
  embedding: { short: "Embedding" },
  query: { short: "Query" },
  retrieval: { short: "Retrieval" },
  augmentation: { short: "Augmentation" },
  generation: { short: "Generation" },
  evaluation: { short: "Evaluation" },
  guardrails: { short: "Guardrails" },

  // Advanced
  hyde: { short: "HyDE" },
  hybrid: { short: "Hybrid" },
  rerank: { short: "Rerank" },

  // Agentic
  route: { short: "Route" },
  grade: { short: "Grade" },
  correct: { short: "Correct" },
  critique: { short: "Critique" },

  // Multi-hop
  decompose: { short: "Decompose" },
  hops: { short: "Hops" },
  synthesize: { short: "Synthesize" },

  // Graph
  extract: { short: "Extract" },
  graphbuild: { short: "Graph" },
  traverse: { short: "Traverse" },

  // Hierarchical
  tree: { short: "Tree" },
  treeroute: { short: "Route" },
};

export interface RagTypeDef {
  id: RagType;
  name: string;
  tagline: string;
  blurb: string;
  stages: string[];
  /** False while a flow is still being built out. */
  ready: boolean;
}

export const RAG_TYPES: RagTypeDef[] = [
  {
    id: "naive",
    name: "Naive RAG",
    tagline: "Embed, retrieve, stuff, generate.",
    blurb:
      "The original pattern, and still the right default. One embedding pass, a top-K similarity search, and everything retrieved goes straight into the prompt.",
    stages: [
      "corpus",
      "chunking",
      "embedding",
      "query",
      "retrieval",
      "augmentation",
      "generation",
      "evaluation",
      "guardrails",
    ],
    ready: true,
  },
  {
    id: "advanced",
    name: "Advanced RAG",
    tagline: "Same shape, smarter at every step.",
    blurb:
      "Rewrite the query before searching, blend keyword and semantic scoring, then rerank a wide net with a model that reads query and passage together.",
    stages: [
      "corpus",
      "chunking",
      "embedding",
      "query",
      "hyde",
      "hybrid",
      "rerank",
      "augmentation",
      "generation",
      "evaluation",
      "guardrails",
    ],
    ready: true,
  },
  {
    id: "agentic",
    name: "Agentic RAG",
    tagline: "Decide, check, and retry.",
    blurb:
      "The system grades its own retrieval, corrects course when the documents are poor, and critiques its answer before showing it to anyone.",
    stages: [
      "corpus",
      "chunking",
      "embedding",
      "query",
      "route",
      "retrieval",
      "grade",
      "correct",
      "augmentation",
      "generation",
      "critique",
      "evaluation",
      "guardrails",
    ],
    ready: false,
  },
  {
    id: "multihop",
    name: "Multi-hop RAG",
    tagline: "Break the question apart, then chain.",
    blurb:
      "Some questions cannot be answered by any single passage. Decompose into sub-questions, retrieve for each in turn, and feed one hop's answer into the next.",
    stages: [
      "corpus",
      "chunking",
      "embedding",
      "query",
      "decompose",
      "hops",
      "synthesize",
      "generation",
      "evaluation",
      "guardrails",
    ],
    ready: false,
  },
  {
    id: "graph",
    name: "Graph RAG",
    tagline: "Index relationships, not just text.",
    blurb:
      "Extract entities and the relationships between them into a graph. Retrieval walks edges instead of ranking by distance, which is what makes whole-corpus questions answerable.",
    stages: [
      "corpus",
      "chunking",
      "extract",
      "graphbuild",
      "query",
      "traverse",
      "augmentation",
      "generation",
      "evaluation",
      "guardrails",
    ],
    ready: false,
  },
  {
    id: "hierarchical",
    name: "Hierarchical RAG",
    tagline: "Summarise upward into a tree.",
    blurb:
      "RAPTOR clusters chunks and summarises each cluster, recursively. A detail question matches a leaf; a big-picture question matches a summary node, through the same search.",
    stages: [
      "corpus",
      "chunking",
      "tree",
      "query",
      "treeroute",
      "augmentation",
      "generation",
      "evaluation",
      "guardrails",
    ],
    ready: false,
  },
];

/** Every stage component takes its number from its position in the active flow. */
export interface StageProps {
  n: number;
}

const ORDINALS = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
];

export function stageKicker(n: number): string {
  return `Stage ${ORDINALS[n] ?? n}`;
}

export function ragTypeDef(id: RagType): RagTypeDef {
  return RAG_TYPES.find((t) => t.id === id) ?? RAG_TYPES[0];
}

/** 1-based display number of a stage within a given flow, or null if absent. */
export function stageNumber(type: RagType, stageId: string): number | null {
  const i = ragTypeDef(type).stages.indexOf(stageId);
  return i === -1 ? null : i + 1;
}
