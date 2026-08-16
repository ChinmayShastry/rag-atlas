import {
  EMBED_MODEL,
  callOpenAI,
  explainError,
  keyMissing,
  readKey,
} from "@/app/lib/openai";
import { LIMITS, isFromCorpus } from "@/app/lib/corpus";
import { clientId, rateLimit, tooMany } from "@/app/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const resolved = readKey(req);
  if (!resolved) return keyMissing();
  const { key, shared } = resolved;

  const body = await req.json().catch(() => null);
  const texts: unknown = body?.texts;
  // "query" is a single short piece of free text; "chunks" must be corpus text.
  const kind = body?.kind === "query" ? "query" : "chunks";

  if (!Array.isArray(texts) || texts.length === 0) {
    return Response.json({ error: "Expected { texts: string[] }." }, { status: 400 });
  }
  if (!texts.every((t) => typeof t === "string")) {
    return Response.json({ error: "All texts must be strings." }, { status: 400 });
  }

  if (shared) {
    const verdict = rateLimit(
      clientId(req, `embed-${kind}`),
      kind === "query" ? 60 : 20,
    );
    if (!verdict.ok) return tooMany(verdict);
  }

  if (kind === "query") {
    if (texts.length !== 1) {
      return Response.json(
        { error: "Query embedding takes exactly one text." },
        { status: 400 },
      );
    }
    if (texts[0].length > LIMITS.maxQuestionChars) {
      return Response.json(
        { error: `Queries are limited to ${LIMITS.maxQuestionChars} characters.` },
        { status: 400 },
      );
    }
  } else {
    if (texts.length > LIMITS.maxEmbedChunks) {
      return Response.json(
        {
          error: `That produced ${texts.length} chunks, past the ${LIMITS.maxEmbedChunks} limit. Increase chunk size or select fewer documents.`,
        },
        { status: 400 },
      );
    }
    const total = texts.reduce((s, t) => s + t.length, 0);
    if (total > LIMITS.maxEmbedChars) {
      return Response.json({ error: "Too much text in one batch." }, { status: 400 });
    }
    // The shared key may only embed text that came from the bundled corpus.
    if (shared && !texts.every((t) => isFromCorpus(t))) {
      return Response.json(
        {
          error:
            "Some chunks did not come from this site's documents. The shared demo key only embeds the bundled corpus — use your own API key for arbitrary text.",
        },
        { status: 400 },
      );
    }
  }

  try {
    const res = await callOpenAI("/embeddings", key, {
      model: EMBED_MODEL,
      input: texts.map((t) => (t.trim() === "" ? " " : t)),
    });

    if (!res.ok) {
      return Response.json({ error: await explainError(res) }, { status: res.status });
    }

    const data = await res.json();
    // The API may return items out of order; `index` is authoritative.
    const vectors: number[][] = new Array(texts.length);
    for (const item of data.data) vectors[item.index] = item.embedding;

    return Response.json({
      vectors,
      dimensions: vectors[0]?.length ?? 0,
      model: EMBED_MODEL,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: 0,
      },
    });
  } catch {
    return Response.json({ error: "Could not reach OpenAI." }, { status: 502 });
  }
}
