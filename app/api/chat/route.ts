import {
  CHAT_MODEL,
  callOpenAI,
  explainError,
  keyMissing,
  readKey,
} from "@/app/lib/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Streams the answer back as newline-delimited JSON so the client can tell
 * token deltas apart from the final usage report:
 *   {"t":"delta","v":"..."}   {"t":"usage","v":{...}}   {"t":"error","v":"..."}
 */
export async function POST(req: Request) {
  const key = readKey(req);
  if (!key) return keyMissing();

  const body = await req.json().catch(() => null);
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Expected { messages: [...] }." }, { status: 400 });
  }

  const temperature =
    typeof body.temperature === "number"
      ? Math.min(2, Math.max(0, body.temperature))
      : 0.2;

  let upstream: Response;
  try {
    upstream = await callOpenAI("/chat/completions", key, {
      model: CHAT_MODEL,
      messages,
      temperature,
      max_tokens: 700,
      stream: true,
      stream_options: { include_usage: true },
    });
  } catch {
    return Response.json({ error: "Could not reach OpenAI." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: await explainError(upstream) },
      { status: upstream.status },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (t: string, v: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify({ t, v }) + "\n"));

      const reader = upstream.body!.getReader();
      let buffer = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Server-sent events are separated by blank lines.
          const events = buffer.split("\n");
          buffer = events.pop() ?? "";

          for (const line of events) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;

            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) emit("delta", delta);
              if (json.usage) {
                emit("usage", {
                  inputTokens: json.usage.prompt_tokens ?? 0,
                  outputTokens: json.usage.completion_tokens ?? 0,
                });
              }
            } catch {
              /* partial JSON — the next chunk completes it */
            }
          }
        }
      } catch {
        emit("error", "The stream from OpenAI was interrupted.");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
