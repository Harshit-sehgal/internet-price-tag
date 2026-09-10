import { NextResponse } from "next/server";
import { createAuthClient, isAuthConfigured } from "@/lib/auth";
import { persistAnalyticsEvent } from "@/lib/analytics-server";
import { sanitizeInternalPath } from "@/lib/navigation";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const safeNext = sanitizeInternalPath(url.searchParams.get("next"));

  if (!isAuthConfigured) return NextResponse.redirect(new URL("/login", url.origin));
  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(safeNext)}`, url.origin));
  }

  const client = await createAuthClient();
  if (tokenHash) {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: (otpType as "magiclink" | "email" | "recovery" | "email_change") ?? "magiclink",
    });
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
    }
    await persistAnalyticsEvent({ event: "login_completed", props: { provider: "magic_link" } });
    return NextResponse.redirect(new URL(safeNext, url.origin));
  }

  const { error } = await client.auth.exchangeCodeForSession(code!);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  await persistAnalyticsEvent({ event: "login_completed", props: { provider: "oauth" } });
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
