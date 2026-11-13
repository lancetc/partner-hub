"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Lesson } from "@/content/lessons";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";

/*
  The lesson player's desktop layout: the card stays the hero in the middle; these panels sit either
  side of it. Left: where you are (the learning path, the topic and its steps). Right: your workspace
  (progress, private notes, and a way to talk it over with peers in the Community).
*/

const panel = "rounded-[1.75rem] bg-surface p-5 shadow-sm ring-1 ring-line";
const label = "font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-ink-muted";

type Progress = { beat: number; done: boolean } | null;

/** Left: the topic's outline. */
export function TopicOutline({ lesson, progress, path }: { lesson: Lesson; progress: Progress; path?: { href: string; name: string } }) {
  return (
    <div className="flex flex-col gap-4">
      <section className={panel}>
        <p className={label}>{path ? "Learning path" : "Topic"}</p>
        {path ? (
          <Link href={path.href} className="mt-1 block font-semibold leading-snug hover:underline">
            {path.name}
          </Link>
        ) : null}
        <h2 className={cx("font-serif text-xl font-semibold leading-snug", path && "mt-3 border-t border-line pt-3")}>{lesson.title}</h2>
        <p className="mt-1 text-sm text-ink-muted">About {lesson.minutes} minutes</p>
        {lesson.outcome && (
          <p className="mt-3 rounded-2xl bg-tealtint px-3 py-2.5 text-sm">
            <span className="font-semibold">You’ll be able to: </span>
            {lesson.outcome}
          </p>
        )}
      </section>

      <section className={panel} aria-labelledby="outline-steps">
        <h2 id="outline-steps" className={label}>
          Steps
        </h2>
        <ol className="mt-3 flex flex-col gap-1.5">
          {lesson.beats.map((b, i) => {
            const state = progress?.done || (progress && i < progress.beat) ? "done" : progress && i === progress.beat ? "current" : "todo";
            return (
              <li
                key={b}
                aria-current={state === "current" ? "step" : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                  state === "current" ? "bg-tealtint font-semibold text-ink" : state === "done" ? "text-ink" : "text-ink-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "grid size-6 shrink-0 place-items-center rounded-full font-mulish text-xs font-extrabold",
                    state === "done" ? "bg-action text-on-action" : state === "current" ? "bg-surface ring-2 ring-action" : "bg-muted",
                  )}
                >
                  {state === "done" ? <Icon name="check" className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">{b}</span>
                <span className="sr-only">{state === "done" ? "done" : state === "current" ? "current step" : "not started"}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/** Right: progress, private notes and peers. */
export function Workspace({ slug, beats, progress }: { slug: string; beats: number; progress: Progress }) {
  const percent = !progress ? 0 : progress.done ? 100 : Math.round((progress.beat / Math.max(1, beats)) * 100);
  return (
    <div className="flex flex-col gap-4">
      <section className={panel}>
        <p className={label}>Your workspace</p>
        <p className="mt-3 text-sm font-semibold">Progress</p>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-[#008282] transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1.5 text-sm text-ink-muted">
          {progress?.done ? "Topic complete" : !progress ? "Not started yet" : `${percent}% through · step ${progress.beat + 1} of ${beats}`}
        </p>
      </section>
      <Notes slug={slug} />
      <Link
        href="/community"
        target="_blank"
        rel="noopener"
        className={cx(panel, "group flex items-start gap-3 hover:ring-[#008282]")}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-tealtint text-accent">
          <Icon name="chat" className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold group-hover:underline">Discuss this topic with peers</span>
          <span className="block text-sm text-ink-muted">Ask a question or share how you handle it, in the Community. Opens in a new tab.</span>
        </span>
      </Link>
    </div>
  );
}

/** Private notes for this topic, kept on this device for the person signed in. */
function Notes({ slug }: { slug: string }) {
  const id = useId();
  // Only shown after the page has loaded (the desktop layout is chosen in the browser), so storage is there to read.
  const key = `tc-notes-${who()}-${slug}`;
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  const [saved, setSaved] = useState(false);
  return (
    <section className={panel}>
      <label htmlFor={id} className="text-sm font-semibold">
        Personal notes
      </label>
      <textarea
        id={id}
        rows={7}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        onBlur={() => {
          try {
            localStorage.setItem(key, text);
            setSaved(true);
          } catch {}
        }}
        placeholder="Your reflections, questions, or something to try on your next visit…"
        maxLength={4000}
        className="mt-2 w-full resize-y rounded-2xl border border-line-strong bg-surface px-3 py-2.5 text-[0.95rem] leading-relaxed"
      />
      <p className="mt-1 text-xs text-ink-muted" role="status">
        {saved ? "Saved on this device." : "Private to you. Saved on this device when you click away."}
      </p>
    </section>
  );
}

/** The signed-in demo account, so two people on one device keep separate notes. */
function who() {
  return /(?:^|;\s*)tc-demo-user=([^;]+)/.exec(document.cookie)?.[1] ?? "guest";
}
