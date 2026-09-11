import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDomain, isHandleAllowed, isHandleValid, requireEligibleDomain } from "./domains.ts";

test("normalizes URLs to canonical eligible domains", () => {
  const r = evaluateDomain("HTTPS://WWW.OpenAI.com/blog/?x=1");
  assert.equal(r.canonicalDomain, "openai.com");
  assert.equal(r.eligible, true);
});

test("strips trailing dots and fragments", () => {
  assert.equal(evaluateDomain("openai.com./#frag").canonicalDomain, "openai.com");
  assert.equal(evaluateDomain("example.io:8443/path").canonicalDomain, "example.io");
});

test("rejects empty and malformed input", () => {
  assert.equal(evaluateDomain("   ").reason, "empty");
  assert.equal(evaluateDomain("not a domain").reason, "malformed");
  assert.equal(evaluateDomain("example..com").reason, "malformed");
  assert.equal(evaluateDomain("-bad.com").reason, "malformed");
  assert.equal(evaluateDomain("a.b").reason, "malformed");
  assert.equal(evaluateDomain("nice.bcd").reason, "unsupported_suffix");
});

test("rejects IPs, ports and localhost", () => {
  assert.equal(evaluateDomain("192.168.1.1").reason, "ip_address");
  assert.equal(evaluateDomain("::1").reason, "ip_address");
  assert.equal(evaluateDomain("localhost").reason, "localhost");
  assert.equal(evaluateDomain("foo.localhost").reason, "localhost");
});

test("enforces launch suffix policy", () => {
  assert.equal(evaluateDomain("whatever.invalid").reason, "unsupported_suffix");
  assert.equal(evaluateDomain("nice.app").eligible, true);
  assert.equal(evaluateDomain("nice.dev").eligible, true);
});

test("reserved domains are not claimable", () => {
  assert.equal(evaluateDomain("whitehouse.gov").reason, "reserved");
  assert.equal(evaluateDomain("openai.org").reason, "reserved");
});

test("requireEligibleDomain returns canonical domain or throws", () => {
  assert.equal(requireEligibleDomain("https://www.reddit.com/r/all"), "reddit.com");
  assert.throws(() => requireEligibleDomain("192.168.0.1"), /DOMAIN_INELIGIBLE/);
});

test("handle validation and banned impersonation names", () => {
  assert.equal(isHandleValid("harshit"), true);
  assert.equal(isHandleValid("ab"), false);
  assert.equal(isHandleValid("has space"), false);
  assert.equal(isHandleValid("x".repeat(21)), false);
  assert.equal(isHandleAllowed("admin"), false);
  assert.equal(isHandleAllowed("Staff"), false);
  assert.equal(isHandleAllowed("harshit"), true);
});

// Handles are PERMANENT, so an impersonating one can never be cleaned up
// later. An exact-match ban list is trivially bypassed by leetspeak and
// separators, and it misses the impersonation that actually reaches users:
// a brand-prefixed "support" handle messaging a holder about their payment.
test("banned handles survive leetspeak and separator evasion", () => {
  for (const handle of [
    "supp0rt",
    "adm1n",
    "r00t",
    "0fficial",
    "s_u_p_p_o_r_t",
    "st4ff",
    "pr1ced",
  ]) {
    assert.equal(isHandleAllowed(handle), false, handle);
  }
});

test("brand-impersonating handles are refused as substrings", () => {
  for (const handle of ["priced_support", "pricedteam", "pricedhelp", "teampriced", "price_tag"]) {
    assert.equal(isHandleAllowed(handle), false, handle);
  }
});

test("ban list does not swallow legitimate handles", () => {
  for (const handle of ["modern", "modest", "supportive_x", "helper", "pricey", "harshit", "indexfund"]) {
    assert.equal(isHandleAllowed(handle), true, handle);
  }
});
