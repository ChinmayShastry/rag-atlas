"use client";

import { useCallback, useRef, useState } from "react";
import { RAG_TYPES, ragTypeDef } from "../lib/ragTypes";
import type { RagType } from "../lib/ragTypes";
import { useRag } from "../lib/store";
import { useDismiss } from "../lib/useDismiss";

export default function ArchitectureSwitcher() {
  const { ragType, setRagType } = useRag();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = ragTypeDef(ragType);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  // The switcher is easy to miss, and a visitor who never finds it sees one
  // architecture and reasonably assumes that is the whole site. The cue shows
  // once and retires permanently the first time the menu is opened.
  const showCue = !everOpened && !open;

  // setTimeout rather than requestAnimationFrame: rAF callbacks are throttled
  // or dropped entirely when the page is not compositing (a background tab, or
  // an embedded viewport), which would silently skip the dispatch below.
  const afterPaint = (fn: () => void) => setTimeout(fn, 0);

  function choose(id: RagType) {
    setRagType(id);
    setOpen(false);
    afterPaint(() =>
      document.getElementById("corpus")?.scrollIntoView({ block: "start" }),
    );
  }

  function openComparison() {
    setOpen(false);
    afterPaint(() => {
      window.dispatchEvent(new CustomEvent("open-comparison"));
      document.getElementById("compare")?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      {showCue && (
        <div className="pointer-events-none absolute right-1 top-full z-30 flex flex-col items-end">
          {/* Points back up at the button it is describing. */}
          <svg
            viewBox="0 0 24 18"
            className="mr-6 h-[15px] w-[20px] text-amber"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animation: "nudge 1.9s ease-in-out infinite" }}
            aria-hidden
          >
            <path d="M12 17V6" />
            <path d="M6 11l6-6 6 6" />
          </svg>
          <span className="mt-0.5 whitespace-nowrap rounded-lg border border-amber/40 bg-honey/[0.18] px-2 py-1 text-[11.5px] font-semibold text-[#9A6A16] shadow-warm">
            Six architectures to explore
          </span>
        </div>
      )}

      <button
        onClick={() => {
          setOpen((o) => !o);
          setEverOpened(true);
        }}
        className={`flex items-center gap-2 rounded-xl border bg-white/70 px-2.5 py-1.5 transition hover:border-terracotta/40 hover:shadow-warm ${
          showCue ? "border-amber/50 shadow-warm" : "border-line"
        }`}
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
                  active ? "bg-terracotta/[0.08]" : "hover:bg-parchment/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[13.5px] font-bold ${active ? "text-terracotta" : "text-ink"}`}
                  >
                    {t.name}
                  </span>
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

          <button
            onClick={openComparison}
            className="mt-1 flex w-full items-center gap-2 rounded-xl border border-terracotta/30 bg-terracotta/[0.05] px-2.5 py-2 text-left transition hover:bg-terracotta/[0.10]"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4 shrink-0 text-terracotta"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 15V8M10 15V5M16 15v-4" />
            </svg>
            <span>
              <span className="block text-[13px] font-bold text-terracotta">
                Compare all six at once
              </span>
              <span className="block text-[11.5px] leading-snug text-muted">
                One question, six answers, scored side by side.
              </span>
            </span>
          </button>

          <p className="border-t border-line px-2.5 pb-1 pt-2.5 text-[11px] leading-relaxed text-muted">
            Jump straight to any of them — your documents, chunks and question
            carry over, and anything a flow still needs it will set up itself.
          </p>
        </div>
      )}
    </div>
  );
}
