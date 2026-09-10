// CTA + bio validation (§7) and /api/profile contract.
import assert from "node:assert/strict";
import test from "node:test";
import { validateCta, validateBio } from "../../src/lib/cta.ts";

test("cta: requires both label and url when either is provided", () => {
  assert.deepEqual(validateCta("Visit my site", ""), { ok: false, reason: "url_required" });
  assert.deepEqual(validateCta("", "https://x.com"), { ok: false, reason: "label_required" });
  assert.deepEqual(validateCta("", ""), { ok: false, reason: "label_required" });
});

test("cta: https-only, full URL required", () => {
  assert.equal(validateCta("Go", "http://x.com").ok, false);
  assert.equal(validateCta("Go", "ftp://x.com").ok, false);
  assert.equal(validateCta("Go", "javascript:alert(1)").ok, false);
  assert.equal(validateCta("Go", "notaurl").ok, false);
  const ok = validateCta("Go", "https://example.com");
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.url, "https://example.com/");
});

test("cta: label and url length caps", () => {
  assert.equal(validateCta("x".repeat(41), "https://example.com").ok, false);
  assert.equal(validateCta("ok", "https://example.com/" + "a".repeat(300)).ok, false);
});

test("cta: whitespace trimmed", () => {
  const ok = validateCta("  Visit my startup  ", "  https://example.com  ");
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.label, "Visit my startup");
});

test("cta: rejects links back into Priced itself", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://priced.game";
  try {
    assert.equal(validateCta("Home", "https://priced.game").ok, false);
    assert.equal(validateCta("Home", "https://priced.game/domain/x.com").ok, false);
    assert.ok(validateCta("Elsewhere", "https://example.com").ok);
  } finally {
    delete process.env.NEXT_PUBLIC_APP_URL;
  }
});

test("bio: null, empty and trimmed-long inputs", () => {
  assert.deepEqual(validateBio(null), { ok: true, bio: null });
  assert.deepEqual(validateBio(""), { ok: true, bio: null });
  assert.deepEqual(validateBio("  hi  "), { ok: true, bio: "hi" });
  assert.equal(validateBio("x".repeat(281)).ok, false);
  assert.deepEqual(validateBio("x".repeat(280)), { ok: true, bio: "x".repeat(280) });
});
