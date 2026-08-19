"use client";

import { useState } from "react";
import { apiPost, streamChat } from "../lib/api";
import { useRag } from "../lib/store";
import { RAG_TYPES, ragTypeDef } from "../lib/ragTypes";
import type { RagType } from "../lib/ragTypes";
import { toPassages } from "../lib/prompt";
import { cosine } from "../lib/vector";
import { bm25Scores, buildBm25, fuse } from "../lib/bm25";
import { crossEncode, loadReranker } from "../lib/rerank";
import { chunksForSpans, expand, seedNodes, spansOf } from "../lib/graph";
import { collapsedSearch } from "../lib/tree";
import type { EvalScores, Scored } from "../lib/types";
import { costOf, formatUSD } from "../lib/pricing";
import { ErrorNote, Panel, Spinner } from "./ui";

/**
 * Runs one question through every architecture and lays the results side by
 * side. Opt-in, because it is the only thing on the site that spends real money
 * without the visitor asking for a specific stage.
 *
 * Deliberately does not switch `ragType` to do this. Driving the visible store
 * six times would leave the page in whatever state the last run happened to
 * finish in; instead each pipeline is reproduced here from the same primitives
 * the stages use, and the page you were reading is left exactly as it was.
 */

const PASSAGE_COUNT = 4;

interface Row {
  type: RagType;
  status: "waiting" | "running" | "done" | "skipped" | "error";
  step: string;
  passages: number;
  answer: string;
  scores: EvalScores | null;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  ms: number;
  note?: string;
}

const blank = (type: RagType): Row => ({
  type,
  status: "waiting",
  step: "",
  passages: 0,
  answer: "",
  scores: null,
  inputTokens: 0,
  outputTokens: 0,
  calls: 0,
  ms: 0,
});

