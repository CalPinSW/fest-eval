"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FestivalTabs({ slug, tabs }: { slug: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Festival sections" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const href = `/festivals/${slug}${tab.href}`;
          const active = tab.href === "" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={tab.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                  active ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
