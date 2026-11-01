import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/site-header";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Blindspot — know what your sources leave out",
  description:
    "Blindspot audits your sources: what they cover, what is missing, where they contradict, and what you should verify next — with every claim backed by a quote.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col font-sans antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer id="about" className="mt-10 border-t border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink">Blindspot</p>
              <p className="mt-1 max-w-md text-sm text-muted">
                An information-gap auditor. Built for the SHINCHAN Online Hackathon 2026.
              </p>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-muted">
              Findings are potential gaps, not guaranteed facts. Gaps mean missing among the
              sources reviewed — not necessarily absent from the world.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
