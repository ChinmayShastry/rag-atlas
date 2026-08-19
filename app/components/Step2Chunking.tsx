"use client";

import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import { useMemo, useState } from "react";
import { STRATEGY_INFO, chunkDocs } from "../lib/chunking";
import { DOC_COLORS, useRag } from "../lib/store";
import { chunkColor } from "../lib/types";
import type { Chunk, Doc, Strategy } from "../lib/types";
import { Insight, Panel, Segmented, Slider, Stat, StepSection } from "./ui";

/**
 * Cards are capped rather than virtualised. At the minimum chunk size a large
 * corpus produces hundreds per document, and rendering them all is the one
 * thing that makes the slider feel sluggish. The ribbon above still shows every
 * cut, so nothing is actually hidden from view.
 */
const MAX_CARDS = 120;

export default function Step2Chunking({ n }: StageProps) {
  const {
    activeDocs,
    chunks,
    strategy,
    setStrategy,
    chunkSize,
    setChunkSize,
    overlap,
    setOverlap,
    effectiveOverlap,
    hovered,
    setHovered,
  } = useRag();

  const [ribbonDoc, setRibbonDoc] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);

  const doc =
    activeDocs.find((d) => d.id === ribbonDoc) ?? activeDocs[0] ?? null;
  const docChunks = useMemo(
    () => (doc ? chunks.filter((c) => c.docId === doc.id) : []),
    [chunks, doc],
  );

  const sizes = chunks.map((c) => c.text.length);
  const avg = sizes.length
    ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)
    : 0;
  const spread = sizes.length
    ? `${Math.min(...sizes)}–${Math.max(...sizes)}`
    : "—";
  const overlapClamped = overlap > effectiveOverlap;

  // Sentence and recursive splitting can only overlap by whole units, so a
  // small overlap next to large atoms silently does nothing. Detect it rather
  // than let the slider look broken.
  const overlapActive = useMemo(() => {
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const cur = chunks[i];
      if (prev.docId === cur.docId && prev.end > cur.start) return true;
    }
    return false;
  }, [chunks]);
  const overlapInert = effectiveOverlap > 0 && !overlapActive;

  return (
    <StepSection
      id="chunking"
      n={n}
      kicker={stageKicker(n)}
      title="Chunking"
      lede="A whole document is too big to retrieve usefully, so it gets cut into pieces. Where those cuts land decides what the model can ever find."
    >
      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        {/* ---------------- controls ---------------- */}
        <div className="space-y-4">
          <Panel title="Controls">
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-soft">
                  Strategy
                </div>
                <div className="flex flex-col gap-1">
                  {(Object.keys(STRATEGY_INFO) as Strategy[]).map((s) => {
                    const active = s === strategy;
                    return (
                      <button
                        key={s}
                        onClick={() => setStrategy(s)}
                        className={`rounded-xl border px-3 py-2 text-left transition-all duration-150 ${
                          active
                            ? "border-terracotta/50 bg-terracotta/[0.07] shadow-warm"
                            : "border-line bg-white/50 hover:border-terracotta/30"
                        }`}
                      >
                        <div
                          className={`text-[13px] font-bold ${active ? "text-terracotta" : "text-ink"}`}
                        >
                          {STRATEGY_INFO[s].name}
                        </div>
                        <div className="text-[11.5px] leading-snug text-muted">
                          {STRATEGY_INFO[s].tagline}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Slider
                label="Chunk size"
                value={chunkSize}
                min={200}
                max={2000}
                step={50}
                unit=" chars"
                onChange={setChunkSize}
                hint="Small chunks are precise but lose context. Large chunks carry context but dilute the match."
              />

              <Slider
                label="Overlap"
                value={overlap}
                min={0}
                max={400}
                step={20}
                unit=" chars"
                accent="#DE922B"
                onChange={setOverlap}
                hint={
                  overlapClamped
                    ? `Capped at ${effectiveOverlap} — overlap cannot exceed half the chunk size.`
                    : overlapInert
                      ? `No effect right now: ${STRATEGY_INFO[strategy].name.toLowerCase()} splitting overlaps by whole units, and none are small enough to fit in ${effectiveOverlap} chars. Raise it, or shrink the chunk size.`
                      : "Repeats the tail of each chunk at the head of the next, so a fact straddling a boundary survives."
                }
              />
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Chunks" value={chunks.length} />
            <Stat label="Avg size" value={avg} accent="#B0811C" sub="characters" />
            <Stat label="Range" value={spread} accent="#8C4A32" sub="min–max" />
            <Stat
              label="Vectors"
              value={chunks.length}
              accent="#B0455A"
              sub="one per chunk"
            />
          </div>

          <button
            onClick={() => setCompare((c) => !c)}
            className={compare ? "btn-amber w-full" : "btn-ghost w-full"}
          >
            {compare ? "Hide comparison" : "Compare all three strategies"}
          </button>
        </div>

        {/* ---------------- ribbon ---------------- */}
        <div className="space-y-4">
          <Panel
            title="Where the cuts land"
            right={
              activeDocs.length > 1 && (
                <Segmented
                  options={activeDocs.map((d) => ({
                    value: d.id,
                    label: d.title.split(" ")[0],
                  }))}
                  value={doc?.id ?? ""}
                  onChange={setRibbonDoc}
                />
              )
            }
            bodyClass="p-0"
          >
            {doc ? (
              <>
                <ChunkRibbon
                  doc={doc}
                  chunks={docChunks}
                  hovered={hovered}
                  setHovered={setHovered}
                />
                <div className="flex flex-wrap items-center gap-4 border-t border-line bg-parchment/30 px-4 py-2 text-[11.5px] text-muted">
                  <LegendSwatch
                    style={{ background: chunkColor(0).bg, opacity: 0.28 }}
                    label="chunk"
                  />
                  <LegendSwatch
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg,rgba(193,85,58,.42) 0 4px,rgba(222,146,43,.42) 4px 8px)",
                    }}
                    label="overlap — belongs to two chunks"
                  />
                  <span className="ml-auto font-mono">
                    {docChunks.length} chunks in this file
                  </span>
                </div>
              </>
            ) : (
              <div className="p-6 text-sm text-muted">
                No documents selected.
              </div>
            )}
          </Panel>

          <Panel
            title="The chunks themselves"
            right={
              <span className="font-mono text-[11px] text-muted">
                {docChunks.length > MAX_CARDS
                  ? `showing ${MAX_CARDS} of ${docChunks.length}`
                  : "hover to link with the ribbon"}
              </span>
            }
          >
            <div className="warm-scroll grid max-h-[300px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {docChunks.slice(0, MAX_CARDS).map((c) => {
                const col = chunkColor(c.index);
                const isHot = hovered === c.id;
                return (
                  <div
                    key={c.id}
                    onMouseEnter={() => setHovered(c.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="cursor-default rounded-xl border p-2.5 transition-all duration-150"
                    style={{
                      borderColor: isHot ? col.bg : "#EADBC8",
                      background: isHot ? col.tint : "rgba(255,255,255,.55)",
                      transform: isHot ? "translateY(-1px)" : undefined,
                      boxShadow: isHot ? `0 6px 18px -10px ${col.bg}` : undefined,
                    }}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className="font-mono text-[10.5px] font-bold uppercase tracking-wider"
                        style={{ color: col.bg }}
                      >
                        chunk #{c.localIndex}
                      </span>
                      <span className="font-mono text-[10.5px] text-muted">
                        {c.text.length}c · ~{c.tokens}t
                      </span>
                    </div>
                    <p className="line-clamp-3 text-[12px] leading-relaxed text-ink-soft">
                      {c.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      {compare && <StrategyComparison />}

      <Insight>
        {strategy === "fixed" ? (
          <>
            Fixed windows slice mid-word — scroll the ribbon and you will find
            chunks that begin halfway through a term. That broken text still gets
            embedded, and a fact split across a boundary can become unretrievable
            unless overlap catches it.
          </>
        ) : strategy === "sentence" ? (
          <>
            Every chunk now ends on a sentence boundary, so retrieved text always
            reads cleanly. The cost is uneven sizes — currently{" "}
            <strong className="font-bold text-ink">{spread}</strong> characters —
            which makes prompt-length budgeting harder to predict.
          </>
        ) : (
          <>
            Recursive splitting keeps paragraphs intact where it can and only
            descends to sentences, then words, when a piece is still too large.
            This is the common production default, and{" "}
            <strong className="font-bold text-ink">{chunks.length} chunks</strong>{" "}
            at ~{avg} characters is a healthy shape.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

/* ------------------------------------------------------------------ *
 * The ribbon: source text painted with its chunk membership
 * ------------------------------------------------------------------ */

interface Run {
  start: number;
  end: number;
  covering: Chunk[];
}

function buildRuns(text: string, chunks: Chunk[]): Run[] {
  if (!chunks.length) return [{ start: 0, end: text.length, covering: [] }];

  const bounds = new Set<number>([0, text.length]);
  for (const c of chunks) {
    bounds.add(c.start);
    bounds.add(Math.min(c.end, text.length));
  }
  const sorted = Array.from(bounds).sort((a, b) => a - b);

  const runs: Run[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    runs.push({
      start,
      end,
      covering: chunks.filter((c) => c.start < end && c.end > start),
    });
  }
  return runs;
}

function ChunkRibbon({
  doc,
  chunks,
  hovered,
  setHovered,
}: {
  doc: Doc;
  chunks: Chunk[];
  hovered: string | null;
  setHovered: (id: string | null) => void;
}) {
  const runs = useMemo(() => buildRuns(doc.text, chunks), [doc.text, chunks]);

  return (
    <div className="warm-scroll max-h-[420px] overflow-y-auto p-4 text-[12.5px] leading-[1.85]">
      <p className="whitespace-pre-wrap break-words font-mono">
        {runs.map((run, i) => {
          const text = doc.text.slice(run.start, run.end);
          if (!run.covering.length) {
            return <span key={i}>{text}</span>;
          }

          const isOverlap = run.covering.length > 1;
          const first = run.covering[0];
          const c1 = chunkColor(first.index);
          const isHot = run.covering.some((c) => c.id === hovered);

          let background: string;
          if (isOverlap) {
            const c2 = chunkColor(run.covering[1].index);
            background = `repeating-linear-gradient(45deg, ${c1.bg}${isHot ? "88" : "50"} 0 4px, ${c2.bg}${isHot ? "88" : "50"} 4px 8px)`;
          } else {
            background = isHot ? `${c1.bg}44` : `${c1.bg}1F`;
          }

          return (
            <span
              key={i}
              onMouseEnter={() => setHovered(first.id)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-default transition-colors duration-150"
              style={{
                background,
                boxShadow: isHot ? `inset 0 -2px 0 ${c1.bg}` : undefined,
                borderRadius: 2,
              }}
              title={`chunk #${first.localIndex}${isOverlap ? ` + #${run.covering[1].localIndex}` : ""}`}
            >
              {text}
            </span>
          );
        })}
      </p>
    </div>
  );
}

function LegendSwatch({
  style,
  label,
}: {
  style: React.CSSProperties;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-6 rounded border border-line"
        style={style}
        aria-hidden
      />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Extra: all three strategies on the same text, same settings
 * ------------------------------------------------------------------ */

function StrategyComparison() {
  const { activeDocs, chunkSize, effectiveOverlap, strategy } = useRag();

  const results = useMemo(
    () =>
      (Object.keys(STRATEGY_INFO) as Strategy[]).map((s) => {
        const cs = chunkDocs(activeDocs, s, chunkSize, effectiveOverlap);
        const sizes = cs.map((c) => c.text.length);
        const mean = sizes.length
          ? sizes.reduce((a, b) => a + b, 0) / sizes.length
          : 0;
        const variance = sizes.length
          ? sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / sizes.length
          : 0;
        // How often does a chunk begin mid-word? A direct measure of damage.
        const brokenWords = cs.filter((c) => /^[a-z]/.test(c.text)).length;
        return {
          strategy: s,
          chunks: cs,
          count: cs.length,
          mean: Math.round(mean),
          sd: Math.round(Math.sqrt(variance)),
          brokenWords,
        };
      }),
    [activeDocs, chunkSize, effectiveOverlap],
  );

  return (
    <div className="mt-4 animate-fade-up">
      <Panel title="Same text, same settings, three strategies">
        <div className="grid gap-3 md:grid-cols-3">
          {results.map((r) => {
            const info = STRATEGY_INFO[r.strategy];
            const isCurrent = r.strategy === strategy;
            return (
              <div
                key={r.strategy}
                className="rounded-xl border p-3 transition"
                style={{
                  borderColor: isCurrent ? "rgba(193,85,58,.5)" : "#EADBC8",
                  background: isCurrent
                    ? "rgba(193,85,58,.05)"
                    : "rgba(255,255,255,.5)",
                }}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-display text-[15px] font-bold text-ink">
                    {info.name}
                  </h4>
                  {isCurrent && (
                    <span className="chip border-terracotta/40 bg-terracotta/10 text-terracotta">
                      active
                    </span>
                  )}
                </div>

                <div className="mt-2 flex gap-3 font-mono text-[11.5px] text-ink-soft">
                  <span>
                    <strong className="text-ink">{r.count}</strong> chunks
                  </span>
                  <span>
                    μ <strong className="text-ink">{r.mean}</strong>
                  </span>
                  <span>
                    σ <strong className="text-ink">{r.sd}</strong>
                  </span>
                </div>

                {/* Size distribution as a tiny bar strip */}
                <div className="mt-2.5 flex h-9 items-end gap-[1px] overflow-hidden rounded-md bg-parchment/50 p-1">
                  {r.chunks.slice(0, 60).map((c, i) => (
                    <div
                      key={i}
                      className="min-w-[2px] flex-1 rounded-sm"
                      style={{
                        height: `${Math.min(100, (c.text.length / (chunkSize || 1)) * 100)}%`,
                        background: chunkColor(i).bg,
                        opacity: 0.65,
                      }}
                      title={`${c.text.length} chars`}
                    />
                  ))}
                </div>

                <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                  {info.detail}
                </p>

                <div
                  className="mt-2 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold"
                  style={{
                    background:
                      r.brokenWords > 0
                        ? "rgba(160,58,78,.08)"
                        : "rgba(110,130,87,.10)",
                    color: r.brokenWords > 0 ? "#8E2F41" : "#4E6340",
                  }}
                >
                  {r.brokenWords > 0
                    ? `${r.brokenWords} chunks start mid-word`
                    : "No chunks start mid-word"}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          σ is the standard deviation of chunk length. Fixed windows drive it to
          almost zero and pay for it by cutting through words; the other two
          accept uneven sizes to keep language intact.
        </p>
      </Panel>
    </div>
  );
}
