import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

const PROTECTED_PREFIXES = ["/friends", "/settings", "/admin"];

export function isProtectedPath(pathname: string): boolean {
  return (
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    /^\/festivals\/new\/?$/.test(pathname) ||
    /^\/festivals\/[^/]+\/(edit|proposals)\/?$/.test(pathname)
  );
}

/** Refresh the auth session cookie and bounce signed-out users off private pages. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Do not put code between createServerClient and getClaims: it validates
  // (and if needed refreshes) the session.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && isProtectedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  return response;
}
