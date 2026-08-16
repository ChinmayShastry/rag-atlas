"use client";

import Header from "./components/Header";
import KeyGate from "./components/KeyGate";
import Step1Corpus from "./components/Step1Corpus";
import Step2Chunking from "./components/Step2Chunking";
import Step3Embedding from "./components/Step3Embedding";
import Step4Query from "./components/Step4Query";
import Step5Retrieval from "./components/Step5Retrieval";
import Step6Augmentation from "./components/Step6Augmentation";
import Step7Generation from "./components/Step7Generation";
import Step8Evaluation from "./components/Step8Evaluation";
import Step9Guardrails from "./components/Step9Guardrails";
import { RagProvider, useRag } from "./lib/store";
import { formatUSD } from "./lib/pricing";

export default function Page() {
  return (
    <RagProvider>
      <Shell />
    </RagProvider>
  );
}

function Shell() {
  const { apiKey, setApiKey } = useRag();

  if (!apiKey) return <KeyGate onReady={setApiKey} />;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1220px] px-5 pb-24">
        <Intro />
        <Step1Corpus />
        <Rule />
        <Step2Chunking />
        <Rule />
        <Step3Embedding />
        <Rule />
        <Step4Query />
        <Rule />
        <Step5Retrieval />
        <Rule />
        <Step6Augmentation />
        <Rule />
        <Step7Generation />
        <Rule />
        <Step8Evaluation />
        <Rule />
        <Step9Guardrails />
        <Outro />
      </main>
    </>
  );
}

function Rule() {
  return <div className="flow-rule" aria-hidden />;
}

function Intro() {
  return (
    <section className="animate-fade-up pb-2 pt-12">
      <div className="max-w-2xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-olive/35 bg-olive/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.13em] text-olive">
          <span className="h-1.5 w-1.5 rounded-full bg-olive" />
          Key accepted
        </div>
        <h1 className="font-display text-[42px] font-bold leading-[1.05] tracking-tight text-ink sm:text-[52px]">
          Watch retrieval-augmented
          <br />
          generation actually happen.
        </h1>
        <p className="mt-4 text-[16.5px] leading-relaxed text-ink-soft">
          Nine stages, three text files, and a lot of sliders. Everything below
          is live: drag a control and the chunks, the vectors, the retrieved
          passages, and the answer all move with it. Start at the top and work
          down — each stage explains itself in a line or two, then shows you.
        </p>
      </div>

      <div className="mt-7 grid gap-2.5 sm:grid-cols-3">
        <IntroCard
          n="1—6"
          title="Retrieval"
          text="Corpus to chunks to vectors to a ranked shortlist to a finished prompt."
          color="#C2603A"
        />
        <IntroCard
          n="7"
          title="Generation"
          text="The answer, streamed and cited — with the same question answered blind, for contrast."
          color="#B0811C"
        />
        <IntroCard
          n="8—9"
          title="Evaluation & guardrails"
          text="Score the answer for groundedness, then try to break the whole thing on purpose."
          color="#B0455A"
        />
      </div>
    </section>
  );
}

function IntroCard({
  n,
  title,
  text,
  color,
}: {
  n: string;
  title: string;
  text: string;
  color: string;
}) {
  return (
    <div
      className="rounded-2xl border bg-card/70 p-3.5"
      style={{ borderColor: `${color}33` }}
    >
      <div
        className="font-mono text-[11px] font-bold uppercase tracking-widest"
        style={{ color }}
      >
        stage {n}
      </div>
      <div className="mt-0.5 font-display text-[16px] font-bold text-ink">
        {title}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function Outro() {
  const { totalCost, totalTokens, usage } = useRag();

  return (
    <section className="mt-10 border-t border-line pt-10">
      <div className="card overflow-hidden">
        <div className="border-b border-line bg-parchment/40 px-5 py-3">
          <h2 className="font-display text-[19px] font-bold text-ink">
            That was the whole pipeline
          </h2>
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-3 text-[14px] leading-relaxed text-ink-soft">
            <p>
              Nothing you saw was a simulation. Real chunking, real
              1536-dimensional embeddings, real cosine ranking, real streamed
              generation, and a real second model grading the first — all from
              three plain text files and your own key.
            </p>
            <p>
              The parts worth carrying away: retrieval quality caps answer
              quality, chunk boundaries silently decide what is findable,
              citations are what make an answer auditable, evaluation is what
              turns a demo into a system you can improve, and guardrails make
              failure visible rather than impossible.
            </p>
            <p className="text-muted">
              Go back and break something on purpose. Set top-K to 1 and ask a
              question spanning two documents. Push temperature to 1.2 and
              re-score. Switch off the coffee file and ask about first crack.
              Every one of those failures is a real failure mode of production
              RAG.
            </p>
          </div>

          <div className="space-y-2">
            <div className="rounded-xl border border-line bg-white/60 p-3.5">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">
                This session cost you
              </div>
              <div className="font-mono text-[28px] font-bold leading-tight text-terracotta">
                {formatUSD(totalCost)}
              </div>
              <div className="text-[12px] text-muted">
                {totalTokens.toLocaleString()} tokens across {usage.length} API
                calls
              </div>
            </div>
            <p className="px-1 text-[11.5px] leading-relaxed text-muted">
              Your key was held in this tab&apos;s memory only. Close the tab and
              it is gone — there is nothing to log out of.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[12px] text-muted">
        Built with Next.js · gpt-4o-mini and text-embedding-3-small · no data
        stored anywhere
      </p>
    </section>
  );
}
