"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { subscribeToMarketChanges } from "@/lib/realtime-browser";
import { nowMs } from "@/lib/time.ts";

/**
 * Silent client bridge: refreshes the current Server Component tree when the
 * market changes (holder, price, history, feed). Renders nothing; motion and
 * layout are left to CSS on the updated content itself (§31).
 */
export function LiveRefresh() {
  const router = useRouter();
  const lastRunRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    const flush = () => {
      const now = nowMs();
      if (busyRef.current || now - lastRunRef.current < 1_500) return;
      lastRunRef.current = now;
      busyRef.current = true;
      try {
        router.refresh();
      } finally {
        busyRef.current = false;
      }
    };
    const unsubscribe = subscribeToMarketChanges(flush);
    return unsubscribe;
  }, [router]);

  return null;
}
