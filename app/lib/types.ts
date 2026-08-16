export type Strategy = "fixed" | "sentence" | "recursive";

export interface Doc {
  id: string;
  title: string;
  file: string;
  blurb: string;
  text: string;
}

export interface Chunk {
  id: string;
  docId: string;
  docTitle: string;
  /** Position in the full chunk list, used for colour assignment. */
  index: number;
  /** Position within its own document. */
  localIndex: number;
  text: string;
  /** Character offsets into the source document. */
  start: number;
  end: number;
  tokens: number;
}

export interface Scored {
  chunk: Chunk;
  score: number;
}

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export interface EvalScores {
  faithfulness: number;
  relevance: number;
  completeness: number;
  faithfulnessReason: string;
  relevanceReason: string;
  completenessReason: string;
  unsupportedClaims: string[];
}

export type GuardVerdict = "pass" | "warn" | "block";

export interface GuardResult {
  id: string;
  label: string;
  stage: "input" | "output";
  verdict: GuardVerdict;
  detail: string;
  /** Literal spans that tripped the rule, for highlighting. */
  matches?: string[];
}

export const CHUNK_COLORS = [
  { bg: "#C1553A", ring: "rgba(193,85,58,.30)", tint: "rgba(193,85,58,.13)" },
  { bg: "#DE922B", ring: "rgba(222,146,43,.30)", tint: "rgba(222,146,43,.15)" },
  { bg: "#8C4A32", ring: "rgba(140,74,50,.30)", tint: "rgba(140,74,50,.13)" },
  { bg: "#B8823C", ring: "rgba(184,130,60,.30)", tint: "rgba(184,130,60,.15)" },
  { bg: "#A8484F", ring: "rgba(168,72,79,.30)", tint: "rgba(168,72,79,.13)" },
  { bg: "#6E8257", ring: "rgba(110,130,87,.30)", tint: "rgba(110,130,87,.15)" },
  { bg: "#D2724A", ring: "rgba(210,114,74,.30)", tint: "rgba(210,114,74,.14)" },
  { bg: "#96633C", ring: "rgba(150,99,60,.30)", tint: "rgba(150,99,60,.14)" },
];

export function chunkColor(index: number) {
  return CHUNK_COLORS[index % CHUNK_COLORS.length];
}
