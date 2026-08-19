"use client";

export interface ProviderSettings {
  /** Empty means OpenAI. Anything else must be an OpenAI-compatible /v1 base. */
  baseUrl: string;
  chatModel: string;
  embedModel: string;
}

export const OPENAI_DEFAULTS: ProviderSettings = {
  baseUrl: "",
  chatModel: "gpt-4o-mini",
  embedModel: "text-embedding-3-small",
};

/**
 * Module state rather than a parameter, so the ~20 existing apiPost call sites
 * do not each have to thread provider settings through. The store is the only
 * writer, and it writes on every change.
 */
let provider: ProviderSettings = { ...OPENAI_DEFAULTS };

export function setProviderSettings(next: ProviderSettings) {
  provider = next;
}

export function getProviderSettings(): ProviderSettings {
  return provider;
}

/**
 * An empty key is valid: it means "use the deployment's demo key, if it has
 * one". The header is omitted entirely rather than sent blank.
 *
 * Provider overrides ride along only when the visitor supplied a key — the
 * server ignores them on the shared key regardless, but there is no reason to
 * send them.
 */
function authHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!key) return headers;

  headers["x-openai-key"] = key;
  if (provider.baseUrl) headers["x-openai-base"] = provider.baseUrl;
  if (provider.chatModel) headers["x-openai-chat-model"] = provider.chatModel;
  if (provider.embedModel) headers["x-openai-embed-model"] = provider.embedModel;
  return headers;
}

/**
 * A `fetch` that rejects never reached the server, so there is no status code
 * and no error body to report. The browser's own message for this is "Failed to
 * fetch", which tells a visitor nothing and looks like an application bug.
 *
 * The realistic causes are all actionable, so name them: the dev server stopped,
 * the network is down, or a content blocker is filtering requests to /api —
 * which is common, since some blocklists match paths like /api/chat.
 */
function unreachable(path: string): Error {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new Error(
      `You appear to be offline, so ${path} could not be reached. Reconnect and try again.`,
    );
  }
  return new Error(
    `Could not reach ${path}. The server may have stopped, or a browser extension may be blocking requests to this app's API. Check that the site is still running, then try again.`,
  );
}

/** Aborts are deliberate, so they must not be dressed up as network failures. */
function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export async function apiPost<T>(
  path: string,
  key: string,
  body: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: authHeaders(key),
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw unreachable(path);
  }

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
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: authHeaders(key),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw unreachable("/api/chat");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? `Generation failed (${res.status}).`);
  }
  if (!res.body) throw new Error("No response stream.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (isAbort(err)) throw err;
      // The connection dropped part-way; whatever streamed so far is kept.
      throw new Error(
        "The connection dropped while the answer was streaming. The server may have stopped, or the network went away.",
      );
    }
    const { done, value } = chunk;
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
