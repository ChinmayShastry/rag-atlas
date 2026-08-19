/**
 * Published USD-per-token rates. Used only to show a running estimate — the
 * authoritative number is always your provider's own dashboard.
 *
 * Only the models this app calls by default are listed. Point it at another
 * provider and the rates are unknown, so the meter says so rather than
 * quietly reporting $0.0000 and looking free.
 */
export const RATES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "text-embedding-3-small": { input: 0.02 / 1_000_000, output: 0 },
  "omni-moderation-latest": { input: 0, output: 0 },
};

/** False for any model this app has no published rate for. */
export function hasRate(model: string): boolean {
  return model in RATES;
}

export function costOf(model: string, inputTokens: number, outputTokens: number) {
  const rate = RATES[model];
  if (!rate) return 0;
  return inputTokens * rate.input + outputTokens * rate.output;
}

export function formatUSD(n: number): string {
  if (n === 0) return "$0.0000";
  if (n < 0.0001) return "<$0.0001";
  return `$${n.toFixed(4)}`;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
