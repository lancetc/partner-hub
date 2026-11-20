"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import type { ResetBlock } from "@/lib/magazine";
import {
  cleanProgress,
  COPY_NOTE,
  copyChecks,
  eligiblePosts,
  EMPTY_PEERS,
  emptyProgress,
  isStale,
  markerPosition,
  OFFER_UNAPPROVED,
  PEER_LABEL,
  RESET_NOTICE,
  REVIEWED_LABEL,
  type Marker,
  type PeerCard,
  type ResetEvent,
  type ResetProgress,
} from "@/lib/reset";
import { members, posts } from "@/content/community";
import type { resetState } from "@/server/reset";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  The Expectation Reset (docs/expectation-reset.md). An illustrative waiting-period story with "How I Kept Them
  Warm" markers. A marker opens a drawer beside the story on a wide screen (the story stays usable) and a full
  sheet on a phone (focus stays inside it, Escape closes it). Closing returns focus to the marker, and the story
  stays where it was. Nothing animates. Peer cards come from the Community, filtered on the server.

  In the editor's preview it works from the Community content directly, and can show the empty, withdrawn,
  stale and offline states an author needs to check.
*/

type Loaded = ReturnType<typeof resetState>;
type Sim = "normal" | "empty" | "withdrawn" | "stale" | "offline";
const SIMS: Record<Sim, string> = {
  normal: "Normal",
  empty: "No peer posts qualify",
  withdrawn: "A post withdrawn in the Community",
  stale: "The reviewed script is past its review date",
  offline: "The Community isn’t available",
};
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const showDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))
    : "";
const daysAgo = (n: number) => (n === 0 ? "today" : n === 1 ? "yesterday" : n < 14 ? `${n} days ago` : `${Math.round(n / 7)} weeks ago`);

