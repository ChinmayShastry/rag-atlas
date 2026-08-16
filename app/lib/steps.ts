export interface StepMeta {
  id: string;
  n: number;
  short: string;
}

export const STEPS: StepMeta[] = [
  { id: "corpus", n: 1, short: "Corpus" },
  { id: "chunking", n: 2, short: "Chunking" },
  { id: "embedding", n: 3, short: "Embedding" },
  { id: "query", n: 4, short: "Query" },
  { id: "retrieval", n: 5, short: "Retrieval" },
  { id: "augmentation", n: 6, short: "Augmentation" },
  { id: "generation", n: 7, short: "Generation" },
  { id: "evaluation", n: 8, short: "Evaluation" },
  { id: "guardrails", n: 9, short: "Guardrails" },
];
