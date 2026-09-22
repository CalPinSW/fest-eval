import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-0.5 px-4 py-3 text-sm sm:gap-1" aria-label="Main">
        <Link href="/" className="mr-1 text-lg font-bold tracking-tight sm:mr-3">
          clash<span className="text-accent">plan</span>
        </Link>
        <Link href="/festivals" className="btn-ghost px-3">
          Festivals
        </Link>
        {user && (
          <>
            <Link href="/friends" className="btn-ghost px-3">
              Friends
            </Link>
            <Link href="/settings" className="btn-ghost px-3">
              Settings
            </Link>
            {user.role === "admin" && (
              <Link href="/admin" className="btn-ghost hidden px-3 sm:inline-flex">
                Admin
              </Link>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href="/settings" className="chip hidden sm:inline-flex" title="Your account">
                @{user.username}
              </Link>
              <form action={signOut}>
                <button className="btn-ghost px-3" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost px-3">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary">
                Join
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
