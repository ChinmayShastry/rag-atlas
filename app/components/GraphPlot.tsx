"use client";

import { useMemo, useState } from "react";
import { TYPE_COLORS, forceLayout } from "../lib/graph";
import type { GraphEdge, GraphNode } from "../lib/graph";

/**
 * Node-link view of a subgraph. Positions come from a seeded force simulation
 * so the same subgraph always draws identically — a graph that reshuffles on
 * every render is impossible to reason about.
 */
export default function GraphPlot({
  nodes,
  edges,
  seeds,
  depth,
  height = 420,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  seeds?: Set<string>;
  depth?: Map<string, number>;
  height?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const positions = useMemo(
    () => forceLayout(nodes, edges),
    [nodes, edges],
  );
  const byId = useMemo(
    () => new Map(positions.map((p) => [p.node.id, p])),
    [positions],
  );

  const activeId = pinned ?? hover;
  const active = activeId ? byId.get(activeId) : null;
  const neighbours = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>();
    for (const e of edges) {
      if (e.s === activeId) set.add(e.t);
      if (e.t === activeId) set.add(e.s);
    }
    return set;
  }, [activeId, edges]);

  if (nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-line bg-parchment/30 text-[13px] text-muted"
        style={{ height }}
      >
        No entities matched.
      </div>
    );
  }

  const px = (x: number) => x * 100;
  const py = (y: number) => y * 100;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-clay/30"
      style={{
        height,
        background:
          "radial-gradient(ellipse 70% 60% at 35% 25%, #3A2418, #241710 72%)",
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {edges.map((e, i) => {
          const a = byId.get(e.s);
          const b = byId.get(e.t);
          if (!a || !b) return null;
          const touched =
            !activeId || e.s === activeId || e.t === activeId;
          return (
            <line
              key={i}
              x1={px(a.x)}
              y1={py(a.y)}
              x2={px(b.x)}
              y2={py(b.y)}
              stroke={touched ? "#F2C14E" : "#8C6A3A"}
              strokeOpacity={touched ? (activeId ? 0.7 : 0.28) : 0.08}
              strokeWidth={touched && activeId ? 0.45 : 0.25}
            />
          );
        })}

        {positions.map((p) => {
          const isSeed = seeds?.has(p.node.id) ?? false;
          const d = depth?.get(p.node.id) ?? 0;
          const isActive = activeId === p.node.id;
          const isNeighbour = neighbours?.has(p.node.id) ?? false;
          const dim = activeId && !isActive && !isNeighbour;
          const color = TYPE_COLORS[p.node.type] ?? "#E8865C";
          const r = isSeed ? 2.2 : Math.max(1.1, 2 - d * 0.4);

          return (
            <g key={p.node.id}>
              {isSeed && (
                <circle
                  cx={px(p.x)}
                  cy={py(p.y)}
                  r={r + 2}
                  fill={color}
                  opacity={dim ? 0.06 : 0.2}
                />
              )}
              <circle
                cx={px(p.x)}
                cy={py(p.y)}
                r={r}
                fill={color}
                opacity={dim ? 0.18 : 1}
                stroke={isSeed ? "#FFF6E6" : "none"}
                strokeWidth={isSeed ? 0.5 : 0}
              />
              <circle
                cx={px(p.x)}
                cy={py(p.y)}
                r={3.4}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHover(p.node.id)}
                onClick={() =>
                  setPinned((c) => (c === p.node.id ? null : p.node.id))
                }
              />
            </g>
          );
        })}
      </svg>

      {/* Labels sit in HTML so they stay legible whatever the viewBox scaling does. */}
      {positions.map((p) => {
        const isSeed = seeds?.has(p.node.id) ?? false;
        const isActive = activeId === p.node.id;
        const isNeighbour = neighbours?.has(p.node.id) ?? false;
        if (!isSeed && !isActive && !isNeighbour && nodes.length > 22) return null;
        return (
          <span
            key={p.node.id}
            className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold"
            style={{
              left: `${p.x * 100}%`,
              top: `calc(${p.y * 100}% + 7px)`,
              color: isSeed ? "#FFF6E6" : "rgba(242,193,78,.72)",
              opacity: activeId && !isActive && !isNeighbour ? 0.25 : 1,
              textShadow: "0 1px 3px rgba(0,0,0,.8)",
            }}
          >
            {p.node.label}
          </span>
        );
      })}

      {active && (
        <div
          className="pointer-events-none absolute z-10 w-[250px] animate-pop rounded-xl border border-honey/25 bg-night/95 p-2.5 shadow-warm-lg"
          style={{
            left: `${active.x * 100}%`,
            top: `${active.y * 100}%`,
            transform: `translate(${active.x > 0.55 ? "-104%" : "4%"}, ${active.y < 0.4 ? "8%" : "-104%"})`,
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: TYPE_COLORS[active.node.type] ?? "#E8865C" }}
            />
            <span className="text-[12px] font-bold text-parchment">
              {active.node.label}
            </span>
            <span className="ml-auto font-mono text-[9.5px] uppercase tracking-wider text-honey/60">
              {active.node.type}
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-parchment/75">
            {active.node.description}
          </p>
          <div className="mt-1.5 font-mono text-[9.5px] uppercase tracking-wider text-honey/40">
            {active.node.degree} links · {active.node.docs.length} doc
            {active.node.docs.length > 1 ? "s" : ""}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2.5 right-3 font-mono text-[10px] uppercase tracking-wider text-honey/40">
        {nodes.length} entities · {edges.length} relations
      </div>
    </div>
  );
}
