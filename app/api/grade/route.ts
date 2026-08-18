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

/**
 * Passage-level judgement for Agentic RAG.
 *
 *  - "grade" is the Corrective RAG step: score each retrieved passage before
 *    it is ever shown to the generator, so a bad retrieval can be caught and
 *    corrected rather than silently answered from.
 *  - "critique" runs after generation and asks whether the answer should ship
 *    at all. Distinct from evaluation, which scores an answer that has already
 *    been shown; this one decides whether to show it.
 */

const GRADE_SYSTEM = `You grade retrieved passages for a question-answering system, one at a time, before any answer is written.

For each passage choose:
- "correct": it contains information that directly helps answer the question.
- "ambiguous": it is on the right topic but does not actually contain the answer, or only touches it in passing.
- "incorrect": it is not relevant to this question. Being well written or interesting does not make it relevant.

Judge each passage on its own. Do not assume a passage is relevant because retrieval returned it — retrieval always returns something, and catching that is the entire point of this step.
Keep each reason under 18 words.`;

const GRADE_SCHEMA = {
  name: "passage_grades",
  strict: true,
  schema: {
    type: "object",
    properties: {
      grades: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer", description: "1-based passage number" },
            verdict: {
              type: "string",
              enum: ["correct", "ambiguous", "incorrect"],
            },
            reason: { type: "string" },
          },
          required: ["index", "verdict", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["grades"],
    additionalProperties: false,
  },
} as const;

const CRITIQUE_SYSTEM = `You are the last check before an answer is shown to a user. You did not write it.

Decide:
- "ship": every claim is supported by the passages and the answer addresses the question.
- "revise": mostly sound but overreaches somewhere — an unsupported detail, a confident tone the evidence does not justify, or a missing caveat.
- "withhold": the answer asserts things the passages do not support, or answers a question the passages cannot actually answer.

List the specific problems you found. An honest "the context does not cover this" is a good answer and should ship.
Keep each issue under 20 words.`;

const CRITIQUE_SCHEMA = {
  name: "answer_critique",
  strict: true,
  schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["ship", "revise", "withhold"] },
      reason: { type: "string" },
      issues: { type: "array", items: { type: "string" } },
    },
    required: ["verdict", "reason", "issues"],
    additionalProperties: false,
  },
} as const;

export async function POST(req: Request) {
  const resolved = readKey(req);
  if (!resolved) return keyMissing();
  const { key, shared } = resolved;

  if (shared) {
    const verdict = rateLimit(clientId(req, "grade"), 40);
    if (!verdict.ok) return tooMany(verdict);
  }

  const body = await req.json().catch(() => null);
  const task: "grade" | "critique" =
    body?.task === "critique" ? "critique" : "grade";
  const question =
    typeof body?.question === "string" ? body.question.trim() : "";
  const answer = typeof body?.answer === "string" ? body.answer : "";

  if (!question || !Array.isArray(body?.passages)) {
    return Response.json(
      { error: "Expected { question, passages }." },
      { status: 400 },
    );
  }
  if (question.length > LIMITS.maxQuestionChars) {
    return Response.json({ error: "Question too long." }, { status: 400 });
  }
  if (task === "critique" && !answer) {
    return Response.json({ error: "An answer is required." }, { status: 400 });
  }
  if (answer.length > 8000) {
    return Response.json({ error: "Answer too long." }, { status: 400 });
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

  const isCritique = task === "critique";
  const userContent = isCritique
    ? `CONTEXT PASSAGES:\n${context}\n\nQUESTION:\n${question}\n\nANSWER TO CHECK:\n${answer}`
    : `QUESTION:\n${question}\n\nPASSAGES:\n${context}`;

  try {
    const res = await callOpenAI("/chat/completions", key, {
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: isCritique ? CRITIQUE_SYSTEM : GRADE_SYSTEM },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: isCritique ? CRITIQUE_SCHEMA : GRADE_SCHEMA,
      },
    });

    if (!res.ok) {
      return Response.json({ error: await explainError(res) }, { status: res.status });
    }

    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    const usage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };

    if (isCritique) {
      return Response.json({
        verdict: ["ship", "revise", "withhold"].includes(parsed.verdict)
          ? parsed.verdict
          : "revise",
        reason: parsed.reason ?? "",
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        usage,
      });
    }

    const grades = Array.isArray(parsed.grades) ? parsed.grades : [];
    return Response.json({
      grades: grades.map(
        (g: { index?: number; verdict?: string; reason?: string }) => ({
          index: Number(g.index) || 0,
          verdict: ["correct", "ambiguous", "incorrect"].includes(g.verdict ?? "")
            ? g.verdict
            : "ambiguous",
          reason: g.reason ?? "",
        }),
      ),
      usage,
    });
  } catch {
    return Response.json(
      { error: "The grader response could not be parsed. Try again." },
      { status: 502 },
    );
  }
}
