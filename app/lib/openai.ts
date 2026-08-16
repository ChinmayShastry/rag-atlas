/** Server-only helpers. The key arrives per-request and is never persisted. */

export const OPENAI_BASE = "https://api.openai.com/v1";
export const CHAT_MODEL = "gpt-4o-mini";
export const EMBED_MODEL = "text-embedding-3-small";
export const MODERATION_MODEL = "omni-moderation-latest";

export interface ResolvedKey {
  key: string;
  /** True when spending the deployment's shared key rather than the visitor's. */
  shared: boolean;
}

/** Whether this deployment carries a demo key of its own. */
export function hasServerKey(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

/**
 * A key supplied by the visitor always wins — they are paying, so they get the
 * unrestricted path. Otherwise fall back to the deployment's shared key, which
 * is rate limited and restricted to the bundled corpus.
 */
export function readKey(req: Request): ResolvedKey | null {
  const supplied = req.headers.get("x-openai-key")?.trim();
  if (supplied) return { key: supplied, shared: false };

  const server = process.env.OPENAI_API_KEY?.trim();
  if (server) return { key: server, shared: true };

  return null;
}

export function keyMissing() {
  return Response.json(
    { error: "No API key supplied. Reload and enter your key." },
    { status: 401 },
  );
}

/** Turns an OpenAI error response into something readable in the UI. */
export async function explainError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message ?? "";
  } catch {
    /* non-JSON error body */
  }

  switch (res.status) {
    case 401:
      return "OpenAI rejected the key. Check it was copied in full.";
    case 429:
      return detail.toLowerCase().includes("quota")
        ? "This key has no remaining quota. Add credit to the OpenAI account."
        : "Rate limited by OpenAI. Wait a few seconds and retry.";
    case 400:
      return detail || "OpenAI rejected the request.";
    default:
      return detail || `OpenAI returned ${res.status}.`;
  }
}

export async function callOpenAI(
  path: string,
  key: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${OPENAI_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
}
