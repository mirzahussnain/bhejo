import { getAuthenticatedOwner } from "@/lib/auth/owner-context";
import { markNotificationAsRead } from "@/lib/remote-scan/session-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const owner = await getAuthenticatedOwner(request);
  if (!owner) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notificationId } = await params;
  const result = await markNotificationAsRead(owner.ownerId, notificationId);
  return Response.json(result.body, { status: result.status });
}
