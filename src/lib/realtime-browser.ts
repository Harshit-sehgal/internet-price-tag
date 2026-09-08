// Browser-side market subscription (§35: realtime is display synchronization,
// never transaction authority). Uses Supabase Realtime when configured, and
// falls back to polling a cheap pulse endpoint in demo mode.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Unsubscribe = () => void;

export function subscribeToMarketChanges(onChange: () => void): Unsubscribe {
  if (supabaseUrl && supabaseAnonKey) {
    let disposed = false;
    let cleanupChannel: (() => void) | null = null;
    // Dynamic import keeps supabase-js out of the bundle for demo deployments.
    void import("@supabase/supabase-js")
      .then(({ createClient }) => {
        if (disposed) return; // unsubscribed before the SDK loaded
        const client = createClient(supabaseUrl, supabaseAnonKey);
        const channel = client
          .channel("market-display")
          .on("postgres_changes", { event: "*", schema: "public", table: "domains" }, onChange)
          .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, onChange)
          .subscribe();
        cleanupChannel = () => void client.removeChannel(channel);
      })
      .catch(() => {
        // SDK failed to load; display updates degrade to manual refresh.
      });
    return () => {
      disposed = true;
      cleanupChannel?.();
    };
  }

  // Demo/polling fallback: cheap pulse endpoint, refresh when state changes.
  let stopped = false;
  let lastVersion: string | null = null;
  const tick = async () => {
    if (stopped) return;
    try {
      const res = await fetch("/api/market/pulse", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { v?: string } | null;
      const version = body?.v;
      if (!version) return;
      if (lastVersion !== null && version !== lastVersion) onChange();
      lastVersion = version;
    } catch {
      // Network hiccups are ignored; next tick retries.
    }
  };
  void tick();
  const interval = setInterval(() => void tick(), 5_000);
  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
