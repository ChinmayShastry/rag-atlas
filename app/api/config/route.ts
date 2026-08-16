import { hasServerKey } from "@/app/lib/openai";

export const dynamic = "force-dynamic";

/**
 * Deployment health check: confirms whether OPENAI_API_KEY reached the
 * running server, which is otherwise awkward to verify from outside.
 *
 * The UI does NOT call this. It receives the same boolean from the server
 * render instead, so that first paint never depends on a request that a
 * privacy extension might block. Returns only a boolean — never the key.
 */
export async function GET() {
  return Response.json({ demoKeyAvailable: hasServerKey() });
}
