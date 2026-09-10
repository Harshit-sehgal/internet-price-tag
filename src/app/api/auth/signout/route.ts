import { NextResponse } from "next/server";
import { createAuthClient, isAuthConfigured } from "@/lib/auth";

export async function POST() {
  if (!isAuthConfigured) return NextResponse.json({ ok: true, demo: true });
  const client = await createAuthClient();
  await client.auth.signOut();
  return NextResponse.json({ ok: true });
}
