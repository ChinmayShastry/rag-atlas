"use client";

import { useMemo } from "react";
import { useRag } from "../lib/store";
import { normalize, tokenize } from "../lib/bm25";
import { DOC_COLORS } from "../lib/store";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import { Insight, Panel, Slider, Stat, StepSection } from "./ui";

export default function StageHybrid({ n }: StageProps) {
  const {
    chunks,
    denseScores,
    sparseScores,
    baseRanked,
    hybridAlpha,
    setHybridAlpha,
    embeddedQuery,
    hovered,
    setHovered,
  } = useRag();

  const ready = !!denseScores && baseRanked.length > 0;

  const queryTerms = useMemo(
    () => (embeddedQuery ? tokenize(embeddedQuery) : []),
    [embeddedQuery],
  );

  /** Rank position of each chunk under each scoring method, for comparison. */
  const ranks = useMemo(() => {
    if (!denseScores) return null;
    const order = (scores: number[]) =>
      chunks
        .map((c, i) => ({ id: c.id, s: scores[i] ?? 0 }))
        .sort((a, b) => b.s - a.s)
        .reduce((m, x, i) => m.set(x.id, i + 1), new Map<string, number>());
    return {
      dense: order(denseScores),
      sparse: order(sparseScores),
    };
  }, [denseScores, sparseScores, chunks]);

  const nDense = denseScores ? normalize(denseScores) : [];
  const nSparse = normalize(sparseScores);
  const byId = useMemo(() => {
    const m = new Map<string, { dense: number; sparse: number }>();
    chunks.forEach((c, i) =>
      m.set(c.id, { dense: nDense[i] ?? 0, sparse: nSparse[i] ?? 0 }),
    );
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks, denseScores, sparseScores]);

  const matchedTerms = sparseScores.filter((s) => s > 0).length;

  return (
    <StepSection
      id="hybrid"
      n={n}
      kicker={stageKicker(n)}
      title="Hybrid retrieval"
      lede="Embeddings understand meaning but fumble exact tokens. Keyword scoring is the reverse. Hybrid search runs both and blends the results."
      locked={!ready}
      lockNote="Embed a question first."
    >
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Fusion weight">
            <Slider
              label="Keyword ← → Semantic"
              value={hybridAlpha}
              min={0}
              max={1}
              step={0.05}
              onChange={setHybridAlpha}
              hint={
                hybridAlpha >= 0.95
                  ? "Pure dense retrieval — identical to Naive RAG."
                  : hybridAlpha <= 0.05
                    ? "Pure BM25. Exact terms win; paraphrase is invisible."
                    : `${Math.round(hybridAlpha * 100)}% semantic, ${Math.round((1 - hybridAlpha) * 100)}% keyword.`
              }
            />
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              Both score sets are min-max normalised before blending, since a
              cosine similarity and a BM25 score live on completely different
              scales.
            </p>
          </Panel>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Query terms" value={queryTerms.length} sub="after stopwords" />
            <Stat
              label="Chunks hit"
              value={matchedTerms}
              accent="#B0811C"
              sub="by keyword"
            />
          </div>

          <Panel title="Terms BM25 is matching">
            {queryTerms.length ? (
              <div className="flex flex-wrap gap-1.5">
                {queryTerms.map((t) => (
                  <code
                    key={t}
                    className="rounded-md bg-parchment/70 px-1.5 py-0.5 font-mono text-[11.5px] text-clay"
                  >
                    {t}
                  </code>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted">No query yet.</p>
            )}
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
              Stopwords are dropped. BM25 rewards rare terms and discounts
              repeats, so a distinctive word like{" "}
              <code className="font-mono text-clay">cristobalite</code> counts
              for far more than <code className="font-mono text-clay">heat</code>.
            </p>
          </Panel>
        </div>

        <Panel
          title="Blended ranking"
          right={
            <span className="font-mono text-[11px] text-muted">
              dense · keyword · fused
            </span>
          }
        >
          <div className="warm-scroll max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
            {baseRanked.slice(0, 12).map((r, i) => {
              const parts = byId.get(r.chunk.id) ?? { dense: 0, sparse: 0 };
              const color = DOC_COLORS[r.chunk.docId]?.accent ?? "#C1553A";
              const dRank = ranks?.dense.get(r.chunk.id);
              const sRank = ranks?.sparse.get(r.chunk.id);
              const isHot = hovered === r.chunk.id;
              // Did keyword scoring pull this up relative to dense alone?
              const climbed = dRank && dRank > i + 1;

              return (
                <div
                  key={r.chunk.id}
                  onMouseEnter={() => setHovered(r.chunk.id)}
                  onMouseLeave={() => setHovered(null)}
                  className="rounded-xl border p-2.5 transition-all duration-150"
                  style={{
                    borderColor: isHot ? `${color}70` : "#EADBC8",
                    background: isHot ? `${color}0C` : "rgba(255,255,255,.5)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10.5px] font-bold text-white"
                      style={{ background: color }}
                    >
                      {i + 1}
                    </span>
                    <span
                      className="truncate text-[11px] font-bold uppercase tracking-wider"
                      style={{ color }}
                    >
                      {r.chunk.docTitle} · #{r.chunk.localIndex}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted">
                      dense #{dRank ?? "—"} · kw #{sRank ?? "—"}
                    </span>
                    {climbed && (
                      <span className="chip shrink-0 border-olive/40 bg-olive/10 text-[9px] text-olive">
                        ↑ {dRank! - (i + 1)}
                      </span>
                    )}
                  </div>

                  {/* Stacked contribution bar: how much of the fused score came
                      from each side, at the current weight. */}
                  <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-parchment">
                    <div
                      style={{
                        width: `${parts.dense * hybridAlpha * 100}%`,
                        background: "#C1553A",
                        transition: "width .35s cubic-bezier(.2,.8,.25,1)",
                      }}
                      title={`semantic ${(parts.dense * hybridAlpha).toFixed(3)}`}
                    />
                    <div
                      style={{
                        width: `${parts.sparse * (1 - hybridAlpha) * 100}%`,
                        background: "#DE922B",
                        transition: "width .35s cubic-bezier(.2,.8,.25,1)",
                      }}
                      title={`keyword ${(parts.sparse * (1 - hybridAlpha)).toFixed(3)}`}
                    />
                  </div>

                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                    {r.chunk.text}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-4 border-t border-line pt-2.5 text-[11.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm bg-terracotta" /> semantic
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm bg-amber" /> keyword
            </span>
            <span className="ml-auto">bar length = contribution to fused score</span>
          </div>
        </Panel>
      </div>

      <Insight>
        Drag the weight to either extreme and watch the order change. Pure
        semantic misses exact strings — part numbers, cone numbers, proper nouns
        — because an embedding has no notion of a literal token. Pure keyword
        misses every paraphrase. Production systems rarely pick a side; most run
        both and fuse, often with reciprocal rank fusion rather than the weighted
        blend used here.
      </Insight>
    </StepSection>
  );
}
