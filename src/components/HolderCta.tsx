"use client";

import { track } from "@/lib/analytics";

/**
 * Holder CTA: links offsite. Always https, always rel="noopener noreferrer",
 * never implies the holder operates the domain the tag belongs to.
 */
export function HolderCta({ label, url, handle }: { label: string; url: string; handle: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="btn btn-take"
      onClick={() => track("cta_clicked", { handle, url })}
    >
      {label}
    </a>
  );
}

/** Compact inline CTA for list rows (same safety rules). */
export function HolderCtaInline({ label, url, handle }: { label: string; url: string; handle: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="cta-inline mono"
      onClick={() => track("cta_clicked", { handle, url })}
    >
      {label} ↗
    </a>
  );
}
