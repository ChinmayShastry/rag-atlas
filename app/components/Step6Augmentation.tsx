"use client";

import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import { useMemo } from "react";
import { DOC_COLORS, useRag } from "../lib/store";
import { SYSTEM_PROMPT, buildContext, toPassages } from "../lib/prompt";
import { estimateTokens } from "../lib/chunking";
import { Insight, Panel, Stat, StepSection } from "./ui";

export default function Step6Augmentation({ n }: StageProps) {
  const { retrieved, embeddedQuery, hovered, setHovered, chunks, topK } = useRag();

  const ready = retrieved.length > 0 && !!embeddedQuery;

  const context = useMemo(
    () => buildContext(toPassages(retrieved)),
    [retrieved],
  );
  const promptTokens =
    estimateTokens(SYSTEM_PROMPT) +
    estimateTokens(context) +
    estimateTokens(embeddedQuery ?? "");

  const wholeCorpusTokens = chunks.reduce((s, c) => s + c.tokens, 0);
  const saved = wholeCorpusTokens
    ? Math.round((1 - estimateTokens(context) / wholeCorpusTokens) * 100)
    : 0;

  return (
    <StepSection
      id="augmentation"
      n={n}
      kicker={stageKicker(n)}
      title="Augmentation"
      lede="The retrieved chunks are pasted into a prompt around your question. This assembled text is the entire universe the model gets to reason over."
      locked={!ready}
      lockNote="Retrieve some chunks to assemble a prompt."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
        <Panel
          title="The literal prompt sent to gpt-4o-mini"
          right={
            <span className="font-mono text-[11px] text-muted">
              ~{promptTokens.toLocaleString()} tokens
            </span>
          }
          bodyClass="p-0"
        >
          <div className="warm-scroll max-h-[520px] overflow-y-auto">
            <PromptBlock role="system" label="system">
              <span className="text-ink-soft">{SYSTEM_PROMPT}</span>
            </PromptBlock>

            <PromptBlock role="user" label="user">
              <div className="mb-2 font-bold text-ink">CONTEXT PASSAGES:</div>

              {retrieved.map((r, i) => {
                const color = DOC_COLORS[r.chunk.docId]?.accent ?? "#C1553A";
                const isHot = hovered === r.chunk.id;
                return (
                  <div
                    key={r.chunk.id}
                    onMouseEnter={() => setHovered(r.chunk.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="mb-2.5 rounded-lg border-l-[3px] py-1.5 pl-2.5 pr-2 transition-all duration-150"
                    style={{
                      borderColor: color,
                      background: isHot ? `${color}14` : `${color}08`,
                    }}
                  >
                    <div className="mb-0.5 flex items-center gap-2">
                      <span
                        className="font-bold"
                        style={{ color }}
                      >{`[${i + 1}]`}</span>
                      <span
                        className="text-[10.5px] font-bold uppercase tracking-wider"
                        style={{ color }}
                      >
                        ({r.chunk.docTitle})
                      </span>
                      <span className="ml-auto text-[10.5px] text-muted">
                        sim {r.score.toFixed(3)} · ~{r.chunk.tokens}t
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-ink-soft">
                      {r.chunk.text}
                    </div>
                  </div>
                );
              })}

              <div className="mt-3 rounded-lg border border-terracotta/30 bg-terracotta/[0.06] px-2.5 py-1.5">
                <span className="font-bold text-terracotta">QUESTION: </span>
                <span className="text-ink">{embeddedQuery}</span>
              </div>
            </PromptBlock>
          </div>
        </Panel>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Passages" value={retrieved.length} sub={`top-K = ${topK}`} />
            <Stat
              label="Context"
              value={estimateTokens(context)}
              accent="#B0811C"
              sub="tokens"
            />
            <Stat
              label="Total prompt"
              value={promptTokens}
              accent="#8C4A32"
              sub="tokens"
            />
            <Stat
              label="Corpus skipped"
              value={`${saved}%`}
              accent="#6E8257"
              sub="never sent"
            />
          </div>

          <Panel title="Why not just send everything?">
            <div className="space-y-2.5 text-[12.5px] leading-relaxed text-ink-soft">
              <p>
                The full corpus is{" "}
                <strong className="text-ink">
                  {wholeCorpusTokens.toLocaleString()} tokens
                </strong>
                . You are sending{" "}
                <strong className="text-ink">
                  {estimateTokens(context).toLocaleString()}
                </strong>
                .
              </p>
              <p>
                At this scale you could paste the lot. At ten thousand documents
                you cannot — not for cost, not for latency, and not for accuracy,
                since models reliably lose track of material buried in the middle
                of a very long prompt.
              </p>
              <p className="text-muted">
                Retrieval is a relevance filter that keeps the prompt small
                enough for the model to actually use.
              </p>
            </div>
          </Panel>

          <Panel title="The instruction that matters">
            <p className="rounded-lg border-l-[3px] border-olive bg-olive/[0.07] py-2 pl-2.5 pr-2 font-mono text-[11.5px] leading-relaxed text-ink-soft">
              &ldquo;If the passages do not contain the answer, say plainly that
              the provided context does not cover it, and stop. Do not
              guess.&rdquo;
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Without a line like this the model happily falls back on its
              training data, and you get an answer that looks grounded but is
              not. The evaluation stage measures whether it obeyed.
            </p>
          </Panel>
        </div>
      </div>

      <Insight>
        The model has no memory of your documents and no database access. Every
        fact it is about to use is sitting in the text above — which is why
        retrieval quality caps answer quality. Hover a passage to trace it back
        to its chunk in the earlier stages.
      </Insight>
    </StepSection>
  );
}

function PromptBlock({
  role,
  label,
  children,
}: {
  role: "system" | "user";
  label: string;
  children: React.ReactNode;
}) {
  const isSystem = role === "system";
  return (
    <div className={isSystem ? "border-b border-line" : ""}>
      <div className="flex items-center gap-2 bg-parchment/40 px-4 py-1.5">
        <span
          className="chip border-transparent"
          style={{
            color: isSystem ? "#8C4A32" : "#B0455A",
            background: isSystem ? "rgba(140,74,50,.10)" : "rgba(176,69,90,.10)",
          }}
        >
          {label}
        </span>
      </div>
      <div className="whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed">
        {children}
      </div>
    </div>
  );
}
