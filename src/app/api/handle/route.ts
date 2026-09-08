import { NextResponse } from "next/server";
import { claimHandle, getViewer, demoViewer } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  // JSON-only: cross-origin form posts cannot produce this content type (§46 CSRF).
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  let user;
  try {
    ({ user } = await getViewer());
    if (!user) {
      const { isAuthConfigured } = await import("@/lib/auth");
      if (!isAuthConfigured) user = demoViewer().user;
    }
  } catch {
    return NextResponse.json({ error: "auth unavailable" }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  if (!rateLimit(`handle:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let handle = "";
  let next = "/";
  try {
    const body = (await req.json()) as { handle?: string; next?: string };
    handle = body.handle ?? "";
    next = body.next && body.next.startsWith("/") && !body.next.startsWith("//") ? body.next : "/";
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await claimHandle(user.id, handle);
  if (!result.ok) {
    return NextResponse.json({ error: "invalid_handle", reason: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, handle: result.handle, next });
}
