"use client";

import { DOC_COLORS, useRag } from "../lib/store";
import { estimateTokens } from "../lib/chunking";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import { Insight, Panel, Stat, StepSection } from "./ui";

export default function StageSynthesize({ n }: StageProps) {
  const { hops, retrieved, embeddedQuery } = useRag();

  const done = hops.filter((h) => h.status === "done");
  const ready = done.length > 0 && done.length === hops.length;

  const contextTokens = retrieved.reduce((s, r) => s + r.chunk.tokens, 0);
  const docsTouched = new Set(retrieved.map((r) => r.chunk.docId));
  // Passages a single-shot search would never have seen together.
  const overlap = hops.length
    ? hops.reduce((s, h) => s + h.retrieved.length, 0) - retrieved.length
    : 0;

  return (
    <StepSection
      id="synthesize"
      n={n}
      kicker={stageKicker(n)}
      title="Synthesis"
      lede="Every hop's findings and passages are pooled into one context. The generator sees the whole chain at once, even though no single search could have produced it."
      locked={!ready}
      lockNote="Run the chain first."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Panel title="The chain, assembled">
            <div className="space-y-2.5">
              {done.map((hop, i) => (
                <div
                  key={i}
                  className="rounded-xl border-l-[3px] bg-white/60 py-2 pl-3 pr-3"
                  style={{
                    borderColor: hop.dependsOnPrevious ? "#B0811C" : "#5F7A4F",
                  }}
                >
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-muted">
                      hop {i + 1}
                    </span>
                    {hop.substituted && (
                      <span className="chip border-olive/40 bg-olive/10 text-[9px] text-olive">
                        used hop {i} finding
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] font-semibold leading-snug text-ink-soft">
                    {hop.resolved}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink">
                    {hop.answer}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-terracotta/30 bg-terracotta/[0.06] px-3 py-2.5">
              <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wider text-terracotta">
                original question
              </div>
              <p className="text-[13.5px] leading-relaxed text-ink">
                {embeddedQuery}
              </p>
            </div>
          </Panel>

          <Panel title={`Pooled context — ${retrieved.length} passages`}>
            <div className="warm-scroll max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
              {retrieved.map((r) => {
                const color = DOC_COLORS[r.chunk.docId]?.accent ?? "#C1553A";
                const fromHops = hops
                  .map((h, i) =>
                    h.retrieved.some((x) => x.chunk.id === r.chunk.id) ? i + 1 : null,
                  )
                  .filter(Boolean);
                return (
                  <div
                    key={r.chunk.id}
                    className="rounded-xl border p-2.5"
                    style={{ borderColor: `${color}44`, background: `${color}0A` }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate text-[11px] font-bold uppercase tracking-wider"
                        style={{ color }}
                      >
                        {r.chunk.docTitle} · #{r.chunk.localIndex}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted">
                        from hop {fromHops.join(" + ")}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                      {r.chunk.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Hops run" value={done.length} accent="#5F7A4F" />
            <Stat
              label="Passages"
              value={retrieved.length}
              accent="#B0811C"
              sub={overlap > 0 ? `${overlap} deduped` : "no overlap"}
            />
            <Stat label="Context" value={contextTokens} sub="tokens" />
            <Stat
              label="Documents"
              value={docsTouched.size}
              accent="#B0455A"
              sub="spanned"
            />
          </div>

          <Panel title="What single-shot could not do">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              The pooled context spans{" "}
              <strong className="text-ink">{docsTouched.size} documents</strong>,
              assembled from separate searches that each used a different query.
              One embedding of your original question would have landed in one
              region of the vector space and stayed there.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Try the same question under Naive RAG for the comparison — the
              corpus, the chunks and the embeddings are all identical, so the
              only variable is the architecture.
            </p>
          </Panel>
        </div>
      </div>

      <Insight>
        Note what the generator receives: not just passages, but passages plus
        the intermediate findings that justified retrieving them. The reasoning
        trace is part of the context, which is why multi-hop answers tend to be
        more auditable — and also why a wrong intermediate finding is so
        damaging, since it arrives stated as established fact.
      </Insight>
    </StepSection>
  );
}
