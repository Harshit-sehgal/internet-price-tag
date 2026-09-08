import { expect, test } from "@playwright/test";
import { handleFor, uniqueDomain } from "./helpers";

test.describe("full takeover loop (demo mode)", () => {
  test("search → claim → quote → mock payment → receipt → share", async ({ page }) => {
    const domain = uniqueDomain();
    await handleFor(page.request); // demo buyer needs a handle before quoting

    // Search anonymously.
    await page.goto("/");
    await page.getByRole("search").getByLabel("Domain").fill(domain);
    await page.getByRole("search").getByRole("button", { name: "Price it" }).click();
    await expect(page).toHaveURL(new RegExp(`/domain/${domain}$`));

    // Unclaimed state and $5 claim.
    await expect(page.getByText("Nobody holds this tag yet.")).toBeVisible();
    await page.getByRole("button", { name: /Claim for \$5/ }).click();

    // Server-authoritative quote confirmation page.
    await expect(page).toHaveURL(/\/takeover\//);
    await expect(page.getByText("First claim — you set the opening price.")).toBeVisible();
    await expect(page.getByText("You are buying:")).toBeVisible();

    // Demo checkout (drives the real signed-webhook path).
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect(page).toHaveURL(/\/checkout\/mock/);
    await expect(page.getByText("Simulated payment")).toBeVisible();
    await page.getByRole("button", { name: "Pay (succeed)" }).click();

    // Receipt/share destination.
    await expect(page).toHaveURL(/\/success\//, { timeout: 10_000 });
    await expect(page.getByText("Held by @smoketest")).toBeVisible();
    await expect(page.getByText("symbolic holder status only — not the actual domain")).toBeVisible();

    // Share artifacts (§36).
    await expect(page.getByRole("button", { name: new RegExp(`Post on X — I just took ${domain}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy post" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();

    // Market now shows the new holder; challenger loop is visible.
    await page.getByRole("link", { name: "Defend it — view the tag" }).click();
    await expect(page).toHaveURL(new RegExp(`/domain/${domain}$`));
    await expect(page.getByText("@smoketest").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Take it for \$10/ })).toBeVisible();
  });

  test("declined payment keeps the tag unclaimed", async ({ page }) => {
    const domain = uniqueDomain();
    await handleFor(page.request);

    await page.goto(`/domain/${domain}`);
    await page.getByRole("button", { name: /Claim for \$5/ }).click();
    await expect(page).toHaveURL(/\/takeover\//);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await expect(page).toHaveURL(/\/checkout\/mock/);

    await page.getByRole("button", { name: "Simulate decline" }).click();
    await expect(page.getByText("Payment declined (simulated). No money moved.")).toBeVisible();

    // No sale must exist: domain stays unclaimed.
    await page.goto(`/domain/${domain}`);
    await expect(page.getByText("Nobody holds this tag yet.")).toBeVisible();
  });
});

test.describe("mobile viewport (§32)", () => {
  test("domain page surfaces holder, price and CTA without hunting", async ({ page }) => {
    // Runs in the Pixel 7 project; the desktop project also exercises this page.
    test.skip(page.viewportSize()?.width !== 412, "mobile-only check");
    await page.goto("/domain/openai.com");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("openai.com");
    await expect(page.getByText("@latentspace").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Take it for \$949\.40/ })).toBeVisible();
    // CTA is comfortably within the first two viewports.
    const cta = page.getByRole("button", { name: /Take it for \$949\.40/ });
    await expect(cta).toBeInViewport({ ratio: 0.5 });
  });
});
