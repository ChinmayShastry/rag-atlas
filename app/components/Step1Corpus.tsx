"use client";

import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import { useState } from "react";
import { DOC_COLORS, useRag } from "../lib/store";
import { estimateTokens } from "../lib/chunking";
import { ErrorNote, Insight, StepSection } from "./ui";

export default function Step1Corpus({ n }: StageProps) {
  const { docs, docsLoading, docsError, activeDocIds, toggleDoc } = useRag();
  const [expanded, setExpanded] = useState<string | null>(null);

  const totalChars = docs
    .filter((d) => activeDocIds.includes(d.id))
    .reduce((s, d) => s + d.text.length, 0);

  return (
    <StepSection
      id="corpus"
      n={n}
      kicker={stageKicker(n)}
      title="The corpus"
      lede={
        <>
          RAG can only ever answer from what you give it. These plain{" "}
          <code className="rounded bg-parchment px-1 py-px font-mono text-[13px] text-clay">
            .txt
          </code>{" "}
          files are the model&apos;s entire world for the rest of this page.
        </>
      }
    >
      {docsError ? (
        <ErrorNote>{docsError}</ErrorNote>
      ) : docsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-52 animate-pulse bg-parchment/50" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {docs.map((doc) => {
            const on = activeDocIds.includes(doc.id);
            const color = DOC_COLORS[doc.id]?.accent ?? "#C1553A";
            const isOpen = expanded === doc.id;

            return (
              <div
                key={doc.id}
                className="card flex flex-col overflow-hidden transition-all duration-200"
                style={{
                  borderColor: on ? `${color}55` : undefined,
                  opacity: on ? 1 : 0.55,
                  boxShadow: on ? `0 8px 26px -16px ${color}88` : undefined,
                }}
              >
                <button
                  onClick={() => toggleDoc(doc.id)}
                  className="flex items-start gap-3 border-b border-line px-4 py-3 text-left transition hover:bg-parchment/30"
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all"
                    style={{
                      borderColor: on ? color : "#D6C3AC",
                      background: on ? color : "transparent",
                    }}
                  >
                    {on && (
                      <svg
                        viewBox="0 0 20 20"
                        className="h-3 w-3"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 10.5l4 4 8-9" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block font-display text-[16px] font-bold leading-tight"
                      style={{ color }}
                    >
                      {doc.title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10.5px] text-muted">
                      {doc.file}
                    </span>
                  </span>
                </button>

                <div className="flex-1 px-4 py-3">
                  <p className="text-[13px] leading-relaxed text-ink-soft">
                    {doc.blurb}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Tag>{doc.text.length.toLocaleString()} chars</Tag>
                    <Tag>
                      {doc.text.split(/\s+/).length.toLocaleString()} words
                    </Tag>
                    <Tag>~{estimateTokens(doc.text).toLocaleString()} tok</Tag>
                  </div>

                  <button
                    onClick={() => setExpanded(isOpen ? null : doc.id)}
                    className="mt-3 text-[12px] font-bold uppercase tracking-wider transition"
                    style={{ color }}
                  >
                    {isOpen ? "Hide raw text ↑" : "Read raw text ↓"}
                  </button>

                  {isOpen && (
                    <div className="warm-scroll mt-2.5 max-h-56 animate-fade-up overflow-y-auto rounded-lg border border-line bg-parchment/25 p-2.5 font-mono text-[11px] leading-relaxed text-ink-soft">
                      {doc.text}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Insight>
        {activeDocIds.length === docs.length ? (
          <>
            All {docs.length} documents are live —{" "}
            <strong className="font-bold text-ink">
              {totalChars.toLocaleString()} characters
            </strong>{" "}
            of ground truth. Switch one off and watch every later stage shrink
            with it. A question the corpus cannot answer is where hallucination
            starts, and you can trigger that deliberately here.
          </>
        ) : (
          <>
            Now running on{" "}
            <strong className="font-bold text-ink">
              {activeDocIds.length} of {docs.length}
            </strong>{" "}
            documents. Ask about an excluded topic later and you will see exactly
            how the pipeline behaves when the answer simply is not in the index.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-parchment/70 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink-soft">
      {children}
    </span>
  );
}
