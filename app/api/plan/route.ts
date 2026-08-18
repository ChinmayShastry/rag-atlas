import {
  CHAT_MODEL,
  callOpenAI,
  explainError,
  keyMissing,
  readKey,
} from "@/app/lib/openai";
import { LIMITS } from "@/app/lib/corpus";
import { clientId, rateLimit, tooMany } from "@/app/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Query planning for multi-hop retrieval. Two short structured calls:
 *
 *  - "decompose" splits a question into the lookups it actually requires.
 *  - "rewrite" turns a sub-question that referred to an earlier answer into a
 *    standalone one, now that the earlier answer exists. This is the step that
 *    makes a chain a chain rather than three independent searches.
 */

const DECOMPOSE_SYSTEM = `You plan retrieval for a question-answering system that searches a small document collection.

Break the user's question into the minimum sequence of sub-questions needed to answer it.

Rules:
- Most questions need only one sub-question. Do not invent steps that are not required.
- Use more than one only when a later lookup genuinely depends on the answer to an earlier one — for example when the question refers to something by description, and you must first find what that something is before you can look up facts about it.
- Each sub-question must target exactly ONE fact. Keep it narrow. "What cone does she glaze for?" is a good sub-question; "What is her pottery like?" is not, because it invites a broad answer that may accidentally include later steps.
- Order matters. Each sub-question may depend only on those before it.
- Mark depends_on_previous true when the sub-question cannot be searched for until an earlier answer is known.
- A dependent sub-question MUST be phrased so the dependency is explicit, referring to the earlier result rather than to the original subject. Write "What temperature does the cone found in step 1 correspond to?" — never restate the user's original question, and never name the subject the first step was about. It will be rewritten into a concrete query once the earlier answer exists.
- Never produce more than 3 sub-questions.
- Each sub-question must be a search query, not an instruction.`;

const DECOMPOSE_SCHEMA = {
  name: "query_plan",
  strict: true,
  schema: {
    type: "object",
    properties: {
      reasoning: {
        type: "string",
        description: "One short sentence on why this split is required.",
      },
      sub_questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            depends_on_previous: { type: "boolean" },
          },
          required: ["question", "depends_on_previous"],
          additionalProperties: false,
        },
      },
    },
    required: ["reasoning", "sub_questions"],
    additionalProperties: false,
  },
} as const;

const REWRITE_SYSTEM = `You rewrite a planned sub-question into a standalone search query, using facts already established by earlier steps.

Rules:
- Replace any indirect reference with the concrete fact from the findings.
- Keep it short and searchable. Output a question, not a sentence of explanation.
- If the findings do not resolve the reference, return the sub-question unchanged.`;

const REWRITE_SCHEMA = {
  name: "rewritten_question",
  strict: true,
  schema: {
    type: "object",
    properties: {
      question: { type: "string" },
      resolved: {
        type: "boolean",
        description: "True if an earlier finding was actually substituted in.",
      },
    },
    required: ["question", "resolved"],
    additionalProperties: false,
  },
} as const;

const ROUTE_SYSTEM = `You are the router in front of a retrieval system. Decide how a question should be handled before any searching happens.

Choose exactly one:
- "retrieve": the answer depends on the indexed documents. This is the default whenever the question touches their subject matter.
- "direct": the model can answer without the documents — greetings, arithmetic, questions about how this system itself works, or definitions of general terms that need no source.
- "reject": the question is about something the documents do not cover and that the system should not answer from memory, because an unsourced answer would be indistinguishable from a hallucination.

Prefer "retrieve" when uncertain. Routing a document question to "direct" is the expensive mistake: it produces a confident answer with no evidence behind it.
Give a reason under 22 words.`;

const ROUTE_SCHEMA = {
  name: "route_decision",
  strict: true,
  schema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["retrieve", "direct", "reject"] },
      reason: { type: "string" },
    },
    required: ["decision", "reason"],
    additionalProperties: false,
  },
} as const;

