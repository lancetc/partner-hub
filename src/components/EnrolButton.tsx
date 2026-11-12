"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "./Icon";

/**
  Enrol in a learning path or a topic, or leave one you enrolled in yourself. Enrolling puts it on
  your Learning page, and administrators can see you're working on it.
*/
export function EnrolButton({
  kind,
  id,
  enrolled,
  onChange,
  className,
}: {
  kind: "path" | "topic";
  id: string;
  enrolled: boolean;
  onChange: (enrolled: boolean) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const what = kind === "path" ? "path" : "topic";

  async function send(action: "enrol" | "leave") {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ enrolled: boolean }>("/api/enrolments", { body: { kind, id, action } });
      onChange(r.enrolled);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {enrolled ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 font-semibold text-success">
            <Icon name="circle-check" className="size-5" /> You’re enrolled
          </span>
          <button type="button" disabled={busy} onClick={() => send("leave")} className="min-h-11 text-sm font-semibold text-ink-muted underline-offset-4 hover:underline">
            {busy ? "Leaving…" : `Leave this ${what}`}
          </button>
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => send("enrol")}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border-2 border-action px-5 font-semibold text-action hover:bg-tealtint disabled:opacity-60"
        >
          <Icon name="plus" className="size-4" /> {busy ? "Enrolling…" : `Enrol in this ${what}`}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
