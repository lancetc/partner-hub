"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { cap, episodeDate, episodeLabel, INTERACTION_KINDS, RESOURCE_KINDS, type InteractionKind } from "@/lib/livesInProgress";
import type { IntroAudioAction } from "@/lib/magazineNarration";
import type { DigitalMemberProfile as Profile } from "@/server/digitalMembers";
import type { LivesStoryView, StoryEpisode } from "@/server/livesInProgress";
import { IntroPlayer } from "../magazine/IntroPlayer";
import { Icon, type IconName } from "../Icon";
import { firstName, Portrait, ProfileBody } from "./DigitalMemberProfile";
import { MemberChatWith, type ChatStory } from "./MemberChat";

/*
  Lives in Progress (docs/lives-in-progress.md): a Digital Member's profile, led by what's happening in their life
  now. A cinematic hero with the current episode, the episode itself, their audio diary (never autoplayed, always
  with its words), ways to spend a moment with them, and tabs for their story so far, who they are, and the reader's
  own conversations with them. Drawn the same way in the modal and on their page.

  Everything here is what the server says this reader may see: episodes that are out, or for an author previewing,
  anything not archived. Looking back at an earlier episode is said plainly, and the chat then knows only that far.
*/

type Tab = "latest" | "story" | "about" | "talks";
const KIND_ICONS: Record<InteractionKind, IconName> = { conversation: "chat", decide: "branch", perspective: "people", reflect: "bulb", learn: "book" };

