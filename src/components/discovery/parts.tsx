"use client";

import { cx } from "@/lib/format";
import { KIND_LABELS, nativeLabel, type CatalogueItem, type ItemKind } from "@/lib/discovery";
import { Icon } from "../Icon";

/* Small pieces shared by the Discovery Path pages (docs/discovery-paths.md). */

export const dbtn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
  quiet: "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-accent hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60",
  icon: "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40",
};
export const dinput = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base";

export const ROLE_LABELS: Record<string, string> = { partner: "Care Partner", coordinator: "Care coordinator", staff: "Trilogy Care staff" };

export function KindBadge({ kind }: { kind: ItemKind }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mulish text-xs font-extrabold uppercase tracking-wide text-ink-muted">
      {KIND_LABELS[kind]}
    </span>
  );
}

export function Chip({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn"; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold",
        tone === "good" && "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]",
        tone === "warn" && "bg-[#fff1cc] text-[#6b4a00] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        tone === "neutral" && "bg-muted text-ink",
      )}
    >
      {children}
    </span>
  );
}

/** What an item is, in a line: its format, its course if it's a page, how long, and what practice it has. */
export function ItemFacts({ item }: { item: CatalogueItem }) {
  const native = nativeLabel(item.kind, item.state);
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
      <KindBadge kind={item.kind} />
      <span className="inline-flex items-center gap-1">
        <Icon name="clock" className="size-4" /> About {item.minutes} min
      </span>
      {item.parent && <span>Part of the course “{item.parent.title}”</span>}
      {item.kind === "course" && <span>The whole course</span>}
      {item.practice && <span>{item.practice}</span>}
      {native && <Chip tone={item.state === "completed" ? "good" : "neutral"}>{native}</Chip>}
    </p>
  );
}

export function Problem({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#fde8e4] px-4 py-3 text-[#7a1d10] dark:bg-[#3b1712] dark:text-[#ffb4a6]">
      <span>{text}</span>
      {onRetry && (
        <button type="button" className="min-h-11 font-semibold underline underline-offset-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </p>
  );
}
