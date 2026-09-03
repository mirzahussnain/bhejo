import { processPageUpload } from "@/lib/remote-scan/session-service";

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

  // Pre-check Content-Length header to avoid buffering oversized requests
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > 10 * 1024 * 1024 + 8192) {
    return Response.json({ error: "Payload exceeds maximum allowed size (10MB)" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const pageId = formData.get("pageId");
  const pageNumberRaw = formData.get("pageNumber");
  const checksum = formData.get("checksum");
  const correctionFallbackRaw = formData.get("correctionFallback");
  const file = formData.get("file");

  if (
    typeof pageId !== "string" ||
    typeof checksum !== "string" ||
    !(file instanceof Blob)
  ) {
    return Response.json({ error: "Invalid upload parameters" }, { status: 400 });
  }

  const pageNumber = Number.parseInt(String(pageNumberRaw), 10);
  if (Number.isNaN(pageNumber)) {
    return Response.json({ error: "Invalid page number" }, { status: 400 });
  }

  // Enforce size limit on Blob BEFORE buffering into memory
  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Page file exceeds maximum allowed size (10MB)" }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const result = await processPageUpload({
    publicToken,
    recipientToken,
    pageId,
    pageNumber,
    checksum,
    correctionFallback: correctionFallbackRaw === "true",
    fileBuffer,
  });

  return Response.json(result.body, { status: result.status });
}
