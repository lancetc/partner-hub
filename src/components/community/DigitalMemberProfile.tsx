"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import type { DigitalMemberProfile as Profile } from "@/server/digitalMembers";
import { initials } from "@/content/community";
import { Icon } from "../Icon";
import { MemberChatWith } from "./MemberChat";
import { LivesStory } from "./LivesStory";

/*
  A Digital Member's profile (server/digitalMembers.ts), drawn the same way on its own page and in the modal that
  opens from a card. In the modal, the people they know open in the same modal rather than leaving the page.
*/

export const firstName = (name: string) => (/^(mr|mrs|ms)\b/i.test(name) ? name : name.split(" ")[0]);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">{children}</h3>
);

export function DigitalMemberProfile({ m, titleId, onPerson, modal }: { m: Profile; titleId?: string; onPerson?: (id: string) => void; modal?: boolean }) {
  const Title = modal ? "h2" : "h1";
  return (
    <>
      <header className={cx("relative isolate overflow-hidden bg-[#102a43] text-white", modal ? "" : "mt-3 rounded-3xl")}>
        {/* A gardener reading the Hub on his phone in the back garden, on the right; navy fades in behind the words. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed backdrop, sized by the header */}
        <img
          src="/images/hero-gardener-topic.webp"
          alt=""
          width={1914}
          height={822}
          className="absolute inset-0 -z-10 size-full object-cover object-[80%_36%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#102a43_0%,rgba(16,42,67,0.92)_38%,rgba(16,42,67,0.55)_70%,rgba(16,42,67,0.25)_100%)] max-sm:bg-[#102a43]/85"
        />
        <div className={cx("grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center", modal ? "p-6 pr-14 sm:p-7 sm:pr-16" : "p-6 sm:p-8")}>
          <Portrait name={m.name} src={m.portrait} className={cx("ring-4 ring-white/15", modal ? "size-28 sm:size-32" : "size-36 sm:size-44")} />
          <div>
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#7fd4d4]">Digital member · {m.groupLabel}</p>
            <Title id={titleId} className={cx("mt-2 font-serif font-semibold", modal ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl")}>
              {m.name}
            </Title>
            <p className="mt-1 text-lg text-white/80">
              {m.role}
              {m.pronouns && <span className="text-white/60"> · {m.pronouns}</span>}
            </p>
            <blockquote className="mt-4 max-w-2xl border-l-4 border-[#fab53d] pl-4 font-serif text-xl italic leading-snug">“{m.hello}”</blockquote>
            {/* Empty, and so hidden, when chat is off for this reader or this person. */}
            <div className="mt-5 empty:hidden">
              <MemberChatWith member={m} />
            </div>
          </div>
        </div>
        <p className={cx("flex items-center gap-2 bg-[#0b1f33]/80 py-2.5 text-xs text-white/80 backdrop-blur-sm", modal ? "px-6 sm:px-7" : "px-6 sm:px-8")}>
          <Icon name="info" className="size-3.5 shrink-0" />
          {m.name} is a fictional person made for Trilogy Care training. Any resemblance to real clients or staff is coincidental.
        </p>
      </header>
      <ProfileBody m={m} onPerson={onPerson} modal={modal} />
    </>
  );
}

/** Who they are, beneath the header: also the "About me" tab of a Lives in Progress story (LivesStory). */
export function ProfileBody({ m, onPerson, modal }: { m: Profile; onPerson?: (id: string) => void; modal?: boolean }) {
  const first = firstName(m.name);
  return (
    <>
      <div className={cx("grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]", modal ? "p-6 sm:p-7" : "mt-8")}>
        <div className="space-y-8">
          <section>
            <Eyebrow>About {first}</Eyebrow>
            <div className="mt-2 space-y-3 text-[1.05rem] leading-relaxed">
              {m.about.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
          {m.approach && (
            <figure className="border-l-4 border-[#008282] pl-5">
              <Eyebrow>{first}’s approach</Eyebrow>
              <blockquote className="mt-2 font-serif text-2xl italic leading-snug text-ink">“{m.approach}”</blockquote>
            </figure>
          )}
          {m.matters && (
            <section className="rounded-2xl border border-line bg-tealtint p-5">
              <Eyebrow>What matters to {first}</Eyebrow>
              <p className="mt-2 text-[1.05rem]">{m.matters}</p>
            </section>
          )}
          {m.themes.length > 0 && (
            <section>
              <Eyebrow>Meeting {first} helps you learn about</Eyebrow>
              <ul className="mt-3 flex flex-wrap gap-2">
                {m.themes.map((t) => (
                  <li key={t} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium">
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <Eyebrow>Where you’ll meet {first}</Eyebrow>
            {m.meet.length ? (
              <ul className="mt-3 space-y-2">
                {m.meet.map((c) => (
                  <li key={c.href}>
                    <Link
                      href={c.href}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 font-semibold hover:border-[#008282]"
                    >
                      <span>{c.title}</span>
                      <span aria-hidden className="text-[#008282] dark:text-[#3cb8b9]">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">{first} will turn up in training soon.</p>
            )}
          </section>
          {m.knows.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-5">
              <Eyebrow>People {first} knows</Eyebrow>
              <ul className="mt-3 space-y-3">
                {m.knows.map((k) => {
                  const inner = (
                    <>
                      {k.member ? (
                        <Portrait name={k.member.name} src={k.member.portrait} className="size-11 text-sm" />
                      ) : (
                        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted" aria-hidden>
                          <Icon name="user" className="size-5 text-ink-muted" />
                        </span>
                      )}
                      <span className="min-w-0 text-left">
                        <span className="block font-semibold">{k.name}</span>
                        <span className="block text-sm text-ink-muted">
                          {k.relation.charAt(0).toUpperCase() + k.relation.slice(1)}
                          {k.note && ` · ${k.note}`}
                        </span>
                      </span>
                    </>
                  );
                  const row = "flex w-full items-center gap-3 rounded-xl hover:bg-muted";
                  return (
                    <li key={k.id}>
                      {k.member && onPerson ? (
                        <button type="button" onClick={() => onPerson(k.member!.id)} className={row}>
                          {inner}
                        </button>
                      ) : k.member ? (
                        <Link href={`/community/digital/${k.member.id}`} className={row}>
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

/**
  The profile modal. `open(id)` shows someone; a card keeps its link to the full page, so a new tab or a copied link
  still works, and only a plain click opens the modal.
*/
export function useDigitalMemberModal() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [id, setId] = useState<string | null>(null);
  const [m, setM] = useState<(Profile & { lives?: boolean }) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Lives in Progress: the episode to open at (from a Life Moment or a notice); none means the latest.
  const [episode, setEpisode] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    api<Profile & { lives?: boolean }>(`/api/community/digital-members/${encodeURIComponent(id)}`).then(
      (p) => {
        if (!live) return;
        setM(p);
        setProblem(null);
        dialog.current?.scrollTo({ top: 0 });
      },
      (e: Error) => live && setProblem(e.message),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const open = useCallback((next: string, atEpisode?: string | null) => {
    setId(next);
    setEpisode(atEpisode ?? null);
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  /** For a card's link: a plain click opens the modal; a modified click (new tab, copy) follows the link. */
  const onCardClick = useCallback(
    (next: string) => (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      open(next);
    },
    [open],
  );

  const shown = m && m.id === id ? m : null;
  const titleId = "digital-member-title";
  const modal = (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      // Only its own close: React passes a nested dialog’s close (the chat) up to this one.
      onClose={(e) => {
        if (e.target !== e.currentTarget) return;
        setId(null);
        setM(null);
        setProblem(null);
        setEpisode(null);
      }}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="pointer-events-auto m-auto max-h-[92vh] w-[min(60rem,calc(100vw-2rem))] max-w-none overflow-y-auto overscroll-contain rounded-3xl bg-bg p-0 text-left text-ink shadow-2xl backdrop:bg-[#0b1626]/70 backdrop:backdrop-blur-sm"
    >
      {/* Stays in the corner while the profile scrolls, without taking any room from it. */}
      <div className="sticky top-0 z-10 h-0">
        <button
          type="button"
          aria-label="Close"
          onClick={() => dialog.current?.close()}
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-[#06223a]/60 text-white backdrop-blur hover:bg-[#06223a]/80"
        >
          <Icon name="close" className="size-5" />
        </button>
      </div>
      {shown ? (
        <>
          {/* A Lives in Progress character opens on what's happening in their life now (LivesStory); others on their profile. */}
          {shown.lives ? (
            <LivesStory key={`${shown.id}:${episode ?? ""}`} profile={shown} titleId={titleId} onPerson={(p) => open(p)} modal initialEpisode={episode} />
          ) : (
            <DigitalMemberProfile m={shown} titleId={titleId} onPerson={(p) => open(p)} modal />
          )}
          <p className="border-t border-line px-6 py-4 text-right sm:px-7">
            <Link href={`/community/digital/${shown.id}`} className="text-sm font-semibold text-[#008282] hover:underline dark:text-[#3cb8b9]">
              Open {firstName(shown.name)}’s page <span aria-hidden>→</span>
            </Link>
          </p>
        </>
      ) : problem ? (
        <p className="p-8 text-ink-muted">Couldn’t open this profile: {problem}</p>
      ) : (
        <div className="min-h-80 animate-pulse bg-[#102a43]" aria-label="Loading" />
      )}
    </dialog>
  );
  return { open, onCardClick, modal };
}

/** A character's portrait, or their initials when the library has no picture yet. The name is always written beside it. */
export function Portrait({ name, src, className }: { name: string; src: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are
    <img src={src} alt="" className={cx("shrink-0 rounded-full bg-muted object-cover ring-2 ring-surface", className)} />
  ) : (
    <span className={cx("grid shrink-0 place-items-center rounded-full bg-[#102a43] font-mulish text-xl font-extrabold text-white", className)} aria-hidden>
      {initials(name)}
    </span>
  );
}
