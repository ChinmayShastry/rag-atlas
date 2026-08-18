"use client";

import { useState } from "react";
import { Spinner } from "./ui";

export default function KeyGate({
  onReady,
  demoKeyAvailable = false,
  onUseDemo,
}: {
  onReady: (key: string) => void;
  demoKeyAvailable?: boolean;
  onUseDemo?: () => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(!demoKeyAvailable);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-openai-key": key.trim() },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not validate that key.");
      onReady(key.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed.");
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-14">
      <DecorPlot />

      <div className="relative w-full max-w-[560px] animate-fade-up">
        <div className="mb-7 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-terracotta/25 bg-white/70 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-terracotta" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-terracotta" />
            </span>
            {demoKeyAvailable
              ? "Interactive · Live demo"
              : "Interactive · Bring your own key"}
          </div>

          <h1 className="font-display text-[46px] font-bold leading-[1.04] tracking-tight text-ink sm:text-[54px]">
            RAG Atlas
          </h1>
          <p className="mx-auto mt-3 max-w-[430px] text-[16px] leading-relaxed text-ink-soft">
            Nine stages of retrieval-augmented generation, evaluation, and
            guardrails — each one drawn, and every slider wired to live output.
          </p>
        </div>

        {demoKeyAvailable && (
          <div className="card mb-3 p-5 shadow-warm-lg">
            <button onClick={onUseDemo} className="btn-amber w-full py-3 text-[15px]">
              Start exploring — no key needed
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 10h11M11 6l4 4-4 4" />
              </svg>
            </button>
            <p className="mt-3 text-center text-[12.5px] leading-relaxed text-ink-soft">
              Runs on the site owner&apos;s key. Rate limited, and restricted to
              questions about the three bundled documents.
            </p>
            {!showKeyForm && (
              <button
                onClick={() => setShowKeyForm(true)}
                className="mt-2 w-full text-center text-[12.5px] font-semibold text-terracotta underline decoration-terracotta/30 underline-offset-2 hover:decoration-terracotta"
              >
                Or use your own key for unlimited access
              </button>
            )}
          </div>
        )}

        {!showKeyForm ? null : (
        <form onSubmit={submit} className="card p-6 shadow-warm-lg">
          <label
            htmlFor="key"
            className="mb-2 block text-[12px] font-bold uppercase tracking-[0.1em] text-ink-soft"
          >
            OpenAI API key
          </label>

          <div className="relative">
            <input
              id="key"
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
              className="field pr-20 font-mono text-[13px]"
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted transition hover:bg-parchment hover:text-terracotta"
              tabIndex={-1}
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-xl border border-berry/30 bg-berry/[0.07] px-3.5 py-2.5 text-[13px] leading-relaxed text-berry">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!key.trim() || busy}
            className="btn-primary mt-4 w-full py-3 text-[15px]"
          >
            {busy ? (
              <>
                <Spinner /> Verifying with OpenAI…
              </>
            ) : (
              <>
                Open the atlas
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 10h11M11 6l4 4-4 4" />
                </svg>
              </>
            )}
          </button>

          <div className="mt-5 space-y-2 border-t border-line pt-4">
            <Assurance>
              Held in memory for this tab only — never written to disk, a
              database, or a log.
            </Assurance>
            <Assurance>
              Sent from your browser to this app&apos;s own API route, and from
              there straight to OpenAI. It goes nowhere else.
            </Assurance>
            <Assurance>
              The reranking stage additionally downloads a small open model from
              a public CDN to run in your browser. Your key and your questions
              are never part of that — it is a static file fetch.
            </Assurance>
            <Assurance>
              A full session costs well under a cent. Models used:{" "}
              <code className="rounded bg-parchment px-1 py-px font-mono text-[11.5px] text-clay">
                gpt-4o-mini
              </code>{" "}
              and{" "}
              <code className="rounded bg-parchment px-1 py-px font-mono text-[11.5px] text-clay">
                text-embedding-3-small
              </code>
              .
            </Assurance>
          </div>
        </form>
        )}

        <p className="mt-5 text-center text-[12.5px] text-muted">
          Need a key? Create one at{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-terracotta underline decoration-terracotta/30 underline-offset-2 hover:decoration-terracotta"
          >
            platform.openai.com/api-keys
          </a>
        </p>
      </div>
    </main>
  );
}

function Assurance({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <svg
        viewBox="0 0 20 20"
        className="mt-[3px] h-3.5 w-3.5 shrink-0"
        fill="none"
        stroke="#6E8257"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 10.5l4 4 8-9" />
      </svg>
      <p className="text-[12.5px] leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}

/** Decorative embedding-space scatter, hinting at what's behind the door. */
function DecorPlot() {
  // Coordinates are rounded so server and client serialise them identically —
  // raw floats differ in their last digit and trip a hydration mismatch.
  const round = (n: number) => Number(n.toFixed(3));
  const pts = Array.from({ length: 46 }, (_, i) => {
    const a = i * 2.399963;
    const r = Math.sqrt(i / 46);
    return {
      x: round(50 + Math.cos(a) * r * 44),
      y: round(50 + Math.sin(a) * r * 44),
      s: round(1 + (i % 4) * 0.5),
      o: round(0.1 + (i % 5) * 0.035),
    };
  });

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={Number((p.s * 0.32).toFixed(3))}
          fill={i % 3 === 0 ? "#C1553A" : i % 3 === 1 ? "#DE922B" : "#8C4A32"}
          opacity={p.o}
        />
      ))}
    </svg>
  );
}
