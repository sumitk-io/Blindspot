import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Grid2x2, ListChecks, Play, Quote } from "lucide-react";
import AspectStrip from "@/components/aspect-strip";
import { aspects } from "@/lib/demo";

const stats = [
  { title: "1 question", detail: "Paste your question and sources" },
  { title: "Clear analysis", detail: "Gaps, conflicts, missing info" },
  { title: "Verified evidence", detail: "Every claim with a quote and source link" },
];

const steps = [
  {
    title: "Ask and add sources",
    detail:
      "Paste a question and up to six links. Every source is frozen as a snapshot, so the evidence cannot change under you.",
  },
  {
    title: "Audit the coverage",
    detail:
      "Your question becomes a checklist of aspects. Each source is checked against each aspect, and every claim must carry a quote that exists in the text.",
  },
  {
    title: "Verify what is missing",
    detail:
      "Blindspot returns gaps, conflicts, outdated pages and a ranked list of what to check next — with the sentence behind each finding.",
  },
];

const features = [
  {
    icon: Grid2x2,
    title: "Coverage matrix",
    detail: "One grid showing every source against every aspect a complete answer needs.",
  },
  {
    icon: Quote,
    title: "Verified quotes",
    detail: "Claims are checked against the snapshot. Unverified text is labelled, never presented as fact.",
  },
  {
    icon: BadgeCheck,
    title: "Conflict detection",
    detail: "Sources that disagree are shown side by side, weighted by how authoritative each one is.",
  },
  {
    icon: ListChecks,
    title: "Verification checklist",
    detail: "A ranked list of what to verify next, with a hint about where to look.",
  },
];

export default function Home() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -right-40 top-0 size-[42rem] rounded-full bg-mint/15 blur-3xl" />
          <div className="absolute -left-32 bottom-0 size-[30rem] rounded-full bg-brand-soft blur-3xl" />
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-14 pt-12 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-brand">
              Research with evidence
            </p>
            <h1 className="mt-5 text-5xl font-extrabold leading-[1.04] tracking-tight sm:text-6xl">
              Find out what
              <br />
              <span className="text-brand">your sources</span>
              <br />
              don&apos;t tell you.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Blindspot analyzes multiple sources to show what they cover, what is missing, where
              they contradict, and what you should verify next — with every claim backed by a real
              quote.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/ask"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-brand-dark"
              >
                Enter
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/#how"
                className="inline-flex items-center gap-2 rounded-full bg-surface px-6 py-3.5 text-base font-semibold text-ink ring-1 ring-line transition hover:bg-canvas"
              >
                <Play className="size-4 text-brand" aria-hidden="true" />
                See how it works
              </Link>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6">
              {stats.map((stat) => (
                <div key={stat.title}>
                  <dt className="text-sm font-bold text-ink">{stat.title}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-muted">{stat.detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-[2rem] ring-1 ring-line shadow-[0_24px_70px_-38px_rgba(11,31,51,0.45)]">
              <Image
                src="/mascot.png"
                alt="Blindspot mascot researching a stack of sources"
                width={960}
                height={690}
                priority
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </section>

      <AspectStrip items={aspects} />

      <section id="how" className="mx-auto max-w-6xl px-6 pt-16">
        <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Three steps, and the third one is the point: knowing what still needs checking.
        </p>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-line bg-surface p-6">
              <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">
                {index + 1}
              </span>
              <h3 className="mt-4 text-base font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 pt-16">
        <h2 className="text-3xl font-bold tracking-tight">What you get</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-line bg-surface p-6">
              <feature.icon className="size-5 text-brand" aria-hidden="true" />
              <h3 className="mt-4 text-base font-bold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="examples" className="mx-auto max-w-6xl px-6 pt-16">
        <div className="rounded-2xl border border-line bg-surface p-8">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand">Example</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">
            What should I verify before applying for this scholarship?
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Five sources, one clear gap, one disagreement, one outdated page. Open the saved analysis
            to see how findings are presented.
          </p>
          <Link
            href="/analysis/demo"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-soft px-5 py-3 text-sm font-semibold text-brand transition hover:bg-brand/10"
          >
            Open the saved analysis
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
