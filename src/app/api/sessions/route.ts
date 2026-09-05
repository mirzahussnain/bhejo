import { getAuthenticatedOwner } from "@/lib/auth/owner-context";
import { createOwnerSession } from "@/lib/remote-scan/session-service";

export async function POST(request: Request) {
  const owner = await getAuthenticatedOwner(request);
  if (!owner) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let title: string | undefined;
  let expiryHours: number | undefined;
  try {
    const body = (await request.json()) as { title?: string; expiryHours?: number };
    if (body && typeof body.title === "string") {
      title = body.title;
    }
    if (body && typeof body.expiryHours === "number") {
      expiryHours = body.expiryHours;
    }
  } catch {
    // Body is optional
  }

  try {
    const result = await createOwnerSession(owner.ownerId, title, expiryHours);
    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create session";
    return Response.json({ error: message }, { status: 500 });
  }
}

