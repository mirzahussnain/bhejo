import { getAuthenticatedOwner } from "@/lib/auth/owner-context";
import { createOwnerSession } from "@/lib/remote-scan/session-service";

export async function POST(request: Request) {
  const owner = await getAuthenticatedOwner(request);
  if (!owner) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let title: string | undefined;
  try {
    const body = (await request.json()) as { title?: string };
    if (body && typeof body.title === "string") {
      title = body.title;
    }
  } catch {
    // Body is optional
  }

  const result = await createOwnerSession(owner.ownerId, title);
  return Response.json(result, { status: 201 });
}
