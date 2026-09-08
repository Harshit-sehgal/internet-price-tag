import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
  // Skip if auth env not configured (demo mode: no Supabase).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session so Server Components see a valid user.
  // Supabase SSR does lazy refresh on getUser / getSession.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Skip the webhook (no user session needed) and the cheap demo pulse;
    // keep all other routes session-aware.
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/market/pulse|api/demo).*)",
  ],
};
