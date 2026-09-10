import { NextResponse } from "next/server";
import { createAuthClient, isAuthConfigured } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { sanitizeInternalPath } from "@/lib/navigation";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const safeNext = sanitizeInternalPath(url.searchParams.get("next"));

  if (!isAuthConfigured) return NextResponse.redirect(new URL("/login", url.origin));
  if (!code) return NextResponse.redirect(new URL("/login", url.origin));

  const client = await createAuthClient();
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  track("login_completed", { provider: "oauth" });
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
