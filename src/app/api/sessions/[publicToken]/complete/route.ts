import { finalizeSession } from "@/lib/remote-scan/session-service";

interface RouteParams {
  params: Promise<{ publicToken: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { publicToken } = await params;
  if (!publicToken) {
    return Response.json({ error: "Invalid token" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const recipientToken = authHeader.slice(7);

  let body: { pageIds?: unknown };
  try {
    body = (await request.json()) as { pageIds?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.pageIds)) {
    return Response.json({ error: "pageIds must be an array" }, { status: 400 });
  }

  const result = await finalizeSession({
    publicToken,
    recipientToken,
    clientPageIds: body.pageIds as string[],
  });

  return Response.json(result.body, { status: result.status });
}
