"use client";

import { useMemo, useState } from "react";
import { useRag } from "../lib/store";
import { LEVEL_COLORS, levelLabel, nodesByLevel, treeIndex } from "../lib/tree";
import type { TreeNode } from "../lib/tree";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import { formatUSD } from "../lib/pricing";
import { ErrorNote, Insight, Panel, Stat, StepSection } from "./ui";

export default function StageTree({ n }: StageProps) {
  const { tree, treeLoading, treeError } = useRag();
  const [selected, setSelected] = useState<string | null>(null);

  const levels = useMemo(() => (tree ? nodesByLevel(tree) : []), [tree]);
  const index = useMemo(
    () => (tree ? treeIndex(tree) : new Map<string, TreeNode>()),
    [tree],
  );
  const node = selected ? index.get(selected) : null;

  // Highlight the path from the selected node down to its descendants.
  const family = useMemo(() => {
    if (!node) return null;
    const down = new Set<string>();
    const walk = (id: string) => {
      const x = index.get(id);
      if (!x) return;
      for (const c of x.children) {
        down.add(c);
        walk(c);
      }
    };
    walk(node.id);
    const up = new Set<string>();
    let cursor: string | null = node.id;
    while (cursor) {
      const parent = tree?.nodes.find((p) => p.children.includes(cursor!));
      if (!parent) break;
      up.add(parent.id);
      cursor = parent.id;
    }
    return { down, up };
  }, [node, index, tree]);

  return (
    <StepSection
      id="tree"
      n={n}
      kicker={stageKicker(n)}
      title="The summary tree"
      lede="Cluster the chunks, summarise each cluster, then cluster the summaries and summarise those. The index stops being a flat list and becomes a hierarchy of abstraction."
      locked={treeLoading && !tree}
      lockNote="Loading the summary tree…"
    >
      {treeError && <ErrorNote>{treeError}</ErrorNote>}

      {tree && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Panel
              title="Every level of the tree"
              right={
                <span className="font-mono text-[11px] text-muted">
                  click a node to trace its family
                </span>
              }
            >
              <div className="space-y-4">
                {levels
                  .map((_, i) => levels.length - 1 - i)
                  .map((levelIdx) => {
                    const color = LEVEL_COLORS[levelIdx] ?? "#9C8674";
                    return (
                      <div key={levelIdx}>
                        <div className="mb-1.5 flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: color }}
                          />
                          <span
                            className="text-[11px] font-bold uppercase tracking-wider"
                            style={{ color }}
                          >
                            {levelLabel(levelIdx, levels.length)}
                          </span>
                          <span className="font-mono text-[10.5px] text-muted">
                            {levels[levelIdx].length} nodes
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {levels[levelIdx].map((x) => {
                            const isSel = selected === x.id;
                            const isDown = family?.down.has(x.id) ?? false;
                            const isUp = family?.up.has(x.id) ?? false;
                            const dim = !!family && !isSel && !isDown && !isUp;
                            return (
                              <button
                                key={x.id}
                                onClick={() =>
                                  setSelected((c) => (c === x.id ? null : x.id))
                                }
                                className="rounded-lg border px-2 py-1 text-left transition-all duration-150"
                                style={{
                                  borderColor: isSel
                                    ? color
                                    : isDown || isUp
                                      ? `${color}70`
                                      : "#EADBC8",
                                  background: isSel
                                    ? `${color}1C`
                                    : isDown
                                      ? `${color}0E`
                                      : "rgba(255,255,255,.5)",
                                  opacity: dim ? 0.32 : 1,
                                  maxWidth: levelIdx === 0 ? 132 : 190,
                                }}
                              >
                                <span
                                  className="block truncate text-[11.5px] font-semibold"
                                  style={{ color: isSel ? color : "#2B1D16" }}
                                >
                                  {x.title}
                                </span>
                                {levelIdx > 0 && (
                                  <span className="block font-mono text-[9.5px] text-muted">
                                    {x.children.length} children
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Panel>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Levels" value={levels.length} accent="#5F7A4F" />
                <Stat label="Nodes" value={tree.nodes.length} accent="#B0811C" />
                <Stat
                  label="Leaves"
                  value={levels[0]?.length ?? 0}
                  accent="#C2603A"
                  sub="source text"
                />
                <Stat
                  label="Summaries"
                  value={tree.nodes.length - (levels[0]?.length ?? 0)}
                  accent="#B0455A"
                  sub="model-written"
                />
              </div>

              <Panel title={node ? node.title : "Select a node"}>
                {node ? (
                  <>
                    <div className="mb-1.5 flex items-center gap-2">
                      <span
                        className="chip border-transparent"
                        style={{
                          color: LEVEL_COLORS[node.level],
                          background: `${LEVEL_COLORS[node.level]}18`,
                        }}
                      >
                        {levelLabel(node.level, levels.length)}
                      </span>
                      <span className="font-mono text-[10.5px] text-muted">
                        {node.docs.join(", ")}
                      </span>
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-ink-soft">
                      {node.text}
                    </p>
                    {node.children.length > 0 && (
                      <p className="mt-2 border-t border-line pt-2 text-[12px] text-muted">
                        Summarises {node.children.length} nodes from the level
                        below.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-muted">
                    Leaves hold verbatim source text. Everything above is written
                    by a model at build time, describing the nodes beneath it.
                  </p>
                )}
              </Panel>

              <Panel title="Built offline">
                <div className="space-y-1.5 font-mono text-[11.5px] text-ink-soft">
                  <Row label="calls" value={String(tree.meta.calls)} />
                  <Row label="cost" value={formatUSD(tree.meta.estimatedCostUsd)} />
                  <Row label="leaf size" value={`~${tree.meta.leafTarget}c`} />
                  <Row
                    label="built"
                    value={new Date(tree.meta.builtAt).toISOString().slice(0, 10)}
                  />
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  Clustering used embeddings of every node, and each cluster cost
                  one summarisation call. Built by{" "}
                  <code className="font-mono text-clay">
                    scripts/build-tree.mjs
                  </code>
                  .
                </p>
              </Panel>
            </div>
          </div>

          <Insight>
            The summaries are lossy by construction — that is the point, not a
            defect. A level-2 node cannot tell you a specific temperature, but it
            can tell you what a whole region of the corpus is about, which no
            individual chunk can. The build prompt explicitly asks for figures to
            be preserved, because a summary that drops the numbers is useless to
            retrieve with.
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
