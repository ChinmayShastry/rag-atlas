"use client";

import { useState } from "react";
import { apiPost, streamChat } from "../lib/api";
import { DOC_COLORS, useRag } from "../lib/store";
import { toPassages } from "../lib/prompt";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import type { Hop } from "../lib/types";
import {
  ErrorNote,
  Insight,
  Panel,
  Slider,
  Spinner,
  StepSection,
} from "./ui";

const HOP_TOP_K = 3;

export default function StageHops({ n }: StageProps) {
  const {
    apiKey,
    canCallApi,
    hops,
    setHops,
    embedOne,
    rankAgainst,
    addUsage,
  } = useRag();

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perHopK, setPerHopK] = useState(HOP_TOP_K);

  const ready = hops.length > 0;
  const allDone = ready && hops.every((h) => h.status === "done");

  const patch = (i: number, next: Partial<Hop>) =>
    setHops((prev) => prev.map((h, j) => (j === i ? { ...h, ...next } : h)));

  async function runChain() {
    setRunning(true);
    setError(null);

    // Reset before re-running so a second pass does not read stale findings.
    setHops((prev) =>
      prev.map((h) => ({
        ...h,
        resolved: h.dependsOnPrevious ? "" : h.planned,
        substituted: false,
        retrieved: [],
        answer: "",
        status: "waiting" as const,
      })),
    );
    await new Promise((r) => setTimeout(r, 60));

    const findings: string[] = [];

    try {
      for (let i = 0; i < hops.length; i++) {
        const hop = hops[i];
        let question = hop.planned;
        let substituted = false;

        // A dependent hop is not searchable until earlier answers exist.
        if (hop.dependsOnPrevious && findings.length > 0) {
          patch(i, { status: "rewriting" });
          const rw = await apiPost<{
            question: string;
            resolved: boolean;
            usage: { inputTokens: number; outputTokens: number };
          }>("/api/plan", apiKey, {
            task: "rewrite",
            question: hop.planned,
            findings: findings.join("\n"),
          });
          question = rw.question;
          substituted = rw.resolved;
          addUsage({
            model: "gpt-4o-mini",
            label: `Hop ${i + 1} query rewrite`,
            inputTokens: rw.usage.inputTokens,
            outputTokens: rw.usage.outputTokens,
          });
        }

        patch(i, { resolved: question, substituted, status: "retrieving" });

        const vec = await embedOne(question, "query");
        const hits = rankAgainst(vec).slice(0, perHopK);
        patch(i, { retrieved: hits, status: "answering" });

        let acc = "";
        await streamChat(
          apiKey,
          {
            mode: "hop",
            temperature: 0,
            question,
            passages: toPassages(hits),
          },
          {
            onDelta: (d) => {
              acc += d;
              patch(i, { answer: acc });
            },
            onUsage: (u) =>
              addUsage({
                model: "gpt-4o-mini",
                label: `Hop ${i + 1} answer`,
                inputTokens: u.inputTokens,
                outputTokens: u.outputTokens,
              }),
          },
        );

        findings.push(`Q: ${question}\nA: ${acc}`);
        patch(i, { answer: acc, status: "done" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The chain broke.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <StepSection
      id="hops"
      n={n}
      kicker={stageKicker(n)}
      title="The chain"
      lede="Each hop retrieves, answers, and hands its finding forward. The next hop's search query does not exist until the previous one has produced it."
      locked={!ready}
      lockNote="Decompose the question first."
    >
      <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Controls">
            <Slider
              label="Passages per hop"
              value={perHopK}
              min={1}
              max={6}
              onChange={setPerHopK}
              hint="Each hop retrieves independently. The generator later sees the union of everything the chain gathered."
            />
            <button
              onClick={runChain}
              disabled={running || !canCallApi}
              className="btn-primary mt-4 w-full"
            >
              {running ? (
                <>
                  <Spinner /> Running chain…
                </>
              ) : allDone ? (
                "Run the chain again"
              ) : (
                "Run the chain →"
              )}
            </button>
            {error && <ErrorNote>{error}</ErrorNote>}
          </Panel>

          <Panel title="Where it can break">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              Errors compound. If hop 1 retrieves the wrong passage, hop 2 is
              rewritten around a wrong fact and searches for the wrong thing
              entirely — and the final answer will be fluent and confidently
              wrong.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              A chain is only as reliable as its weakest hop, and nothing in the
              pipeline notices the failure. That is the argument for the grading
              step in Agentic RAG.
            </p>
          </Panel>
        </div>

        <div className="space-y-3">
          {hops.map((hop, i) => (
            <HopCard key={i} hop={hop} index={i} />
          ))}
        </div>
      </div>

      <Insight>
        {allDone ? (
          <>
            Follow the chain above: the second hop&apos;s query contains a fact
            that appears nowhere in your original question. It was discovered,
            not asked for. That is the entire mechanism — and also why this
            architecture costs roughly one model call and one embedding{" "}
            <em>per hop</em>, run strictly in sequence.
          </>
        ) : (
          <>
            Watch the resolved query on a dependent hop. It starts empty, because
            until the hop before it answers, there is literally nothing to search
            for.
          </>
        )}
      </Insight>
    </StepSection>
  );
}

const STATUS_LABEL: Record<Hop["status"], string> = {
  waiting: "waiting",
  rewriting: "rewriting query",
  retrieving: "retrieving",
  answering: "answering",
  done: "done",
  error: "failed",
};

function HopCard({ hop, index }: { hop: Hop; index: number }) {
  const active = hop.status !== "waiting" && hop.status !== "done";
  const accent = hop.dependsOnPrevious ? "#B0811C" : "#5F7A4F";

  return (
    <div className="relative">
      {index > 0 && (
        <div
          className="absolute -top-3 left-[19px] h-3 w-[2px]"
          style={{ background: "#EADBC8" }}
          aria-hidden
        />
      )}
      <div
        className="card overflow-hidden transition-all duration-200"
        style={{
          borderColor: hop.status === "done" ? `${accent}66` : undefined,
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line bg-parchment/30 px-3.5 py-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold text-white"
            style={{ background: accent }}
          >
            {index + 1}
          </span>
          <span className="text-[12px] font-bold uppercase tracking-wider text-ink-soft">
            Hop {index + 1}
          </span>
          {hop.dependsOnPrevious && (
            <span className="chip border-amber/40 bg-honey/15 text-[9px] text-[#9A6A16]">
              dependent
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
            {active && <Spinner className="h-3 w-3" />}
            {STATUS_LABEL[hop.status]}
          </span>
        </div>

        <div className="space-y-2.5 p-3.5">
          <Field label="Planned">
            <span className="text-ink-soft">{hop.planned}</span>
          </Field>

          {hop.dependsOnPrevious && (
            <Field label="Resolved">
              {hop.resolved ? (
                <span className="text-ink">
                  {hop.resolved}
                  {hop.substituted && (
                    <span className="ml-1.5 text-[11px] font-semibold text-olive">
                      · rewritten from hop {index}
                    </span>
                  )}
                </span>
              ) : (
                <span className="italic text-muted">
                  not yet known — waiting on hop {index}
                </span>
              )}
            </Field>
          )}

          {hop.retrieved.length > 0 && (
            <div>
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-muted">
                Retrieved
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hop.retrieved.map((r) => {
                  const color = DOC_COLORS[r.chunk.docId]?.accent ?? "#C1553A";
                  return (
                    <span
                      key={r.chunk.id}
                      className="chip border-transparent text-[10px]"
                      style={{ color, background: `${color}14` }}
                      title={r.chunk.text.slice(0, 200)}
                    >
                      {r.chunk.docTitle} #{r.chunk.localIndex} ·{" "}
                      {r.score.toFixed(2)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {hop.answer && (
            <Field label="Finding">
              <span className="text-ink">{hop.answer}</span>
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wider text-muted">
        {label}
      </div>
      <p className="text-[13px] leading-relaxed">{children}</p>
    </div>
  );
}
