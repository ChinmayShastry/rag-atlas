"use client";

import { useState } from "react";
import { useRag, DOC_COLORS } from "../lib/store";
import { RERANK_MODEL, crossEncode, loadReranker } from "../lib/rerank";
import type { LoadProgress } from "../lib/rerank";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import {
  ErrorNote,
  Insight,
  Panel,
  Slider,
  Spinner,
  Stat,
  StepSection,
} from "./ui";

export default function StageRerank({ n }: StageProps) {
  const {
    embeddedQuery,
    hydeText,
    useHyde,
    candidates,
    candidateK,
    setCandidateK,
    rerankScores,
    setRerankScores,
    baseRanked,
    ranked,
    topK,
    chunks,
  } = useRag();

  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [device, setDevice] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = baseRanked.length > 0 && !!embeddedQuery;

  // The cross-encoder scores the query against passages; HyDE only steered the
  // shortlist, so the real question is what gets compared here.
  const rerankQuery = embeddedQuery ?? "";

  async function run() {
    if (!candidates.length) return;
    setRunning(true);
    setError(null);
    try {
      const dev = await loadReranker(setProgress);
      setDevice(dev);
      const t0 = performance.now();
      const scores = await crossEncode(
        rerankQuery,
        candidates.map((c) => c.chunk.text),
      );
      setElapsed(Math.round(performance.now() - t0));
      const map = new Map<string, number>();
      candidates.forEach((c, i) => map.set(c.chunk.id, scores[i]));
      setRerankScores(map);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — the model is fetched from the Hugging Face CDN, so a blocked or offline connection will stop it.`
          : "Reranking failed.",
      );
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const beforeRank = new Map(baseRanked.map((r, i) => [r.chunk.id, i + 1]));
  const movers = rerankScores
    ? ranked.slice(0, candidateK).filter((r, i) => {
        const before = beforeRank.get(r.chunk.id) ?? 0;
        return before !== i + 1;
      }).length
    : 0;

  return (
    <StepSection
      id="rerank"
      n={n}
      kicker={stageKicker(n)}
      title="Reranking"
      lede="Cast a wide net cheaply, then re-score the shortlist with a model that reads the query and passage together. Slower, far more accurate, and only affordable on a handful of candidates."
      locked={!ready}
      lockNote="Rank some chunks first."
    >
      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Controls">
            <Slider
              label="Shortlist size"
              value={candidateK}
              min={5}
              max={Math.min(30, Math.max(5, chunks.length))}
              onChange={(v) => {
                setCandidateK(v);
                setRerankScores(null);
              }}
              hint={`The cross-encoder scores ${candidateK} candidates, then the top ${topK} go to the prompt. Wider net, better recall, more compute.`}
            />
            <button
              onClick={run}
              disabled={running || !candidates.length}
              className="btn-primary mt-4 w-full"
            >
              {running ? (
                <>
                  <Spinner /> {progress?.stage ?? "Working"}…
                </>
              ) : rerankScores ? (
                "Rerank again"
              ) : (
                "Load model and rerank →"
              )}
            </button>

            {progress && progress.percent !== null && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-parchment">
                  <div
                    className="h-full rounded-full bg-terracotta transition-all"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <p className="mt-1 font-mono text-[10.5px] text-muted">
                  {progress.stage} {progress.percent}%
                </p>
              </div>
            )}
            {error && <ErrorNote>{error}</ErrorNote>}
          </Panel>

          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Runs on"
              value={
                <span className="text-[12px]">{device ?? "not loaded"}</span>
              }
              accent="#6E8257"
              sub={device ? "in your browser" : "~21 MB once"}
            />
            <Stat
              label="Rerank time"
              value={elapsed !== null ? `${elapsed}ms` : "—"}
              accent="#B0811C"
              sub={`${candidateK} pairs`}
            />
            <Stat
              label="Moved"
              value={rerankScores ? movers : "—"}
              sub="changed rank"
            />
            <Stat
              label="API cost"
              value="$0.00"
              accent="#6E8257"
              sub="fully local"
            />
          </div>

          <Panel title="Bi-encoder vs cross-encoder">
            <div className="space-y-3 text-[12.5px] leading-relaxed">
              <div className="border-l-[3px] border-muted pl-2.5">
                <div className="text-[12px] font-bold text-ink-soft">
                  Bi-encoder (stages above)
                </div>
                <p className="text-muted">
                  Query and passage are embedded <em>separately</em> and compared
                  by distance. The passage vectors can be computed once, in
                  advance — which is the only reason searching millions of
                  documents is possible.
                </p>
              </div>
              <div className="border-l-[3px] border-terracotta pl-2.5">
                <div className="text-[12px] font-bold text-terracotta">
                  Cross-encoder (here)
                </div>
                <p className="text-muted">
                  Both go through the model <em>together</em>, so every word of
                  the query can attend to every word of the passage. Nothing can
                  be precomputed: N passages means N forward passes, which is why
                  it only ever runs on a shortlist.
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title={rerankScores ? "Before and after" : "The shortlist"}
          right={
            <span className="font-mono text-[11px] text-muted">
              {rerankScores ? "arrows show rank movement" : `top ${candidateK} by fused score`}
            </span>
          }
        >
          <div className="warm-scroll max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
            {(rerankScores ? ranked.slice(0, candidateK) : candidates).map(
              (r, i) => {
                const before = beforeRank.get(r.chunk.id) ?? i + 1;
                const after = i + 1;
                const delta = before - after;
                const color = DOC_COLORS[r.chunk.docId]?.accent ?? "#C1553A";
                const inPrompt = i < topK;

                return (
                  <div
                    key={r.chunk.id}
                    className="rounded-xl border p-2.5 transition-all duration-200"
                    style={{
                      borderColor: inPrompt ? `${color}70` : "#EADBC8",
                      background: inPrompt
                        ? `${color}0E`
                        : "rgba(255,255,255,.45)",
                      opacity: inPrompt ? 1 : 0.72,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10.5px] font-bold text-white"
                        style={{ background: inPrompt ? color : "#C4B3A0" }}
                      >
                        {after}
                      </span>

                      {rerankScores && delta !== 0 && (
                        <span
                          className="chip shrink-0 border-transparent text-[9.5px]"
                          style={{
                            color: delta > 0 ? "#4E6340" : "#8E2F41",
                            background:
                              delta > 0
                                ? "rgba(110,130,87,.12)"
                                : "rgba(160,58,78,.10)",
                          }}
                          title={`was #${before}`}
                        >
                          {delta > 0 ? `↑${delta}` : `↓${-delta}`}
                        </span>
                      )}

                      <span
                        className="truncate text-[11px] font-bold uppercase tracking-wider"
                        style={{ color }}
                      >
                        {r.chunk.docTitle} · #{r.chunk.localIndex}
                      </span>

                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        {inPrompt && (
                          <span className="chip border-olive/40 bg-olive/10 text-[9.5px] text-olive">
                            in prompt
                          </span>
                        )}
                        <span className="font-mono text-[12px] font-bold tabular-nums text-ink">
                          {r.score.toFixed(rerankScores ? 2 : 3)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-ink-soft">
                      {r.chunk.text}
                    </p>
                  </div>
                );
              },
            )}
          </div>

          {rerankScores && (
            <p className="mt-3 border-t border-line pt-2.5 text-[12px] leading-relaxed text-muted">
              Scores are now raw cross-encoder logits, not cosine similarities —
              unbounded, and not comparable to the numbers in earlier stages.
              That is also why the score floor no longer applies here.
            </p>
          )}
        </Panel>
      </div>

      <Insight>
        {rerankScores ? (
          movers > 0 ? (
            <>
              <strong className="font-bold text-ink">{movers}</strong> of{" "}
              {candidateK} candidates changed position. Anything that climbed
              into the top {topK} would have been invisible to the generator a
              moment ago — the retrieval was not wrong, just imprecisely ordered,
              and ordering is what the prompt budget spends.
            </>
          ) : (
            <>
              Nothing moved this time, which is a perfectly good outcome: the
              first-stage ranking already agreed with the cross-encoder. Rerankers
              earn their cost on hard queries, not easy ones.
            </>
          )
        ) : (
          <>
            The model is <code className="font-mono text-clay">{RERANK_MODEL}</code>,
            about 21 MB, downloaded once and cached by your browser. Everything
            runs locally on WebGPU or WebAssembly — no API key, no request, no
            cost. That is also the honest limit of this technique: you would never
            ship a cross-encoder over a whole corpus, only over a shortlist.
            {useHyde && hydeText ? " Note the shortlist came from your HyDE passage, but the cross-encoder scores against your real question." : ""}
          </>
        )}
      </Insight>
    </StepSection>
  );
}
