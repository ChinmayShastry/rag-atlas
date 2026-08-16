import { OPENAI_BASE, explainError } from "@/app/lib/openai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Deliberately reads the header directly rather than via readKey(): this
  // route exists to check a key the visitor typed, so it must never silently
  // validate the deployment's own key and report success.
  const key = req.headers.get("x-openai-key")?.trim();
  if (!key) {
    return Response.json(
      { error: "No API key supplied. Reload and enter your key." },
      { status: 401 },
    );
  }

  if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(key)) {
    return Response.json(
      {
        error:
          "That doesn't look like an OpenAI key. They start with 'sk-' and are much longer.",
      },
      { status: 400 },
    );
  }

  try {
    // Cheapest possible authenticated call — costs nothing, proves the key works.
    const res = await fetch(`${OPENAI_BASE}/models/gpt-4o-mini`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!res.ok) {
      return Response.json({ error: await explainError(res) }, { status: res.status });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not reach OpenAI. Check your network connection." },
      { status: 502 },
    );
  }
}
