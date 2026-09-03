import { getAuthenticatedOwner } from "@/lib/auth/owner-context";
import { getOwnerSessionHistory } from "@/lib/remote-scan/session-service";

export async function GET(request: Request) {
  const owner = await getAuthenticatedOwner(request);
  if (!owner) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getOwnerSessionHistory(owner.ownerId);
  return Response.json(result.body, { status: result.status });
}
