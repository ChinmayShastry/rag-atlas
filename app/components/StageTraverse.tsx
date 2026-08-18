"use client";

import { useMemo } from "react";
import { DOC_COLORS, useRag } from "../lib/store";
import { TYPE_COLORS } from "../lib/graph";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import GraphPlot from "./GraphPlot";
import { Insight, Panel, Slider, Stat, StepSection } from "./ui";

export default function StageTraverse({ n }: StageProps) {
  const {
    graph,
    graphMode,
    setGraphMode,
    graphHops,
    setGraphHops,
    graphSeeds,
    subgraph,
    graphCommunities,
    retrieved,
    embeddedQuery,
    topK,
    setTopK,
  } = useRag();

  const ready = !!graph && !!embeddedQuery;
  const seedIds = useMemo(
    () => new Set(graphSeeds.map((s) => s.node.id)),
    [graphSeeds],
  );

  const docsTouched = new Set(retrieved.map((r) => r.chunk.docId));

  return (
    <StepSection
      id="traverse"
      n={n}
      kicker={stageKicker(n)}
      title="Traversal"
      lede="Retrieval here is a walk, not a ranking. Find the entities the question names, follow their edges, and collect the text those edges came from."
      locked={!ready}
      lockNote="Embed a question first."
    >
      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Search mode">
            <div className="space-y-2">
              <Mode
                active={graphMode === "local"}
                onClick={() => setGraphMode("local")}
                title="Local"
                note="Anchor on named entities and walk outward. For questions about specific things."
              />
              <Mode
                active={graphMode === "global"}
                onClick={() => setGraphMode("global")}
                title="Global"
                note="Answer from community summaries instead of passages. For questions about the corpus as a whole."
              />
            </div>

            {graphMode === "local" && (
              <div className="mt-4 space-y-4">
                <Slider
                  label="Hops"
                  value={graphHops}
                  min={1}
                  max={3}
                  onChange={setGraphHops}
                  hint={
                    graphHops === 1
                      ? "Direct neighbours only. Precise, and blind to anything one step further out."
                      : `Follows ${graphHops} edges from each seed. Wider context, and quickly a lot of noise.`
                  }
                />
                <Slider
                  label="Passages"
                  value={topK}
                  min={1}
                  max={10}
                  accent="#B0811C"
                  onChange={setTopK}
                  hint="Chunks the walk touched, ranked by how many times it landed in them."
                />
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Seed entities"
              value={graphMode === "local" ? graphSeeds.length : "—"}
              accent="#C2603A"
            />
            <Stat
              label="Subgraph"
              value={graphMode === "local" ? (subgraph?.nodes.length ?? 0) : "—"}
              accent="#B0811C"
              sub="entities reached"
            />
            <Stat
              label="Passages"
              value={retrieved.length}
              accent="#5F7A4F"
            />
            <Stat
              label="Documents"
              value={docsTouched.size}
              accent="#B0455A"
              sub="spanned"
            />
          </div>

          {graphMode === "local" && (
            <Panel title="Seeds">
              {graphSeeds.length === 0 ? (
                <p className="text-[12.5px] leading-relaxed text-muted">
                  No entity in the graph matches a word in your question. That is
                  the honest failure mode of graph retrieval: if the question
                  names nothing the extractor captured, the walk has nowhere to
                  start.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {graphSeeds.map((s) => (
                    <div
                      key={s.node.id}
                      className="flex items-center gap-2 rounded-lg border border-line bg-white/60 px-2.5 py-1.5"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: TYPE_COLORS[s.node.type] ?? "#9C8674" }}
                      />
                      <span className="truncate text-[12.5px] font-semibold text-ink">
                        {s.node.label}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted">
                        {s.node.degree} links
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          {graphMode === "local" ? (
            <Panel title="The walk" bodyClass="p-3">
              <GraphPlot
                nodes={subgraph?.nodes ?? []}
                edges={subgraph?.edges ?? []}
                seeds={seedIds}
                depth={subgraph?.depth}
                height={340}
              />
              <p className="mt-2.5 px-1 text-[12px] leading-relaxed text-muted">
                Ringed nodes are the seeds your question named. Everything else
                was reached by following relationships — text that no similarity
                search would have surfaced, because it never mentions your
                question&apos;s wording at all.
              </p>
            </Panel>
          ) : (
            <Panel
              title="Communities in play"
              right={
                <span className="font-mono text-[11px] text-muted">
                  ranked by coverage, not keyword match
                </span>
              }
            >
              {graphCommunities.length === 0 ? (
                <p className="py-4 text-[13px] text-muted">
                  The graph has no communities to summarise.
                </p>
              ) : (
                <div className="space-y-2">
                  {graphCommunities.map(({ community, score }) => (
                    <div
                      key={community.id}
                      className="rounded-xl border border-olive/40 bg-olive/[0.06] p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-bold text-ink">
                          {community.label}
                        </span>
                        <span className="ml-auto font-mono text-[10.5px] text-muted">
                          {community.size} entities · {score.toFixed(1)}
                        </span>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                        {community.summary}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}

          <Panel title={`Context — ${retrieved.length} passages`}>
            <div className="warm-scroll max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
              {retrieved.map((r) => {
                const color =
                  DOC_COLORS[r.chunk.docId]?.accent ??
                  (r.chunk.docId === "graph" ? "#5F7A4F" : "#C1553A");
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
                        {r.chunk.docTitle}
                        {r.chunk.docId !== "graph" && ` · #${r.chunk.localIndex}`}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted">
                        {r.score.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                      {r.chunk.text}
                    </p>
                  </div>
                );
              })}
              {retrieved.length === 0 && (
                <p className="py-3 text-[13px] text-muted">
                  Nothing retrieved.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <Insight>
        {graphMode === "global" ? (
          <>
            Global mode never touches the source text. It answers from summaries
            written at build time about clusters of the graph — the only way to
            answer a question whose answer is not written down anywhere, such as
            what themes the documents share. Note it does <em>not</em> filter
            those summaries by keyword: a thematic question shares no vocabulary
            with any single cluster name, so matching on overlap would return
            precisely the clusters least able to answer it. The published method
            map-reduces over every summary; this takes the broadest ones. The
            cost either way is that you are trusting a summary written before
            anyone asked the question.
          </>
        ) : subgraph && subgraph.nodes.length > graphSeeds.length ? (
          <>
            The walk reached{" "}
            <strong className="font-bold text-ink">
              {subgraph.nodes.length} entities
            </strong>{" "}
            from {graphSeeds.length} seed
            {graphSeeds.length === 1 ? "" : "s"}, pulling in{" "}
            {retrieved.length} passages across {docsTouched.size} document
            {docsTouched.size === 1 ? "" : "s"}. Raise the hop count and watch
            precision fall away — two hops from a well-connected entity reaches
            most of the corpus, which is retrieval in name only.
          </>
        ) : (
          <>
            Graph retrieval depends entirely on the extraction step having
            captured the right entities. Where vector search degrades gracefully
            into returning something vaguely related, a graph walk with no
            matching seed returns nothing at all.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

function Mode({
  active,
  onClick,
  title,
  note,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  note: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-2 text-left transition-all duration-150 ${
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
