"use client";

import { useMemo } from "react";
import { useRag } from "../lib/store";
import { LEVEL_COLORS, levelLabel, nodesByLevel } from "../lib/tree";
import type { ScoredNode } from "../lib/tree";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import {
  Insight,
  Panel,
  Slider,
  Spinner,
  Stat,
  StepSection,
} from "./ui";

export default function StageTreeRoute({ n }: StageProps) {
  const {
    tree,
    treeVectors,
    treeEmbedding,
    runTreeEmbedding,
    treeMode,
    setTreeMode,
    treeKeepPerLevel,
    setTreeKeepPerLevel,
    treeHits,
    treeTraversal,
    queryVector,
    embeddedQuery,
    topK,
    setTopK,
    canCallApi,
  } = useRag();

  const levels = useMemo(() => (tree ? nodesByLevel(tree) : []), [tree]);
  const ready = !!tree && !!embeddedQuery && !!queryVector;

  const picked: ScoredNode[] =
    treeMode === "collapsed" ? treeHits : (treeTraversal?.selected ?? []);

  // Which levels did the answer actually come from?
  const levelMix = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of picked)
      counts.set(p.node.level, (counts.get(p.node.level) ?? 0) + 1);
    return counts;
  }, [picked]);

  return (
    <StepSection
      id="treeroute"
      n={n}
      kicker={stageKicker(n)}
      title="Routing by abstraction"
      lede="Every node is embedded, summaries included. A precise question lands on a leaf and a broad one lands on a summary, through exactly the same similarity search."
      locked={!ready}
      lockNote="Embed a question first."
    >
      {!treeVectors ? (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="max-w-lg text-[14px] leading-relaxed text-ink-soft">
              The tree ships as a static file but its embeddings do not — at
              1536 floats per node the JSON would be larger than the corpus. One
              batch call embeds all {tree?.nodes.length ?? 0} nodes.
            </p>
            <button
              onClick={runTreeEmbedding}
              disabled={treeEmbedding || !canCallApi}
              className="btn-primary"
            >
              {treeEmbedding ? (
                <>
                  <Spinner /> Embedding the tree…
                </>
              ) : (
                `Embed ${tree?.nodes.length ?? 0} tree nodes →`
              )}
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
            <div className="space-y-4">
              <Panel title="Retrieval strategy">
                <div className="space-y-2">
                  <Mode
                    active={treeMode === "collapsed"}
                    onClick={() => setTreeMode("collapsed")}
                    title="Collapsed tree"
                    note="Ignore the hierarchy. Every node at every level competes in one flat search."
                  />
                  <Mode
                    active={treeMode === "traversal"}
                    onClick={() => setTreeMode("traversal")}
                    title="Tree traversal"
                    note="Start at the root, keep the best few, descend into their children only."
                  />
                </div>

                <div className="mt-4">
                  {treeMode === "collapsed" ? (
                    <Slider
                      label="Passages"
                      value={topK}
                      min={1}
                      max={10}
                      onChange={setTopK}
                      hint="Taken from anywhere in the tree, whichever nodes score highest."
                    />
                  ) : (
                    <Slider
                      label="Keep per level"
                      value={treeKeepPerLevel}
                      min={1}
                      max={5}
                      onChange={setTreeKeepPerLevel}
                      hint="Narrow is fast but one wrong turn near the root makes whole branches unreachable."
                    />
                  )}
                </div>
              </Panel>

              <div className="grid grid-cols-2 gap-2">
                <Stat label="Selected" value={picked.length} accent="#5F7A4F" />
                <Stat
                  label="Levels used"
                  value={levelMix.size}
                  accent="#B0811C"
                  sub={`of ${levels.length}`}
                />
              </div>

              <Panel title="Where the context came from">
                <div className="space-y-1.5">
                  {levels.map((_, i) => levels.length - 1 - i).map((lvl) => {
                    const count = levelMix.get(lvl) ?? 0;
                    const color = LEVEL_COLORS[lvl] ?? "#9C8674";
                    return (
                      <div key={lvl} className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        <span className="text-[12px] text-ink-soft">
                          {levelLabel(lvl, levels.length)}
                        </span>
                        <div className="ml-auto flex items-center gap-1.5">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-parchment">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${picked.length ? (count / picked.length) * 100 : 0}%`,
                                background: color,
                                transition: "width .4s ease",
                              }}
                            />
                          </div>
                          <span className="w-4 text-right font-mono text-[11px] text-muted">
                            {count}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                  Leaves will usually dominate here, and that is honest rather
                  than broken: this corpus has {levels[0]?.length ?? 0} leaves
                  against {(tree?.nodes.length ?? 0) - (levels[0]?.length ?? 0)}{" "}
                  summaries, and on four documents a specific passage is nearly
                  always the better match. RAPTOR earns its keep when no single
                  passage can cover the question — which needs a far larger
                  corpus than this one.
                </p>
              </Panel>
            </div>

            <div className="space-y-4">
              {treeMode === "traversal" && treeTraversal && (
                <Panel title="The descent">
                  <div className="space-y-2.5">
                    {treeTraversal.levels.map((level, i) => (
                      <div key={i}>
                        <div className="mb-1 font-mono text-[10.5px] uppercase tracking-wider text-muted">
                          step {i + 1} · level {levels.length - 1 - i}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {level.map((s) => {
                            const color = LEVEL_COLORS[s.node.level] ?? "#9C8674";
                            return (
                              <span
                                key={s.node.id}
                                className="rounded-lg border px-2 py-1 text-[11.5px] font-semibold"
                                style={{
                                  borderColor: `${color}66`,
                                  background: `${color}0E`,
                                  color: "#2B1D16",
                                }}
                                title={s.node.text.slice(0, 200)}
                              >
                                {s.node.title}
                                <span className="ml-1.5 font-mono text-[10px] text-muted">
                                  {s.score.toFixed(2)}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                    Only children of the surviving nodes are ever scored. Anything
                    under a branch discarded at step 1 is invisible for the rest
                    of the search, however relevant it is.
                  </p>
                </Panel>
              )}

              <Panel title={`Retrieved — ${picked.length} nodes`}>
                <div className="warm-scroll max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                  {picked.map((s) => {
                    const color = LEVEL_COLORS[s.node.level] ?? "#9C8674";
                    return (
                      <div
                        key={s.node.id}
                        className="rounded-xl border p-2.5"
                        style={{
                          borderColor: `${color}55`,
                          background: `${color}0A`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="chip shrink-0 border-transparent text-[9.5px]"
                            style={{ color, background: `${color}18` }}
                          >
                            L{s.node.level}
                          </span>
                          <span
                            className="truncate text-[11.5px] font-bold"
                            style={{ color }}
                          >
                            {s.node.title}
                          </span>
                          <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
                            {s.score.toFixed(3)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-ink-soft">
                          {s.node.text}
                        </p>
                      </div>
                    );
                  })}
                  {picked.length === 0 && (
                    <p className="py-3 text-[13px] text-muted">
                      Nothing selected.
                    </p>
                  )}
                </div>
              </Panel>
            </div>
          </div>

          <Insight>
            {treeMode === "collapsed" ? (
              <>
                Collapsed search is what the RAPTOR paper found works best, and
                it is the counterintuitive result: having built a careful
                hierarchy, the best way to use it is to ignore the structure and
                let every node compete. The tree earns its keep by{" "}
                <em>existing</em> — by putting summaries in the index at all —
                not by being walked. Switch to traversal and watch the level mix
                narrow.
              </>
            ) : (
              <>
                Traversal scores far fewer nodes, which matters at a million
                documents and not at all here. The cost is that a wrong turn near
                the root is unrecoverable: everything beneath a discarded branch
                is gone from consideration, no matter how well it matches.
              </>
            )}
          </Insight>
        </>
      )}
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
