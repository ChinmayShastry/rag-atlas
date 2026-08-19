"use client";

import { useState } from "react";
import { Spinner } from "./ui";
import { OPENAI_DEFAULTS } from "../lib/api";
import type { ProviderSettings } from "../lib/api";

/**
 * Any API that speaks the OpenAI wire format works. The catch is that this app
 * needs BOTH chat completions and embeddings from the same endpoint, and
 * several popular providers — Groq, DeepSeek, OpenRouter — serve chat only.
 * Only providers that do both are offered as presets.
 *
 * Model names are starting points, not guarantees: providers rename and retire
 * them. Every field stays editable, and a wrong name comes back as a plain
 * 404 naming the model.
 */
const PRESETS: {
  id: string;
  label: string;
  hint: string;
  keysUrl: string | null;
  settings: ProviderSettings;
}[] = [
  {
    id: "openai",
    label: "OpenAI",
    hint: "The default. Nothing to configure.",
    keysUrl: "https://platform.openai.com/api-keys",
    settings: OPENAI_DEFAULTS,
  },
  {
    id: "together",
    label: "Together AI",
    hint: "Open-weight models, both endpoints.",
    keysUrl: "https://api.together.xyz/settings/api-keys",
    settings: {
      baseUrl: "https://api.together.xyz/v1",
      chatModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      embedModel: "BAAI/bge-base-en-v1.5",
    },
  },
  {
    id: "fireworks",
    label: "Fireworks",
    hint: "Open-weight models, both endpoints.",
    keysUrl: "https://fireworks.ai/account/api-keys",
    settings: {
      baseUrl: "https://api.fireworks.ai/inference/v1",
      chatModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      embedModel: "nomic-ai/nomic-embed-text-v1.5",
    },
  },
  {
    id: "mistral",
    label: "Mistral",
    hint: "mistral-embed covers the vector stages.",
    keysUrl: "https://console.mistral.ai/api-keys",
    settings: {
      baseUrl: "https://api.mistral.ai/v1",
      chatModel: "mistral-small-latest",
      embedModel: "mistral-embed",
    },
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    hint: "Only when you run this app locally too — the endpoint is dialled from the server, not your browser. Any key value works.",
    keysUrl: null,
    settings: {
      baseUrl: "http://localhost:11434/v1",
      chatModel: "llama3.1",
      embedModel: "nomic-embed-text",
    },
  },
  {
    id: "custom",
    label: "Something else",
    hint: "Any OpenAI-compatible /v1 base URL.",
    keysUrl: null,
    settings: { baseUrl: "", chatModel: "", embedModel: "" },
  },
];

