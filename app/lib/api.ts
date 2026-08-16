"use client";

export async function apiPost<T>(
  path: string,
  key: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-openai-key": key },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onUsage?: (u: { inputTokens: number; outputTokens: number }) => void;
}

/** Consumes the NDJSON stream produced by /api/chat. */
export async function streamChat(
  key: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-openai-key": key },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? `Generation failed (${res.status}).`);
  }
  if (!res.body) throw new Error("No response stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: { t: string; v: unknown };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.t === "delta") handlers.onDelta(msg.v as string);
      else if (msg.t === "usage")
        handlers.onUsage?.(msg.v as { inputTokens: number; outputTokens: number });
      else if (msg.t === "error") throw new Error(msg.v as string);
    }
  }
}
