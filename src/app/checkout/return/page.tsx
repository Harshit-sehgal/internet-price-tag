import Link from "next/link";
import { getQuote } from "@/lib/repo";
import { money } from "@/lib/game.ts";

export const dynamic = "force-dynamic";

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CheckoutReturnPage({ searchParams }: Params) {
  const sp = await searchParams;
  const quoteId = typeof sp.quote_id === "string" ? sp.quote_id : null;
  const quote = quoteId ? await getQuote(quoteId) : null;

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <p className="eyebrow">Payment return</p>
      <h1 className="display display-section">
        {quote?.status === "consumed" ? "You hold the tag." : "Finalizing…"}
      </h1>
      <p className="muted">
        {quote?.status === "consumed"
          ? "Your payment settled and the takeover is recorded."
          : "We never treat this redirect as proof of payment. The signed webhook finalizes your takeover — give it a few seconds, then check the domain page."}
      </p>
      {quote ? (
        <p className="small muted">
          {quote.domain} · {money(quote.nextPriceCents)} · quote status: <span className="mono">{quote.status}</span>
        </p>
      ) : null}
      <div className="row-split">
        {quote ? (
          <Link href={`/domain/${quote.domain}`} className="btn">
            Check {quote.domain}
          </Link>
        ) : (
          <Link href="/" className="btn">Back to the market</Link>
        )}
      </div>
    </div>
  );
}