export default function KeyGate({
  onReady,
  demoKeyAvailable = false,
  onUseDemo,
}: {
  onReady: (key: string, provider: ProviderSettings) => void;
  demoKeyAvailable?: boolean;
  onUseDemo?: () => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(!demoKeyAvailable);

  const [presetId, setPresetId] = useState("openai");
  const [advanced, setAdvanced] = useState(false);
  const [settings, setSettings] = useState<ProviderSettings>(OPENAI_DEFAULTS);

  const isOpenAI = presetId === "openai";
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];

  function choose(id: string) {
    setPresetId(id);
    setError(null);
    const next = PRESETS.find((p) => p.id === id)?.settings ?? OPENAI_DEFAULTS;
    // "Something else" keeps whatever was typed rather than wiping it.
    setSettings(id === "custom" ? { ...settings, baseUrl: settings.baseUrl } : next);
  }

  const field = (k: keyof ProviderSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || busy) return;

    const resolved: ProviderSettings = {
      baseUrl: settings.baseUrl.trim(),
      chatModel: settings.chatModel.trim() || OPENAI_DEFAULTS.chatModel,
      embedModel: settings.embedModel.trim() || OPENAI_DEFAULTS.embedModel,
    };

    if (!isOpenAI && !resolved.baseUrl) {
      setError("Enter the base URL for this provider — it usually ends in /v1.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-openai-key": key.trim(),
      };
      if (resolved.baseUrl) headers["x-openai-base"] = resolved.baseUrl;

      let res: Response;
      try {
        res = await fetch("/api/validate", {
          method: "POST",
          headers,
          body: "{}",
        });
      } catch {
        // Never reached the server, so there is no status or body to report.
        throw new Error(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "You appear to be offline. Reconnect and try again."
            : "Could not reach this app's server. It may have stopped, or a browser extension may be blocking requests to /api.",
        );
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Could not validate that key.");
      onReady(key.trim(), resolved);
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
            Six architectures of retrieval-augmented generation, evaluation,
            and guardrails — every stage drawn, and every slider wired to live
            output.
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
              questions about the ten bundled documents.
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
            {isOpenAI ? "OpenAI API key" : `${preset.label} API key`}
          </label>

          <div className="relative">
            <input
              id="key"
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={isOpenAI ? "sk-..." : "Your provider's key"}
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

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setAdvanced((a) => !a)}
              className="flex w-full items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft transition hover:text-terracotta"
            >
              <svg
                viewBox="0 0 20 20"
                className={`h-3.5 w-3.5 transition-transform ${advanced ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M7 4l6 6-6 6" />
              </svg>
              Not an OpenAI key?
              {!isOpenAI && (
                <span className="ml-auto rounded-full bg-terracotta/10 px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-terracotta">
                  {preset.label}
                </span>
              )}
            </button>

            {advanced && (
              <div className="mt-3 space-y-3 rounded-xl border border-line bg-parchment/40 p-3.5">
                <p className="text-[12.5px] leading-relaxed text-ink-soft">
                  Any API that speaks the OpenAI format works. This pipeline
                  needs <strong className="font-semibold text-ink">both</strong>{" "}
                  chat and embeddings from the same endpoint, so chat-only
                  services — Groq, DeepSeek, OpenRouter — cannot drive it.
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((pr) => (
                    <button
                      key={pr.id}
                      type="button"
                      onClick={() => choose(pr.id)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition ${
                        pr.id === presetId
                          ? "border-terracotta bg-terracotta/[0.09] text-terracotta"
                          : "border-line bg-white/70 text-ink-soft hover:border-terracotta/40 hover:text-terracotta"
                      }`}
                    >
                      {pr.label}
                    </button>
                  ))}
                </div>

                <p className="text-[11.5px] text-muted">{preset.hint}</p>

                {!isOpenAI && (
                  <div className="space-y-2.5 border-t border-line pt-3">
                    <Field
                      label="Base URL"
                      value={settings.baseUrl}
                      onChange={field("baseUrl")}
                      placeholder="https://api.example.com/v1"
                      disabled={busy}
                    />
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <Field
                        label="Chat model"
                        value={settings.chatModel}
                        onChange={field("chatModel")}
                        placeholder={OPENAI_DEFAULTS.chatModel}
                        disabled={busy}
                      />
                      <Field
                        label="Embedding model"
                        value={settings.embedModel}
                        onChange={field("embedModel")}
                        placeholder={OPENAI_DEFAULTS.embedModel}
                        disabled={busy}
                      />
                    </div>
                    <p className="text-[11.5px] leading-relaxed text-muted">
                      Two stages stay OpenAI-only and will say so when you reach
                      them: the moderation endpoint, and the running cost meter,
                      which has no published rates to work from.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!key.trim() || busy}
            className="btn-primary mt-4 w-full py-3 text-[15px]"
          >
            {busy ? (
              <>
                <Spinner /> Verifying with {isOpenAI ? "OpenAI" : preset.label}…
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
              there straight to {isOpenAI ? "OpenAI" : preset.label}. It goes
              nowhere else.
            </Assurance>
            <Assurance>
              The reranking stage additionally downloads a small open model from
              a public CDN to run in your browser. Your key and your questions
              are never part of that — it is a static file fetch.
            </Assurance>
            <Assurance>
              {isOpenAI ? "A full session costs well under a cent. " : ""}
              Models used:{" "}
              <code className="rounded bg-parchment px-1 py-px font-mono text-[11.5px] text-clay">
                {settings.chatModel || OPENAI_DEFAULTS.chatModel}
              </code>{" "}
              and{" "}
              <code className="rounded bg-parchment px-1 py-px font-mono text-[11.5px] text-clay">
                {settings.embedModel || OPENAI_DEFAULTS.embedModel}
              </code>
              .
            </Assurance>
          </div>
        </form>
        )}

        {preset.keysUrl && (
          <p className="mt-5 text-center text-[12.5px] text-muted">
            Need a key? Create one at{" "}
            <a
              href={preset.keysUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-terracotta underline decoration-terracotta/30 underline-offset-2 hover:decoration-terracotta"
            >
              {preset.keysUrl.replace(/^https:\/\//, "")}
            </a>
          </p>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        className="field py-2 font-mono text-[12px]"
      />
    </label>
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
