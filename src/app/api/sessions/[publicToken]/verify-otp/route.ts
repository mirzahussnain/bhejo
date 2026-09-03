import { verifySessionOtp } from "@/lib/remote-scan/session-service";

interface RouteParams {
  params: Promise<{ publicToken: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { publicToken } = await params;
  if (!publicToken) {
    return Response.json({ success: false, error: "invalid_token" }, { status: 400 });
  }

  let body: { otp?: unknown };
  try {
    body = (await request.json()) as { otp?: unknown };
  } catch {
    return Response.json({ success: false, error: "invalid_body" }, { status: 400 });
  }

  const otp = typeof body.otp === "string" ? body.otp : "";
  const result = await verifySessionOtp(publicToken, otp);
  return Response.json(result.body, { status: result.status });
}
