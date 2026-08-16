"use client";

import { useRag } from "../lib/store";
import { PRESET_QUERIES } from "../lib/prompt";
import EmbeddingPlot from "./EmbeddingPlot";
import { ErrorNote, Insight, Panel, Spinner, StepSection } from "./ui";

const KIND_STYLE = {
  easy: { color: "#4E6340", bg: "rgba(110,130,87,.10)", label: "covered" },
  cross: { color: "#9A6A16", bg: "rgba(222,146,43,.13)", label: "spans docs" },
  trap: { color: "#8E2F41", bg: "rgba(160,58,78,.09)", label: "not in corpus" },
};

export default function Step4Query() {
  const {
    query,
    setQuery,
    runQueryEmbedding,
    querying,
    queryError,
    queryVector,
    embeddedQuery,
    vectors,
    reachStep,
  } = useRag();

  const ready = !!vectors;
  const dirty = embeddedQuery !== null && embeddedQuery !== query.trim();

  return (
    <StepSection
      id="query"
      n={4}
      kicker="Stage four"
      title="The query"
      lede="Your question goes through the exact same embedding model as the chunks. That is the whole trick — question and answer end up in one shared space."
      locked={!ready}
      lockNote="Embed the chunks in stage 3 first — there is nothing to compare a question against yet."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel title="Ask something">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runQueryEmbedding();
                reachStep(4);
              }}
            >
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask anything about coffee, bees, or kilns…"
                  className="field flex-1"
                />
                <button
                  type="submit"
                  disabled={!query.trim() || querying}
                  className="btn-primary shrink-0"
                >
                  {querying ? (
                    <>
                      <Spinner /> Embedding
                    </>
                  ) : (
                    "Embed query"
                  )}
                </button>
              </div>
            </form>

            {queryError && <ErrorNote>{queryError}</ErrorNote>}

            {dirty && (
              <div className="mt-2.5 rounded-lg border border-amber/30 bg-honey/10 px-3 py-2 text-[12.5px] text-ink-soft">
                You edited the question — re-embed to update everything below.
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted">
                Try one of these
              </div>
              <div className="grid gap-1.5">
                {PRESET_QUERIES.map((p) => {
                  const style = KIND_STYLE[p.kind];
                  return (
                    <button
                      key={p.q}
                      onClick={() => setQuery(p.q)}
                      className="group rounded-xl border border-line bg-white/50 px-3 py-2 text-left transition-all hover:border-terracotta/40 hover:bg-terracotta/[0.04]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[13px] font-semibold leading-snug text-ink">
                          {p.q}
                        </span>
                        <span
                          className="chip shrink-0 border-transparent"
                          style={{ color: style.color, background: style.bg }}
                        >
                          {style.label}
                        </span>
                      </div>
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                        {p.note}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Query in the same space" bodyClass="p-3">
            <EmbeddingPlot height={300} />
          </Panel>

          <Panel title="What just happened">
            {queryVector ? (
              <div className="space-y-2 text-[12.5px] leading-relaxed text-ink-soft">
                <Row
                  label="Question"
                  value={`"${embeddedQuery}"`}
                  mono={false}
                />
                <Row label="Model" value="text-embedding-3-small" />
                <Row label="Output" value={`${queryVector.length} numbers`} />
                <Row
                  label="Magnitude"
                  value={Math.sqrt(
                    queryVector.reduce((s, v) => s + v * v, 0),
                  ).toFixed(4)}
                />
                <p className="pt-1 text-[12px] text-muted">
                  The vector is unit length, which is why cosine similarity
                  reduces to a plain dot product in the next stage.
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-muted">
                Embed a question to drop it onto the map as a white marker. Its
                distance to each chunk is what stage 5 ranks.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <Insight>
        {queryVector ? (
          <>
            The white marker is your question living in the same 1536-dimensional
            space as every chunk. Notice which cluster it drifted toward — that
            drift happened purely from meaning, with no keyword matching
            anywhere in the process.
          </>
        ) : (
          <>
            A question and a passage that answers it are usually worded quite
            differently, which is exactly why keyword search struggles. Embedding
            both through the same model puts them near each other regardless of
            shared vocabulary.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

function Row({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted">
        {label}
      </span>
      <span
        className={`truncate text-right text-[12px] text-ink ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
