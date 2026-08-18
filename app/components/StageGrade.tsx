"use client";

import { useState } from "react";
import { apiPost } from "../lib/api";
import { DOC_COLORS, useRag } from "../lib/store";
import { toPassages } from "../lib/prompt";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import type { GradeVerdict, PassageGrade } from "../lib/types";
import {
  ErrorNote,
  Insight,
  Panel,
  Spinner,
  Stat,
  StepSection,
} from "./ui";

export const GRADE_STYLE: Record<
  GradeVerdict,
  { label: string; color: string; bg: string; border: string }
> = {
  correct: {
    label: "relevant",
    color: "#4E6340",
    bg: "rgba(110,130,87,.10)",
    border: "rgba(110,130,87,.45)",
  },
  ambiguous: {
    label: "ambiguous",
    color: "#9A6A16",
    bg: "rgba(242,193,78,.14)",
    border: "rgba(222,146,43,.5)",
  },
  incorrect: {
    label: "irrelevant",
    color: "#8E2F41",
    bg: "rgba(160,58,78,.09)",
    border: "rgba(160,58,78,.45)",
  },
};

export default function StageGrade({ n }: StageProps) {
  const {
    apiKey,
    canCallApi,
    embeddedQuery,
    agenticBase,
    grades,
    setGrades,
    routeDecision,
    addUsage,
  } = useRag();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skipped = routeDecision !== null && routeDecision.decision !== "retrieve";
  const ready = !skipped && agenticBase.length > 0 && !!embeddedQuery;

  const counts = { correct: 0, ambiguous: 0, incorrect: 0 };
  if (grades) {
    for (const r of agenticBase) {
      const v = grades.get(r.chunk.id)?.verdict;
      if (v) counts[v]++;
    }
  }

  async function grade() {
    if (!embeddedQuery || !agenticBase.length) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiPost<{
        grades: { index: number; verdict: GradeVerdict; reason: string }[];
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/grade", apiKey, {
        task: "grade",
        question: embeddedQuery,
        passages: toPassages(agenticBase),
      });
      addUsage({
        model: "gpt-4o-mini",
        label: `Graded ${agenticBase.length} passages`,
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
      });
      const map = new Map<string, PassageGrade>();
      for (const g of data.grades) {
        // Grades come back keyed by 1-based passage number.
        const target = agenticBase[g.index - 1];
        if (target) map.set(target.chunk.id, { verdict: g.verdict, reason: g.reason });
      }
      setGrades(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grading failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepSection
      id="grade"
      n={n}
      kicker={stageKicker(n)}
      title="Grading the retrieval"
      lede="Retrieval always returns something. This step asks a model whether what came back is actually relevant — before the generator ever sees it."
      locked={!ready}
      lockNote={
        skipped
          ? "The router skipped retrieval, so there is nothing to grade."
          : "Retrieve some passages first."
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel
          title="Passage grades"
          right={
            grades && (
              <span className="font-mono text-[11px] text-muted">
                irrelevant passages are dropped
              </span>
            )
          }
        >
          {!grades ? (
            <div className="flex flex-col items-center gap-3 py-7 text-center">
              <p className="max-w-md text-[14px] leading-relaxed text-ink-soft">
                Score each of the {agenticBase.length} retrieved passages
                independently. A passage that is on-topic but does not contain
                the answer is not good enough.
              </p>
              <button
                onClick={grade}
                disabled={busy || !canCallApi}
                className="btn-primary"
              >
                {busy ? (
                  <>
                    <Spinner /> Grading…
                  </>
                ) : (
                  "Grade the passages →"
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {agenticBase.map((r, i) => {
                const g = grades.get(r.chunk.id);
                const style = g ? GRADE_STYLE[g.verdict] : null;
                const color = DOC_COLORS[r.chunk.docId]?.accent ?? "#C1553A";
                return (
                  <div
                    key={r.chunk.id}
                    className="rounded-xl border p-2.5 transition-all"
                    style={{
                      borderColor: style?.border ?? "#EADBC8",
                      background: style?.bg ?? "transparent",
                      opacity: g?.verdict === "incorrect" ? 0.62 : 1,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10.5px] font-bold text-white"
                        style={{ background: color }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="truncate text-[11px] font-bold uppercase tracking-wider"
                        style={{ color }}
                      >
                        {r.chunk.docTitle} · #{r.chunk.localIndex}
                      </span>
                      {style && (
                        <span
                          className="chip ml-auto shrink-0 border-transparent text-[9.5px]"
                          style={{ color: style.color, background: style.bg }}
                        >
                          {style.label}
                        </span>
                      )}
                      <span className="shrink-0 font-mono text-[11px] text-muted">
                        {r.score.toFixed(3)}
                      </span>
                    </div>
                    {g && (
                      <p
                        className="mt-1 pl-7 text-[12.5px] leading-relaxed"
                        style={{ color: style?.color }}
                      >
                        {g.reason}
                      </p>
                    )}
                    <p className="mt-1 line-clamp-2 pl-7 text-[12px] leading-relaxed text-ink-soft">
                      {r.chunk.text}
                    </p>
                  </div>
                );
              })}

              <button onClick={grade} disabled={busy} className="btn-ghost mt-2 w-full">
                {busy ? <Spinner /> : null} Re-grade
              </button>
            </div>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
        </Panel>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="Relevant"
              value={grades ? counts.correct : "—"}
              accent="#4E6340"
            />
            <Stat
              label="Ambiguous"
              value={grades ? counts.ambiguous : "—"}
              accent="#9A6A16"
            />
            <Stat
              label="Dropped"
              value={grades ? counts.incorrect : "—"}
              accent="#8E2F41"
            />
          </div>

          <Panel title="Similarity is not relevance">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              A cosine score says a passage is <em>near</em> the question in
              vector space. It cannot say whether the passage actually contains
              the answer, and near-miss passages score highly precisely because
              they are on the same topic.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Compare each grade against its similarity score on the left. They
              often disagree, and where they do is where naive retrieval quietly
              fails.
            </p>
          </Panel>
        </div>
      </div>

      <Insight>
        {grades ? (
          counts.incorrect > 0 ? (
            <>
              <strong className="font-bold text-ink">{counts.incorrect}</strong>{" "}
              of {agenticBase.length} passages were judged irrelevant and have
              been dropped from the prompt. Under every earlier architecture
              they would have been sent to the generator regardless, competing
              for its attention with the passages that actually mattered.
            </>
          ) : (
            <>
              Everything survived, which means retrieval did its job. The grader
              costs a call whether or not it finds a problem — that is the
              standing tax of a system that checks itself.
            </>
          )
        ) : (
          <>
            This is the Corrective RAG step. It exists because retrieval has no
            concept of failure: ask an unanswerable question and it will still
            return its top few chunks, with scores that look perfectly ordinary.
          </>
        )}
      </Insight>
    </StepSection>
  );
}