export function LivesStory({
  profile,
  titleId,
  onPerson,
  modal,
  initialEpisode,
  preview,
}: {
  profile: Profile;
  titleId?: string;
  onPerson?: (id: string) => void;
  modal?: boolean;
  initialEpisode?: string | null;
  /** An author's preview: episodes that aren't out yet can be opened, and nothing is counted. */
  preview?: boolean;
}) {
  const [episodeId, setEpisodeId] = useState<string | null>(initialEpisode ?? null);
  const [tab, setTab] = useState<Tab>("latest");
  const q = new URLSearchParams();
  if (episodeId) q.set("episode", episodeId);
  if (preview) q.set("preview", "1");
  const { data, error, reload } = useApi<LivesStoryView>(`/api/community/lives/${encodeURIComponent(profile.id)}${q.size ? `?${q}` : ""}`);
  const top = useRef<HTMLDivElement>(null);
  const first = firstName(profile.name);
  const Title = modal ? "h2" : "h1";

  // What learners chose to do, for the report. An author's preview isn't counted.
  const post = (kind: string, extra: Record<string, unknown> = {}) => {
    if (preview) return;
    void api(`/api/community/lives/${encodeURIComponent(profile.id)}`, { body: { kind, ...extra } }).catch(() => {});
  };
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || preview) return;
    opened.current = true;
    void api(`/api/community/lives/${encodeURIComponent(profile.id)}`, { body: { kind: "open", detail: modal ? "modal" : "page" } }).catch(() => {});
  }, [profile.id, modal, preview]);
  const viewedId = data?.viewing?.id;
  useEffect(() => {
    if (!viewedId || preview) return;
    void api(`/api/community/lives/${encodeURIComponent(profile.id)}`, { body: { kind: "episode_view", episodeId: viewedId } }).catch(() => {});
  }, [viewedId, profile.id, preview]);

  const goTo = (id: string | null) => {
    setEpisodeId(id);
    setTab("latest");
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  if (error)
    return (
      <p className="p-8 text-ink-muted">
        Couldn’t open {first}’s story: {error}
      </p>
    );
  if (!data)
    return (
      <div className="relative min-h-80 bg-[#0b1f33]" aria-label="Loading">
        {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
        {profile.portrait && <img src={profile.portrait} alt="" className="absolute inset-0 size-full object-cover opacity-40" />}
      </div>
    );

  const p = data.member.pronouns;
  const e = data.viewing;
  const labels: Record<Tab, string> = {
    latest: "Latest story",
    story: `${cap(p.possessive)} story so far`,
    about: "About me",
    talks: "Our conversations",
  };
  const chatStory = (ep: StoryEpisode): ChatStory => ({
    episodeId: ep.id,
    number: ep.number,
    title: ep.title,
    historical: data.historical,
    memory: data.memory.enabled,
    remembered: data.conversations.length,
    preview: data.preview,
  });

  return (
    <div ref={top} className="scroll-mt-4">
      <Hero data={data} titleId={titleId} Title={Title} modal={modal} onFollow={(on, notify) => post(on ? "follow" : "unfollow", { notify })} />
      <Tabs tab={tab} setTab={setTab} labels={labels} talks={data.conversations.length} modal={modal} />
      <div className={cx(modal ? "px-5 pb-8 pt-6 sm:px-7" : "pb-8 pt-6")}>
        {tab === "latest" && e && (
          <LatestStory
            key={e.id}
            data={data}
            e={e}
            first={first}
            portrait={profile.portrait}
            onBack={() => goTo(null)}
            post={post}
            chat={(ep) => chatStory(ep)}
            member={{ id: profile.id, name: profile.name, role: profile.role, portrait: profile.portrait, hello: profile.hello }}
          />
        )}
        {tab === "story" && <Timeline data={data} onOpen={(id) => goTo(id === data.latestId ? null : id)} />}
        {tab === "about" && (
          <div className="-mx-5 -mt-6 sm:-mx-7">
            <ProfileBody m={profile} onPerson={onPerson} modal />
          </div>
        )}
        {tab === "talks" && (
          <Conversations
            data={data}
            first={first}
            onChange={reload}
            chat={
              e && (
                <MemberChatWith
                  member={{ id: profile.id, name: profile.name, role: profile.role, portrait: profile.portrait, hello: profile.hello }}
                  story={chatStory(e)}
                  label={<>Talk with {first}</>}
                  className={chatButton}
                />
              )
            }
          />
        )}
      </div>
      <p className={cx("flex items-center gap-2 border-t border-line py-3 text-xs text-ink-muted", modal ? "px-5 sm:px-7" : "")}>
        <Icon name="info" className="size-3.5 shrink-0" />
        {profile.name} is a fictional person made for Trilogy Care training. Their story is written by our learning team; any resemblance to real people is
        coincidental.
      </p>
    </div>
  );
}

const chatButton =
  "inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action";

// ---------------------------------------------------------------------------------------------
// The hero
// ---------------------------------------------------------------------------------------------

function Hero({
  data,
  titleId,
  Title,
  modal,
  onFollow,
}: {
  data: LivesStoryView;
  titleId?: string;
  Title: "h1" | "h2";
  modal?: boolean;
  onFollow: (on: boolean, notify: boolean) => void;
}) {
  const e = data.viewing;
  const m = data.member;
  const src = e?.hero.src || m.portrait;
  return (
    // The picture and the words side by side: the picture fills the right of the hero, framed on its focal point (the
    // face, from the Character Bible, or an episode picture's own), and the navy behind the words fades out well before
    // it, so nothing sits over their face. On a phone the picture comes first and the words follow underneath.
    <header className={cx("relative isolate overflow-hidden bg-[#0b1f33] text-white", !modal && "mt-3 rounded-3xl")}>
      {src && (
        <div className="relative aspect-[4/3] w-full sm:absolute sm:inset-y-0 sm:right-0 sm:aspect-auto sm:w-[56%]">
          {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
          <img
            src={src}
            alt={e?.hero.src ? e.hero.alt : m.alt}
            className="size-full object-cover"
            style={{ objectPosition: e?.hero.focus ?? m.focus }}
            onError={(ev) => {
              // A stand-in that isn't on this Hub falls back to their portrait, framed on their face.
              const img = ev.currentTarget;
              if (m.portrait && img.src !== new URL(m.portrait, location.href).href) {
                img.src = m.portrait;
                img.style.objectPosition = m.focus;
              }
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,31,51,0)_62%,#0b1f33_100%)] sm:bg-[linear-gradient(90deg,#0b1f33_0%,rgba(11,31,51,0.55)_14%,rgba(11,31,51,0)_36%)]"
          />
          {e?.hero.placeholder && (
            <p className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold">
              Placeholder picture: replace in Admin → Lives in Progress
            </p>
          )}
        </div>
      )}
      <div className={cx("relative flex flex-col justify-end sm:min-h-[27rem] sm:w-[52%]", modal ? "p-6 sm:p-8" : "p-6 sm:p-9")}>
        <p className="flex flex-wrap items-center gap-x-2 font-mulish text-xs font-extrabold uppercase tracking-[0.16em] text-[#fab53d]">
          Lives in Progress <span className="text-white/50">·</span> <span className="text-[#7fd4d4]">{m.groupLabel}</span>
        </p>
        <Title id={titleId} className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">
          {m.name}
        </Title>
        <p className="mt-1 max-w-xl text-white/80">{[m.circumstances, m.location].filter(Boolean).join(" · ")}</p>
        {e && (
          <div className="mt-5 max-w-xl">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              {data.isNew && !data.historical && (
                <span className="rounded-full bg-[#fab53d] px-2.5 py-0.5 font-mulish text-xs font-extrabold uppercase tracking-wider text-[#102a43]">
                  New episode
                </span>
              )}
              {data.historical && (
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 font-mulish text-xs font-extrabold uppercase tracking-wider">
                  An earlier chapter
                </span>
              )}
              <span className="font-semibold">
                {episodeLabel(e.number)} · {e.title}
              </span>
            </p>
            <p className="mt-0.5 text-sm text-white/70">{episodeDate(e.publishedAt)}</p>
            {e.quote && (
              <blockquote className="mt-3 border-l-4 border-[#fab53d] pl-4 font-serif text-2xl italic leading-snug sm:text-[1.7rem]">“{e.quote}”</blockquote>
            )}
          </div>
        )}
        <div className="mt-6">
          <Follow data={data} onFollow={onFollow} />
        </div>
      </div>
    </header>
  );
}

function Follow({ data, onFollow }: { data: LivesStoryView; onFollow: (on: boolean, notify: boolean) => void }) {
  const [on, setOn] = useState(data.following.on);
  const [notify, setNotify] = useState(data.following.notify);
  const first = firstName(data.member.name);
  if (data.preview) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => {
          setOn(!on);
          onFollow(!on, notify);
        }}
        className={cx(
          "inline-flex min-h-11 items-center gap-2 rounded-full px-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
          on ? "bg-white/15 text-white ring-1 ring-white/40 hover:bg-white/25" : "bg-white text-[#102a43] hover:bg-[#e8f6f6]",
        )}
      >
        <Icon name={on ? "check" : "plus"} className="size-4" />
        {on ? `Following ${first}` : `Follow ${first}’s story`}
      </button>
      {on && (
        <button
          type="button"
          aria-pressed={notify}
          onClick={() => {
            setNotify(!notify);
            onFollow(true, !notify);
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white/85 ring-1 ring-white/25 hover:bg-white/10"
        >
          <Icon name="inbox" className="size-4" />
          {notify ? "New episodes go to your Inbox" : "No notifications"}
        </button>
      )}
    </div>
  );
}

function Tabs({ tab, setTab, labels, talks, modal }: { tab: Tab; setTab: (t: Tab) => void; labels: Record<Tab, string>; talks: number; modal?: boolean }) {
  const order: Tab[] = ["latest", "story", "about", "talks"];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      role="tablist"
      aria-label="Their story"
      className={cx("sticky top-0 z-[5] flex gap-1 overflow-x-auto border-b border-line bg-bg/95 backdrop-blur", modal ? "px-3 sm:px-5" : "")}
    >
      {order.map((t, i) => (
        <button
          key={t}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          aria-selected={tab === t}
          tabIndex={tab === t ? 0 : -1}
          onClick={() => setTab(t)}
          onKeyDown={(ev) => {
            const d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
            if (!d) return;
            ev.preventDefault();
            const next = order[(i + d + order.length) % order.length];
            setTab(next);
            refs.current[order.indexOf(next)]?.focus();
          }}
          className={cx(
            "min-h-12 shrink-0 whitespace-nowrap border-b-[3px] px-3 text-base font-semibold transition-colors",
            tab === t ? "border-[#008282] text-ink" : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {labels[t]}
          {t === "talks" && talks > 0 && <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">{talks}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The episode
// ---------------------------------------------------------------------------------------------

type Member = { id: string; name: string; role: string; portrait: string; hello: string };

function LatestStory({
  data,
  e,
  first,
  portrait,
  onBack,
  post,
  chat,
  member,
}: {
  data: LivesStoryView;
  e: StoryEpisode;
  first: string;
  portrait: string;
  onBack: () => void;
  post: (kind: string, extra?: Record<string, unknown>) => void;
  chat: (e: StoryEpisode) => ChatStory;
  member: Member;
}) {
  const p = data.member.pronouns;
  const [open, setOpen] = useState<string | null>(null);
  const learnLinks = new Set(e.interactions.filter((i) => i.kind === "learn").map((i) => i.href));
  return (
    <div className="space-y-10">
      {data.historical && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-[#fab53d]/60 bg-[#fff8e8] px-4 py-3 text-sm dark:bg-[#2e2612]">
          <Icon name="clock" className="size-4 shrink-0" />
          <span className="flex-1">You’re looking back at an earlier chapter. {first} only knows what had happened by then.</span>
          <button type="button" onClick={onBack} className="font-semibold text-[#007373] hover:underline dark:text-[#3cb8b9]">
            Back to the latest <span aria-hidden>→</span>
          </button>
        </p>
      )}
      {e.status && e.status !== "published" && (
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm">
          Preview: this episode is <strong>{e.status.replace("_", " ")}</strong>. Learners can’t see it yet.
        </p>
      )}

      <section aria-labelledby={`ep-${e.id}`}>
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#007373] dark:text-[#3cb8b9]">
          {episodeLabel(e.number)} · {episodeDate(e.publishedAt)}
          {e.arcTitle && <span className="text-ink-muted"> · {e.arcTitle}</span>}
        </p>
        <h3 id={`ep-${e.id}`} className="mt-2 font-serif text-3xl font-semibold leading-tight sm:text-[2.1rem]">
          {e.title}
        </h3>
        <p className="mt-3 max-w-3xl text-[1.15rem] leading-relaxed">{e.story}</p>
        {e.dialogue && (
          <figure className="mt-6 flex max-w-3xl gap-4">
            <Portrait name={member.name} src={portrait} className="size-14 text-sm" />
            <blockquote className="font-serif text-xl italic leading-snug text-ink">“{e.dialogue}”</blockquote>
          </figure>
        )}
      </section>

      <Diary e={e} name={member.name} first={first} possessive={p.possessive} portrait={portrait} post={post} />

      {e.interactions.length > 0 && (
        <section aria-labelledby={`moment-${e.id}`}>
          <h3 id={`moment-${e.id}`} className="font-serif text-2xl font-semibold">
            Spend a moment with {first}
          </h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {e.interactions.map((i) => {
              if (i.kind === "conversation")
                return (
                  <li key={i.id}>
                    <MemberChatWith
                      member={member}
                      story={chat(e)}
                      opener={i.body}
                      onStart={() => post("interaction", { episodeId: e.id, interactionId: i.id })}
                      icon={null}
                      className={momentCard}
                      label={<MomentLabel kind={i.kind} label={i.label} body={i.body} />}
                    />
                  </li>
                );
              if (i.kind === "learn")
                return (
                  <li key={i.id}>
                    <Link href={i.href} onClick={() => post("resource", { episodeId: e.id, detail: i.href })} className={momentCard}>
                      <MomentLabel kind={i.kind} label={i.label} body={i.body} />
                    </Link>
                  </li>
                );
              const isOpen = open === i.id;
              return (
                <li key={i.id} className={cx(isOpen && "sm:col-span-2")}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`moment-panel-${i.id}`}
                    onClick={() => {
                      setOpen(isOpen ? null : i.id);
                      if (!isOpen && i.kind !== "decide") post("interaction", { episodeId: e.id, interactionId: i.id });
                    }}
                    className={cx(momentCard, isOpen && "border-[#008282] bg-tealtint")}
                  >
                    <MomentLabel
                      kind={i.kind}
                      label={i.label}
                      body={i.kind === "perspective" && i.speaker ? `${i.speaker.name}, ${p.possessive} ${i.speaker.relation}` : i.body}
                    />
                  </button>
                  {isOpen && (
                    <div id={`moment-panel-${i.id}`} className="mt-2 rounded-2xl border border-line bg-surface p-5">
                      {i.kind === "decide" && (
                        <Decide
                          i={i}
                          first={first}
                          possessive={p.possessive}
                          onChoose={(o) => post("decision", { episodeId: e.id, interactionId: i.id, optionId: o })}
                        />
                      )}
                      {i.kind === "perspective" && (
                        <figure className="flex gap-4">
                          {i.speaker && <Portrait name={i.speaker.name} src={i.speaker.portrait} className="size-12 text-sm" />}
                          <div>
                            <blockquote className="font-serif text-lg italic leading-snug">“{i.body}”</blockquote>
                            {i.speaker && (
                              <figcaption className="mt-2 text-sm text-ink-muted">
                                {i.speaker.name}, {p.possessive} {i.speaker.relation}
                              </figcaption>
                            )}
                          </div>
                        </figure>
                      )}
                      {i.kind === "reflect" && <Reflect i={i} first={first} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {e.resources.filter((r) => !learnLinks.has(r.href)).length > 0 && (
        <section aria-label="Related learning">
          <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Related learning</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {e.resources
              .filter((r) => !learnLinks.has(r.href))
              .map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    onClick={() => post("resource", { episodeId: e.id, detail: r.href })}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold hover:border-[#008282]"
                  >
                    <span className="text-ink-muted">{RESOURCE_KINDS[r.kind]}</span> {r.title} <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

      {!data.historical && data.upcoming && (
        <section className="rounded-2xl border border-dashed border-line-strong p-5" aria-label="Coming next">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">Next episode · {episodeDate(data.upcoming.at)}</p>
          {data.upcoming.teaser && <p className="mt-2 font-serif text-lg italic">{data.upcoming.teaser}</p>}
        </section>
      )}
    </div>
  );
}

const momentCard =
  "flex h-full min-h-20 w-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-[#008282] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008282]";

function MomentLabel({ kind, label, body }: { kind: InteractionKind; label: string; body: string }) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tealtint text-[#007373] dark:text-[#3cb8b9]" aria-hidden>
        <Icon name={KIND_ICONS[kind]} className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{label || INTERACTION_KINDS[kind].label}</span>
        {body && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-muted">{body}</span>}
      </span>
    </>
  );
}

function Decide({
  i,
  first,
  possessive,
  onChoose,
}: {
  i: StoryEpisode["interactions"][number];
  first: string;
  possessive: string;
  onChoose: (optionId: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const pick = i.options.find((o) => o.id === chosen);
  const id = useId();
  return (
    <div>
      <p className="text-[1.05rem]">{i.body}</p>
      <div role="group" aria-labelledby={id} className="mt-3 flex flex-col gap-2">
        <span id={id} className="sr-only">
          Possible responses
        </span>
        {i.options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={chosen === o.id}
            onClick={() => {
              setChosen(o.id);
              onChoose(o.id);
            }}
            className={cx(
              "min-h-11 rounded-xl border px-4 py-2 text-left font-medium",
              chosen === o.id ? "border-[#008282] bg-tealtint" : "border-line hover:border-[#008282]",
            )}
          >
            {o.text}
          </button>
        ))}
      </div>
      {pick && (
        <div role="status" className="mt-4 rounded-2xl bg-muted p-4">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">What if · How {first} might react</p>
          <blockquote className="mt-2 font-serif text-lg italic leading-snug">“{pick.response}”</blockquote>
          <p className="mt-3 text-xs text-ink-muted">A what-if you explored, not what happened. {cap(possessive)} story carries on the same for everyone.</p>
        </div>
      )}
    </div>
  );
}

function Reflect({ i, first }: { i: StoryEpisode["interactions"][number]; first: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <p className="font-serif text-xl leading-snug">{i.body}</p>
      <p className="mt-2 text-sm text-ink-muted">Take a moment with it. There’s no right answer, and nothing is saved.</p>
      {i.thought &&
        (shown ? (
          <blockquote className="mt-4 border-l-4 border-[#008282] pl-4 font-serif text-lg italic leading-snug">“{i.thought}”</blockquote>
        ) : (
          <button
            type="button"
            onClick={() => setShown(true)}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
          >
            What {first} thinks
          </button>
        ))}
    </div>
  );
}

/** "In her own words": the diary, with a recording when there's a checked one, and the words always. Never autoplays. */
function Diary({
  e,
  name,
  first,
  possessive,
  portrait,
  post,
}: {
  e: StoryEpisode;
  name: string;
  first: string;
  possessive: string;
  portrait: string;
  post: (kind: string, extra?: Record<string, unknown>) => void;
}) {
  const [words, setWords] = useState(false);
  const title = `In ${possessive} own words`;
  const onEvent = (action: IntroAudioAction) => {
    const kind =
      action === "play" || action === "replay" ? "audio_play" : action === "complete" ? "audio_complete" : action === "transcript" ? "transcript" : null;
    if (kind) post(kind, { episodeId: e.id });
  };
  return (
    <section aria-label={title} className="rounded-3xl bg-[#102a43] p-5 text-white sm:p-6">
      <div className="flex items-center gap-4">
        <Portrait name={name} src={portrait} className="size-16 text-lg ring-white/20" />
        <div className="min-w-0">
          <h3 className="font-serif text-2xl font-semibold">{title}</h3>
          <p className="text-sm text-white/70">
            {first}’s diary · {episodeDate(e.publishedAt)}
            {e.diary.audio && ` · ${Math.round(e.diary.audio.seconds)} seconds`}
          </p>
        </div>
      </div>
      {e.diary.audio ? (
        <div className="mt-4 rounded-2xl bg-white p-3 text-ink dark:bg-[#0b1f33] dark:text-white">
          <IntroPlayer
            script={e.diary.script}
            audio={{
              src: e.diary.audio.src,
              seconds: e.diary.audio.seconds,
              words: null,
              scriptHash: e.diary.audio.scriptHash,
              voice: e.diary.audio.voice,
              at: e.diary.audio.at,
            }}
            onEvent={onEvent}
            label={`Listen to ${first}’s diary`}
          />
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-white/70">The recording isn’t ready yet. Here’s what {first} wrote.</p>
          <button
            type="button"
            aria-expanded={words}
            onClick={() => {
              setWords(!words);
              if (!words) post("transcript", { episodeId: e.id });
            }}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 font-semibold ring-1 ring-white/25 hover:bg-white/20"
          >
            <Icon name="doc" className="size-4" /> {words ? "Hide the diary" : "Read the diary"}
          </button>
          {words && <p className="mt-4 whitespace-pre-line font-serif text-lg leading-relaxed text-white/95">{e.diary.script}</p>}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The story so far, and our conversations
// ---------------------------------------------------------------------------------------------

function Timeline({ data, onOpen }: { data: LivesStoryView; onOpen: (id: string) => void }) {
  const first = firstName(data.member.name);
  const arcs = [...new Set(data.timeline.map((t) => t.arcTitle))];
  return (
    <div className="space-y-8">
      {arcs.map((arc) => (
        <section key={arc} aria-label={arc || "Episodes"}>
          {arcs.length > 1 && <h3 className="mb-3 font-serif text-xl font-semibold">{arc}</h3>}
          <ol className="relative space-y-3 before:absolute before:bottom-4 before:left-[2.15rem] before:top-4 before:w-px before:bg-line sm:before:left-[2.65rem]">
            {data.timeline
              .filter((t) => t.arcTitle === arc)
              .map((t) => (
                <li key={t.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onOpen(t.id)}
                    aria-current={data.viewing?.id === t.id ? "true" : undefined}
                    className={cx(
                      "flex w-full items-start gap-4 rounded-2xl border bg-surface p-3 text-left transition hover:border-[#008282]",
                      data.viewing?.id === t.id ? "border-[#008282]" : "border-line",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
                    <img src={t.thumb} alt="" className="size-[3.75rem] shrink-0 rounded-xl bg-muted object-cover sm:size-[4.75rem]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-ink-muted">
                        <span className="font-mulish font-extrabold uppercase tracking-wider text-[#007373] dark:text-[#3cb8b9]">{episodeLabel(t.number)}</span>
                        <span>{episodeDate(t.publishedAt)}</span>
                        {t.status && t.status !== "published" && <span className="rounded-full bg-muted px-2">{t.status.replace("_", " ")}</span>}
                      </span>
                      <span className="mt-0.5 block font-serif text-lg font-semibold leading-snug">{t.title}</span>
                      <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">{t.blurb}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                        {t.viewed ? (
                          <span className="inline-flex items-center gap-1">
                            <Icon name="check" className="size-3.5" /> Seen
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-ink">
                            <span className="size-2 rounded-full bg-[#fab53d]" aria-hidden /> Not seen yet
                          </span>
                        )}
                        {t.audio && (
                          <span className="inline-flex items-center gap-1">
                            <Icon name="volume" className="size-3.5" /> Audio diary
                          </span>
                        )}
                        {t.kinds.map((k) => (
                          <span key={k} className="inline-flex items-center gap-1" title={INTERACTION_KINDS[k as InteractionKind]?.label}>
                            <Icon name={KIND_ICONS[k as InteractionKind] ?? "spark"} className="size-3.5" />
                            <span className="sr-only">{INTERACTION_KINDS[k as InteractionKind]?.label}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ol>
        </section>
      ))}
      {data.upcoming && (
        <p className="rounded-2xl border border-dashed border-line-strong p-4 text-sm">
          <span className="font-semibold">Coming {episodeDate(data.upcoming.at)}.</span> {data.upcoming.teaser || `${first}’s story carries on.`}
        </p>
      )}
    </div>
  );
}

function Conversations({ data, first, onChange, chat }: { data: LivesStoryView; first: string; onChange: () => void; chat: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const forget = async (id?: string) => {
    setBusy(true);
    try {
      await api(`/api/community/lives/${encodeURIComponent(data.member.id)}/memory${id ? `?conversation=${encodeURIComponent(id)}` : ""}`, {
        method: "DELETE",
      });
      onChange();
    } finally {
      setBusy(false);
      setSure(false);
    }
  };
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-tealtint p-5">
        <h3 className="font-serif text-xl font-semibold">What {first} remembers</h3>
        {data.memory.enabled ? (
          <p className="mt-2 text-base">
            When you chat, {first} remembers the topics you talked about and a few of your questions, so next time feels like picking up where you left off.
            Never the whole conversation, and never anything that looks like a phone number or someone’s details. Only you can see this. It’s kept for{" "}
            {data.memory.retentionDays} days.
          </p>
        ) : (
          <p className="mt-2">Memory is switched off on this Hub: each chat with {first} starts fresh.</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">{chat}</div>
      </div>
      {data.conversations.length ? (
        <>
          <ul className="space-y-3">
            {data.conversations.map((c) => (
              <li key={c.id} className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-4">
                <Icon name={c.category === "hypothetical" ? "branch" : "chat"} className="mt-1 size-5 shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink-muted">
                    {new Date(c.at).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}
                    {c.episodeNumber && ` · around ${episodeLabel(c.episodeNumber)}`}
                    {c.category === "hypothetical" && " · a what-if, not what happened"}
                  </p>
                  <p className="mt-1 font-semibold">{c.summary}</p>
                  {c.details.questions.length > 0 && (
                    <p className="mt-1 text-sm text-ink-muted">You asked: {c.details.questions.map((x) => `“${x}”`).join(" ")}</p>
                  )}
                  {c.details.decisions.length > 0 && <p className="mt-1 text-sm text-ink-muted">{c.details.decisions.join(" ")}</p>}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void forget(c.id)}
                  className="shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-muted hover:text-ink"
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
          {sure ? (
            <p className="flex flex-wrap items-center gap-3 text-sm">
              Forget everything you and {first} have talked about? This can’t be undone.
              <button
                type="button"
                disabled={busy}
                onClick={() => void forget()}
                className="rounded-full border border-danger/60 px-4 py-2 font-semibold hover:bg-danger/10"
              >
                Yes, forget it all
              </button>
              <button type="button" onClick={() => setSure(false)} className="rounded-full px-3 py-2 font-semibold text-ink-muted hover:bg-muted">
                Keep it
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setSure(true)}
              className="text-sm font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Clear our history
            </button>
          )}
        </>
      ) : (
        <p className="text-ink-muted">You haven’t talked with {first} yet.</p>
      )}
    </div>
  );
}
