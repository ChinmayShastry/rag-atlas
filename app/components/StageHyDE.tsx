"use client";

import { useState } from "react";
import { streamChat } from "../lib/api";
import { useRag } from "../lib/store";
import { cosine } from "../lib/vector";
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

export default function StageHyDE({ n }: StageProps) {
  const {
    apiKey,
    canCallApi,
    embeddedQuery,
    queryVector,
    hydeText,
    setHydeText,
    hydeVector,
    hydeEmbedding,
    runHydeEmbedding,
    useHyde,
    setUseHyde,
    vectors,
    chunks,
    addUsage,
  } = useRag();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!embeddedQuery && !!queryVector;

  /** Best similarity the raw question achieves, versus the HyDE passage. */
  const best = (v: number[] | null) => {
    if (!v || !vectors || vectors.length !== chunks.length) return null;
    let top = -1;
    for (const vec of vectors) top = Math.max(top, cosine(v, vec));
    return top;
  };
  const bestQuery = best(queryVector);
  const bestHyde = best(hydeVector);
  const lift =
    bestQuery !== null && bestHyde !== null ? bestHyde - bestQuery : null;

  async function write() {
    if (!embeddedQuery) return;
    setBusy(true);
    setError(null);
    setHydeText("");
    let acc = "";
    try {
      await streamChat(
        apiKey,
        { mode: "hyde", temperature: 0.4, question: embeddedQuery },
        {
          onDelta: (d) => {
            acc += d;
            setHydeText(acc);
          },
          onUsage: (u) =>
            addUsage({
              model: "gpt-4o-mini",
              label: "HyDE hypothetical passage",
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
            }),
        },
      );
      await runHydeEmbedding(acc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "HyDE generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepSection
      id="hyde"
      n={n}
      kicker={stageKicker(n)}
      title="Query transformation — HyDE"
      lede="A question and the passage that answers it are written completely differently. HyDE closes that gap by inventing an answer first, then searching with the invention."
      locked={!ready}
      lockNote="Embed a question first."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Panel title="The hypothetical passage">
            {hydeText ? (
              <div className="rounded-xl border-l-[3px] border-amber bg-honey/[0.09] py-2.5 pl-3 pr-3 text-[13.5px] leading-relaxed text-ink">
                {hydeText}
                {busy && (
                  <span className="ml-0.5 inline-block h-[14px] w-[6px] translate-y-[2px] animate-blink bg-amber" />
                )}
              </div>
            ) : busy ? (
              <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
                <Spinner /> inventing an answer…
              </div>
            ) : (
              <p className="py-5 text-center text-[13px] leading-relaxed text-muted">
                Ask gpt-4o-mini to write the passage it <em>expects</em> would
                answer your question — with no retrieval at all.
              </p>
            )}

            <button
              onClick={write}
              disabled={busy || !canCallApi}
              className={hydeText ? "btn-ghost mt-3 w-full" : "btn-primary mt-3 w-full"}
            >
              {busy ? (
                <>
                  <Spinner /> Writing…
                </>
              ) : hydeText ? (
                "Rewrite"
              ) : (
                "Write a hypothetical answer →"
              )}
            </button>
            {hydeEmbedding && (
              <p className="mt-2 flex items-center gap-2 text-[12px] text-muted">
                <Spinner className="h-3 w-3" /> embedding the passage…
              </p>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
          </Panel>

          {hydeVector && (
            <Panel title="Does it actually help?">
              <div className="grid gap-3 sm:grid-cols-2">
                <Compare
                  label="Searching with your question"
                  text={embeddedQuery ?? ""}
                  score={bestQuery}
                  accent="#9C8674"
                />
                <Compare
                  label="Searching with the hypothetical"
                  text={hydeText}
                  score={bestHyde}
                  accent="#C1553A"
                />
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                Best cosine similarity against any chunk in the corpus.{" "}
                {lift !== null && lift > 0.01 ? (
                  <>
                    The hypothetical scores{" "}
                    <strong className="text-ink">+{lift.toFixed(3)}</strong>{" "}
                    higher — it lands closer to real passages because it{" "}
                    <em>is</em> shaped like one.
                  </>
                ) : lift !== null && lift < -0.01 ? (
                  <>
                    Here the hypothetical scores{" "}
                    <strong className="text-ink">{lift.toFixed(3)}</strong> —{" "}
                    <em>worse</em>. HyDE is not free: a hypothetical that drifts
                    off-topic drags retrieval with it.
                  </>
                ) : (
                  <>Roughly the same either way for this question.</>
                )}
              </p>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Question sim"
              value={bestQuery !== null ? bestQuery.toFixed(3) : "—"}
              accent="#9C8674"
              sub="best match"
            />
            <Stat
              label="HyDE sim"
              value={bestHyde !== null ? bestHyde.toFixed(3) : "—"}
              sub="best match"
            />
          </div>

          <Panel title="Search with">
            <div className="space-y-2">
              <Choice
                active={!useHyde}
                onClick={() => setUseHyde(false)}
                title="Your question"
                note="The literal text you typed. This is what Naive RAG does."
              />
              <Choice
                active={useHyde}
                onClick={() => setUseHyde(true)}
                title="The hypothetical passage"
                note={
                  hydeVector
                    ? "Retrieval below runs against the invented passage instead."
                    : "Write one first to enable this."
                }
                disabled={!hydeVector}
              />
            </div>
          </Panel>

          <Panel title="Why invent an answer?">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              Embeddings place text by meaning, but a question and a statement
              are different <em>kinds</em> of text. &ldquo;How hot is first
              crack?&rdquo; and &ldquo;the bean reaches first crack around 196
              degrees&rdquo; are not near neighbours in the way you would hope.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              The hypothetical does not need to be <em>correct</em>. It only
              needs the vocabulary and shape of a real passage — which is why a
              confidently wrong invention can still retrieve the right chunk.
            </p>
          </Panel>
        </div>
      </div>

      <Insight>
        {hydeVector ? (
          <>
            Note the cost: one extra model call and one extra embedding before
            retrieval even starts. HyDE roughly doubles the latency of a query
            for a gain that is real but not guaranteed — flip the toggle and
            watch the ranking below change.
          </>
        ) : (
          <>
            This is the first stage that changes the <em>question</em> rather
            than the index. Everything downstream — hybrid scoring, reranking,
            the prompt — then operates on the transformed query.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

function Compare({
  label,
  text,
  score,
  accent,
}: {
  label: string;
  text: string;
  score: number | null;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white/60 p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
          {label}
        </span>
        <span
          className="font-mono text-[15px] font-bold tabular-nums"
          style={{ color: accent }}
        >
          {score !== null ? score.toFixed(3) : "—"}
        </span>
      </div>
      <p className="line-clamp-3 text-[12px] leading-relaxed text-ink-soft">
        {text}
      </p>
    </div>
  );
}

function Choice({
  active,
  onClick,
  title,
  note,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  note: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl border px-3 py-2 text-left transition-all duration-150 disabled:opacity-45 ${
        active
          ? "border-terracotta/50 bg-terracotta/[0.07] shadow-warm"
          : "border-line bg-white/50 hover:border-terracotta/30"
      }`}
    >
      <div
        className={`text-[13px] font-bold ${active ? "text-terracotta" : "text-ink"}`}
      >
        {title}
      </div>
      <div className="text-[11.5px] leading-snug text-muted">{note}</div>
    </button>
  );
}
