import {
  CHAT_MODEL,
  callOpenAI,
  explainError,
  keyMissing,
  readKey,
} from "@/app/lib/openai";
import { LIMITS, validatePassages } from "@/app/lib/corpus";
import { clientId, rateLimit, tooMany } from "@/app/lib/ratelimit";
import { buildContext } from "@/app/lib/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JUDGE_SYSTEM = `You are a strict evaluator for a retrieval-augmented generation system.
You will be given CONTEXT passages, a QUESTION, and an ANSWER produced from them.

Score three axes from 0 to 100:

- faithfulness: is every factual claim in the ANSWER directly supported by the CONTEXT?
  Score 100 only if nothing is asserted that the CONTEXT does not state. Outside knowledge
  that happens to be true still counts against faithfulness — it was not retrieved.
  An honest "the context does not cover this" is fully faithful and scores high.
- relevance: does the ANSWER actually address the QUESTION that was asked?
- completeness: does the ANSWER use the relevant material that was present in the CONTEXT,
  rather than leaving supporting detail on the table?

List every claim in the ANSWER that the CONTEXT does not support in unsupported_claims,
quoting the answer directly. Return an empty array if there are none.
Keep each reason under 24 words and point at specifics.`;

const SCHEMA = {
  name: "rag_evaluation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      faithfulness: { type: "integer", description: "0-100" },
      faithfulness_reason: { type: "string" },
      relevance: { type: "integer", description: "0-100" },
      relevance_reason: { type: "string" },
      completeness: { type: "integer", description: "0-100" },
      completeness_reason: { type: "string" },
      unsupported_claims: { type: "array", items: { type: "string" } },
    },
    required: [
      "faithfulness",
      "faithfulness_reason",
      "relevance",
      "relevance_reason",
      "completeness",
      "completeness_reason",
      "unsupported_claims",
    ],
    additionalProperties: false,
  },
} as const;

const clamp = (n: unknown) =>
  Math.max(0, Math.min(100, Math.round(typeof n === "number" ? n : 0)));

export async function POST(req: Request) {
  const resolved = readKey(req);
  if (!resolved) return keyMissing();
  const { key, shared } = resolved;

  if (shared) {
    const verdict = rateLimit(clientId(req, "evaluate"), 40);
    if (!verdict.ok) return tooMany(verdict);
  }

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const answer = typeof body?.answer === "string" ? body.answer : "";

  if (!question || !answer || !Array.isArray(body?.passages)) {
    return Response.json(
      { error: "Expected { passages, question, answer }." },
      { status: 400 },
    );
  }
  if (question.length > LIMITS.maxQuestionChars) {
    return Response.json({ error: "Question too long." }, { status: 400 });
  }
  if (answer.length > 8000) {
    return Response.json({ error: "Answer too long to judge." }, { status: 400 });
  }
  if (shared) {
    const problem = validatePassages(body.passages);
    if (problem) return Response.json({ error: problem }, { status: 400 });
  }

  const context = buildContext(
    body.passages.map((p: { title?: string; text: string }) => ({
      title: p.title ?? "Document",
      text: p.text,
    })),
  );

  try {
    const res = await callOpenAI("/chat/completions", key, {
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        {
          role: "user",
          content: `CONTEXT:\n${context}\n\nQUESTION:\n${question}\n\nANSWER:\n${answer}`,
        },
      ],
      response_format: { type: "json_schema", json_schema: SCHEMA },
    });

    if (!res.ok) {
      return Response.json({ error: await explainError(res) }, { status: res.status });
    }

    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return Response.json({
      scores: {
        faithfulness: clamp(parsed.faithfulness),
        relevance: clamp(parsed.relevance),
        completeness: clamp(parsed.completeness),
        faithfulnessReason: parsed.faithfulness_reason ?? "",
        relevanceReason: parsed.relevance_reason ?? "",
        completenessReason: parsed.completeness_reason ?? "",
        unsupportedClaims: Array.isArray(parsed.unsupported_claims)
          ? parsed.unsupported_claims
          : [],
      },
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    });
  } catch {
    return Response.json(
      { error: "The judge response could not be parsed. Try again." },
      { status: 502 },
    );
  }
}
