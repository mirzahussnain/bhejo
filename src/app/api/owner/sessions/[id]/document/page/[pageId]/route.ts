import { getAuthenticatedOwner } from "@/lib/auth/owner-context";
import { getOwnerPageBinary } from "@/lib/remote-scan/session-service";

interface RouteParams {
  params: Promise<{ id: string; pageId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const owner = await getAuthenticatedOwner(request);
  if (!owner) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId, pageId } = await params;
  const result = await getOwnerPageBinary(owner.ownerId, sessionId, pageId);

  if (result.error || !result.buffer) {
    return Response.json({ error: result.error || "Failed to load page" }, { status: result.status });
  }

  return new Response(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": result.buffer.length.toString(),
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "Content-Disposition": `inline; filename="page_${pageId}.jpg"`,
    },
  });
}
