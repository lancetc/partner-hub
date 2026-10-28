"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";
import { Icon, type IconName } from "../Icon";

/** Icons that suit a key point, roughly grouped: people and care, time, money and records, safety, general. */
export const POINT_ICONS: IconName[] = [
  "people",
  "user",
  "heart",
  "home",
  "chat",
  "phone",
  "clock",
  "calendar",
  "refresh",
  "money",
  "doc",
  "pen",
  "checklist",
  "list",
  "folder",
  "shield",
  "alert",
  "lock",
  "eye",
  "search",
  "info",
  "bulb",
  "flag",
  "target",
  "route",
  "check",
  "star",
  "spark",
  "sun",
  "leaf",
  "book",
  "news",
];

/**
  A key point's icon: a round button showing it (or an empty circle to add one), which opens a small
  grid to choose from.
*/
export function IconPick({ value, onChange, className }: { value?: IconName; onChange: (icon: IconName | undefined) => void; className?: string }) {
  // Where the grid opens: fixed to the page, since a card's own scroll area would cut it off.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = at !== null;
  const toggle = () => {
    const r = button.current?.getBoundingClientRect();
    if (open || !r) return setAt(null);
    const width = 232;
    setAt({ top: Math.min(r.bottom + 4, window.innerHeight - 260), left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node))
        setAt(null);
    };
    // Scrolling the cards would leave it behind, so it closes.
    const onScroll = (e: Event) => !panel.current?.contains(e.target as Node) && setAt(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div className={className}>
      <button
        ref={button}
        type="button"
        aria-label={value ? `Icon: ${value}. Change it` : "Add an icon"}
        aria-expanded={open}
        title={value ? "Change the icon" : "Add an icon"}
        onClick={toggle}
        className={cx(
          "inline-flex size-7 items-center justify-center rounded-full",
          value
            ? "bg-tealtint text-accent hover:ring-2 hover:ring-action/50"
            : "border border-dashed border-line-strong text-ink-muted hover:border-action hover:text-action",
        )}
      >
        <Icon name={value ?? "plus"} className="size-3.5" />
      </button>
      {at &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Choose an icon"
            style={{ top: at.top, left: at.left }}
            className="fixed z-[60] w-[232px] rounded-2xl bg-surface p-2 text-ink shadow-xl ring-1 ring-line"
          >
            <div className="grid grid-cols-6 gap-1">
              {POINT_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={i}
                  aria-pressed={i === value}
                  title={i}
                  onClick={() => {
                    onChange(i);
                    setAt(null);
                  }}
                  className={cx("grid size-8 place-items-center rounded-lg hover:bg-muted", i === value && "bg-tealtint text-action ring-1 ring-action/40")}
                >
                  <Icon name={i} className="size-4" />
                </button>
              ))}
            </div>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(undefined);
                  setAt(null);
                }}
                className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-ink-muted hover:bg-muted"
              >
                No icon
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
