"use client";

import { useEffect, useState } from "react";
import { STEPS } from "../lib/steps";
import { useRag } from "../lib/store";
import { costOf, formatCount, formatUSD } from "../lib/pricing";

export default function Header() {
  const [active, setActive] = useState("corpus");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-88px 0px -62% 0px", threshold: 0 },
    );
    STEPS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1220px] items-center gap-4 px-5 py-2.5">
        <a href="#corpus" className="group flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-terracotta to-clay text-[15px] font-bold text-white shadow-warm">
            R
          </span>
          <span className="hidden font-display text-[17px] font-bold tracking-tight text-ink sm:block">
            RAG Atlas
          </span>
        </a>

        <nav className="warm-scroll flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {STEPS.map((s) => {
            const isActive = active === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-all duration-150 ${
                  isActive
                    ? "bg-terracotta/10 text-terracotta"
                    : "text-muted hover:bg-parchment/70 hover:text-ink-soft"
                }`}
              >
                <span className="mr-1 font-mono text-[11px] opacity-60">{s.n}</span>
                {s.short}
              </a>
            );
          })}
        </nav>

        <CostMeter />
      </div>
    </header>
  );
}

function CostMeter() {
  const { usage, totalCost, totalTokens } = useRag();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-line bg-white/70 px-2.5 py-1.5 transition hover:border-terracotta/40 hover:shadow-warm"
        title="Session spend on your key"
      >
        <svg
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5 text-amber"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <circle cx="10" cy="10" r="7.4" />
          <path d="M10 5.6v8.8M12.3 7.6c-.5-.7-1.3-1-2.3-1-1.3 0-2.2.6-2.2 1.6 0 2.3 4.6 1.2 4.6 3.5 0 1-1 1.7-2.4 1.7-1.1 0-1.9-.4-2.4-1.1" />
        </svg>
        <div className="text-left leading-none">
          <div className="font-mono text-[13px] font-bold tabular-nums text-ink">
            {formatUSD(totalCost)}
          </div>
          <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted">
            {formatCount(totalTokens)} tok
          </div>
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-[330px] animate-pop rounded-2xl border border-line bg-card p-4 shadow-warm-lg">
            <div className="mb-2 flex items-baseline justify-between">
              <h4 className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                Session spend
              </h4>
              <span className="font-mono text-[15px] font-bold text-terracotta">
                {formatUSD(totalCost)}
              </span>
            </div>

            {usage.length === 0 ? (
              <p className="py-3 text-[13px] leading-relaxed text-muted">
                No API calls yet. Chunking, similarity ranking, and every slider
                run entirely in your browser and cost nothing.
              </p>
            ) : (
              <div className="warm-scroll max-h-[290px] space-y-1.5 overflow-y-auto pr-1">
                {usage
                  .slice()
                  .reverse()
                  .map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-white/60 px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-semibold text-ink">
                          {u.label}
                        </div>
                        <div className="font-mono text-[10.5px] text-muted">
                          {u.model} · {u.inputTokens} in
                          {u.outputTokens > 0 ? ` · ${u.outputTokens} out` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-soft">
                        {formatUSD(costOf(u.model, u.inputTokens, u.outputTokens))}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            <p className="mt-3 border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted">
              Estimated from published per-token rates. Your OpenAI dashboard is
              the authoritative figure.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
