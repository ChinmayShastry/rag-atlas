/** Server-only helpers. The key arrives per-request and is never persisted. */

export const OPENAI_BASE = "https://api.openai.com/v1";
export const CHAT_MODEL = "gpt-4o-mini";
export const EMBED_MODEL = "text-embedding-3-small";
export const MODERATION_MODEL = "omni-moderation-latest";

export interface ProviderConfig {
  key: string;
  /** True when spending the deployment's shared key rather than the visitor's. */
  shared: boolean;
  baseUrl: string;
  chatModel: string;
  embedModel: string;
  /** False when pointed at a non-OpenAI endpoint, which has no moderation route. */
  isOpenAI: boolean;
}

/** Whether this deployment carries a demo key of its own. */
export function hasServerKey(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

function sanitiseModel(value: string | null | undefined, fallback: string): string {
  const v = value?.trim();
  if (!v || v.length > 80 || !/^[\w.:\/-]+$/.test(v)) return fallback;
  return v;
}

/**
 * Validates a caller-supplied endpoint.
 *
 * Only ever honoured for a request carrying the visitor's OWN key. Allowing it
 * on the shared demo key would let anyone point this server at a URL they
 * control and be handed the deployment's credentials — the request would look
 * entirely ordinary from the outside.
 */
export function sanitiseBase(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const isLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  // Plain http is permitted only for a local runtime such as Ollama.
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    return null;
  }
  return url.toString().replace(/\/+$/, "");
}

/**
 * A key supplied by the visitor always wins — they are paying, so they get the
 * unrestricted path. Otherwise fall back to the deployment's shared key, which
 * is rate limited and restricted to the bundled corpus.
 */
export function readConfig(req: Request): ProviderConfig | null {
  const supplied = req.headers.get("x-openai-key")?.trim();
  const server = process.env.OPENAI_API_KEY?.trim();

  const key = supplied || server;
  if (!key) return null;
  const shared = !supplied;

  // Custom endpoints are for people spending their own key, never the demo one.
  const base = shared ? null : sanitiseBase(req.headers.get("x-openai-base"));
  const baseUrl = base ?? OPENAI_BASE;
  const isOpenAI = baseUrl.startsWith(OPENAI_BASE);

  return {
    key,
    shared,
    baseUrl,
    chatModel: shared
      ? CHAT_MODEL
      : sanitiseModel(req.headers.get("x-openai-chat-model"), CHAT_MODEL),
    embedModel: shared
      ? EMBED_MODEL
      : sanitiseModel(req.headers.get("x-openai-embed-model"), EMBED_MODEL),
    isOpenAI,
  };
}

export function keyMissing() {
  return Response.json(
    { error: "No API key supplied. Reload and enter your key." },
    { status: 401 },
  );
}

/** Turns an error response into something readable in the UI. */
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
      return "The provider rejected the key. Check it was copied in full, and that it matches the endpoint you selected.";
    case 404:
      return (
        detail ||
        "The endpoint returned 404. Check the base URL and that the model name exists on this provider."
      );
    case 429:
      return detail.toLowerCase().includes("quota")
        ? "This key has no remaining quota. Add credit to the account."
        : "Rate limited by the provider. Wait a few seconds and retry.";
    case 400:
      return detail || "The provider rejected the request.";
    default:
      return detail || `The provider returned ${res.status}.`;
  }
}

export async function callProvider(
  path: string,
  cfg: ProviderConfig,
  body: unknown,
): Promise<Response> {
  return fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ *
 * Structured output, with a fallback for providers that lack it
 * ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = { name: string; strict?: boolean; schema: any };

export interface StructuredResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsed: any;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Asks for strict JSON-schema output, and falls back to plain JSON mode when
 * the provider does not support it.
 *
 * OpenAI-compatible endpoints vary widely here: some implement `json_schema`,
 * many implement only `json_object`, and a few neither. Rather than detect
 * providers, try the strict form and degrade on the specific failure — with the
 * schema restated in the prompt so the weaker mode still has something to aim
 * at. Output is validated by the caller either way.
 */
export async function structuredCall(
  cfg: ProviderConfig,
  system: string,
  user: string,
  schema: Schema,
): Promise<StructuredResult> {
  const attempt = async (format: unknown, systemText: string) =>
    callProvider("/chat/completions", cfg, {
      model: cfg.chatModel,
      temperature: 0,
      messages: [
        { role: "system", content: systemText },
        { role: "user", content: user },
      ],
      response_format: format,
    });

  let res = await attempt(
    { type: "json_schema", json_schema: schema },
    system,
  );

  if (!res.ok && (res.status === 400 || res.status === 404 || res.status === 422)) {
    const withShape = `${system}

Reply with JSON only, matching exactly this shape:
${JSON.stringify(schema.schema, null, 1)}`;
    res = await attempt({ type: "json_object" }, withShape);

    // Some endpoints reject response_format entirely.
    if (!res.ok && (res.status === 400 || res.status === 404 || res.status === 422)) {
      res = await attempt(undefined, withShape);
    }
  }

  if (!res.ok) throw new Error(await explainError(res));

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  // Weaker modes sometimes wrap the object in prose or a code fence.
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The provider did not return JSON.");

  return {
    parsed: JSON.parse(content.slice(start, end + 1)),
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
  };
}
