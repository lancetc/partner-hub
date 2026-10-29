"use client";

import { useState } from "react";
import { send as sendOrQueue } from "@/lib/outbox";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";

/* "Report a problem" under a card: a learner flags something that looks wrong or out of date. Works offline (sent later). */
export function ReportProblem({ slug, cardId, preview, onColour }: { slug: string; cardId: string; preview: boolean; onColour: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "queued">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent" || state === "queued")
    return (
      <p role="status" className={cx("text-xs", onColour ? "opacity-85" : "text-ink-muted")}>
        {state === "sent" ? "Thanks. The learning team will take a look." : "Thanks. Your report is saved and will be sent when you’re back online."}
      </p>
    );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          "inline-flex items-center gap-1 self-start text-xs underline-offset-4 hover:underline [text-shadow:none]",
          onColour ? "opacity-80" : "text-ink-muted",
        )}
      >
        <Icon name="alert" className="size-3.5" /> Report a problem
      </button>
    );

  return (
    <form
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 text-ink [text-shadow:none]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (preview) {
          setState("sent");
          return;
        }
        setState("sending");
        setError(null);
        try {
          const r = await sendOrQueue("/api/reports", { lesson: slug, card: cardId, text }, { label: "Problem reported on a topic card" });
          setState(r.queued ? "queued" : "sent");
        } catch (err) {
          setError((err as Error).message);
          setState("idle");
        }
      }}
    >
      <label htmlFor={`${cardId}-report`} className="text-sm font-semibold">
        What looks wrong or out of date?
      </label>
      <textarea
        id={`${cardId}-report`}
        rows={2}
        maxLength={600}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="For example: this rate changed last month"
        className="rounded-xl border border-line-strong bg-surface p-2.5 text-[0.95rem]"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={text.trim().length < 5 || state === "sending"}
          className="inline-flex min-h-10 items-center rounded-full bg-action px-4 text-sm font-semibold text-on-action disabled:opacity-45"
        >
          {state === "sending" ? "Sending…" : "Send"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-10 px-3 text-sm font-medium text-ink-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
