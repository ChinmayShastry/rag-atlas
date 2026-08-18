"use client";

import { useState } from "react";
import { apiPost } from "../lib/api";
import { useRag } from "../lib/store";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import type { Hop } from "../lib/types";
import {
  ErrorNote,
  Insight,
  Panel,
  Spinner,
  Stat,
  StepSection,
} from "./ui";

interface PlanResponse {
  reasoning: string;
  subQuestions: { question: string; dependsOnPrevious: boolean }[];
  usage: { inputTokens: number; outputTokens: number };
}

export default function StageDecompose({ n }: StageProps) {
  const {
    apiKey,
    canCallApi,
    embeddedQuery,
    vectors,
    hops,
    setHops,
    planReasoning,
    setPlanReasoning,
    addUsage,
  } = useRag();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!embeddedQuery && !!vectors;
  const dependent = hops.filter((h) => h.dependsOnPrevious).length;

  async function plan() {
    if (!embeddedQuery) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiPost<PlanResponse>("/api/plan", apiKey, {
        task: "decompose",
        question: embeddedQuery,
      });
      addUsage({
        model: "gpt-4o-mini",
        label: "Query decomposition",
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
      });
      setPlanReasoning(data.reasoning);
      setHops(
        data.subQuestions.map<Hop>((s) => ({
          planned: s.question,
          resolved: s.dependsOnPrevious ? "" : s.question,
          dependsOnPrevious: s.dependsOnPrevious,
          substituted: false,
          retrieved: [],
          answer: "",
          status: "waiting",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planning failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepSection
      id="decompose"
      n={n}
      kicker={stageKicker(n)}
      title="Decomposition"
      lede="Some questions cannot be answered by any single passage, no matter how good retrieval is. The fix is to stop treating the question as one search."
      locked={!ready}
      lockNote="Embed a question first."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Panel title="The plan">
            {hops.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-7 text-center">
                <p className="max-w-md text-[14px] leading-relaxed text-ink-soft">
                  Ask the model to split your question into the lookups it
                  actually requires — and to say which of them cannot even be
                  searched for until an earlier one is answered.
                </p>
                <button
                  onClick={plan}
                  disabled={busy || !canCallApi}
                  className="btn-primary"
                >
                  {busy ? (
                    <>
                      <Spinner /> Planning…
                    </>
                  ) : (
                    "Decompose the question →"
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {planReasoning && (
                  <p className="mb-3 rounded-xl border-l-[3px] border-amber bg-honey/[0.09] py-2 pl-3 pr-2 text-[13px] leading-relaxed text-ink-soft">
                    {planReasoning}
                  </p>
                )}

                {hops.map((h, i) => (
                  <div
                    key={i}
                    className="relative rounded-xl border border-line bg-white/60 p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold text-white"
                        style={{
                          background: h.dependsOnPrevious ? "#B0811C" : "#5F7A4F",
                        }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold leading-snug text-ink">
                          {h.planned}
                        </p>
                        <span
                          className="mt-1 inline-block text-[11.5px] font-semibold"
                          style={{
                            color: h.dependsOnPrevious ? "#9A6A16" : "#4A6340",
                          }}
                        >
                          {h.dependsOnPrevious
                            ? "↳ blocked until the previous hop answers"
                            : "can be searched immediately"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={plan}
                  disabled={busy}
                  className="btn-ghost mt-2 w-full"
                >
                  {busy ? <Spinner /> : null} Re-plan
                </button>
              </div>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
          </Panel>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Sub-questions" value={hops.length || "—"} accent="#5F7A4F" />
            <Stat
              label="Dependent"
              value={hops.length ? dependent : "—"}
              accent="#B0811C"
              sub="need a prior answer"
            />
          </div>

          <Panel title="Why one search is not enough">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              Ask <em>&ldquo;what temperature does Marta&apos;s stoneware mature
              at?&rdquo;</em> and no chunk anywhere contains the answer. Her
              profile says she glazes for a particular cone; the kiln document
              says what that cone means in degrees. The two facts never appear
              in the same passage.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Single-shot retrieval will happily return one or the other and the
              generator will either guess or refuse. Neither is a retrieval
              failure — the passage it needed does not exist.
            </p>
          </Panel>

          <Panel title="The cost">
            <p className="text-[12.5px] leading-relaxed text-muted">
              A plan is one extra model call before any searching starts, and a
              dependent hop cannot begin until the one before it finishes. That
              serialisation is why multi-hop is slow: latency adds up rather
              than overlapping.
            </p>
          </Panel>
        </div>
      </div>

      <Insight>
        {hops.length > 1 ? (
          <>
            The planner split this into{" "}
            <strong className="font-bold text-ink">
              {hops.length} sub-questions
            </strong>
            {dependent > 0 ? (
              <>
                , {dependent} of which cannot even be written as a search yet —
                they refer to something the first hop has to discover. That
                dependency is what separates real multi-hop from simply asking
                two questions.
              </>
            ) : (
              <>, all independently searchable. They could run in parallel.</>
            )}
          </>
        ) : hops.length === 1 ? (
          <>
            The planner decided one lookup is enough, which for a simple factual
            question is the right call. A good planner should decline to
            decompose — extra hops on a simple question cost latency and add
            failure modes for nothing.
          </>
        ) : (
          <>
            This is the first architecture that treats the question itself as
            something to reason about before retrieving. Everything up to now
            has taken the query as given.
          </>
        )}
      </Insight>
    </StepSection>
  );
}
