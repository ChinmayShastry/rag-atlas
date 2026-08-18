"use client";

import { useMemo, useState } from "react";
import { DOC_COLORS, useRag } from "../lib/store";
import { TYPE_COLORS } from "../lib/graph";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import {
  ErrorNote,
  Insight,
  Panel,
  Segmented,
  Stat,
  StepSection,
} from "./ui";
import { formatUSD } from "../lib/pricing";

export default function StageExtract({ n }: StageProps) {
  const { graph, graphLoading, graphError, activeDocIds, docs } = useRag();
  const [docFilter, setDocFilter] = useState<string>("all");

  const stats = useMemo(() => {
    if (!graph) return null;
    const types = new Map<string, number>();
    for (const node of graph.nodes)
      types.set(node.type, (types.get(node.type) ?? 0) + 1);
    return {
      types: [...types.entries()].sort((a, b) => b[1] - a[1]),
      isolated: graph.nodes.filter((x) => x.degree === 0).length,
      bridges: graph.nodes.filter((x) => x.docs.length > 1).length,
    };
  }, [graph]);

  const shown = useMemo(() => {
    if (!graph) return [];
    const pool = graph.edges.filter(
      (e) =>
        activeDocIds.includes(e.docId) &&
        (docFilter === "all" || e.docId === docFilter),
    );
    return pool.slice(0, 40);
  }, [graph, docFilter, activeDocIds]);

  const labels = useMemo(
    () => new Map((graph?.nodes ?? []).map((x) => [x.id, x])),
    [graph],
  );

  return (
    <StepSection
      id="extract"
      n={n}
      kicker={stageKicker(n)}
      title="Extraction"
      lede="Instead of indexing text for similarity, a model reads every paragraph and writes down the entities in it and how they relate. The index becomes a graph."
      locked={graphLoading && !graph}
      lockNote="Loading the knowledge graph…"
    >
      {graphError && <ErrorNote>{graphError}</ErrorNote>}

      {graph && stats && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
            <Panel
              title="Extracted relationships"
              right={
                <Segmented
                  options={[
                    { value: "all", label: "All" },
                    ...docs
                      .filter((d) => activeDocIds.includes(d.id))
                      .map((d) => ({
                        value: d.id,
                        label: d.title.split(" ")[0],
                      })),
                  ]}
                  value={docFilter}
                  onChange={setDocFilter}
                />
              }
            >
              <div className="warm-scroll max-h-[430px] space-y-1 overflow-y-auto pr-1">
                {shown.map((e, i) => {
                  const s = labels.get(e.s);
                  const t = labels.get(e.t);
                  const color = DOC_COLORS[e.docId]?.accent ?? "#C1553A";
                  return (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white/55 px-2.5 py-1.5 text-[12.5px]"
                    >
                      <span
                        className="rounded-md px-1.5 py-0.5 font-semibold"
                        style={{
                          color: TYPE_COLORS[s?.type ?? ""] ?? "#C1553A",
                          background: `${TYPE_COLORS[s?.type ?? ""] ?? "#C1553A"}14`,
                        }}
                      >
                        {s?.label ?? e.s}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        —{e.relation}→
                      </span>
                      <span
                        className="rounded-md px-1.5 py-0.5 font-semibold"
                        style={{
                          color: TYPE_COLORS[t?.type ?? ""] ?? "#C1553A",
                          background: `${TYPE_COLORS[t?.type ?? ""] ?? "#C1553A"}14`,
                        }}
                      >
                        {t?.label ?? e.t}
                      </span>
                      <span
                        className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider"
                        style={{ color }}
                      >
                        {e.docId}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                Showing {shown.length} of {graph.edges.length} relationships.
                Each was written by a model reading one paragraph, and is
                anchored to that paragraph&apos;s character range — which is why
                the graph survives any change to the chunking sliders.
              </p>
            </Panel>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Entities" value={graph.nodes.length} accent="#C2603A" />
                <Stat label="Relations" value={graph.edges.length} accent="#B0811C" />
                <Stat
                  label="Bridges"
                  value={stats.bridges}
                  accent="#5F7A4F"
                  sub="span 2+ docs"
                />
                <Stat
                  label="Orphans"
                  value={stats.isolated}
                  accent="#9C8674"
                  sub="no relations"
                />
              </div>

              <Panel title="Entity types">
                <div className="space-y-1">
                  {stats.types.map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: TYPE_COLORS[type] ?? "#9C8674" }}
                      />
                      <span className="text-[12.5px] text-ink-soft">{type}</span>
                      <span className="ml-auto font-mono text-[11.5px] text-muted">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Built offline">
                <div className="space-y-1.5 font-mono text-[11.5px] text-ink-soft">
                  <Row label="model" value={graph.meta.model} />
                  <Row label="calls" value={String(graph.meta.calls)} />
                  <Row
                    label="cost"
                    value={formatUSD(graph.meta.estimatedCostUsd)}
                  />
                  <Row
                    label="built"
                    value={new Date(graph.meta.builtAt).toISOString().slice(0, 10)}
                  />
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  One model call per paragraph. That is the real cost of Graph
                  RAG, and it scales with the corpus rather than with traffic —
                  so it is paid once, at build time, by{" "}
                  <code className="font-mono text-clay">
                    scripts/build-graph.mjs
                  </code>
                  .
                </p>
              </Panel>
            </div>
          </div>

          <Insight>
            Note the <strong className="font-bold text-ink">{stats.isolated} orphans</strong>
            : entities the model named but never connected to anything. Extraction
            is lossy and inconsistent — the same concept can surface under two
            names in two paragraphs and never merge. Every Graph RAG system
            spends most of its engineering effort on exactly this problem, not on
            the graph algorithms.
          </Insight>
        </>
      )}
    </StepSection>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line/60 pb-1">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
