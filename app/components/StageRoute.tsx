"use client";

import { useState } from "react";
import { apiPost } from "../lib/api";
import { useRag } from "../lib/store";
import { stageKicker } from "../lib/ragTypes";
import type { StageProps } from "../lib/ragTypes";
import type { RouteChoice, RouteDecision } from "../lib/types";
import {
  ErrorNote,
  Insight,
  Panel,
  Spinner,
  StepSection,
} from "./ui";

const CHOICE: Record<
  RouteChoice,
  { label: string; color: string; bg: string; border: string; blurb: string }
> = {
  retrieve: {
    label: "Retrieve",
    color: "#4E6340",
    bg: "rgba(110,130,87,.10)",
    border: "rgba(110,130,87,.45)",
    blurb: "Search the documents, then answer only from what comes back.",
  },
  direct: {
    label: "Answer directly",
    color: "#9A6A16",
    bg: "rgba(242,193,78,.14)",
    border: "rgba(222,146,43,.5)",
    blurb: "No search needed. Fast and free — and unsourced, which is the risk.",
  },
  reject: {
    label: "Decline",
    color: "#8E2F41",
    bg: "rgba(160,58,78,.09)",
    border: "rgba(160,58,78,.45)",
    blurb: "Outside what these documents cover. Refusing beats inventing.",
  },
};

export default function StageRoute({ n }: StageProps) {
  const {
    apiKey,
    canCallApi,
    embeddedQuery,
    docs,
    activeDocIds,
    routeDecision,
    setRouteDecision,
    addUsage,
  } = useRag();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!embeddedQuery;

  async function route() {
    if (!embeddedQuery) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiPost<RouteDecision & {
        usage: { inputTokens: number; outputTokens: number };
      }>("/api/plan", apiKey, {
        task: "route",
        question: embeddedQuery,
        corpusSummary: docs
          .filter((d) => activeDocIds.includes(d.id))
          .map((d) => d.title)
          .join("; "),
      });
      addUsage({
        model: "gpt-4o-mini",
        label: "Routing decision",
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
      });
      setRouteDecision({ decision: data.decision, reason: data.reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Routing failed.");
    } finally {
      setBusy(false);
    }
  }

  const chosen = routeDecision ? CHOICE[routeDecision.decision] : null;

  return (
    <StepSection
      id="route"
      n={n}
      kicker={stageKicker(n)}
      title="Routing"
      lede="Before searching anything, decide whether this question needs the documents at all — and whether it is one this system should answer."
      locked={!ready}
      lockNote="Embed a question first."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel title="The decision">
            {routeDecision && chosen ? (
              <div
                className="rounded-xl border px-4 py-3.5"
                style={{ borderColor: chosen.border, background: chosen.bg }}
              >
                <div
                  className="font-display text-[19px] font-bold"
                  style={{ color: chosen.color }}
                >
                  {chosen.label}
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink">
                  {routeDecision.reason}
                </p>
                <p className="mt-2 border-t border-line/70 pt-2 text-[12.5px] leading-relaxed text-muted">
                  {chosen.blurb}
                </p>
              </div>
            ) : (
              <p className="py-5 text-center text-[13.5px] leading-relaxed text-ink-soft">
                Every question so far has been assumed to need retrieval. This
                stage questions that assumption before spending anything on it.
              </p>
            )}

            <button
              onClick={route}
              disabled={busy || !canCallApi}
              className={routeDecision ? "btn-ghost mt-3 w-full" : "btn-primary mt-3 w-full"}
            >
              {busy ? (
                <>
                  <Spinner /> Deciding…
                </>
              ) : routeDecision ? (
                "Re-route"
              ) : (
                "Route this question →"
              )}
            </button>
            {error && <ErrorNote>{error}</ErrorNote>}
          </Panel>

          {routeDecision && routeDecision.decision !== "retrieve" && (
            <div className="rounded-2xl border border-amber/40 bg-honey/[0.10] px-4 py-3">
              <div className="font-display text-[15px] font-bold text-[#9A6A16]">
                Retrieval skipped
              </div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
                The stages below will stay empty, because the router decided
                this question does not go to the documents. Re-route as{" "}
                <em>retrieve</em> to run the rest of the pipeline.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="The three routes">
            <div className="space-y-2.5">
              {(Object.keys(CHOICE) as RouteChoice[]).map((k) => {
                const c = CHOICE[k];
                const active = routeDecision?.decision === k;
                return (
                  <div
                    key={k}
                    className="rounded-xl border px-3 py-2 transition-all"
                    style={{
                      borderColor: active ? c.border : "#EADBC8",
                      background: active ? c.bg : "transparent",
                    }}
                  >
                    <div
                      className="text-[12.5px] font-bold"
                      style={{ color: active ? c.color : "#6B5445" }}
                    >
                      {c.label}
                    </div>
                    <p className="text-[11.5px] leading-snug text-muted">
                      {c.blurb}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Why route at all">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              Retrieval is not free. It costs an embedding, a search, and a
              much larger prompt. For a question the model can answer unaided,
              all of that is waste.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              But the asymmetry matters: routing a document question to{" "}
              <em>direct</em> produces a confident answer with no evidence
              behind it, which is far worse than a wasted search. A good router
              is biased toward retrieving.
            </p>
          </Panel>
        </div>
      </div>

      <Insight>
        {routeDecision ? (
          routeDecision.decision === "retrieve" ? (
            <>
              Routed to retrieval, as most questions about this corpus should
              be. Try asking something the documents plainly do not cover and
              watch the decision change — that is the router earning its keep.
            </>
          ) : (
            <>
              The router declined to search. Notice this decision was made
              before any embedding or retrieval happened, so it costs one small
              classification call and saves everything downstream.
            </>
          )
        ) : (
          <>
            This is the first stage where the system decides <em>what to do</em>{" "}
            rather than simply doing it. Every architecture before this ran the
            same fixed pipeline no matter what you asked.
          </>
        )}
      </Insight>
    </StepSection>
  );
}
