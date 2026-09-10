import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeInternalPath } from "../../src/lib/navigation.ts";

test("sanitizeInternalPath keeps same-origin relative paths", () => {
  assert.equal(sanitizeInternalPath("/"), "/");
  assert.equal(sanitizeInternalPath("/domain/openai.com"), "/domain/openai.com");
  assert.equal(sanitizeInternalPath("/takeover/abc?via=share#pay"), "/takeover/abc?via=share#pay");
});

test("sanitizeInternalPath rejects external and scheme-relative redirects", () => {
  for (const value of [
    "https://evil.example",
    "http://evil.example",
    "//evil.example/path",
    "///evil.example/path",
    "/\\evil.example/path",
    "javascript:alert(1)",
    "data:text/html,hello",
    "evil.example/path",
    "",
    null,
    undefined,
  ]) {
    assert.equal(sanitizeInternalPath(value), "/", String(value));
  }
});

test("sanitized output cannot change origin when resolved", () => {
  const origin = "https://priced.example";
  for (const value of [
    "/profile",
    "/?next=https://evil.example",
    "/%5cevil.example",
    "/%2f%2fevil.example",
    "/\\evil.example",
    "//evil.example",
  ]) {
    const safe = sanitizeInternalPath(value);
    assert.equal(new URL(safe, origin).origin, origin, value);
  }
});
