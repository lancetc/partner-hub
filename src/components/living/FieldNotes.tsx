"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { FieldNoteItem, FieldNotes as Loaded } from "@/server/living";
import { Icon } from "../Icon";

/*
  Field Notes from Ava (docs/living-cases.md): a quiet inbox of invitations back to a story or a task. Not a
  training queue: every note here is optional, and opening, snoozing or dismissing one never changes a course, a
  completion or an attempt. A note says why it's here in a line that could be read over someone's shoulder; what
  a person answered last time is only ever on the page they open.
*/

const dateText = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");

function Note({ n, act, busy }: { n: FieldNoteItem; act: (action: "dismiss" | "snooze", id: string) => void; busy: boolean }) {
  return (
    <li className="rounded-2xl bg-muted p-4 ring-1 ring-line">
      <div className="flex items-start gap-3">
        {n.character?.portrait ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={n.character.portrait} alt="" className="size-12 shrink-0 rounded-full border border-line object-cover" />
        ) : (
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-action text-on-action">
            <Icon name="mail" className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-accent">
            {n.reason}
            {n.state === "new" && <span className="rounded-full bg-action px-2 py-0.5 tracking-normal text-on-action">New</span>}
          </p>
          <p className="mt-1 font-serif text-lg font-semibold leading-snug">{n.title}</p>
          <p className="mt-1">{n.hook}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <Icon name="clock" className="size-4" /> About {n.minutes} min
            </span>
            <span>Optional</span>
            {n.publishedOn && <span>Published {dateText(n.publishedOn)}</span>}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* A plain link: opening a note marks it read, so the page it leads to is never fetched ahead of a tap. */}
            <Link
              href={n.href}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90"
            >
              Open <Icon name="arrow-right" className="size-4" />
            </Link>
            {n.earlier && (
              <Link href={n.earlier.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-2">
                Earlier in this story: {n.earlier.title}
              </Link>
            )}
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => act("snooze", n.id)}
                className="min-h-11 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-surface disabled:opacity-50"
              >
                Remind me in a week
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act("dismiss", n.id)}
                className="min-h-11 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-surface disabled:opacity-50"
              >
                Dismiss<span className="sr-only">: {n.title}</span>
              </button>
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function useNotes() {
  const loaded = useApi<Loaded>("/api/field-notes");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const act = async (action: "dismiss" | "snooze", id: string) => {
    setBusy(true);
    try {
      await api("/api/field-notes", { body: { action, id } });
      setSaid(
        action === "dismiss"
          ? "Dismissed. The story is still in the Magazine whenever you want it."
          : "We’ll bring it back in a week. It’s in the Magazine if you want it sooner.",
      );
      loaded.reload();
    } catch (e) {
      setSaid((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { loaded, busy, said, act };
}

/** On the Hub home: the notes that have arrived, if there are any. With none, nothing is shown at all. */
export function HomeFieldNotes() {
  const { loaded, busy, said, act } = useNotes();
  const d = loaded.data;
  if (!d || (!d.notes.length && !said)) return null;
  return (
    <section aria-labelledby="home-field-notes" className="mt-10 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="home-field-notes" className="flex items-center gap-2 font-serif text-2xl font-semibold">
          <Icon name="mail" className="size-5 text-accent" /> Field Notes from Ava
        </h2>
        <Link href="/field-notes" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-2">
          All notes
        </Link>
      </div>
      <p className="text-ink-muted">Invitations back to a story or a task. All optional.</p>
      {d.notes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {d.notes.slice(0, 2).map((n) => (
            <Note key={n.id} n={n} act={act} busy={busy} />
          ))}
        </ul>
      )}
      <p role="status" className={cx("text-sm text-ink-muted", said && "mt-3")}>
        {said}
      </p>
    </section>
  );
}

export function FieldNotesList() {
  const { loaded, busy, said, act } = useNotes();
  if (loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!loaded.data) return <p className="mt-6 text-ink-muted">Loading…</p>;
  const d = loaded.data;
  return (
    <div className="mt-6">
      <p role="status" className={cx("text-ink-muted", said && "mb-3")}>
        {said}
      </p>
      {d.notes.length ? (
        <ul className="flex flex-col gap-3">
          {d.notes.map((n) => (
            <Note key={n.id} n={n} act={act} busy={busy} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-muted p-5 text-lg">
          No notes just now. Ava writes when a story you’ve met has moved on, or when something has changed for a task you do. Everything is still in the{" "}
          <Link href="/magazine" className="font-semibold text-accent underline underline-offset-2">
            Magazine
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/**
  A note being opened: asks the Hub to check it is still this person's and still there, marks it read, and goes to
  its page. Done from the browser, after the tap, so a page fetched ahead of time can never mark a note read.
*/
export function OpenNote({ id }: { id: string }) {
  const router = useRouter();
  const [gone, setGone] = useState<"unavailable" | "none" | "error" | null>(null);
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api<{ state: "open" | "unavailable" | "none"; href: string }>("/api/field-notes", { body: { action: "open", id } })
      .then((r) => (r.state === "open" ? router.replace(r.href) : setGone(r.state)))
      .catch(() => setGone("error"));
  }, [id, router]);
  if (!gone) return <p className="mt-6 text-lg text-ink-muted">Opening your note…</p>;
  return (
    <div className="mt-6 rounded-2xl bg-muted p-5">
      <p className="font-serif text-xl font-semibold">
        {gone === "unavailable"
          ? "This note is no longer available"
          : gone === "none"
            ? "There’s no note here for you"
            : "That note couldn’t be opened just now"}
      </p>
      <p className="mt-1 text-ink-muted">
        {gone === "unavailable"
          ? "The page it pointed to has been withdrawn or changed. Nothing you’ve done has been lost."
          : gone === "none"
            ? "It may have been for someone else, or it hasn’t arrived yet."
            : "Check your connection and try again."}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href="/magazine" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action">
          Go to the Magazine <Icon name="arrow-right" className="size-4" />
        </Link>
        <Link href="/field-notes" className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-5 font-semibold hover:bg-surface">
          Your Field Notes
        </Link>
      </div>
    </div>
  );
}
