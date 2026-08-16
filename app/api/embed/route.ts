import {
  EMBED_MODEL,
  callOpenAI,
  explainError,
  keyMissing,
  readKey,
} from "@/app/lib/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_INPUTS = 300;

export async function POST(req: Request) {
  const key = readKey(req);
  if (!key) return keyMissing();

  let texts: string[];
  try {
    const body = await req.json();
    texts = body?.texts;
    if (!Array.isArray(texts) || texts.length === 0) throw new Error();
  } catch {
    return Response.json({ error: "Expected { texts: string[] }." }, { status: 400 });
  }

  if (texts.length > MAX_INPUTS) {
    return Response.json(
      {
        error: `That produced ${texts.length} chunks, past the ${MAX_INPUTS} limit. Increase chunk size or select fewer documents.`,
      },
      { status: 400 },
    );
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
