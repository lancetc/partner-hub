"use client";

import { Icon } from "./Icon";
import { toggleSaved, useHub } from "@/lib/store";
import { cx } from "@/lib/format";

export function SaveButton({
  id,
  title,
  className,
  withLabel = false,
  onDark = false,
}: {
  id: string;
  title: string;
  className?: string;
  withLabel?: boolean;
  onDark?: boolean;
}) {
  const saved = useHub((s) => s.saved.includes(id));
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={withLabel ? undefined : saved ? `Remove “${title}” from saved` : `Save “${title}”`}
      onClick={() => toggleSaved(id)}
      className={cx(
        "relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full transition-colors",
        withLabel && "border px-4 text-sm font-medium",
        onDark
          ? "border-white/30 text-on-hero hover:bg-white/10"
          : "border-line-strong text-ink hover:bg-muted",
        saved && !onDark && "text-action",
        className,
      )}
    >
      <Icon name={saved ? "bookmark-filled" : "bookmark"} className="size-5" />
      {withLabel && <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
