import { listMarket, listRecentSales, marketValueCents, seedDemoMarket } from "@/lib/repo";
import { money } from "@/lib/game.ts";
import { SearchBar } from "@/components/SearchBar";
import { MarketTable } from "@/components/MarketTable";
import { ActivityFeed } from "@/components/ActivityFeed";

// Demo seed only runs when no production datastore is configured (§41).
seedDemoMarket([
  { domain: "google.com", holderHandle: "@indexfund", priceCents: 428000 },
  { domain: "x.com", holderHandle: "@timeline", priceCents: 231000 },
  { domain: "openai.com", holderHandle: "@latentspace", priceCents: 94000 },
  { domain: "apple.com", holderHandle: "@onebutton", priceCents: 72000 },
  { domain: "reddit.com", holderHandle: "@upvote", priceCents: 43000 },
  { domain: "linear.app", holderHandle: "@shipfast", priceCents: 10500 },
]);

export const dynamic = "force-dynamic";

export default async function Home() {
  const [rows, sales, value] = await Promise.all([
    listMarket(25),
    listRecentSales(8),
    marketValueCents(),
  ]);

  return (
    <div className="stack-lg">
      <section className="stack">
        <p className="eyebrow">The Internet Price Tag</p>
        <h1 className="display display-hero">How much is the internet worth?</h1>
        <p className="muted" style={{ maxWidth: 640, margin: 0 }}>
          Every domain has a price now. Somebody holds each tag — until someone pays the next
          price and takes it. <strong>Not the actual domain.</strong> Just the tag.
        </p>
        <SearchBar />
      </section>

      <section className="section-rule stack">
        <div className="row-split">
          <h2 className="display display-section">The Market</h2>
          <p className="small muted" style={{ margin: 0 }}>
            THE INTERNET IS CURRENTLY WORTH <span className="money money-up">{money(value)}</span>*
          </p>
        </div>
        <MarketTable rows={rows} />
        <p className="small muted" style={{ margin: 0 }}>
          * according to this ridiculous website. Ranked by current symbolic price.
        </p>
      </section>

      <section className="section-rule stack">
        <h2 className="display display-section">Recent Takeovers</h2>
        <ActivityFeed sales={sales} />
      </section>

      <section className="notice">
        <strong>What am I buying?</strong> The right for this website to publicly show your handle
        on a domain&apos;s price tag until somebody pays more and takes it. No domain registration,
        no DNS, no equity, no affiliation. Previous holders get nothing. That&apos;s the game.
      </section>
    </div>
  );
}
