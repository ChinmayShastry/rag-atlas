"use client";

import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import { useState } from "react";
import { streamChat } from "../lib/api";
import { DOC_COLORS, useRag } from "../lib/store";
import { toPassages } from "../lib/prompt";
import { ErrorNote, Insight, Panel, Slider, Spinner, StepSection } from "./ui";

export default function Step7Generation({ n }: StageProps) {
  const {
    apiKey,
    canCallApi,
    ragType,
    graphMode,
    retrieved,
    embeddedQuery,
    answer,
    setAnswer,
    baselineAnswer,
    setBaselineAnswer,
    temperature,
    setTemperature,
    addUsage,
    setScores,
    reachStep,
  } = useRag();

  const [busy, setBusy] = useState(false);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const ready = retrieved.length > 0 && !!embeddedQuery;

  async function generate() {
    if (!embeddedQuery) return;
    setBusy(true);
    setError(null);
    setAnswer("");
    setScores(null);
    const t0 = performance.now();

    let acc = "";

    try {
      await streamChat(
        apiKey,
        {
          // Global graph search reasons over cluster summaries, so it needs a
          // prompt that permits synthesis rather than one that forbids it.
          mode:
            ragType === "graph" && graphMode === "global" ? "global" : "rag",
          temperature,
          question: embeddedQuery,
          passages: toPassages(retrieved),
        },
        {
          onDelta: (d) => {
            acc += d;
            setAnswer(acc);
          },
          onUsage: (u) =>
            addUsage({
              model: "gpt-4o-mini",
              label: "Generated answer (with retrieval)",
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
            }),
        },
      );
      setElapsed(Math.round(performance.now() - t0));
      reachStep(7);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function generateBaseline() {
    if (!embeddedQuery) return;
    setBaselineBusy(true);
    setError(null);
    setBaselineAnswer("");
    let acc = "";

    try {
      await streamChat(
        apiKey,
        {
          mode: "baseline",
          temperature,
          question: embeddedQuery,
        },
        {
          onDelta: (d) => {
            acc += d;
            setBaselineAnswer(acc);
          },
          onUsage: (u) =>
            addUsage({
              model: "gpt-4o-mini",
              label: "Generated answer (no retrieval)",
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
            }),
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBaselineBusy(false);
    }
  }

  return (
    <StepSection
      id="generation"
      n={n}
      kicker={stageKicker(n)}
      title="Generation"
      lede="Now the model writes. It has no database and no memory of your files — only the passages assembled in the previous stage."
      locked={!ready}
      lockNote="Assemble a prompt first."
    >
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Controls">
            <Slider
              label="Temperature"
              value={temperature}
              min={0}
              max={1.2}
              step={0.1}
              onChange={setTemperature}
              hint={
                temperature <= 0.3
                  ? "Low: near-deterministic. What you want for grounded factual answers."
                  : temperature <= 0.7
                    ? "Medium: some variation in phrasing. Facts should still hold."
                    : "High: creative and loose. Watch faithfulness drop when you score it."
              }
            />
            <div className="mt-4 space-y-2">
              <button
                onClick={generate}
                disabled={busy || !canCallApi}
                className="btn-primary w-full"
              >
                {busy ? (
                  <>
                    <Spinner /> Writing…
                  </>
                ) : answer ? (
                  "Regenerate"
                ) : (
                  "Generate answer →"
                )}
              </button>
              <button
                onClick={generateBaseline}
                disabled={baselineBusy || !canCallApi}
                className="btn-ghost w-full"
              >
                {baselineBusy ? <Spinner /> : null}
                {baselineAnswer ? "Re-run without RAG" : "Compare without RAG"}
              </button>
            </div>
          </Panel>

          {elapsed !== null && (
            <div className="rounded-xl border border-line bg-white/60 px-3 py-2.5 text-[12px] text-muted">
              <span className="font-mono text-[14px] font-bold text-ink">
                {(elapsed / 1000).toFixed(1)}s
              </span>{" "}
              end to end, including network round trip.
            </div>
          )}

          <Panel title="Model">
            <div className="space-y-1.5 font-mono text-[11.5px] text-ink-soft">
              <div className="flex justify-between border-b border-line/60 pb-1">
                <span className="text-muted">model</span>
                <span>gpt-4o-mini</span>
              </div>
              <div className="flex justify-between border-b border-line/60 pb-1">
                <span className="text-muted">temperature</span>
                <span>{temperature}</span>
              </div>
              <div className="flex justify-between border-b border-line/60 pb-1">
                <span className="text-muted">passages</span>
                <span>{retrieved.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">max tokens</span>
                <span>700</span>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <div
            className={`grid gap-4 ${baselineAnswer || baselineBusy ? "md:grid-cols-2" : ""}`}
          >
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-olive" />
                  With retrieval
                </span>
              }
            >
              {answer ? (
                <div className="text-[14px] leading-[1.75] text-ink">
                  <CitedText text={answer} />
                  {busy && (
                    <span className="ml-0.5 inline-block h-[15px] w-[7px] translate-y-[2px] animate-blink bg-terracotta" />
                  )}
                </div>
              ) : busy ? (
                <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
                  <Spinner /> waiting for the first token…
                </div>
              ) : (
                <p className="py-6 text-center text-[13px] text-muted">
                  Press generate to stream an answer built from your{" "}
                  {retrieved.length} retrieved passages.
                </p>
              )}

              {answer && !busy && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {retrieved.map((r, i) => {
                    const used = new RegExp(`\\[${i + 1}\\]`).test(answer);
                    const color = DOC_COLORS[r.chunk.docId]?.accent ?? "#C1553A";
                    return (
                      <span
                        key={r.chunk.id}
                        className="chip"
                        style={{
                          color: used ? color : "#9C8674",
                          borderColor: used ? `${color}55` : "#EADBC8",
                          background: used ? `${color}12` : "transparent",
                        }}
                      >
                        [{i + 1}] {used ? "cited" : "unused"}
                      </span>
                    );
                  })}
                </div>
              )}
            </Panel>

            {(baselineAnswer || baselineBusy) && (
              <Panel
                title={
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-berry" />
                    No retrieval — memory only
                  </span>
                }
              >
                {baselineAnswer ? (
                  <div className="text-[14px] leading-[1.75] text-ink-soft">
                    {baselineAnswer}
                    {baselineBusy && (
                      <span className="ml-0.5 inline-block h-[15px] w-[7px] translate-y-[2px] animate-blink bg-berry" />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
                    <Spinner /> asking without any context…
                  </div>
                )}
                <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-muted">
                  Same model, same question, zero context. Nothing here is
                  traceable to a source, and nothing can be verified.
                </p>
              </Panel>
            )}
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      </div>

      <Insight>
        {baselineAnswer ? (
          <>
            Compare the two panels. The grounded answer carries citations you can
            click back through to a specific chunk of a specific file; the
            unretrieved one is fluent, confident, and completely unauditable.
            That auditability — not raw accuracy — is what RAG actually buys you.
          </>
        ) : (
          <>
            Notice the bracketed citations. They exist only because the system
            prompt asked for them and the passages were numbered — a small
            formatting decision during augmentation that makes every claim traceable.
            Press <strong className="font-bold text-ink">Compare without RAG</strong>{" "}
            to see the same question answered from memory alone.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

/** Renders [1]-style citations as coloured pills. */
function CitedText({ text }: { text: string }) {
  const { retrieved } = useRag();
  const parts = text.split(/(\[\d+\])/g);

  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (!m) return <span key={i}>{part}</span>;
        const n = Number(m[1]);
        const src = retrieved[n - 1];
        const color = src ? (DOC_COLORS[src.chunk.docId]?.accent ?? "#C1553A") : "#9C8674";
        return (
          <span
            key={i}
            className="mx-0.5 inline-block cursor-help rounded-md px-1.5 py-px align-baseline font-mono text-[11.5px] font-bold"
            style={{ color, background: `${color}18` }}
            title={src ? `${src.chunk.docTitle} — ${src.chunk.text.slice(0, 160)}…` : "unknown passage"}
          >
            {n}
          </span>
        );
      })}
    </>
  );
}
