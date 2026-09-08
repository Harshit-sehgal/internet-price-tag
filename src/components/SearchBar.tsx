"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = value.trim().toLowerCase();
    if (!cleaned) return;
    // Mirror the server normalizer enough for pleasant URLs: scheme →
    // userinfo? ignore, then path/query/fragment → host, strip leading
    // www. and any :port, then trim trailing dots. Server re-normalizes
    // definitively, so this only needs to avoid obvious mismatches.
    let host = cleaned.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    host = host.split("@").pop() ?? host;
    host = host.split(/[/?#]/)[0] ?? host;
    host = host.replace(/:\d{1,5}$/, "");
    host = host.replace(/^www\./, "");
    host = host.replace(/\.+$/, "");
    if (!host) return;
    router.push(`/domain/${encodeURIComponent(host)}`);
  }

  return (
    <form
      className="searchbar"
      onSubmit={submit}
      role="search"
      aria-label="Search any domain"
      style={compact ? undefined : { maxWidth: 560 }}
    >
      <input
        type="text"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="search any domain…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Domain"
      />
      <button type="submit" className="btn btn-primary">
        Price it
      </button>
    </form>
  );
}
