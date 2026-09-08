"use client";

import { createBrowserClient } from "@supabase/ssr";

let cached: Awaited<ReturnType<typeof createBrowserClient>> | null = null;

export async function createAuthBrowserClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("AUTH_NOT_CONFIGURED");
  cached = createBrowserClient(url, anonKey);
  return cached;
}
