import { hasServerKey } from "@/app/lib/openai";

export const dynamic = "force-dynamic";

/**
 * Tells the client whether this deployment can run without the visitor
 * supplying a key. Deliberately returns only a boolean — never the key.
 */
export async function GET() {
  return Response.json({ demoKeyAvailable: hasServerKey() });
}
