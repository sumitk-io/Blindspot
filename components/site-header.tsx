import Link from "next/link";
import { GitHubIcon } from "@/components/icons";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-brand">
            <svg viewBox="0 0 24 24" className="size-[18px] text-white" fill="none" aria-hidden="true">
              <path
                d="M5 18V9m4.5 9V6m4.5 12v-7m4.5 7V8"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="text-[15px] font-extrabold uppercase tracking-[0.18em] text-ink">
            Blindspot
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-muted lg:flex">
          <Link href="/#how" className="transition hover:text-ink">
            How it works
          </Link>
          <Link href="/#features" className="transition hover:text-ink">
            Features
          </Link>
          <Link href="/#examples" className="transition hover:text-ink">
            Examples
          </Link>
          <Link href="/#about" className="transition hover:text-ink">
            About
          </Link>
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-ink transition hover:text-brand"
          >
            <GitHubIcon className="size-5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <Link
            href="/ask"
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Enter
          </Link>
        </div>
      </div>
    </header>
  );
}
