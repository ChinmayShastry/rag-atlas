/** Server-only helpers. The key arrives per-request and is never persisted. */

export const OPENAI_BASE = "https://api.openai.com/v1";
export const CHAT_MODEL = "gpt-4o-mini";
export const EMBED_MODEL = "text-embedding-3-small";
export const MODERATION_MODEL = "omni-moderation-latest";

export function readKey(req: Request): string | null {
  const key = req.headers.get("x-openai-key")?.trim();
  if (!key) return null;
  return key;
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
