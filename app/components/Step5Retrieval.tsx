"use client";

import { useMemo } from "react";
import { DOC_COLORS, useRag } from "../lib/store";
import EmbeddingPlot from "./EmbeddingPlot";
import { Insight, Panel, Slider, Stat, StepSection } from "./ui";

export default function Step5Retrieval() {
  const {
    ranked,
    retrieved,
    topK,
    setTopK,
    minScore,
    setMinScore,
    queryVector,
    vectors,
    hovered,
    setHovered,
    chunks,
  } = useRag();

  const ready = !!vectors && !!queryVector && ranked.length > 0;

  const highlight = useMemo(
    () => new Set(retrieved.map((r) => r.chunk.id)),
    [retrieved],
  );
  const scoreById = useMemo(
    () => new Map(ranked.map((r) => [r.chunk.id, r.score])),
    [ranked],
  );

  const best = ranked[0]?.score ?? 0;
  const worst = ranked[ranked.length - 1]?.score ?? 0;
  const cutoff = retrieved[retrieved.length - 1]?.score ?? 0;
  const filteredOut = ranked.filter((r) => r.score < minScore).length;

  // Do the winners come from more than one document?
  const docsHit = new Set(retrieved.map((r) => r.chunk.docId));

  return (
    <StepSection
      id="retrieval"
      n={5}
      kicker="Stage five"
      title="Retrieval"
      lede="Every chunk is scored against the question by cosine similarity, sorted, and the top few are kept. This is the R in RAG."
      locked={!ready}
      lockNote="Embed a question in stage 4 to rank the chunks against it."
    >
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Controls">
            <div className="space-y-4">
              <Slider
                label="Top K"
                value={topK}
                min={1}
                max={Math.min(12, Math.max(1, chunks.length))}
                onChange={setTopK}
                hint="How many chunks get handed to the model. More recall, more tokens, more noise."
              />
              <Slider
                label="Score floor"
                value={minScore}
                min={0}
                max={0.8}
                step={0.01}
                accent="#B0455A"
                onChange={setMinScore}
                hint={
                  filteredOut > 0
                    ? `${filteredOut} chunks now fall below the floor and can never be retrieved.`
                    : "Raise this to refuse weak matches rather than pad the prompt with them."
                }
              />
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Best match" value={best.toFixed(3)} />
            <Stat label="Cutoff" value={cutoff.toFixed(3)} accent="#B0811C" />
            <Stat label="Weakest" value={worst.toFixed(3)} accent="#9C8674" />
            <Stat
              label="Documents"
              value={`${docsHit.size}/3`}
              accent="#6E8257"
              sub="in the winners"
            />
          </div>

          <Panel title="Score spread">
            <ScoreHistogram
              scores={ranked.map((r) => r.score)}
              cutoff={cutoff}
              floor={minScore}
            />
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Every chunk, ranked. The shaded band is what survives to the
              prompt. A flat distribution means the query does not discriminate
              well.
            </p>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Query to winners" bodyClass="p-3">
            <EmbeddingPlot
              height={330}
              highlight={highlight}
              scoreById={scoreById}
            />
          </Panel>

          <Panel
            title={`Ranked chunks — top ${Math.min(topK, retrieved.length)} retrieved`}
          >
            <div className="warm-scroll max-h-[430px] space-y-1.5 overflow-y-auto pr-1">
              {ranked.slice(0, 14).map((r, i) => {
                const isIn = highlight.has(r.chunk.id);
                const isHot = hovered === r.chunk.id;
                const color = DOC_COLORS[r.chunk.docId]?.accent ?? "#C1553A";
                const belowFloor = r.score < minScore;

                return (
                  <div
                    key={r.chunk.id}
                    onMouseEnter={() => setHovered(r.chunk.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="rounded-xl border p-2.5 transition-all duration-150"
                    style={{
                      borderColor: isIn
                        ? `${color}70`
                        : isHot
                          ? "#D9C3A8"
                          : "#EADBC8",
                      background: isIn
                        ? `${color}0E`
                        : "rgba(255,255,255,.45)",
                      opacity: isIn ? 1 : belowFloor ? 0.42 : 0.72,
                      transform: isHot ? "translateX(2px)" : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10.5px] font-bold text-white"
                        style={{ background: isIn ? color : "#C4B3A0" }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="truncate text-[11px] font-bold uppercase tracking-wider"
                        style={{ color }}
                      >
                        {r.chunk.docTitle} · #{r.chunk.localIndex}
                      </span>

                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        {isIn && (
                          <span className="chip border-olive/40 bg-olive/10 text-[9.5px] text-olive">
                            in prompt
                          </span>
                        )}
                        {belowFloor && (
                          <span className="chip border-berry/30 bg-berry/[.07] text-[9.5px] text-berry">
                            below floor
                          </span>
                        )}
                        <span className="font-mono text-[12px] font-bold tabular-nums text-ink">
                          {r.score.toFixed(3)}
                        </span>
                      </div>
                    </div>

                    {/* Similarity bar — the scale is stretched because real
                        cosine scores on related text cluster in a narrow band. */}
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-parchment">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, ((r.score - 0.1) / 0.7) * 100)}%`,
                          background: isIn
                            ? `linear-gradient(90deg,${color}99,${color})`
                            : "#CBB8A2",
                          transition: "width .5s cubic-bezier(.2,.8,.25,1)",
                        }}
                      />
                    </div>

                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                      {r.chunk.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      <Insight>
        {docsHit.size > 1 ? (
          <>
            Your top {retrieved.length} chunks span{" "}
            <strong className="font-bold text-ink">
              {docsHit.size} different documents
            </strong>
            . Nothing told the system these files were related — similarity alone
            pulled the relevant passages together across them.
          </>
        ) : best < 0.35 ? (
          <>
            The best match is only{" "}
            <strong className="font-bold text-ink">{best.toFixed(3)}</strong>,
            which is weak. Retrieval always returns <em>something</em> — it has
            no notion of &ldquo;no good answer exists&rdquo;. That is precisely
            why the score floor and the guardrails in stage 9 matter.
          </>
        ) : (
          <>
            Drag <strong className="font-bold text-ink">Top K</strong> and watch
            the plot: each extra chunk adds recall but also tokens and noise. The
            gap between rank 1 and rank {Math.min(topK + 1, ranked.length)} tells
            you how confident this retrieval really is.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

function ScoreHistogram({
  scores,
  cutoff,
  floor,
}: {
  scores: number[];
  cutoff: number;
  floor: number;
}) {
  if (!scores.length) return null;
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const span = max - min || 1;

  return (
    <div className="flex h-20 items-end gap-[2px]">
      {scores.slice(0, 70).map((s, i) => {
        const h = 12 + ((s - min) / span) * 88;
        const kept = s >= cutoff && s >= floor;
        return (
          <div
            key={i}
            className="min-w-[2px] flex-1 rounded-t-sm"
            style={{
              height: `${h}%`,
              background: kept
                ? "linear-gradient(180deg,#C1553A,#8C4A32)"
                : s < floor
                  ? "#E3D3C0"
                  : "#D6BFA6",
              transition: "background .3s ease",
            }}
            title={s.toFixed(4)}
          />
        );
      })}
    </div>
  );
}
