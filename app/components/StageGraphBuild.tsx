"use client";

import { useMemo, useState } from "react";
import { useRag } from "../lib/store";
import { TYPE_COLORS } from "../lib/graph";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import GraphPlot from "./GraphPlot";
import { Insight, Panel, Slider, Stat, StepSection } from "./ui";

export default function StageGraphBuild({ n }: StageProps) {
  const { graph, graphLoading } = useRag();
  const [minDegree, setMinDegree] = useState(3);

  // The full graph is far too dense to read, so the overview shows the
  // best-connected part of it — which is also the part retrieval will use.
  const view = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    const nodes = graph.nodes
      .filter((x) => x.degree >= minDegree)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 55);
    const ids = new Set(nodes.map((x) => x.id));
    return {
      nodes,
      edges: graph.edges.filter((e) => ids.has(e.s) && ids.has(e.t)),
    };
  }, [graph, minDegree]);

  const bridges = useMemo(
    () =>
      (graph?.nodes ?? [])
        .filter((x) => x.docs.length > 1)
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 8),
    [graph],
  );

  const topCommunities = useMemo(
    () => (graph?.communities ?? []).slice(0, 6),
    [graph],
  );

  return (
    <StepSection
      id="graphbuild"
      n={n}
      kicker={stageKicker(n)}
      title="The graph"
      lede="Entities extracted separately from every paragraph are merged by name, so a concept mentioned in several documents becomes one node joining them."
      locked={graphLoading && !graph}
      lockNote="Loading the knowledge graph…"
    >
      {graph && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Panel
              title="Best-connected entities"
              right={
                <span className="font-mono text-[11px] text-muted">
                  hover a node · click to pin
                </span>
              }
              bodyClass="p-3"
            >
              <GraphPlot nodes={view.nodes} edges={view.edges} height={430} />
              <div className="mt-2.5">
                <Slider
                  label="Minimum connections"
                  value={minDegree}
                  min={1}
                  max={8}
                  onChange={setMinDegree}
                  hint={`Showing ${view.nodes.length} entities with at least ${minDegree} relationship${minDegree > 1 ? "s" : ""}. Lower it to see the sparse edges of the graph.`}
                />
              </div>
            </Panel>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="On screen" value={view.nodes.length} />
                <Stat
                  label="Communities"
                  value={graph.communities.length}
                  accent="#B0811C"
                />
              </div>

              <Panel title="Entities that bridge documents">
                <div className="space-y-1.5">
                  {bridges.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border border-line bg-white/60 px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: TYPE_COLORS[b.type] ?? "#9C8674" }}
                        />
                        <span className="text-[12.5px] font-semibold text-ink">
                          {b.label}
                        </span>
                        <span className="ml-auto font-mono text-[10.5px] text-muted">
                          {b.degree} links
                        </span>
                      </div>
                      <div className="mt-0.5 pl-3.5 font-mono text-[10.5px] text-muted">
                        {b.docs.join(" + ")}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  These are the joins vector search cannot make. Nothing told the
                  system the workshop profile was related to the other files —
                  the shared entity names did.
                </p>
              </Panel>

              <Panel title="Communities">
                <div className="warm-scroll max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                  {topCommunities.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-line bg-white/55 px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-bold text-ink">
                          {c.label}
                        </span>
                        <span className="ml-auto font-mono text-[10.5px] text-muted">
                          {c.size}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">
                        {c.summary}
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <Insight>
            Communities are found by label propagation over the edges, then
            summarised once, offline. That summary is what makes whole-corpus
            questions answerable: &ldquo;what themes run through these
            documents?&rdquo; has no answer in any single passage, so no amount
            of similarity search will ever find one — but a summary of a cluster
            is exactly that answer, written in advance.
          </Insight>
        </>
      )}
    </StepSection>
  );
}
