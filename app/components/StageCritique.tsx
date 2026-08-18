"use client";

import { useState } from "react";
import { apiPost } from "../lib/api";
import { useRag } from "../lib/store";
import { toPassages } from "../lib/prompt";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import type { Critique } from "../lib/types";
import {
  ErrorNote,
  Insight,
  Panel,
  Spinner,
  StepSection,
} from "./ui";

const VERDICT: Record<
  Critique["verdict"],
  { label: string; color: string; bg: string; border: string; blurb: string }
> = {
  ship: {
    label: "Ship it",
    color: "#4E6340",
    bg: "rgba(110,130,87,.10)",
    border: "rgba(110,130,87,.45)",
    blurb: "Every claim traces to a passage. The answer can be shown as written.",
  },
  revise: {
    label: "Needs revision",
    color: "#9A6A16",
    bg: "rgba(242,193,78,.14)",
    border: "rgba(222,146,43,.5)",
    blurb: "Broadly sound, but it overreaches somewhere. Regenerate or soften before showing.",
  },
  withhold: {
    label: "Withhold",
    color: "#8E2F41",
    bg: "rgba(160,58,78,.09)",
    border: "rgba(160,58,78,.45)",
    blurb: "The answer asserts things the passages do not support. Do not show it.",
  },
};

export default function StageCritique({ n }: StageProps) {
  const {
    apiKey,
    canCallApi,
    answer,
    embeddedQuery,
    retrieved,
    critique,
    setCritique,
    addUsage,
  } = useRag();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!answer && !!embeddedQuery && retrieved.length > 0;
  const style = critique ? VERDICT[critique.verdict] : null;

  async function run() {
    if (!answer || !embeddedQuery) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiPost<Critique & {
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/grade", apiKey, {
        task: "critique",
        question: embeddedQuery,
        answer,
        passages: toPassages(retrieved),
      });
      addUsage({
        model: "gpt-4o-mini",
        label: "Self-critique",
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
      });
      setCritique({
        verdict: data.verdict,
        reason: data.reason,
        issues: data.issues,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Critique failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepSection
      id="critique"
      n={n}
      kicker={stageKicker(n)}
      title="Self-critique"
      lede="The answer exists but has not been shown to anyone yet. One more check decides whether it should be."
      locked={!ready}
      lockNote="Generate an answer first."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-4">
          <Panel title="The verdict">
            {critique && style ? (
              <div
                className="rounded-xl border px-4 py-3.5"
                style={{ borderColor: style.border, background: style.bg }}
              >
                <div
                  className="font-display text-[19px] font-bold"
                  style={{ color: style.color }}
                >
                  {style.label}
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink">
                  {critique.reason}
                </p>
                <p className="mt-2 border-t border-line/70 pt-2 text-[12.5px] leading-relaxed text-muted">
                  {style.blurb}
                </p>
              </div>
            ) : (
              <p className="py-5 text-center text-[13.5px] leading-relaxed text-ink-soft">
                Hand the question, the passages, and the answer to a model that
                did not write it, and ask whether it should be published.
              </p>
            )}

            <button
              onClick={run}
              disabled={busy || !canCallApi}
              className={critique ? "btn-ghost mt-3 w-full" : "btn-primary mt-3 w-full"}
            >
              {busy ? (
                <>
                  <Spinner /> Checking…
                </>
              ) : critique ? (
                "Re-check"
              ) : (
                "Critique the answer →"
              )}
            </button>
            {error && <ErrorNote>{error}</ErrorNote>}
          </Panel>

          {critique && (
            <Panel title="Problems found">
              {critique.issues.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-olive/35 bg-olive/[0.08] px-3.5 py-3">
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="#4E6340"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 10.5l4 4 8-9" />
                  </svg>
                  <p className="text-[13px] leading-relaxed text-[#4E6340]">
                    Nothing flagged. The answer stays within its evidence.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {critique.issues.map((issue, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-berry/30 bg-berry/[0.06] px-3.5 py-2.5"
                    >
                      <p className="text-[13px] leading-relaxed text-ink">{issue}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Not the same as evaluation">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              The evaluation stage <em>scores</em> an answer that has already
              been shown, so you can track quality over time. This one is a{" "}
              <em>gate</em>: it runs before the user sees anything and can stop
              the answer from being shown at all.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Same underlying trick, different position in the pipeline, and
              that position is the whole difference.
            </p>
          </Panel>

          <Panel title="Marking your own homework">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              The critic is the same model that wrote the answer, so it shares
              the same blind spots. It reliably catches overreach and
              unsupported specifics; it is much weaker on errors that require
              knowledge neither the answer nor the passages contain.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              Useful, cheap, and not a substitute for a human on anything
              consequential.
            </p>
          </Panel>
        </div>
      </div>

      <Insight>
        {critique ? (
          critique.verdict === "ship" ? (
            <>
              Cleared. Worth trying the opposite: raise temperature in the
              generation stage, regenerate, and re-check — a looser answer tends
              to acquire exactly the unsupported flourishes this gate is looking
              for.
            </>
          ) : (
            <>
              The gate caught something. In production this verdict would branch
              the pipeline — regenerate at a lower temperature, retrieve more
              context, or fall back to refusing. The answer would never reach
              the user in this state.
            </>
          )
        ) : (
          <>
            Every architecture so far has shown the user whatever the generator
            produced. This is the first one with the authority to decide not
            to.
          </>
        )}
      </Insight>
    </StepSection>
  );
}
