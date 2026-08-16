"use client";

import { useMemo, useState } from "react";
import { DOC_COLORS, useRag } from "../lib/store";
import type { Chunk } from "../lib/types";

interface Props {
  /** Draw lines from the query to these chunk ids, and make them glow. */
  highlight?: Set<string>;
  /** chunkId -> cosine score, used to modulate brightness. */
  scoreById?: Map<string, number>;
  height?: number;
  showQuery?: boolean;
}

export default function EmbeddingPlot({
  highlight,
  scoreById,
  height = 380,
  showQuery = true,
}: Props) {
  const { plot, queryPoint, hovered, setHovered, embedDims } = useRag();
  const [pinned, setPinned] = useState<string | null>(null);

  const activeId = pinned ?? hovered;
  const activePoint = useMemo(
    () => plot.find((p) => p.chunk.id === activeId) ?? null,
    [plot, activeId],
  );

  if (plot.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-line bg-parchment/30 text-[13px] text-muted"
        style={{ height }}
      >
        Embed the chunks to plot them.
      </div>
    );
  }

  const px = (x: number) => 6 + x * 88;
  const py = (y: number) => 94 - y * 88;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-clay/30"
      style={{
        height,
        background:
          "radial-gradient(ellipse 70% 60% at 30% 25%, #3A2418, #241710 70%)",
      }}
      onMouseLeave={() => setHovered(null)}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <radialGradient id="queryGlow">
            <stop offset="0%" stopColor="#FFF3DC" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FFF3DC" stopOpacity="0" />
          </radialGradient>
        </defs>

        {[20, 40, 60, 80].map((v) => (
          <g key={v} stroke="#F2C14E" strokeOpacity="0.055" strokeWidth="0.25">
            <line x1={v} y1="2" x2={v} y2="98" />
            <line x1="2" y1={v} x2="98" y2={v} />
          </g>
        ))}

        {/* Retrieval lines: query -> each retrieved chunk */}
        {showQuery &&
          queryPoint &&
          highlight &&
          plot
            .filter((p) => highlight.has(p.chunk.id))
            .map((p) => {
              const s = scoreById?.get(p.chunk.id) ?? 0.5;
              return (
                <line
                  key={`l-${p.chunk.id}`}
                  x1={px(queryPoint.x)}
                  y1={py(queryPoint.y)}
                  x2={px(p.x)}
                  y2={py(p.y)}
                  stroke="#F2C14E"
                  strokeOpacity={0.22 + s * 0.45}
                  strokeWidth={0.35 + s * 0.5}
                  strokeLinecap="round"
                />
              );
            })}

        {plot.map((p) => {
          const color = DOC_COLORS[p.chunk.docId]?.plot ?? "#E8865C";
          const isHit = highlight?.has(p.chunk.id) ?? false;
          const isActive = activeId === p.chunk.id;
          const score = scoreById?.get(p.chunk.id);

          // With scores present, dim the field so the winners stand out.
          const baseOpacity = scoreById
            ? isHit
              ? 1
              : 0.16 + Math.max(0, (score ?? 0)) * 0.45
            : 0.82;

          const r = isActive ? 2.4 : isHit ? 2.0 : 1.25;

          return (
            <g key={p.chunk.id}>
              {(isHit || isActive) && (
                <circle
                  cx={px(p.x)}
                  cy={py(p.y)}
                  r={r + 2.2}
                  fill={color}
                  opacity={0.18}
                />
              )}
              <circle
                cx={px(p.x)}
                cy={py(p.y)}
                r={r}
                fill={color}
                opacity={baseOpacity}
                stroke={isActive ? "#FFF6E6" : "none"}
                strokeWidth={isActive ? 0.6 : 0}
                style={{ transition: "r .18s ease, opacity .25s ease" }}
              />
              {/* Generous invisible hit target */}
              <circle
                cx={px(p.x)}
                cy={py(p.y)}
                r={3.2}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHovered(p.chunk.id)}
                onClick={() =>
                  setPinned((cur) => (cur === p.chunk.id ? null : p.chunk.id))
                }
              />
            </g>
          );
        })}

        {showQuery && queryPoint && (
          <g>
            <circle
              cx={px(queryPoint.x)}
              cy={py(queryPoint.y)}
              r="7"
              fill="url(#queryGlow)"
            />
            <circle
              cx={px(queryPoint.x)}
              cy={py(queryPoint.y)}
              r="2.6"
              fill="#FFF6E6"
              stroke="#F2C14E"
              strokeWidth="0.8"
            />
          </g>
        )}
      </svg>

      <Legend hasQuery={showQuery && !!queryPoint} />

      <div className="pointer-events-none absolute bottom-2.5 right-3 font-mono text-[10px] uppercase tracking-wider text-honey/40">
        PCA · {embedDims || 1536}D → 2D
      </div>

      {activePoint && (
        <Tooltip
          chunk={activePoint.chunk}
          x={px(activePoint.x)}
          y={py(activePoint.y)}
          score={scoreById?.get(activePoint.chunk.id)}
          pinned={pinned === activePoint.chunk.id}
        />
      )}
    </div>
  );
}

function Legend({ hasQuery }: { hasQuery: boolean }) {
  const { activeDocs } = useRag();
  return (
    <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
      {activeDocs.map((d) => (
        <div key={d.id} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: DOC_COLORS[d.id]?.plot }}
          />
          <span className="text-[10.5px] font-semibold text-honey/70">
            {d.title}
          </span>
        </div>
      ))}
      {hasQuery && (
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#FFF6E6] ring-2 ring-honey/50" />
          <span className="text-[10.5px] font-semibold text-honey/70">
            Your query
          </span>
        </div>
      )}
    </div>
  );
}

function Tooltip({
  chunk,
  x,
  y,
  score,
  pinned,
}: {
  chunk: Chunk;
  x: number;
  y: number;
  score?: number;
  pinned: boolean;
}) {
  const flipX = x > 55;
  const flipY = y < 40;

  return (
    <div
      className="pointer-events-none absolute z-10 w-[248px] animate-pop rounded-xl border border-honey/25 bg-night/95 p-2.5 shadow-warm-lg backdrop-blur"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(${flipX ? "-104%" : "4%"}, ${flipY ? "6%" : "-104%"})`,
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          className="truncate text-[10.5px] font-bold uppercase tracking-wider"
          style={{ color: DOC_COLORS[chunk.docId]?.plot }}
        >
          {chunk.docTitle} · #{chunk.localIndex}
        </span>
        {score !== undefined && (
          <span className="shrink-0 font-mono text-[11px] font-bold text-honey">
            {score.toFixed(3)}
          </span>
        )}
      </div>
      <p className="line-clamp-4 text-[11.5px] leading-relaxed text-parchment/80">
        {chunk.text}
      </p>
      <div className="mt-1.5 font-mono text-[9.5px] uppercase tracking-wider text-honey/40">
        {pinned ? "Click again to unpin" : "Click to pin"} · {chunk.text.length} chars
      </div>
    </div>
  );
}