const CORRECT_SYSTEM = `Retrieval for a question returned poor results. Rewrite the search query so it has a better chance.

Techniques, in rough order of usefulness:
- Replace conversational phrasing with the vocabulary a source document would actually use.
- Make an implicit subject explicit.
- Split a compound question down to its most specific part.
- Add distinguishing terms that separate this topic from near neighbours.

Return only the rewritten query, and name the technique you applied in a few words.`;

const CORRECT_SCHEMA = {
  name: "corrected_query",
  strict: true,
  schema: {
    type: "object",
    properties: {
      question: { type: "string" },
      strategy: { type: "string" },
    },
    required: ["question", "strategy"],
    additionalProperties: false,
  },
} as const;

export async function POST(req: Request) {
  const resolved = readKey(req);
  if (!resolved) return keyMissing();
  const { key, shared } = resolved;

  if (shared) {
    const verdict = rateLimit(clientId(req, "plan"), 40);
    if (!verdict.ok) return tooMany(verdict);
  }

  const body = await req.json().catch(() => null);
  const TASKS = ["decompose", "rewrite", "route", "correct"] as const;
  type Task = (typeof TASKS)[number];
  const task: Task = TASKS.includes(body?.task) ? body.task : "decompose";
  const question =
    typeof body?.question === "string" ? body.question.trim() : "";

  if (!question) {
    return Response.json({ error: "A question is required." }, { status: 400 });
  }
  if (question.length > LIMITS.maxQuestionChars) {
    return Response.json(
      { error: `Questions are limited to ${LIMITS.maxQuestionChars} characters.` },
      { status: 400 },
    );
  }

  const findings: string =
    typeof body?.findings === "string" ? body.findings.slice(0, 2000) : "";
  // Document titles only — used so the router knows what this corpus covers.
  const corpusSummary: string =
    typeof body?.corpusSummary === "string" ? body.corpusSummary.slice(0, 400) : "";

  const SYSTEMS: Record<Task, string> = {
    decompose: DECOMPOSE_SYSTEM,
    rewrite: REWRITE_SYSTEM,
    route: ROUTE_SYSTEM,
    correct: CORRECT_SYSTEM,
  };
  const SCHEMAS = {
    decompose: DECOMPOSE_SCHEMA,
    rewrite: REWRITE_SCHEMA,
    route: ROUTE_SCHEMA,
    correct: CORRECT_SCHEMA,
  } as const;

  const userContent =
    task === "rewrite"
      ? `EARLIER FINDINGS:\n${findings}\n\nSUB-QUESTION TO REWRITE:\n${question}`
      : task === "route"
        ? `INDEXED DOCUMENTS: ${corpusSummary || "unknown"}\n\nQUESTION: ${question}`
        : task === "correct"
          ? `ORIGINAL QUERY: ${question}\n\nWHY IT FAILED:\n${findings || "The retrieved passages were judged irrelevant."}`
          : question;

  try {
    const res = await callOpenAI("/chat/completions", key, {
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEMS[task] },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: SCHEMAS[task],
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

    if (task === "rewrite") {
      return Response.json({
        question: String(parsed.question ?? question).slice(0, LIMITS.maxQuestionChars),
        resolved: !!parsed.resolved,
        usage,
      });
    }

    if (task === "route") {
      return Response.json({
        decision: ["retrieve", "direct", "reject"].includes(parsed.decision)
          ? parsed.decision
          : "retrieve",
        reason: parsed.reason ?? "",
        usage,
      });
    }

    if (task === "correct") {
      return Response.json({
        question: String(parsed.question ?? question).slice(0, LIMITS.maxQuestionChars),
        strategy: parsed.strategy ?? "",
        usage,
      });
    }

    const subs = Array.isArray(parsed.sub_questions) ? parsed.sub_questions : [];
    return Response.json({
      reasoning: parsed.reasoning ?? "",
      subQuestions: subs.slice(0, 3).map((s: { question?: string; depends_on_previous?: boolean }) => ({
        question: String(s.question ?? "").slice(0, LIMITS.maxQuestionChars),
        dependsOnPrevious: !!s.depends_on_previous,
      })),
      usage,
    });
  } catch {
    return Response.json(
      { error: "The planner response could not be parsed. Try again." },
      { status: 502 },
    );
  }
}
