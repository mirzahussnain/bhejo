import { getAuthenticatedOwner } from "@/lib/auth/owner-context";
import {
  cancelOwnerSession,
  getOwnerSessionDetail,
} from "@/lib/remote-scan/session-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const owner = await getAuthenticatedOwner(request);
  if (!owner) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const result = await getOwnerSessionDetail(owner.ownerId, sessionId);
  return Response.json(result.body, { status: result.status });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const owner = await getAuthenticatedOwner(request);
  if (!owner) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const result = await cancelOwnerSession(owner.ownerId, sessionId);
  return Response.json(result.body, { status: result.status });
}
