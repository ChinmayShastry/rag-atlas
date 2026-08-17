"use client";

import { useEffect, useRef, useState } from "react";
import { RAG_TYPES, ragTypeDef } from "../lib/ragTypes";
import type { RagType } from "../lib/ragTypes";
import { useRag } from "../lib/store";

export default function ArchitectureSwitcher() {
  const { ragType, setRagType } = useRag();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = ragTypeDef(ragType);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function choose(id: RagType) {
    setRagType(id);
    setOpen(false);
    // Land at the top of the newly selected flow rather than mid-page.
    requestAnimationFrame(() => {
      document.getElementById("corpus")?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-line bg-white/70 px-2.5 py-1.5 transition hover:border-terracotta/40 hover:shadow-warm"
        title="Switch RAG architecture"
        aria-expanded={open}
      >
        <div className="text-left leading-none">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted">
            Architecture
          </div>
          <div className="mt-0.5 text-[12.5px] font-bold text-ink">
            {current.name}
          </div>
        </div>
        <svg
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-[360px] animate-pop rounded-2xl border border-line bg-card p-2 shadow-warm-lg">
            <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.11em] text-muted">
              Same corpus, same question — different architecture
            </div>

            {RAG_TYPES.map((t) => {
              const active = t.id === ragType;
              return (
                <button
                  key={t.id}
                  onClick={() => choose(t.id)}
                  className={`w-full rounded-xl px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "bg-terracotta/[0.08]"
                      : "hover:bg-parchment/60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[13.5px] font-bold ${active ? "text-terracotta" : "text-ink"}`}
                    >
                      {t.name}
                    </span>
                    {!t.ready && (
                      <span className="chip border-amber/40 bg-honey/15 text-[9px] text-[#9A6A16]">
                        building
                      </span>
                    )}
                    {active && (
                      <svg
                        viewBox="0 0 20 20"
                        className="ml-auto h-3.5 w-3.5 shrink-0 text-terracotta"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 10.5l4 4 8-9" />
                      </svg>
                    )}
                  </div>
                  <div className="text-[11.5px] leading-snug text-muted">
                    {t.tagline}
                  </div>
                </button>
              );
            })}

            <p className="border-t border-line px-2.5 pb-1 pt-2.5 text-[11px] leading-relaxed text-muted">
              Your documents, chunks and question carry over, so you can ask once
              and compare how each architecture handles it.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
