import { OPENAI_BASE, explainError, sanitiseBase } from "@/app/lib/openai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Deliberately reads the header directly rather than via readConfig(): this
  // route exists to check a key the visitor typed, so it must never silently
  // validate the deployment's own key and report success.
  const key = req.headers.get("x-openai-key")?.trim();
  if (!key) {
    return Response.json(
      { error: "No API key supplied. Reload and enter your key." },
      { status: 401 },
    );
  }

  // Sanitised for the same reason the other routes sanitise it: this handler
  // makes a server-side request to whatever URL it is handed.
  const supplied = req.headers.get("x-openai-base");
  if (supplied?.trim() && !sanitiseBase(supplied)) {
    return Response.json(
      { error: "That base URL is not usable. It must be an https:// address (or localhost)." },
      { status: 400 },
    );
  }
  const base = sanitiseBase(supplied) ?? OPENAI_BASE;
  const isOpenAI = base.startsWith(OPENAI_BASE);

  // Only OpenAI keys have a predictable shape; other providers vary widely.
  if (isOpenAI && !/^sk-[A-Za-z0-9_\-]{20,}$/.test(key)) {
    return Response.json(
      {
        error:
          "That doesn't look like an OpenAI key. They start with 'sk-' and are much longer.",
      },
      { status: 400 },
    );
  }

  try {
    // Cheapest possible authenticated call — costs nothing, proves the key
    // works, and every OpenAI-compatible API exposes it.
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!res.ok) {
      return Response.json({ error: await explainError(res) }, { status: res.status });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Could not reach that endpoint. Check the base URL and your network connection." },
      { status: 502 },
    );
  }
}
