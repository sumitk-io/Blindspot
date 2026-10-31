import type { ComponentType } from "react";
import { CalendarDays, FileText, Layers, RefreshCw, Settings, Users } from "lucide-react";
import type { Aspect, AspectIcon } from "@/lib/types";
import { cn } from "@/lib/utils";

const icons = {
  users: Users,
  calendar: CalendarDays,
  file: FileText,
  refresh: RefreshCw,
  settings: Settings,
  layers: Layers,
} satisfies Record<AspectIcon, ComponentType<{ className?: string }>>;

export default function AspectStrip({
  items,
  className,
  heading = "We check for",
  subheading = "The important aspects of a complete answer.",
}: {
  items: Aspect[];
  className?: string;
  heading?: string;
  subheading?: string;
}) {
  return (
    <section className={cn("mx-auto max-w-6xl px-6", className)}>
      <div className="rounded-2xl border border-line bg-surface px-6 py-6 shadow-[0_1px_2px_rgba(11,31,51,0.04)] sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
          <div className="lg:w-56 lg:shrink-0">
            <h2 className="text-lg font-bold text-ink">{heading}</h2>
            <p className="mt-1 text-sm text-muted">{subheading}</p>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-4 sm:grid-cols-6">
            {items.map((aspect) => {
              const Icon = icons[aspect.icon];
              return (
                <div key={aspect.id} className="flex flex-col items-center gap-2 text-center">
                  <span className={cn("grid size-11 place-items-center rounded-full", aspect.tint)}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium text-ink">{aspect.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
