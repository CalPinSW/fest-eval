import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Clashplan", template: "%s · Clashplan" },
  description: "Plan who you'll see at a festival, with your friends.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">{children}</main>
        <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted">
          Lineup data partly from{" "}
          <a className="underline" href="https://clashfinder.com" target="_blank" rel="noreferrer">
            Clashfinder
          </a>{" "}
          (CC BY-NC 3.0) and community edits.
        </footer>
      </body>
    </html>
  );
}
