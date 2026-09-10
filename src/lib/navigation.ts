export function sanitizeInternalPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";

  try {
    const base = new URL("https://priced.invalid");
    const parsed = new URL(value, base);
    if (parsed.origin !== base.origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