export default function ComparisonPanel() {
  const rag = useRag();
  const {
    apiKey,
    canCallApi,
    embeddedQuery,
    queryVector,
    vectors,
    chunks,
    graph,
    tree,
    treeVectors,
    runTreeEmbedding,
    embedOne,
    addUsage,
  } = rag;

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(RAG_TYPES.map((t) => blank(t.id)));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<RagType | null>(null);

  const ready = !!embeddedQuery && !!queryVector && !!vectors;

  const patch = (type: RagType, next: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.type === type ? { ...r, ...next } : r)));

  /** Ranks all chunks against a vector. Local, free. */
  const rank = (v: number[]): Scored[] =>
    !vectors || vectors.length !== chunks.length
      ? []
      : chunks
          .map((chunk, i) => ({ chunk, score: cosine(v, vectors[i]) }))
          .sort((a, b) => b.score - a.score);

  async function generate(
    type: RagType,
    question: string,
    passages: Scored[],
    mode: "rag" | "global" = "rag",
  ): Promise<string> {
    let acc = "";
    await streamChat(
      apiKey,
      { mode, temperature: 0.2, question, passages: toPassages(passages) },
      {
        onDelta: (d) => {
          acc += d;
        },
        onUsage: (u) => {
          addUsage({
            model: "gpt-4o-mini",
            label: `Comparison · ${ragTypeDef(type).name}`,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
          });
          patch(type, {});
          setRows((prev) =>
            prev.map((r) =>
              r.type === type
                ? {
                    ...r,
                    inputTokens: r.inputTokens + u.inputTokens,
                    outputTokens: r.outputTokens + u.outputTokens,
                    calls: r.calls + 1,
                  }
                : r,
            ),
          );
        },
      },
    );
    return acc;
  }

  const bump = (type: RagType, u: { inputTokens: number; outputTokens: number }) =>
    setRows((prev) =>
      prev.map((r) =>
        r.type === type
          ? {
              ...r,
              inputTokens: r.inputTokens + u.inputTokens,
              outputTokens: r.outputTokens + u.outputTokens,
              calls: r.calls + 1,
            }
          : r,
      ),
    );

  /* ---- one function per architecture, each returning its passages ---- */

  async function runNaive(q: string): Promise<Scored[]> {
    patch("naive", { step: "ranking" });
    return rank(queryVector!).slice(0, PASSAGE_COUNT);
  }

  async function runAdvanced(q: string): Promise<Scored[]> {
    patch("advanced", { step: "writing HyDE passage" });
    let hyde = "";
    await streamChat(
      apiKey,
      { mode: "hyde", temperature: 0.4, question: q },
      {
        onDelta: (d) => {
          hyde += d;
        },
        onUsage: (u) => bump("advanced", u),
      },
    );

    patch("advanced", { step: "embedding + fusing" });
    const hv = await embedOne(hyde, "hyde");
    bump("advanced", { inputTokens: 0, outputTokens: 0 });
    const dense = chunks.map((_, i) => cosine(hv, vectors![i]));
    const sparse = bm25Scores(buildBm25(chunks.map((c) => c.text)), q);
    const fused = fuse(dense, sparse, 0.6);
    const shortlist = chunks
      .map((chunk, i) => ({ chunk, score: fused[i] ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    patch("advanced", { step: "reranking locally" });
    try {
      await loadReranker();
      const logits = await crossEncode(q, shortlist.map((s) => s.chunk.text));
      return shortlist
        .map((s, i) => ({ chunk: s.chunk, score: logits[i] }))
        .sort((a, b) => b.score - a.score)
        .slice(0, PASSAGE_COUNT);
    } catch {
      // The cross-encoder comes from a CDN; fall back rather than fail the row.
      patch("advanced", { note: "reranker unavailable — fused ranking used" });
      return shortlist.slice(0, PASSAGE_COUNT);
    }
  }

  async function runAgentic(q: string): Promise<Scored[]> {
    patch("agentic", { step: "routing" });
    const route = await apiPost<{
      decision: string;
      usage: { inputTokens: number; outputTokens: number };
    }>("/api/plan", apiKey, {
      task: "route",
      question: q,
      corpusSummary: rag.docs.map((d) => d.title).join("; "),
    });
    bump("agentic", route.usage);
    if (route.decision !== "retrieve") {
      patch("agentic", { note: `router chose "${route.decision}"` });
      return [];
    }

    patch("agentic", { step: "grading passages" });
    const base = rank(queryVector!).slice(0, PASSAGE_COUNT + 2);
    const graded = await apiPost<{
      grades: { index: number; verdict: string }[];
      usage: { inputTokens: number; outputTokens: number };
    }>("/api/grade", apiKey, {
      task: "grade",
      question: q,
      passages: toPassages(base),
    });
    bump("agentic", graded.usage);
    const bad = new Set(
      graded.grades.filter((g) => g.verdict === "incorrect").map((g) => g.index - 1),
    );
    const kept = base.filter((_, i) => !bad.has(i));
    if (bad.size) patch("agentic", { note: `${bad.size} passages dropped by grader` });
    return kept.slice(0, PASSAGE_COUNT);
  }

  async function runMultihop(q: string): Promise<Scored[]> {
    patch("multihop", { step: "decomposing" });
    const plan = await apiPost<{
      subQuestions: { question: string; dependsOnPrevious: boolean }[];
      usage: { inputTokens: number; outputTokens: number };
    }>("/api/plan", apiKey, { task: "decompose", question: q });
    bump("multihop", plan.usage);

    const findings: string[] = [];
    const union: Scored[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < plan.subQuestions.length; i++) {
      const sub = plan.subQuestions[i];
      let question = sub.question;
      patch("multihop", { step: `hop ${i + 1} of ${plan.subQuestions.length}` });

      if (sub.dependsOnPrevious && findings.length) {
        const rw = await apiPost<{
          question: string;
          usage: { inputTokens: number; outputTokens: number };
        }>("/api/plan", apiKey, {
          task: "rewrite",
          question: sub.question,
          findings: findings.join("\n"),
        });
        bump("multihop", rw.usage);
        question = rw.question;
      }

      const hv = await embedOne(question, "query");
      const hits = rank(hv).slice(0, 3);
      for (const h of hits) {
        if (seen.has(h.chunk.id)) continue;
        seen.add(h.chunk.id);
        union.push(h);
      }

      let acc = "";
      await streamChat(
        apiKey,
        { mode: "hop", temperature: 0, question, passages: toPassages(hits) },
        { onDelta: (d) => (acc += d), onUsage: (u) => bump("multihop", u) },
      );
      findings.push(`Q: ${question}\nA: ${acc}`);
    }
    patch("multihop", { note: `${plan.subQuestions.length} hops` });
    return union;
  }

  async function runGraph(q: string): Promise<Scored[]> {
    if (!graph) {
      patch("graph", { status: "skipped", note: "graph not loaded" });
      return [];
    }
    patch("graph", { step: "walking the graph" });
    const seeds = seedNodes(q, graph);
    if (!seeds.length) {
      patch("graph", { note: "no entity matched the question" });
      return [];
    }
    const sub = expand(graph, seeds.map((s) => s.node.id), 1);
    patch("graph", { note: `${seeds.length} seeds → ${sub.nodes.length} entities` });
    return chunksForSpans(spansOf(sub), chunks).slice(0, PASSAGE_COUNT);
  }

  async function runHierarchical(q: string): Promise<Scored[]> {
    if (!tree) {
      patch("hierarchical", { status: "skipped", note: "tree not loaded" });
      return [];
    }
    let tv = treeVectors;
    if (!tv) {
      patch("hierarchical", { step: "embedding tree" });
      // Must use the return value: reading treeVectors back here would get the
      // pre-update value captured in this closure.
      tv = await runTreeEmbedding();
    }
    if (!tv) {
      patch("hierarchical", { status: "skipped", note: "tree embeddings unavailable" });
      return [];
    }
    patch("hierarchical", { step: "searching all levels" });
    const hits = collapsedSearch(tree, tv, queryVector!, PASSAGE_COUNT);
    const levels = new Set(hits.map((h) => h.node.level));
    patch("hierarchical", { note: `levels ${[...levels].sort().join(", ")}` });
    return hits.map(({ node, score }) => ({
      chunk: {
        id: `tree-${node.id}`,
        docId: node.level === 0 ? (node.span?.docId ?? "tree") : "tree",
        docTitle: node.level === 0 ? node.title : `L${node.level} · ${node.title}`,
        index: -1,
        localIndex: node.level,
        text: node.text,
        start: node.span?.start ?? 0,
        end: node.span?.end ?? node.text.length,
        tokens: Math.round(node.text.length / 4),
      },
      score,
    }));
  }

  const RUNNERS: Record<RagType, (q: string) => Promise<Scored[]>> = {
    naive: runNaive,
    advanced: runAdvanced,
    agentic: runAgentic,
    multihop: runMultihop,
    graph: runGraph,
    hierarchical: runHierarchical,
  };

  async function runOne(type: RagType, q: string) {
    const t0 = performance.now();
    patch(type, { status: "running", step: "starting" });
    try {
      const passages = await RUNNERS[type](q);
      patch(type, { passages: passages.length });

      if (passages.length === 0) {
        // A runner that already declared itself skipped keeps that status —
        // "done with nothing" and "could not run" are different outcomes.
        setRows((prev) =>
          prev.map((r) =>
            r.type === type
              ? {
                  ...r,
                  status: r.status === "skipped" ? "skipped" : "done",
                  step: "",
                  answer:
                    r.status === "skipped"
                      ? ""
                      : "No passages retrieved — nothing was sent to the generator.",
                  ms: Math.round(performance.now() - t0),
                }
              : r,
          ),
        );
        return;
      }

      patch(type, { step: "generating" });
      const answer = await generate(
        type,
        q,
        passages,
        type === "graph" ? "rag" : "rag",
      );
      patch(type, { answer, step: "scoring" });

      const evaluated = await apiPost<{
        scores: EvalScores;
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/evaluate", apiKey, {
        passages: toPassages(passages),
        question: q,
        answer,
      });
      bump(type, evaluated.usage);

      patch(type, {
        status: "done",
        step: "",
        scores: evaluated.scores,
        ms: Math.round(performance.now() - t0),
      });
    } catch (err) {
      patch(type, {
        status: "error",
        step: "",
        note: err instanceof Error ? err.message : "failed",
        ms: Math.round(performance.now() - t0),
      });
    }
  }

  async function runAll() {
    if (!embeddedQuery) return;
    setRunning(true);
    setError(null);
    setRows(RAG_TYPES.map((t) => blank(t.id)));
    try {
      // Each architecture is independent; only their internal steps are ordered.
      await Promise.all(RAG_TYPES.map((t) => runOne(t.id, embeddedQuery)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setRunning(false);
    }
  }

  const totalCost = rows.reduce(
    (s, r) => s + costOf("gpt-4o-mini", r.inputTokens, r.outputTokens),
    0,
  );
  const done = rows.filter((r) => r.status === "done").length;
  const best = rows
    .filter((r) => r.scores)
    .sort((a, b) => (b.scores!.faithfulness) - (a.scores!.faithfulness))[0];

  return (
    <section id="compare" className="scroll-mt-24 pt-10">
      <div className="card overflow-hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 border-b border-line bg-parchment/40 px-5 py-3.5 text-left transition hover:bg-parchment/60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-terracotta to-clay text-white">
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 15V8M10 15V5M16 15v-4" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[19px] font-bold text-ink">
              Run all six on the same question
            </span>
            <span className="block text-[13px] leading-snug text-ink-soft">
              One question, six architectures, answers and faithfulness side by
              side. Costs about half a cent and takes half a minute.
            </span>
          </span>
          <svg
            viewBox="0 0 20 20"
            className={`ml-auto h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>

        {open && (
          <div className="p-5">
            {!ready ? (
              <p className="py-4 text-center text-[13.5px] leading-relaxed text-muted">
                Embed the chunks and a question first — the comparison reuses
                the same embeddings rather than recomputing them.
              </p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={runAll}
                    disabled={running || !canCallApi}
                    className="btn-primary"
                  >
                    {running ? (
                      <>
                        <Spinner /> Running {done}/6…
                      </>
                    ) : done > 0 ? (
                      "Run again"
                    ) : (
                      "Run the comparison →"
                    )}
                  </button>
                  <span className="text-[13px] text-ink-soft">
                    &ldquo;{embeddedQuery}&rdquo;
                  </span>
                  {done > 0 && (
                    <span className="ml-auto font-mono text-[12.5px] text-muted">
                      {formatUSD(totalCost)} ·{" "}
                      {rows.reduce((s, r) => s + r.calls, 0)} calls
                    </span>
                  )}
                </div>

                {error && <ErrorNote>{error}</ErrorNote>}

                <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {rows.map((row) => (
                    <ResultCard
                      key={row.type}
                      row={row}
                      isBest={!!best && best.type === row.type && done === 6}
                      expanded={expanded === row.type}
                      onToggle={() =>
                        setExpanded((c) => (c === row.type ? null : row.type))
                      }
                    />
                  ))}
                </div>

                {done === 6 && (
                  <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed text-muted">
                    Same question, same corpus, same chunks, same model. Every
                    difference below comes from the retrieval strategy alone.
                    Faithfulness is scored by a separate judge call per
                    architecture, so treat small gaps as noise and large ones as
                    signal.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ResultCard({
  row,
  isBest,
  expanded,
  onToggle,
}: {
  row: Row;
  isBest: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const def = ragTypeDef(row.type);
  const cost = costOf("gpt-4o-mini", row.inputTokens, row.outputTokens);
  const f = row.scores?.faithfulness ?? null;
  const colour = f === null ? "#9C8674" : f >= 80 ? "#4E6340" : f >= 55 ? "#9A6A16" : "#8E2F41";

  return (
    <div
      className="flex flex-col rounded-xl border bg-white/60 p-3 transition-all"
      style={{
        borderColor: isBest ? "rgba(110,130,87,.55)" : "#EADBC8",
        background: isBest ? "rgba(110,130,87,.06)" : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-bold text-ink">{def.name}</span>
        {isBest && (
          <span className="chip border-olive/40 bg-olive/10 text-[9px] text-olive">
            most faithful
          </span>
        )}
        <span className="ml-auto shrink-0">
          {row.status === "running" && <Spinner className="h-3.5 w-3.5 text-muted" />}
          {row.status === "done" && f !== null && (
            <span
              className="font-mono text-[16px] font-bold tabular-nums"
              style={{ color: colour }}
            >
              {f}
            </span>
          )}
        </span>
      </div>

      <div className="mt-0.5 font-mono text-[10.5px] text-muted">
        {row.status === "running"
          ? row.step
          : row.status === "error"
            ? "failed"
            : row.status === "waiting"
              ? "waiting"
              : `${row.passages} passages · ${row.calls} calls · ${formatUSD(cost)} · ${(row.ms / 1000).toFixed(1)}s`}
      </div>

      {row.note && (
        <div className="mt-1 text-[11.5px] leading-snug text-[#9A6A16]">
          {row.note}
        </div>
      )}

      {row.answer && (
        <>
          <p
            className={`mt-2 text-[12.5px] leading-relaxed text-ink-soft ${expanded ? "" : "line-clamp-4"}`}
          >
            {row.answer}
          </p>
          <button
            onClick={onToggle}
            className="mt-1.5 self-start text-[11px] font-bold uppercase tracking-wider text-terracotta"
          >
            {expanded ? "Show less" : "Show all"}
          </button>
        </>
      )}
    </div>
  );
}
