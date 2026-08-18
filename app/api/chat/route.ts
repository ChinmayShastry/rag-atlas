import {
  CHAT_MODEL,
  callOpenAI,
  explainError,
  keyMissing,
  readKey,
} from "@/app/lib/openai";
import { LIMITS, validatePassages } from "@/app/lib/corpus";
import { clientId, rateLimit, tooMany } from "@/app/lib/ratelimit";
import {
  BASELINE_SYSTEM_PROMPT,
  HYDE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
  buildContext,
  buildUserMessage,
} from "@/app/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Builds and sends the prompt itself rather than accepting a caller-supplied
 * `messages` array. That distinction matters: when the deployment's shared key
 * is in use, this endpoint must not be usable as a general chat proxy, so the
 * caller may only choose a question and a set of passages that are provably
 * excerpts of the bundled corpus.
 *
 * Streams back newline-delimited JSON:
 *   {"t":"delta","v":"..."}   {"t":"usage","v":{...}}   {"t":"error","v":"..."}
 */
export async function POST(req: Request) {
  const resolved = readKey(req);
  if (!resolved) return keyMissing();
  const { key, shared } = resolved;

  if (shared) {
    const verdict = rateLimit(clientId(req, "chat"), 40);
    if (!verdict.ok) return tooMany(verdict);
  }

  const body = await req.json().catch(() => null);
  const mode: "rag" | "baseline" | "hyde" =
    body?.mode === "baseline" || body?.mode === "hyde" ? body.mode : "rag";
  const question = typeof body?.question === "string" ? body.question.trim() : "";

  if (!question) {
    return Response.json({ error: "A question is required." }, { status: 400 });
  }
  if (question.length > LIMITS.maxQuestionChars) {
    return Response.json(
      { error: `Questions are limited to ${LIMITS.maxQuestionChars} characters.` },
      { status: 400 },
    );
  }

  const temperature =
    typeof body?.temperature === "number"
      ? Math.min(2, Math.max(0, body.temperature))
      : 0.2;

  let messages: { role: string; content: string }[];

  if (mode === "baseline" || mode === "hyde") {
    messages = [
      {
        role: "system",
        content: mode === "hyde" ? HYDE_SYSTEM_PROMPT : BASELINE_SYSTEM_PROMPT,
      },
      { role: "user", content: question },
    ];
  } else {
    // Only enforce corpus membership for the shared key. A visitor paying with
    // their own key may point the pipeline at whatever they like.
    if (shared) {
      const problem = validatePassages(body?.passages);
      if (problem) return Response.json({ error: problem }, { status: 400 });
    }

    const passages = Array.isArray(body?.passages) ? body.passages : [];
    if (passages.length === 0) {
      return Response.json({ error: "No passages supplied." }, { status: 400 });
    }

    const context = buildContext(
      passages.map((p: { title?: string; text: string }) => ({
        title: p.title ?? "Document",
        text: p.text,
      })),
    );

    messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(context, question) },
    ];
  }

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
