"use client";

import { useMemo } from "react";
import { DOC_COLORS, useRag } from "../lib/store";
import EmbeddingPlot from "./EmbeddingPlot";
import { ErrorNote, Insight, Panel, Spinner, Stat, StepSection } from "./ui";

export default function Step3Embedding() {
  const {
    apiKey,
    chunks,
    vectors,
    embedDims,
    embedding,
    embedError,
    embedFromCache,
    runEmbedding,
    vectorsStale,
    hovered,
    plot,
    reachStep,
  } = useRag();

  const hasVectors = !!vectors && !vectorsStale;

  const hoveredIndex = useMemo(
    () => chunks.findIndex((c) => c.id === hovered),
    [chunks, hovered],
  );
  const inspected =
    hasVectors && hoveredIndex >= 0 && vectors
      ? { chunk: chunks[hoveredIndex], vector: vectors[hoveredIndex] }
      : hasVectors && vectors
        ? { chunk: chunks[0], vector: vectors[0] }
        : null;

  return (
    <StepSection
      id="embedding"
      n={3}
      kicker="Stage three"
      title="Embedding"
      lede="Each chunk is converted into a list of 1536 numbers that encodes its meaning. Text that means similar things lands in a similar place."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel
          title="Embedding space"
          right={
            hasVectors && (
              <span className="font-mono text-[11px] text-muted">
                hover a point · click to pin
              </span>
            )
          }
          bodyClass="p-3"
        >
          {hasVectors ? (
            <EmbeddingPlot height={400} showQuery={false} />
          ) : (
            <div className="flex h-[400px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-line bg-parchment/25 px-6 text-center">
              <div className="max-w-sm">
                <p className="text-[14px] leading-relaxed text-ink-soft">
                  {vectorsStale
                    ? "Your chunking settings changed, so the old vectors no longer describe these chunks."
                    : "Nothing has been sent to OpenAI yet. Everything so far ran in your browser."}
                </p>
                <p className="mt-1.5 text-[12.5px] text-muted">
                  {chunks.length} chunks · about{" "}
                  {chunks.reduce((s, c) => s + c.tokens, 0).toLocaleString()}{" "}
                  tokens · roughly $
                  {(
                    (chunks.reduce((s, c) => s + c.tokens, 0) * 0.02) /
                    1_000_000
                  ).toFixed(5)}
                </p>
              </div>
              <button
                onClick={() => {
                  runEmbedding();
                  reachStep(3);
                }}
                disabled={embedding || !apiKey || !chunks.length}
                className="btn-primary"
              >
                {embedding ? (
                  <>
                    <Spinner /> Embedding {chunks.length} chunks…
                  </>
                ) : (
                  <>Embed {chunks.length} chunks →</>
                )}
              </button>
            </div>
          )}
          {embedError && <ErrorNote>{embedError}</ErrorNote>}
        </Panel>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Vectors" value={hasVectors ? chunks.length : "—"} />
            <Stat
              label="Dimensions"
              value={hasVectors ? embedDims : "—"}
              accent="#B0811C"
            />
            <Stat
              label="Model"
              value={<span className="text-[12px]">3-small</span>}
              accent="#8C4A32"
              sub="text-embedding"
            />
            <Stat
              label="Source"
              value={
                <span className="text-[12px]">
                  {hasVectors ? (embedFromCache ? "cache" : "OpenAI") : "—"}
                </span>
              }
              accent="#6E8257"
              sub={embedFromCache ? "free" : "billed once"}
            />
          </div>

          {hasVectors && (
            <button
              onClick={runEmbedding}
              disabled={embedding}
              className="btn-ghost w-full"
            >
              {embedding ? <Spinner /> : null} Re-embed current chunks
            </button>
          )}

          <Panel title="Inside one vector">
            {inspected ? (
              <>
                <div className="mb-2">
                  <span
                    className="font-mono text-[10.5px] font-bold uppercase tracking-wider"
                    style={{ color: DOC_COLORS[inspected.chunk.docId]?.accent }}
                  >
                    {inspected.chunk.docTitle} · #{inspected.chunk.localIndex}
                  </span>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                    {inspected.chunk.text}
                  </p>
                </div>
                <VectorStrip vector={inspected.vector} />
                <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-muted">
                  first 48 of {inspected.vector.length} dimensions · no single
                  one is human-readable
                </p>
              </>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-muted">
                Once embedded, hover any chunk or plot point to inspect its raw
                vector here.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <Insight>
        {hasVectors ? (
          <>
            The three documents have separated into visible clusters without
            anyone labelling them — proximity here <em>is</em> semantic
            similarity, and that is the entire basis for retrieval. The axes are
            a PCA projection down from {embedDims} dimensions, so they have no
            individual meaning; only relative distance does.
          </>
        ) : (
          <>
            Chunking, similarity ranking, and every slider on this page run
            locally for free. This is the first stage that actually spends money
            on your key — and thanks to caching, it spends it only once per
            unique chunking configuration.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

/** Diverging bar strip of the first 48 dimensions. */
function VectorStrip({ vector }: { vector: number[] }) {
  const slice = vector.slice(0, 48);
  const max = Math.max(...slice.map(Math.abs)) || 1;

  return (
    <div className="flex h-16 items-center gap-[1.5px] rounded-lg border border-line bg-parchment/30 px-2">
      {slice.map((v, i) => {
        const h = (Math.abs(v) / max) * 46;
        const up = v >= 0;
        return (
          <div
            key={i}
            className="relative flex-1"
            style={{ height: 52 }}
            title={v.toFixed(4)}
          >
            <div
              className="absolute left-0 w-full rounded-[1px]"
              style={{
                height: Math.max(1, h / 2),
                bottom: up ? "50%" : undefined,
                top: up ? undefined : "50%",
                background: up ? "#C1553A" : "#B0811C",
                opacity: 0.8,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
