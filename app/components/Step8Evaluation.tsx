"use client";

import { useState } from "react";
import { apiPost } from "../lib/api";
import { useRag } from "../lib/store";
import { buildContext } from "../lib/prompt";
import type { EvalScores } from "../lib/types";
import {
  ErrorNote,
  Insight,
  Panel,
  ScoreMeter,
  Spinner,
  Stat,
  StepSection,
} from "./ui";

export default function Step8Evaluation() {
  const {
    apiKey,
    answer,
    embeddedQuery,
    retrieved,
    scores,
    setScores,
    addUsage,
    reachStep,
  } = useRag();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!answer && !!embeddedQuery;

  // Local, free metric: how much of what we retrieved did the answer actually use?
  const citedCount = retrieved.filter((_, i) =>
    new RegExp(`\\[${i + 1}\\]`).test(answer),
  ).length;
  const precision = retrieved.length
    ? Math.round((citedCount / retrieved.length) * 100)
    : 0;

  async function evaluate() {
    if (!embeddedQuery || !answer) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiPost<{
        scores: EvalScores;
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/evaluate", apiKey, {
        context: buildContext(retrieved),
        question: embeddedQuery,
        answer,
      });
      setScores(data.scores);
      addUsage({
        model: "gpt-4o-mini",
        label: "Evaluation (LLM judge)",
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
      });
      reachStep(8);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepSection
      id="evaluation"
      n={8}
      kicker="Stage eight"
      title="Evaluation"
      lede="A fluent answer is not necessarily a correct one. Evaluation asks a second model to check the first one's work against the passages it was given."
      locked={!ready}
      lockNote="Generate an answer in stage 7 before scoring it."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {scores ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <ScoreMeter
                label="Faithfulness"
                score={scores.faithfulness}
                reason={scores.faithfulnessReason}
                delay={0}
              />
              <ScoreMeter
                label="Relevance"
                score={scores.relevance}
                reason={scores.relevanceReason}
                delay={120}
              />
              <ScoreMeter
                label="Completeness"
                score={scores.completeness}
                reason={scores.completenessReason}
                delay={240}
              />
            </div>
          ) : (
            <Panel>
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="max-w-md text-[14px] leading-relaxed text-ink-soft">
                  Send the question, the retrieved passages, and the answer to a
                  second gpt-4o-mini call whose only job is to grade — not to
                  answer.
                </p>
                <button
                  onClick={evaluate}
                  disabled={busy || !apiKey}
                  className="btn-primary"
                >
                  {busy ? (
                    <>
                      <Spinner /> Judging…
                    </>
                  ) : (
                    "Score this answer →"
                  )}
                </button>
              </div>
            </Panel>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}

          {scores && (
            <Panel title="Claims the passages do not support">
              {scores.unsupportedClaims.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-olive/35 bg-olive/[0.08] px-3.5 py-3">
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="#4E6340"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 10.5l4 4 8-9" />
                  </svg>
                  <p className="text-[13px] leading-relaxed text-[#4E6340]">
                    Every claim traces back to a retrieved passage. This is what
                    a grounded answer looks like.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scores.unsupportedClaims.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-berry/30 bg-berry/[0.06] px-3.5 py-2.5"
                    >
                      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-berry">
                        unsupported
                      </div>
                      <p className="text-[13px] leading-relaxed text-ink">
                        &ldquo;{c}&rdquo;
                      </p>
                    </div>
                  ))}
                  <p className="pt-1 text-[12px] leading-relaxed text-muted">
                    These may still be true — they simply were not in the
                    retrieved context, so the system cannot vouch for them. In a
                    regulated setting that distinction is the whole ballgame.
                  </p>
                </div>
              )}
            </Panel>
          )}

          {scores && (
            <button
              onClick={evaluate}
              disabled={busy}
              className="btn-ghost w-full"
            >
              {busy ? <Spinner /> : null} Re-score
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Context precision"
              value={`${precision}%`}
              accent="#B0811C"
              sub={`${citedCount}/${retrieved.length} cited`}
            />
            <Stat
              label="Judge"
              value={<span className="text-[12px]">4o-mini</span>}
              accent="#8C4A32"
              sub="temperature 0"
            />
          </div>

          <Panel title="What each score means">
            <div className="space-y-3 text-[12.5px] leading-relaxed">
              <Metric
                name="Faithfulness"
                color="#C1553A"
                text="Is every claim backed by the passages? This is the anti-hallucination metric. A correct fact the model knew from training but that was not retrieved still counts as a miss."
              />
              <Metric
                name="Relevance"
                color="#B0811C"
                text="Does the answer address the question actually asked? An accurate answer to a different question scores low here."
              />
              <Metric
                name="Completeness"
                color="#6E8257"
                text="Did the answer use the useful material it was given, or leave supporting detail sitting unused in the context?"
              />
            </div>
          </Panel>

          <Panel title="The catch">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              This is LLM-as-judge, and it is fallible in the same ways the
              generator is. It is cheap, fast, and correlates well enough with
              human raters to catch regressions — which makes it useful for
              tracking a trend across hundreds of questions, not for settling any
              single verdict.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Serious pipelines pair it with a human-labelled gold set and track
              both together.
            </p>
          </Panel>
        </div>
      </div>

      <Insight>
        {scores ? (
          scores.faithfulness >= 85 ? (
            <>
              Faithfulness of{" "}
              <strong className="font-bold text-ink">{scores.faithfulness}</strong>{" "}
              means the model stayed inside its evidence. Now go back to stage 7,
              push temperature past 0.9, regenerate, and re-score — you can watch
              groundedness erode in real time.
            </>
          ) : (
            <>
              Faithfulness came in at{" "}
              <strong className="font-bold text-ink">{scores.faithfulness}</strong>
              . Try raising top-K in stage 5 so the answer has more evidence to
              stand on, or lowering temperature in stage 7. Evaluation is only
              useful when it changes what you build.
            </>
          )
        ) : (
          <>
            Without measurement you cannot tell a pipeline improvement from a
            lucky prompt. These three scores are the minimum viable dashboard for
            a RAG system, and they cost a fraction of a cent per question.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

function Metric({
  name,
  color,
  text,
}: {
  name: string;
  color: string;
  text: string;
}) {
  return (
    <div className="border-l-[3px] pl-2.5" style={{ borderColor: color }}>
      <div className="text-[12px] font-bold" style={{ color }}>
        {name}
      </div>
      <p className="text-muted">{text}</p>
    </div>
  );
}
