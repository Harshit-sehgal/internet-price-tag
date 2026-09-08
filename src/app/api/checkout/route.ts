import { NextResponse } from "next/server";
import { getQuote, markQuoteStatus } from "@/lib/repo";
import { getViewer, demoViewer } from "@/lib/auth";
import { getPaymentProvider } from "@/lib/payments";
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

  let quoteId: string | undefined;
  try {
    const body = (await req.json()) as { quoteId?: string };
    quoteId = body.quoteId;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!quoteId) return NextResponse.json({ error: "quoteId_required" }, { status: 400 });

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

  const { getProfileById } = await import("@/lib/repo");
  const profile = await getProfileById(user.id);
  // Webhook still resolves the canonical handle from the DB; this is only for
  // provider-runner metadata and should never be a raw user id when possible.
  const checkoutHandle = profile?.handle ?? `user_${user.id.slice(0, 8)}`;

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
