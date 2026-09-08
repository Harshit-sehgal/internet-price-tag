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
    // Server normalizes again; this just makes URLs pleasant.
    const slug = encodeURIComponent(cleaned.replace(/^https?:\/\//, "").split(/[/?#]/)[0]);
    router.push(`/domain/${slug}`);
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
