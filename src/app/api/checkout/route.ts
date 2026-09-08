import { NextResponse } from "next/server";
import { getQuote, markQuoteStatus } from "@/lib/repo";
import { getViewer, demoViewer } from "@/lib/auth";
import { getPaymentProvider } from "@/lib/payments";
import { verifyTurnstile } from "@/lib/turnstile";
import { rateLimit } from "@/lib/ratelimit";
import { track } from "@/lib/analytics";

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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`checkout:${user.id}`, 6, 60_000) && rateLimit(`checkout:ip:${ip}`, 12, 60_000);
  if (!rl) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  // Suspended buyers can still reach this endpoint after the quote was created;
  // enforce here too so the provider never receives a tainted checkout.
  const { getProfileById: getProfileForCheckout } = await import("@/lib/repo");
  const viewerProfile = await getProfileForCheckout(user.id);
  if (viewerProfile?.suspendedAt) {
    return NextResponse.json({ code: "SUSPENDED", error: "account suspended" }, { status: 403 });
  }

  let quoteId: string | undefined;
  let turnstileToken: unknown;
  try {
    const body = (await req.json()) as { quoteId?: string; turnstileToken?: unknown };
    quoteId = body.quoteId;
    turnstileToken = body.turnstileToken;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!quoteId) return NextResponse.json({ error: "quoteId_required" }, { status: 400 });

  // Bot protection (§45): fail closed when Turnstile is configured.
  const turnstile = await verifyTurnstile(turnstileToken, ip === "unknown" ? null : ip);
  if (!turnstile.ok) {
    track("checkout_blocked_bot", { reason: turnstile.reason });
    return NextResponse.json({ error: "bot_check_failed", detail: turnstile.reason }, { status: 403 });
  }

  const quote = await getQuote(quoteId);
  if (!quote) return NextResponse.json({ error: "unknown_quote" }, { status: 404 });
  if (quote.buyerUserId !== user.id) return NextResponse.json({ error: "not_your_quote" }, { status: 403 });
  if (quote.status !== "active" && quote.status !== "checkout_created") {
    return NextResponse.json({ error: `quote_${quote.status}` }, { status: 409 });
  }
  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    await markQuoteStatus(quote.id, "expired");
    return NextResponse.json({ error: "quote_expired" }, { status: 409 });
  }

  // Reuse the profile just fetched above.
  const checkoutHandle = viewerProfile?.handle ?? `user_${user.id.slice(0, 8)}`;

  const provider = getPaymentProvider();
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  try {
    const checkout = await provider.createCheckout({
      quoteId: quote.id,
      domain: quote.domain,
      buyerUserId: user.id,
      buyerHandle: checkoutHandle,
      amountCents: quote.nextPriceCents,
      successUrl: `${base}/checkout/return?quote_id=${quote.id}`,
      cancelUrl: `${base}/domain/${quote.domain}?checkout=cancelled`,
    });
    await markQuoteStatus(quote.id, "checkout_created");
    track("checkout_started", { domain: quote.domain, provider: provider.name });
    return NextResponse.json({ checkoutUrl: checkout.checkoutUrl, providerPaymentId: checkout.providerPaymentId });
  } catch (e) {
    return NextResponse.json(
      { error: "checkout_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
