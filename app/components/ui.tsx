"use client";

import type { ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * Slider — the primary interaction of the whole site
 * ------------------------------------------------------------------ */

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  hint,
  onChange,
  disabled,
  accent = "#C1553A",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  onChange: (n: number) => void;
  disabled?: boolean;
  accent?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className={disabled ? "opacity-45" : ""}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-soft">
          {label}
        </label>
        <span
          className="rounded-lg px-2 py-0.5 font-mono text-[13px] font-bold tabular-nums"
          style={{ color: accent, background: `${accent}18` }}
        >
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${pct}%` }}
        aria-label={label}
      />
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Section scaffolding
 * ------------------------------------------------------------------ */

export function StepSection({
  id,
  n,
  kicker,
  title,
  lede,
  children,
  locked,
  lockNote,
}: {
  id: string;
  n: number;
  kicker: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
  locked?: boolean;
  lockNote?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-9">
      <div className="mb-5 flex items-start gap-4">
        <div className="relative mt-0.5 shrink-0">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl font-display text-lg font-bold text-white shadow-warm"
            style={{
              backgroundImage: locked
                ? "linear-gradient(135deg,#c9b8a6,#ab9884)"
                : "linear-gradient(135deg,#C1553A,#8C4A32)",
            }}
          >
            {n}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta/80">
            {kicker}
          </div>
          <h2 className="font-display text-[27px] font-bold leading-tight tracking-tight text-ink">
            {title}
          </h2>
          <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-ink-soft">
            {lede}
          </p>
        </div>
      </div>

      {locked ? (
        <div className="card flex items-center gap-3 border-dashed bg-parchment/40 p-7 text-sm text-muted">
          <LockIcon />
          <span>{lockNote}</span>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function Panel({
  title,
  right,
  children,
  className = "",
  bodyClass = "",
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-parchment/40 px-4 py-2.5">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.11em] text-ink-soft">
            {title}
          </h3>
          {right}
        </div>
      )}
      <div className={bodyClass || "p-4"}>{children}</div>
    </div>
  );
}

/** The one-or-two-line "what just happened" note attached to each stage. */
export function Insight({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber/25 bg-honey/[0.10] px-3.5 py-2.5">
      <svg
        viewBox="0 0 20 20"
        className="mt-[1px] h-4 w-4 shrink-0"
        fill="none"
        stroke="#B87A16"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 2.5a5 5 0 0 0-3 9v1.5h6V11.5a5 5 0 0 0-3-9Z" />
        <path d="M8 16.5h4M8.5 18.5h3" />
      </svg>
      <p className="text-[13.5px] leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}

export function Stat({
  label,
  value,
  accent = "#C1553A",
  sub,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white/60 px-3 py-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-muted">
        {label}
      </div>
      <div
        className="font-mono text-[19px] font-bold leading-tight tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] leading-tight text-muted">{sub}</div>}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-berry/30 bg-berry/[0.07] px-3.5 py-2.5 text-[13px] leading-relaxed text-berry">
      <svg
        viewBox="0 0 20 20"
        className="mt-[2px] h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      >
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 6.5v4.2M10 13.4v.2" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="8.5" width="12" height="8" rx="2" />
      <path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" />
    </svg>
  );
}

/** Segmented control used for chunking strategy and comparison modes. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-parchment/50 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-150 ${
              active
                ? "bg-white text-terracotta shadow-warm"
                : "text-ink-soft hover:text-terracotta"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Animated 0-100 meter used for evaluation scores. */
export function ScoreMeter({
  label,
  score,
  reason,
  delay = 0,
}: {
  label: string;
  score: number;
  reason: string;
  delay?: number;
}) {
  const color = score >= 80 ? "#6E8257" : score >= 55 ? "#DE922B" : "#A03A4E";
  return (
    <div className="rounded-xl border border-line bg-white/60 p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] font-bold uppercase tracking-[0.09em] text-ink-soft">
          {label}
        </span>
        <span
          className="font-mono text-[21px] font-bold tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-parchment">
        <div
          className="h-full rounded-full"
          style={{
            width: `${score}%`,
            background: `linear-gradient(90deg,${color}bb,${color})`,
            transition: `width .9s cubic-bezier(.2,.8,.25,1) ${delay}ms`,
          }}
        />
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{reason}</p>
    </div>
  );
}