export function ExpectationReset({ block: b, ctx }: { block: ResetBlock; ctx: InteractiveContext }) {
  const hydrated = useHydrated();
  const url = `/api/magazine/${ctx.guideId}/reset`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [progress, setProgress] = useState<ResetProgress | null>(ctx.preview ? emptyProgress() : null);
  const [sim, setSim] = useState<Sim>("normal");
  const [pos, setPos] = useState(0);
  const [open, setOpen] = useState<{ id: string; modal: boolean } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const dirty = useRef(false);
  const done = useRef(false);

  if (!ctx.preview && loaded.data && progress === null) setProgress(cleanProgress(b, loaded.data.progress));
  useEffect(() => {
    if (ctx.preview || !progress || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, progress } }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [progress, ctx.preview, url, b.id]);

  if (!ctx.preview && loaded.error && !progress)
    return (
      <Shell title={b.title}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!progress)
    return (
      <Shell title={b.title}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  // In the editor's preview the Community content is read directly, today's date is the browser's, and an author can simulate states.
  const today = ctx.preview ? (hydrated ? new Date().toISOString().slice(0, 10) : "") : (loaded.data?.today ?? "");
  const offline = ctx.preview ? sim === "offline" : Boolean(loaded.error);
  const peersOf = (m: Marker): PeerCard[] => {
    if (offline) return [];
    if (!ctx.preview) return loaded.data?.peers[m.id] ?? [];
    if (sim === "empty") return [];
    const cards = eligiblePosts(m, posts, members, new Set(), today);
    return sim === "withdrawn" ? eligiblePosts(m, posts, members, new Set(cards.slice(0, 1).map((c) => c.postId)), today) : cards;
  };
  const staleOf = (m: Marker) => (ctx.preview ? sim === "stale" || (today ? isStale(m, today) : false) : (loaded.data?.stale ?? []).includes(m.id));

  const change = (fn: (p: ResetProgress) => ResetProgress) => {
    dirty.current = true;
    setProgress((p) => (p ? fn(p) : p));
  };
  const event = (e: ResetEvent, marker: string, post?: string) => {
    if (!ctx.preview) api(url, { body: { action: "event", blockId: b.id, event: e, marker, post } }).catch(() => undefined);
  };
  const openMarker = (m: Marker, el: HTMLButtonElement) => {
    opener.current = el;
    const modal = !window.matchMedia("(min-width: 1024px)").matches;
    setOpen({ id: m.id, modal });
    event("opened", m.id);
    change((p) => {
      const opened = p.opened.includes(m.id) ? p.opened : [...p.opened, m.id];
      // Opening every marker is what counts as having worked through the block.
      if (!done.current && b.markers.every((x) => opened.includes(x.id))) {
        done.current = true;
        ctx.activity(b.id, { outcome: "explored" });
        ctx.engaged(b.id);
      }
      return { ...p, opened };
    });
  };
  const close = () => {
    setOpen(null);
    requestAnimationFrame(() => opener.current?.focus());
  };
  const marker = open ? b.markers.find((m) => m.id === open.id) : undefined;

  const drawer = marker && (
    <Drawer
      key={marker.id}
      block={b}
      m={marker}
      modal={open!.modal}
      peers={peersOf(marker)}
      offline={offline}
      stale={staleOf(marker)}
      progress={progress}
      change={change}
      event={event}
      flag={(target, text) =>
        ctx.preview ? Promise.resolve() : api(url, { body: { action: "flag", blockId: b.id, marker: marker.id, target, text } }).then(() => undefined)
      }
      onClose={close}
    />
  );

  return (
    <Shell title={b.title}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{RESET_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      {ctx.preview && (
        <label className="mt-3 flex max-w-md flex-col gap-1 rounded-2xl bg-muted p-3 text-sm">
          <span className="font-semibold">Preview the Community’s state</span>
          <select className={field} value={sim} onChange={(e) => setSim(e.target.value as Sim)}>
            {(Object.keys(SIMS) as Sim[]).map((k) => (
              <option key={k} value={k}>
                {SIMS[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      <article aria-label={`About ${b.person.name}`} className={cx(box, "mt-4")}>
        <CharacterRow names={[b.person.name, b.family.name]} size="sm">
          <p>
            <span className="font-semibold">{b.person.name}. </span>
            {b.person.about}
          </p>
          {b.family.name && (
            <p className="mt-1 text-sm">
              <span className="font-semibold">
                {b.family.name}
                {b.family.relation ? ` (${b.family.relation})` : ""}:{" "}
              </span>
              {b.consent}
            </p>
          )}
        </CharacterRow>
      </article>

      <div className={cx("mt-4 grid gap-4", open && !open.modal && "lg:grid-cols-[minmax(0,1fr)_26rem]")}>
        <Timeline block={b} pos={pos} setPos={setPos} progress={progress} openId={open?.id ?? null} onOpen={openMarker} />
        {open && !open.modal && drawer}
      </div>
      {open?.modal && drawer}

      {progress.saved.length > 0 && <Saved block={b} saved={progress.saved} peersOf={peersOf} />}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Expectation Reset: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="timeline" className="size-5" /> The Expectation Reset · illustrative story
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** The story: points in order, with markers at a point or between two. The months are the story's, not estimates. */
function Timeline({
  block: b,
  pos,
  setPos,
  progress,
  openId,
  onOpen,
}: {
  block: ResetBlock;
  pos: number;
  setPos: (n: number) => void;
  progress: ResetProgress;
  openId: string | null;
  onOpen: (m: Marker, el: HTMLButtonElement) => void;
}) {
  const at = (i: number) => b.markers.filter((m) => markerPosition(b, m).at === i);
  const between = (i: number) => b.markers.filter((m) => markerPosition(b, m).between?.[0] === i);
  return (
    <section aria-label={`${b.person.name}’s story`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Move through the story">
        <button type="button" className={secondary} disabled={pos <= 0} onClick={() => setPos(pos - 1)}>
          Earlier
        </button>
        <p className="flex-1 text-sm font-semibold" aria-live="polite">
          Story month {b.nodes[pos]?.month}: {b.nodes[pos]?.label}
        </p>
        <button type="button" className={secondary} disabled={pos >= b.nodes.length - 1} onClick={() => setPos(pos + 1)}>
          Later
        </button>
      </div>
      <ol className="flex flex-col gap-2 border-l-2 border-line pl-4">
        {b.nodes.map((n, i) => (
          <li key={n.id} className="flex flex-col gap-2">
            <div className={cx("relative rounded-xl p-3", i === pos ? "bg-muted ring-2 ring-accent" : "")} aria-current={i === pos ? "step" : undefined}>
              <span aria-hidden className={cx("absolute -left-[1.45rem] top-4 size-3 rounded-full", i <= pos ? "bg-accent" : "bg-line-strong")} />
              <button type="button" className="text-left" onClick={() => setPos(i)}>
                <span className="block text-xs font-semibold text-ink-muted">Story month {n.month}</span>
                <span className="block font-semibold">{n.label}</span>
              </button>
              {i === pos && n.summary && <p className="mt-1 text-sm">{n.summary}</p>}
              <ul className="mt-2 flex flex-col gap-2">
                {at(i).map((m) => (
                  <li key={m.id}>
                    <MarkerButton m={m} open={openId === m.id} opened={progress.opened.includes(m.id)} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            </div>
            {between(i).map((m) => (
              <div key={m.id} className="ml-4">
                <p className="mb-1 text-xs text-ink-muted">
                  Between {b.nodes[i].label.toLowerCase()} and {b.nodes[i + 1]?.label.toLowerCase()}
                </p>
                <MarkerButton m={m} open={openId === m.id} opened={progress.opened.includes(m.id)} onOpen={onOpen} />
              </div>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A marker: a button that opens its drawer. Kept outside the timeline so it stays the same element, and focus can return to it. */
function MarkerButton({ m, open, opened, onOpen }: { m: Marker; open: boolean; opened: boolean; onOpen: (m: Marker, el: HTMLButtonElement) => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={(e) => onOpen(m, e.currentTarget)}
      className={cx(
        "flex min-h-11 w-full flex-col items-start rounded-xl border border-dashed border-accent bg-surface px-3 py-2 text-left hover:bg-muted",
        open && "border-solid bg-muted",
      )}
    >
      <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-accent">
        {m.label} · How I Kept Them Warm{opened ? " · opened" : ""}
      </span>
      <span className="font-semibold">{m.subtitle}</span>
      {m.theme && <span className="text-sm text-ink-muted">{m.theme}</span>}
    </button>
  );
}

function Drawer({
  block: b,
  m,
  modal,
  peers,
  offline,
  stale,
  progress,
  change,
  event,
  flag,
  onClose,
}: {
  block: ResetBlock;
  m: Marker;
  modal: boolean;
  peers: PeerCard[];
  offline: boolean;
  stale: boolean;
  progress: ResetProgress;
  change: (fn: (p: ResetProgress) => ResetProgress) => void;
  event: (e: ResetEvent, marker: string, post?: string) => void;
  flag: (target: string, text: string) => Promise<void>;
  onClose: () => void;
}) {
  const ids = useId();
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [revealed, setRevealed] = useState(!m.firstTake || Boolean(progress.takes[m.id]));
  const [draft, setDraft] = useState(progress.takes[m.id] ?? "");
  const [using, setUsing] = useState(false);

  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (revealed) {
      event("featured", m.id);
      for (const p of peers) event("peer_viewed", m.id, p.postId);
    }
    // Once per reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
    if (!modal || e.key !== "Tab" || !panel.current) return;
    // On a phone it's a full sheet: focus stays inside it until it's closed.
    const focusable = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), textarea, input, select, [tabindex='-1']")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  const save = (key: string) => {
    change((p) => ({ ...p, saved: p.saved.includes(key) ? p.saved.filter((x) => x !== key) : [...p.saved, key] }));
    event("saved", m.id, key.startsWith("post:") ? key.slice(5) : undefined);
  };

  return (
    <aside
      ref={panel}
      role={modal ? "dialog" : "region"}
      aria-modal={modal || undefined}
      aria-labelledby={`${ids}-h`}
      onKeyDown={onKey}
      className={cx(
        "flex flex-col gap-4 bg-surface",
        modal
          ? "fixed inset-0 z-50 overflow-y-auto p-5"
          : "rounded-2xl p-4 ring-1 ring-line-strong lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 id={`${ids}-h`} ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
          {m.label}: {m.subtitle}
        </h4>
        <button type="button" className={secondary} onClick={onClose}>
          {modal ? "Back to the story" : "Close"}
        </button>
      </div>

      <section aria-label="At this point in the story" className={box}>
        <h5 className="font-semibold">At this point in the story (story month {m.month})</h5>
        <p className="mt-1">{m.story.now}</p>
        <Facts title="Known" items={m.story.known} />
        <Facts title="Not known" items={m.story.unknown} />
        <Facts title="What may have changed" items={m.story.changed} />
      </section>

      {!revealed ? (
        <section aria-label="Try your line" className={cx(box, "flex flex-col gap-2")}>
          <label htmlFor={`${ids}-take`} className="font-semibold">
            {m.question || `What would you say to ${b.person.name}?`}
          </label>
          <p className="text-sm text-ink-muted">Just for you: nobody else sees it, and it isn’t sent anywhere.</p>
          <textarea id={`${ids}-take`} className={cx(field, "min-h-24")} value={draft} maxLength={1500} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={draft.trim().length < 5}
              onClick={() => {
                change((p) => ({ ...p, takes: { ...p.takes, [m.id]: draft.trim() } }));
                event("take", m.id);
                setRevealed(true);
              }}
            >
              Save it and see the approaches
            </button>
            <button type="button" className={secondary} onClick={() => setRevealed(true)}>
              Skip to the approaches
            </button>
          </div>
        </section>
      ) : (
        <>
          {progress.takes[m.id] && (
            <p className="rounded-2xl bg-muted p-3 text-sm">
              <span className="font-semibold">Your first take: </span>
              <span className="whitespace-pre-line">{progress.takes[m.id]}</span>
            </p>
          )}

          <section aria-label={REVIEWED_LABEL} className={cx(box, "flex flex-col gap-2")}>
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="rounded-full bg-[#e3f4ea] px-2 py-0.5 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]">
                {stale ? "Under review" : `${REVIEWED_LABEL}${m.featured.reviewedBy ? `: reviewed by ${m.featured.reviewedBy}` : ""}`}
              </span>
              {m.featured.policyId && <span className="text-ink-muted">{m.featured.policyId}</span>}
              {m.featured.approvedOn && <span className="text-ink-muted">Approved {showDate(m.featured.approvedOn)}</span>}
            </p>
            {stale && (
              <p className={warn}>
                This script is past its review date, or hasn’t been reviewed yet. It’s shown for learning; it can’t be copied until it’s reviewed.
              </p>
            )}
            <p className="whitespace-pre-line font-serif text-lg">“{m.featured.text}”</p>
            <p className="text-sm">
              <span className="font-semibold">Why it works: </span>
              {m.featured.why}
            </p>
            <div className="flex flex-wrap gap-2">
              {m.allowCopy && (
                <button type="button" className={secondary} disabled={stale} aria-expanded={using} onClick={() => setUsing(!using)}>
                  Use this phrase
                </button>
              )}
              {m.allowSave && (
                <button type="button" className={secondary} aria-pressed={progress.saved.includes(`featured:${m.id}`)} onClick={() => save(`featured:${m.id}`)}>
                  {progress.saved.includes(`featured:${m.id}`) ? "Saved" : "Save"}
                </button>
              )}
              <FlagButton onFlag={(t) => flag("featured", t)} after={() => event("flagged", m.id)} />
            </div>
            {using && !stale && <UsePhrase block={b} m={m} onCopied={() => event("copied", m.id)} />}
          </section>

          <section aria-label="If something urgent comes up" className={warn}>
            <p className="font-semibold">If something has changed, or is urgent</p>
            <p className="mt-1">{m.urgent}</p>
          </section>

          <section aria-label="From the Community" className="flex flex-col gap-2">
            <h5 className="font-semibold">From the Community</h5>
            <p className="text-sm text-ink-muted">{PEER_LABEL}, from verified colleagues. Not policy.</p>
            {offline && <p className={box}>The Community isn’t available right now. {EMPTY_PEERS}</p>}
            {!offline && peers.length === 0 && <p className={box}>{m.fallback || EMPTY_PEERS}</p>}
            {peers.map((p) => (
              <article key={p.postId} aria-label={`${PEER_LABEL} from ${p.author || p.role}`} className={cx(box, "flex flex-col gap-2")}>
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{PEER_LABEL}</span>
                  <span className="font-semibold">{p.author ? `${p.author}, ${p.role}` : p.role}</span>
                  {p.verified && <span className="text-ink-muted">Verified role</span>}
                  <span className="text-ink-muted">Posted {daysAgo(p.daysAgo)}</span>
                </p>
                <p className="text-sm">
                  <span className="font-semibold">When I used this: </span>
                  {p.when}
                </p>
                <p className="whitespace-pre-line">“{p.script}”</p>
                {p.next && (
                  <p className="text-sm">
                    <span className="font-semibold">Next step: </span>
                    {p.next}
                  </p>
                )}
                {p.offer && <p className="text-sm font-semibold">{b.offer.approved ? `Trilogy Care offers this: ${b.offer.scope}` : OFFER_UNAPPROVED}</p>}
                {p.differs && <p className="text-sm text-ink-muted">A different approach: {p.differs}</p>}
                <p className="text-xs text-ink-muted">
                  {p.likes} likes · {p.comments} replies in the Community · review due {showDate(p.reviewDue)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/community#post-${p.postId}`} className={secondary} onClick={() => event("discussion", m.id, p.postId)}>
                    View discussion
                  </Link>
                  {m.allowSave && (
                    <button
                      type="button"
                      className={secondary}
                      aria-pressed={progress.saved.includes(`post:${p.postId}`)}
                      onClick={() => save(`post:${p.postId}`)}
                    >
                      {progress.saved.includes(`post:${p.postId}`) ? "Saved" : "Save"}
                    </button>
                  )}
                  <FlagButton onFlag={(t) => flag(p.postId, t)} after={() => undefined} />
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </aside>
  );
}

function Facts({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="list-disc pl-5 text-sm">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/** "Use this phrase": an editable starting point, with checks before it can be copied. The family version needs consent checked. */
function UsePhrase({ block: b, m, onCopied }: { block: ResetBlock; m: Marker; onCopied: () => void }) {
  const ids = useId();
  const [toFamily, setToFamily] = useState(false);
  const [text, setText] = useState(m.featured.text);
  const [ticked, setTicked] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const checks = copyChecks(toFamily, b.person.name, b.family.name);
  const ready = checks.every((c) => ticked.includes(c.id)) && text.trim().length > 0;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied. Remember: nothing has been sent or recorded.");
    } catch {
      area.current?.select();
      setNote("Your browser didn’t allow copying. The text is selected: copy it from there.");
    }
    onCopied();
  };
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted p-3">
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 text-sm font-semibold">Who it’s for</legend>
        {[false, true].map((fam) => (
          <label key={String(fam)} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name={`${ids}-to`}
              className="size-5"
              checked={toFamily === fam}
              onChange={() => {
                setToFamily(fam);
                setText(fam ? m.featured.family : m.featured.text);
                setTicked([]);
                setNote(null);
              }}
            />
            {fam ? `${b.family.name || "The family"}${b.family.relation ? ` (${b.family.relation})` : ""}` : b.person.name}
          </label>
        ))}
      </fieldset>
      {toFamily && <p className="text-sm">{b.consent}</p>}
      <label htmlFor={`${ids}-text`} className="text-sm font-semibold">
        Your version
      </label>
      <textarea id={`${ids}-text`} ref={area} className={cx(field, "min-h-28 whitespace-pre-line")} value={text} onChange={(e) => setText(e.target.value)} />
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold">Before you use it</legend>
        {checks.map((c) => (
          <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={ticked.includes(c.id)}
              onChange={(e) => setTicked(e.target.checked ? [...ticked, c.id] : ticked.filter((x) => x !== c.id))}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-ink-muted">{COPY_NOTE}</p>
      <div>
        <button type="button" className={primary} disabled={!ready} onClick={() => void copy()}>
          Copy
        </button>
      </div>
      {note && (
        <p role="status" className="text-sm">
          {note}
        </p>
      )}
    </div>
  );
}

function FlagButton({ onFlag, after }: { onFlag: (text: string) => Promise<void>; after: () => void }) {
  const ids = useId();
  const [openForm, setOpenForm] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  if (state === "sent") return <p className="self-center text-sm">Thanks. The content owner will look at it.</p>;
  if (!openForm)
    return (
      <button type="button" className={secondary} onClick={() => setOpenForm(true)}>
        Flag as out of date
      </button>
    );
  return (
    <div className="flex w-full flex-col gap-1">
      <label htmlFor={`${ids}-flag`} className="text-sm font-semibold">
        What looks out of date?
      </label>
      <textarea id={`${ids}-flag`} className={field} value={text} maxLength={600} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <button
          type="button"
          className={secondary}
          disabled={text.trim().length < 5}
          onClick={() =>
            onFlag(text.trim()).then(
              () => {
                setState("sent");
                after();
              },
              () => setState("error"),
            )
          }
        >
          Send flag
        </button>
        <button type="button" className={secondary} onClick={() => setOpenForm(false)}>
          Cancel
        </button>
      </div>
      {state === "error" && <p role="alert">That didn’t send. Try again.</p>}
    </div>
  );
}

function Saved({ block: b, saved, peersOf }: { block: ResetBlock; saved: string[]; peersOf: (m: Marker) => PeerCard[] }) {
  const items = saved
    .map((key) => {
      if (key.startsWith("featured:")) {
        const m = b.markers.find((x) => x.id === key.slice(9));
        return m ? { key, label: `${m.label}, ${REVIEWED_LABEL.toLowerCase()}`, text: m.featured.text } : null;
      }
      const card = b.markers.flatMap((m) => peersOf(m)).find((c) => c.postId === key.slice(5));
      return card ? { key, label: `${PEER_LABEL}, ${card.author || card.role}`, text: card.script } : null;
    })
    .filter((x): x is { key: string; label: string; text: string } => Boolean(x));
  if (!items.length) return null;
  return (
    <section aria-label="Your saved phrases" className={cx(box, "mt-4")}>
      <h4 className="font-semibold">Your saved phrases</h4>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((x) => (
          <li key={x.key}>
            <p className="text-sm text-ink-muted">{x.label}</p>
            <p className="whitespace-pre-line">“{x.text}”</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
