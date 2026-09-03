import { getPublicSessionInfo } from "@/lib/remote-scan/session-service";

interface RouteParams {
  params: Promise<{ publicToken: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { publicToken } = await params;
  const result = await getPublicSessionInfo(publicToken);
  return Response.json(result.body, { status: result.status });
}
