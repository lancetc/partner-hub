"use client";

import { useId } from "react";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { btn, input } from "./ui";

/*
  "Write it with AI", the same box on New story, Topics, Discovery Paths and New Magazine (the owner, Nov 2026): one
  title, the light teal panel, the document on the left and the brief with that page's own settings on the right, and
  the button inside the box. Each page brings its own drop zone (DocumentDrop or, for the Magazine, DocumentsDrop),
  settings and what happens when the button is pressed.
*/

export function AiWriterBox({
  intro,
  drop,
  brief,
  settings,
  action,
  note,
  aside,
  children,
  heading = "h2",
  className,
}: {
  /** What AI will write from it, and that nothing is published until it's reviewed. */
  intro: React.ReactNode;
  /** The drop zone: DocumentDrop, or DocumentsDrop for several documents. */
  drop: React.ReactNode;
  brief: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    /** A document has been read: the brief becomes "Anything to add?". */
    hasDocument: boolean;
    disabled?: boolean;
  };
  /** That page's own choices (track, length, who it's for), under the brief. */
  settings?: React.ReactNode;
  action: { label: string; busyLabel: string; busy: boolean; disabled: boolean; onClick: () => void };
  /** Beside the button: how long it takes, or another choice (make a poster). */
  note?: React.ReactNode;
  /** Top right, beside the title (Topics: Start from blank cards). */
  aside?: React.ReactNode;
  /** Between the fields and the button: progress and errors. */
  children?: React.ReactNode;
  heading?: "h2" | "h3";
  className?: string;
}) {
  const id = useId();
  const H = heading;
  return (
    <section aria-labelledby={`${id}-h`} className={cx("rounded-3xl border-2 border-action/30 bg-tealtint/50 p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <H id={`${id}-h`} className="flex items-center gap-2 font-serif text-xl font-semibold">
          <Icon name="spark" className="size-5 text-accent" /> Write it with AI
        </H>
        {aside}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-muted">{intro}</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {drop}
        <div className="flex flex-col gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
            {brief.hasDocument ? "Anything to add? (optional)" : "Or write a brief"}
            <textarea
              rows={5}
              maxLength={4000}
              value={brief.value}
              disabled={brief.disabled}
              onChange={(e) => brief.onChange(e.target.value)}
              className={cx(input, "flex-1 py-2 font-normal leading-relaxed")}
              placeholder={brief.placeholder}
            />
          </label>
          {settings}
        </div>
      </div>
      {children && <div className="mt-4 flex flex-col gap-3">{children}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={btn.primary} disabled={action.busy || action.disabled} onClick={action.onClick}>
          <Icon name="spark" className="size-4" /> {action.busy ? action.busyLabel : action.label}
        </button>
        {note}
      </div>
    </section>
  );
}
