"use client";

import { cx } from "@/lib/format";
import { Icon } from "../Icon";

/*
  The steps Claude works through to build something (a topic's cards, a learning path, a challenge),
  shown before it starts so authors know what they'll get, and live while it works: each step ticks
  off as its part of the reply arrives.
*/

export type BuildStep = { key: string; label: string; makes: string; purpose: string };
export type BuildPhase = "idle" | "reading" | "writing" | "checking" | "fixing" | "done";

const PHASE_TEXT: Record<Exclude<BuildPhase, "idle">, string> = {
  reading: "Reading your document…",
  writing: "Claude is writing, in this order:",
  checking: "Checking the draft against the format and the sequence…",
  fixing: "Claude is fixing what the checks found…",
  done: "Done. Here’s what Claude built:",
};

/**
  `counts`: how many items of each step Claude has written so far. A step is done once a later one
  has started; the furthest step reached is the one being written.
*/
export function BuildProgress({
  steps,
  phase,
  counts = {},
  unit = ["card", "cards"],
  issues,
  title = "How Claude builds it",
  details = {},
}: {
  steps: readonly BuildStep[];
  phase: BuildPhase;
  counts?: Partial<Record<string, number>>;
  unit?: [string, string];
  issues?: number;
  title?: string;
  /** A step's progress in words, in place of its count, e.g. "4 chapters · 9 existing topics". */
  details?: Partial<Record<string, string>>;
}) {
  const reached = steps.reduce((at, s, i) => ((counts[s.key] ?? 0) > 0 ? i : at), -1);
  const working = phase === "writing" || phase === "fixing";
  const finished = phase === "checking" || phase === "done";
  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-muted/40 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold" role="status" aria-live="polite">
        {phase === "idle" ? (
          <>
            <Icon name="route" className="size-4 text-accent" /> {title}
          </>
        ) : phase === "done" ? (
          <>
            <Icon name="circle-check" className="size-4 text-accent" /> {PHASE_TEXT.done}
          </>
        ) : (
          <>
            <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
            {phase === "fixing" && issues ? `Claude is fixing ${issues} ${issues === 1 ? "problem" : "problems"} the checks found…` : PHASE_TEXT[phase]}
          </>
        )}
      </p>
      <ol className={cx("mt-3 grid gap-2", steps.length > 4 ? "sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" : "sm:grid-cols-3")}>
        {steps.map((s, i) => {
          const n = counts[s.key] ?? 0;
          const done = finished ? n > 0 : working && i < reached;
          const current = working && i === reached;
          const next = working && i === reached + 1;
          return (
            <li
              key={s.key}
              className={cx(
                "flex flex-col gap-1 rounded-xl border p-3 transition-colors",
                done ? "border-action/40 bg-tealtint/60" : current ? "border-action bg-surface shadow-sm" : "border-line bg-surface",
                working && !done && !current && !next && "opacity-60",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cx(
                    "grid size-6 shrink-0 place-items-center rounded-full font-mulish text-xs font-bold",
                    done ? "bg-action text-on-action" : current ? "bg-tealtint text-accent" : "bg-muted text-ink-muted",
                  )}
                >
                  {done ? (
                    <Icon name="check" className="size-3.5" />
                  ) : current ? (
                    <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="font-semibold leading-tight">{s.label}</span>
              </span>
              <span className="text-xs font-semibold text-ink-muted">{s.makes}</span>
              <span className="text-xs leading-snug text-ink-muted">{s.purpose}</span>
              {n > 0 && (
                <span className="mt-auto pt-1 text-xs font-semibold text-accent">
                  {details[s.key] || `${n} ${n === 1 ? unit[0] : unit[1]}`}
                  {current ? " so far" : ""}
                </span>
              )}
              <span className="sr-only">{done ? "Done." : current ? "Being written now." : "Not started."}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Reads a stream of JSON lines (one event per line) from a response, calling `onEvent` for each. */
export async function readEvents<E>(res: Response, onEvent: (e: E) => void) {
  if (!res.body) throw new Error("No reply from the server.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as E);
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as E);
}
