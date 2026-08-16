import ClientApp from "./components/ClientApp";
import { hasServerKey } from "./lib/openai";

// Read per request rather than at build time, so toggling the environment
// variable in the host's dashboard takes effect without a code change.
export const dynamic = "force-dynamic";

export default function Page() {
  // Resolved on the server and handed to the client as a plain boolean. The
  // key itself never leaves the server — only whether one exists.
  return <ClientApp demoKeyAvailable={hasServerKey()} />;
}
