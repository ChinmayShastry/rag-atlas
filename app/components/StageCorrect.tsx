"use client";

import { useState } from "react";
import { apiPost } from "../lib/api";
import { DOC_COLORS, useRag } from "../lib/store";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import {
  ErrorNote,
  Insight,
  Panel,
  Spinner,
  Stat,
  StepSection,
} from "./ui";

export default function StageCorrect({ n }: StageProps) {
  const {
    apiKey,
    canCallApi,
    embeddedQuery,
    agenticBase,
    grades,
    routeDecision,
    correctedQuery,
    setCorrectedQuery,
    correctionStrategy,
    setCorrectionStrategy,
    correctedHits,
    setCorrectedHits,
    embedOne,
    rankAgainst,
    topK,
    setGrades,
    addUsage,
  } = useRag();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skipped = routeDecision !== null && routeDecision.decision !== "retrieve";
  const ready = !skipped && !!grades && agenticBase.length > 0;

  const bad = grades
    ? agenticBase.filter((r) => grades.get(r.chunk.id)?.verdict === "incorrect").length
    : 0;
  const good = grades
    ? agenticBase.filter((r) => grades.get(r.chunk.id)?.verdict === "correct").length
    : 0;

  // Corrective RAG's three branches, decided by what grading found.
  const action: "proceed" | "supplement" | "rewrite" =
    good > 0 && bad === 0 ? "proceed" : good > 0 ? "supplement" : "rewrite";

  async function correct() {
    if (!embeddedQuery) return;
    setBusy(true);
    setError(null);
    try {
      const failed = grades
        ? agenticBase
            .filter((r) => grades.get(r.chunk.id)?.verdict !== "correct")
            .map((r) => `- ${grades.get(r.chunk.id)?.reason ?? "not relevant"}`)
            .join("\n")
        : "";

      const data = await apiPost<{
        question: string;
        strategy: string;
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/plan", apiKey, {
        task: "correct",
        question: embeddedQuery,
        findings: failed,
      });
      addUsage({
        model: "gpt-4o-mini",
        label: "Corrective query rewrite",
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
      });
      setCorrectedQuery(data.question);
      setCorrectionStrategy(data.strategy);

      const vec = await embedOne(data.question, "query");
      const hits = rankAgainst(vec).slice(0, topK);
      setCorrectedHits(hits);
      // Grades belonged to the old passages; the new set is ungraded.
      setGrades(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCorrectedHits(null);
    setCorrectedQuery(null);
    setCorrectionStrategy("");
    setGrades(null);
  }

  return (
    <StepSection
      id="correct"
      n={n}
      kicker={stageKicker(n)}
      title="Correction"
      lede="When grading finds the retrieval was poor, the system does not just proceed anyway. It rewrites the query and searches again."
      locked={!ready}
      lockNote={
        skipped
          ? "The router skipped retrieval, so there is nothing to correct."
          : "Grade the passages first."
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-4">
          <Panel title="What the grades imply">
            <div className="space-y-2">
              <Branch
                active={action === "proceed"}
                label="Proceed"
                cond="every passage relevant"
                text="Retrieval succeeded. Send it to the generator unchanged and spend nothing more."
                color="#4E6340"
              />
              <Branch
                active={action === "supplement"}
                label="Drop and proceed"
                cond="some relevant, some not"
                text="Keep what survived grading, discard the rest, and answer from a smaller but cleaner context."
                color="#9A6A16"
              />
              <Branch
                active={action === "rewrite"}
                label="Rewrite and retry"
                cond="nothing relevant"
                text="The query itself is the problem. Rephrase it in the vocabulary the documents use, and search again."
                color="#8E2F41"
              />
            </div>

            <button
              onClick={correct}
              disabled={busy || !canCallApi}
              className={action === "rewrite" ? "btn-primary mt-3 w-full" : "btn-ghost mt-3 w-full"}
            >
              {busy ? (
                <>
                  <Spinner /> Rewriting and re-searching…
                </>
              ) : correctedHits ? (
                "Rewrite again"
              ) : (
                "Force a corrective retry →"
              )}
            </button>
            {correctedHits && (
              <button onClick={reset} className="btn-ghost mt-2 w-full">
                Undo — go back to the original retrieval
              </button>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
          </Panel>

          {correctedQuery && (
            <Panel title="The rewrite">
              <div className="space-y-2">
                <div className="rounded-xl border border-line bg-white/60 px-3 py-2">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">
                    before
                  </div>
                  <p className="text-[13px] text-ink-soft">{embeddedQuery}</p>
                </div>
                <div className="rounded-xl border border-olive/40 bg-olive/[0.08] px-3 py-2">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-olive">
                    after
                  </div>
                  <p className="text-[13px] font-semibold text-ink">
                    {correctedQuery}
                  </p>
                </div>
                {correctionStrategy && (
                  <p className="text-[12.5px] leading-relaxed text-muted">
                    Technique: <strong className="text-ink">{correctionStrategy}</strong>
                  </p>
                )}
              </div>

              {correctedHits && (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted">
                    New retrieval
                  </div>
                  <div className="space-y-1.5">
                    {correctedHits.map((r) => {
                      const color = DOC_COLORS[r.chunk.docId]?.accent ?? "#C1553A";
                      const isNew = !agenticBase.some(
                        (o) => o.chunk.id === r.chunk.id,
                      );
                      return (
                        <div
                          key={r.chunk.id}
                          className="flex items-center gap-2 rounded-lg border border-line bg-white/60 px-2.5 py-1.5"
                        >
                          <span
                            className="truncate text-[11px] font-bold uppercase tracking-wider"
                            style={{ color }}
                          >
                            {r.chunk.docTitle} · #{r.chunk.localIndex}
                          </span>
                          {isNew && (
                            <span className="chip shrink-0 border-olive/40 bg-olive/10 text-[9px] text-olive">
                              new
                            </span>
                          )}
                          <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
                            {r.score.toFixed(3)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Kept" value={good} accent="#4E6340" sub="graded relevant" />
            <Stat label="Dropped" value={bad} accent="#8E2F41" sub="graded irrelevant" />
          </div>

          <Panel title="Where the loop stops">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              Nothing here prevents rewriting forever. Production systems cap
              the retries — usually at one or two — and fall back to refusing,
              or to a wider source such as web search, when the cap is hit.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              An uncapped corrective loop on an unanswerable question will
              happily spend your entire budget rephrasing a question that no
              phrasing can rescue.
            </p>
          </Panel>

          <Panel title="What real CRAG adds">
            <p className="text-[12.5px] leading-relaxed text-muted">
              The published method falls back to <em>web search</em> when the
              local index fails, on the reasoning that a corpus which does not
              contain the answer cannot be rephrased into containing it. This
              demo has no outside source, so a rewrite is all it can attempt —
              which is itself a useful limit to see.
            </p>
          </Panel>
        </div>
      </div>

      <Insight>
        {correctedHits ? (
          <>
            The second search used a query the user never wrote. That is the
            trade: better recall, at the cost of a system whose behaviour is
            harder to predict and whose spend per question is no longer fixed.
          </>
        ) : action === "proceed" ? (
          <>
            Grading found nothing wrong, so the correct action is to do nothing.
            You can still force a retry above to see the mechanism — a useful
            reminder that a rewrite is not automatically an improvement.
          </>
        ) : (
          <>
            The branch taken here depends entirely on the grades above. That is
            what makes this architecture agentic: the path through the pipeline
            is chosen at runtime, not fixed in advance.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

function Branch({
  active,
  label,
  cond,
  text,
  color,
}: {
  active: boolean;
  label: string;
  cond: string;
  text: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2 transition-all"
      style={{
        borderColor: active ? `${color}70` : "#EADBC8",
        background: active ? `${color}12` : "transparent",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[12.5px] font-bold"
          style={{ color: active ? color : "#6B5445" }}
        >
          {label}
        </span>
        <span className="font-mono text-[10.5px] text-muted">— {cond}</span>
        {active && (
          <span
            className="chip ml-auto border-transparent text-[9px]"
            style={{ color, background: `${color}18` }}
          >
            selected
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{text}</p>
    </div>
  );
}
