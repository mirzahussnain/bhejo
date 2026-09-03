import { getAuthenticatedOwner } from "@/lib/auth/owner-context";
import { getOwnerDocument } from "@/lib/remote-scan/session-service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const owner = await getAuthenticatedOwner(request);
  if (!owner) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const result = await getOwnerDocument(owner.ownerId, sessionId);

  if ("error" in result.body) {
    return Response.json(result.body, { status: result.status });
  }

  const document = result.body.document;
  return Response.json({
    document: {
      id: document.id,
      sessionId: document.sessionId,
      pageCount: document.pageCount,
      pages: document.pages.map((p) => ({
        id: p.id,
        pageNumber: p.pageNumber,
        mimeType: p.mimeType,
        byteSize: p.byteSize,
        sha256Checksum: p.sha256Checksum,
        downloadUrl: `/api/owner/sessions/${sessionId}/document/page/${p.id}`,
        createdAt: p.createdAt,
      })),
      createdAt: document.createdAt,
      completedAt: document.completedAt,
    },
  });
}
