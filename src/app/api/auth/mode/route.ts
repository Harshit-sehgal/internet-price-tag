import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    demo: !isAuthConfigured,
    auth: isAuthConfigured ? "supabase" : "demo",
  });
}
