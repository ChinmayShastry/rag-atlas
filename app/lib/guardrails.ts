import type { GuardResult, GuardVerdict } from "./types";

/**
 * Deterministic guardrails. These are pure functions with no network cost, so
 * the UI can run them on every keystroke — which is exactly the point: a large
 * share of real-world guardrail coverage never needs a model at all.
 */

/** Credit-card checksum. Filters the false positives a bare digit regex creates. */
function luhnValid(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

interface PiiRule {
  label: string;
  pattern: RegExp;
  validate?: (m: string) => boolean;
}

const PII_RULES: PiiRule[] = [
  { label: "email address", pattern: /[\w.+-]+@[\w-]+\.[\w.]{2,}/g },
  { label: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { label: "US social security number", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    label: "credit card number",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    validate: luhnValid,
  },
  {
    label: "phone number",
    pattern: /\b(?:\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g,
  },
  {
    label: "IP address",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
];

export function scanPII(text: string): { label: string; match: string }[] {
  const hits: { label: string; match: string }[] = [];
  for (const rule of PII_RULES) {
    // Fresh regex each pass — /g regexes carry lastIndex between calls.
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].trim().length === 0) break;
      if (rule.validate && !rule.validate(m[0])) continue;
      hits.push({ label: rule.label, match: m[0] });
      if (hits.length > 12) return hits;
    }
  }
  return hits;
}

const INJECTION_PATTERNS: { re: RegExp; note: string }[] = [
  {
    re: /ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|prompts?|rules?|directions?)/i,
    note: "classic instruction-override phrasing",
  },
  {
    re: /disregard\s+(all\s+|the\s+)?(previous|prior|above|earlier|your)\s+\w+/i,
    note: "instruction-override phrasing",
  },
  {
    re: /(reveal|show|print|repeat|output|display)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions|rules|api\s*key)/i,
    note: "attempts to extract the system prompt",
  },
  {
    re: /you\s+are\s+now\s+(a|an|no longer)/i,
    note: "attempts to reassign your role",
  },
  {
    re: /\b(jailbreak|DAN\s+mode|developer\s+mode|god\s+mode)\b/i,
    note: "names a known jailbreak technique",
  },
  {
    re: /pretend\s+(that\s+)?(you\s+(are|have)|to\s+be)/i,
    note: "role-play framing used to bypass rules",
  },
  {
    re: /new\s+(instructions?|rules?|system\s+prompt)\s*:/i,
    note: "injects a fake instruction block",
  },
  {
    re: /(without|do\s*n[o']?t)\s+(using|refer(ring)?\s+to|consulting)\s+the\s+(context|documents?|passages?|sources?)/i,
    note: "tries to detach the model from its retrieved context",
  },
  {
    re: /\b(end|close)\s+of\s+(context|document|passage)\b/i,
    note: "forges a context boundary",
  },
];

export function scanInjection(text: string): string[] {
  return INJECTION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.note);
}

/** Answers that quietly drop the retrieved context are worth flagging. */
export function scanRefusal(text: string): boolean {
  return /\b(as an ai|i (can'?t|cannot) (help|assist|comply))\b/i.test(text);
}

export function piiGuard(text: string, stage: "input" | "output"): GuardResult {
  const hits = scanPII(text);
  const unique = Array.from(new Set(hits.map((h) => h.label)));
  return {
    id: `pii-${stage}`,
    stage,
    label: stage === "input" ? "PII in question" : "PII in answer",
    verdict: hits.length ? "block" : "pass",
    detail: hits.length
      ? `Found ${hits.length} likely identifier${hits.length > 1 ? "s" : ""}: ${unique.join(", ")}.`
      : "No emails, keys, card numbers, or other identifiers detected.",
    matches: hits.map((h) => h.match),
  };
}

export function injectionGuard(text: string): GuardResult {
  const notes = scanInjection(text);
  return {
    id: "injection-regex",
    stage: "input",
    label: "Injection patterns",
    verdict: notes.length ? "block" : "pass",
    detail: notes.length
      ? `Matched ${notes.length} known pattern${notes.length > 1 ? "s" : ""}: ${notes.join("; ")}.`
      : "No known instruction-override phrasing found.",
  };
}

export function groundednessGuard(
  faithfulness: number | null,
  threshold: number,
): GuardResult {
  if (faithfulness === null) {
    return {
      id: "groundedness",
      stage: "output",
      label: "Groundedness gate",
      verdict: "warn",
      detail: "Not scored yet — run the evaluation step first.",
    };
  }
  const verdict: GuardVerdict =
    faithfulness >= threshold ? "pass" : faithfulness >= threshold - 20 ? "warn" : "block";
  return {
    id: "groundedness",
    stage: "output",
    label: "Groundedness gate",
    verdict,
    detail:
      verdict === "pass"
        ? `Faithfulness ${faithfulness} clears the ${threshold} threshold — safe to show.`
        : `Faithfulness ${faithfulness} is below the ${threshold} threshold. In production this answer would be withheld or retried.`,
  };
}

export const VERDICT_STYLE: Record<
  GuardVerdict,
  { text: string; border: string; bg: string; dot: string; word: string }
> = {
  pass: {
    text: "#4E6340",
    border: "rgba(110,130,87,.45)",
    bg: "rgba(110,130,87,.10)",
    dot: "#6E8257",
    word: "PASS",
  },
  warn: {
    text: "#9A6A16",
    border: "rgba(222,146,43,.50)",
    bg: "rgba(242,193,78,.16)",
    dot: "#DE922B",
    word: "WARN",
  },
  block: {
    text: "#8E2F41",
    border: "rgba(160,58,78,.45)",
    bg: "rgba(160,58,78,.10)",
    dot: "#A03A4E",
    word: "BLOCK",
  },
};
