"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api, useApi, type Me } from "@/lib/api";
import { useHydrated } from "@/lib/store";
import { cx, formatDate } from "@/lib/format";
import {
  cardById,
  cardOfTheWeek,
  cards,
  deckFor,
  perspectives,
  shuffled,
  themeOf,
  themes,
  type ConversationCard,
  type ThemeId,
} from "@/content/conversations";
import { avatarColour, initials, memberById } from "@/content/community";
import { Icon } from "../Icon";
import { FlipCard } from "./FlipCard";

/*
  Care Conversations: draw a card, think about the question, flip it for a deeper one, then reflect
  privately, take it to a team session, or share a perspective with the community. No scores and no
  right answers. Reflections, saved cards and appreciations are kept on this device for each person
  (demonstration: nothing goes to the server except team sessions).
*/

type Reflection = { text: string; at: string; shared: boolean };
type Mine = { reflections: Record<string, Reflection>; saved: string[]; appreciated: string[] };
const EMPTY: Mine = { reflections: {}, saved: [], appreciated: [] };
const key = (who: string) => `tc-conversations-${who}`;

function load(who: string): Mine {
  try {
    const raw = localStorage.getItem(key(who));
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}
function store(who: string, m: Mine) {
  try {
    localStorage.setItem(key(who), JSON.stringify(m));
  } catch {}
}

/** This person's saved reflections and cards, kept per person on this device. */
function useMine() {
  const hydrated = useHydrated();
  const me = useApi<Me>("/api/me").data;
  const who = me?.user.id ?? "guest";
  const [kept, setKept] = useState<Record<string, Mine>>({});
  const mine = kept[who] ?? (hydrated ? load(who) : EMPTY);
  const update = (change: (m: Mine) => Mine) => {
    const next = change(mine);
    setKept((all) => ({ ...all, [who]: next }));
    store(who, next);
  };
  return { mine, update, hydrated, name: me?.user.name ?? "You" };
}

type Mode = "draw" | "team" | "week" | "collection";

export function CareConversations() {
  const { mine, update, hydrated, name } = useMine();
  const [mode, setMode] = useState<Mode>("draw");
  const saved = mine.saved.length + Object.keys(mine.reflections).filter((id) => !mine.saved.includes(id)).length;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <Link href="/play" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Play
      </Link>
      <header className="relative mt-1 overflow-hidden rounded-3xl bg-[#1d2b4f] px-5 py-7 text-white sm:px-8">
        <FannedDeck />
        <div className="relative max-w-xl">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#9fe3e3]">A conversation card game</p>
          <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Care Conversations</h1>
          <p className="mt-3 text-lg text-white/90">Pick a card. Consider the question. Share your perspective. Discover how others approach the same situation.</p>
          <p className="mt-3 text-sm text-white/75">48 cards in six themes. No scores and no right answers: it’s about thinking it through and learning from each other.</p>
        </div>
      </header>

      <div role="tablist" aria-label="Ways to play" className="mt-5 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)]">
        {(
          [
            ["draw", "Draw a card", "spark"],
            ["team", "Team session", "people"],
            ["week", "Card of the week", "calendar"],
            ["collection", `Your collection${hydrated && saved ? ` (${saved})` : ""}`, "bookmark"],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cx(
              "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-[3px] px-4 font-semibold",
              mode === id ? "border-[#008282] text-ink dark:border-[#3cb8b9]" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            <Icon name={icon} className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="pt-6">
        {mode === "draw" && <Draw mine={mine} update={update} name={name} />}
        {mode === "team" && <Team />}
        {mode === "week" && <Week mine={mine} update={update} name={name} />}
        {mode === "collection" && <Collection mine={mine} onPlay={() => setMode("draw")} />}
      </div>
    </div>
  );
}

/** Six cards fanned out in the header, one per theme. */
function FannedDeck() {
  return (
    <div aria-hidden className="pointer-events-none absolute -bottom-10 right-4 hidden h-56 w-80 md:block lg:right-16">
      {themes.map((t, i) => (
        <span
          key={t.id}
          className="absolute bottom-0 left-1/2 h-48 w-32 origin-bottom rounded-2xl shadow-lg ring-1 ring-black/10"
          style={{ background: t.colour, transform: `translateX(-50%) rotate(${(i - 2.5) * 11}deg)` }}
        >
          <span className="absolute left-3 top-3 text-lg">{t.emoji}</span>
        </span>
      ))}
    </div>
  );
}

type Update = (change: (m: Mine) => Mine) => void;

// ---------- Draw a card (solo) ----------

function Draw({ mine, update, name }: { mine: Mine; update: Update; name: string }) {
  const [theme, setTheme] = useState<ThemeId | "all">("all");
  const [seed, setSeed] = useState(7);
  const [at, setAt] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const order = shuffled(deckFor(theme), seed);
  const card = order[at % order.length];
  const go = (n: number) => {
    setAt((a) => (a + n + order.length) % order.length);
    setFlipped(false);
  };
  const pick = (t: ThemeId | "all") => {
    setTheme(t);
    setAt(0);
    setFlipped(false);
  };
  const shuffle = () => {
    setSeed((s) => s + 1);
    setAt(0);
    setFlipped(false);
  };
  const isSaved = mine.saved.includes(card.id);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-4">
        <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-full sm:flex-wrap sm:justify-center sm:px-0" role="group" aria-label="Theme">
          <ThemeChip active={theme === "all"} onClick={() => pick("all")} label="All themes" emoji="🃏" />
          {themes.map((t) => (
            <ThemeChip key={t.id} active={theme === t.id} onClick={() => pick(t.id)} label={t.name} emoji={t.emoji} colour={t.colour} />
          ))}
        </div>
        <FlipCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} label={`Card ${(at % order.length) + 1} of ${order.length}`} />
        <div className="flex w-full max-w-sm items-center justify-between gap-2">
          <button type="button" onClick={() => go(-1)} className={round} aria-label="Previous card">
            <Icon name="arrow-left" className="size-5" />
          </button>
          <span className="text-sm font-semibold tabular-nums text-ink-muted">
            {(at % order.length) + 1} of {order.length}
          </span>
          <button type="button" onClick={() => go(1)} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#008282] px-5 font-semibold text-white hover:bg-[#006b6b]">
            Next card <Icon name="arrow-right" className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={shuffle} className={quiet}>
            <Icon name="refresh" className="size-4" /> Shuffle
          </button>
          <button
            type="button"
            aria-pressed={isSaved}
            onClick={() => update((m) => ({ ...m, saved: isSaved ? m.saved.filter((x) => x !== card.id) : [...m.saved, card.id] }))}
            className={quiet}
          >
            <Icon name={isSaved ? "bookmark-filled" : "bookmark"} className="size-4" /> {isSaved ? "Saved" : "Save card"}
          </button>
        </div>
      </div>
      <Respond card={card} mine={mine} update={update} name={name} />
    </div>
  );
}

const round = "grid size-12 place-items-center rounded-full border border-line-strong hover:bg-muted";
const quiet = "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-ink-muted hover:bg-muted hover:text-ink";

function ThemeChip({ active, onClick, label, emoji, colour }: { active: boolean; onClick: () => void; label: string; emoji: string; colour?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-semibold",
        active ? "border-transparent bg-[#102a43] text-white dark:bg-white dark:text-[#102a43]" : "border-line text-ink-muted hover:text-ink",
      )}
    >
      {colour && <span className="size-2.5 rounded-full" style={{ background: colour }} aria-hidden />}
      <span aria-hidden>{emoji}</span> {label}
    </button>
  );
}

// ---------- Respond: a private reflection, optionally shared, and what others said ----------

function Respond({ card, mine, update, name }: { card: ConversationCard; mine: Mine; update: Update; name: string }) {
  const id = useId();
  const kept = mine.reflections[card.id];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const text = drafts[card.id] ?? kept?.text ?? "";
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const save = (shared: boolean) => {
    if (!text.trim()) return;
    update((m) => ({ ...m, reflections: { ...m.reflections, [card.id]: { text: text.trim(), at: new Date().toISOString(), shared } } }));
    setDrafts((d) => {
      const rest = { ...d };
      delete rest[card.id];
      return rest;
    });
    setJustSaved(shared ? "Shared with the community." : "Saved privately. Only you can see it.");
  };
  const others = perspectives.filter((p) => p.cardId === card.id);
  const yours = kept?.shared ? [{ id: `you-${card.id}`, text: kept.text, by: name, role: "You", colour: "#102a43", appreciations: 0, when: "Just now" }] : [];
  const list = [
    ...yours,
    ...others.map((p) => {
      const m = memberById(p.memberId)!;
      return { id: p.id, text: p.text, by: m.name, role: m.role, colour: avatarColour(m.id), appreciations: p.appreciations, when: p.daysAgo === 1 ? "Yesterday" : `${p.daysAgo} days ago` };
    }),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-serif text-xl font-semibold">Your reflection</h2>
        <p className="mt-1 text-sm text-ink-muted">Write what comes to mind. It’s private unless you choose to share it. Leave out client names and anything that could identify someone.</p>
        <label htmlFor={id} className="sr-only">
          Your reflection on this card
        </label>
        <textarea
          id={id}
          rows={5}
          value={text}
          onChange={(e) => {
            setDrafts((d) => ({ ...d, [card.id]: e.target.value }));
            setJustSaved(null);
          }}
          placeholder="What does this card bring up for you?"
          maxLength={1500}
          className="mt-3 w-full rounded-2xl border border-line-strong bg-surface px-4 py-3 leading-relaxed"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => save(false)} disabled={!text.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted disabled:opacity-45">
            <Icon name="lock" className="size-4" /> Keep it private
          </button>
          <button type="button" onClick={() => save(true)} disabled={!text.trim()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#008282] px-4 font-semibold text-white hover:bg-[#006b6b] disabled:opacity-45">
            <Icon name="people" className="size-4" /> Share with the community
          </button>
        </div>
        {(justSaved || kept) && (
          <p className="mt-2 text-sm text-ink-muted" role="status">
            {justSaved ?? (kept?.shared ? `You shared this on ${formatDate(kept.at)}.` : `Saved privately on ${formatDate(kept!.at)}.`)}
          </p>
        )}
      </section>

      <section aria-labelledby={`${id}-others`}>
        <h2 id={`${id}-others`} className="font-serif text-xl font-semibold">
          How others see it
        </h2>
        {list.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-line p-4 text-ink-muted">Nobody has shared a perspective on this card yet. You could be the first.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {list.map((p) => {
              const liked = mine.appreciated.includes(p.id);
              return (
                <li key={p.id} className="rounded-2xl bg-muted p-4">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="grid size-8 place-items-center rounded-full font-mulish text-xs font-extrabold text-white" style={{ background: p.colour }} aria-hidden>
                      {initials(p.by)}
                    </span>
                    <span className="font-semibold">{p.by}</span>
                    <span className="text-ink-muted">
                      · {p.role} · {p.when}
                    </span>
                  </p>
                  <p className="mt-2">{p.text}</p>
                  {p.role !== "You" && (
                    <button
                      type="button"
                      aria-pressed={liked}
                      onClick={() => update((m) => ({ ...m, appreciated: liked ? m.appreciated.filter((x) => x !== p.id) : [...m.appreciated, p.id] }))}
                      className={cx("mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold", liked ? "bg-[#fde8e9] text-[#c7393e] dark:bg-[#4a1c1e] dark:text-[#ff9ea2]" : "text-ink-muted hover:bg-surface")}
                    >
                      <Icon name="heart" className={cx("size-4", liked && "fill-current")} /> {liked ? "Appreciated" : "Appreciate"} · {p.appreciations + Number(liked)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-muted">Appreciations say thanks. They aren’t points, and personal reflections are never scored.</p>
      </section>
    </div>
  );
}

// ---------- Team session ----------

function Team() {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeId | "all">("all");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const codeId = useId();
  async function host() {
    setBusy(true);
    setProblem(null);
    try {
      const r = await api<{ code: string }>("/api/conversations/rooms", { body: { theme } });
      router.push(`/play/conversations/room/${r.code}`);
    } catch (e) {
      setProblem((e as Error).message);
      setBusy(false);
    }
  }
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
      <section className="rounded-3xl border border-line bg-surface p-6">
        <h2 className="font-serif text-2xl font-semibold">Host a session</h2>
        <p className="mt-2 text-ink-muted">
          For team meetings, onboarding, webinars and challenge days. Put the card on the big screen, and everyone who joins with the code sees it on their phone
          too. You turn the cards; the group talks.
        </p>
        <label className="mt-4 block text-sm font-semibold" htmlFor={`${codeId}-theme`}>
          Deck
        </label>
        <select id={`${codeId}-theme`} value={theme} onChange={(e) => setTheme(e.target.value as ThemeId | "all")} className="mt-1 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3">
          <option value="all">All themes (48 cards)</option>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji} {t.name} (8 cards)
            </option>
          ))}
        </select>
        <button type="button" onClick={host} disabled={busy} className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#008282] px-6 font-semibold text-white hover:bg-[#006b6b] disabled:opacity-60">
          <Icon name="play" className="size-4" /> {busy ? "Starting…" : "Start a session"}
        </button>
        {problem && <p className="mt-2 text-sm font-semibold text-danger">{problem}</p>}
        <h3 className="mt-6 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Facilitator tips</h3>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          <li>• Give people a minute to think before anyone speaks.</li>
          <li>• Go around once, then open it up. Passing is always fine.</li>
          <li>• Flip the card when the first question has run its course.</li>
          <li>• Keep client details out of it: situations, not names.</li>
        </ul>
      </section>
      <section className="rounded-3xl bg-[#e3f5f5] p-6 text-[#004f4f] dark:bg-[#123d3e] dark:text-[#d9f5f5]">
        <h2 className="font-serif text-2xl font-semibold">Join a session</h2>
        <p className="mt-2">Got a code from the person hosting? Enter it to follow along on your own screen.</p>
        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean.length === 6) router.push(`/play/conversations/room/${clean}`);
          }}
        >
          <label htmlFor={codeId} className="sr-only">
            Session code
          </label>
          <input
            id={codeId}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABC234"
            autoComplete="off"
            autoCapitalize="characters"
            className="min-h-12 w-44 rounded-xl border border-[#008282]/40 bg-white px-4 font-mulish text-xl font-extrabold uppercase tracking-[0.3em] text-[#102a43]"
          />
          <button type="submit" disabled={clean.length !== 6} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#102a43] px-6 font-semibold text-white disabled:opacity-50">
            Join <Icon name="arrow-right" className="size-4" />
          </button>
        </form>
      </section>
    </div>
  );
}

// ---------- Card of the week (community) ----------

function Week({ mine, update, name }: { mine: Mine; update: Update; name: string }) {
  const hydrated = useHydrated();
  const [flipped, setFlipped] = useState(false);
  // The week is worked out in the browser: on the server "today" would be fixed at build time.
  const card = hydrated ? cardOfTheWeek(new Date()) : null;
  if (!card) return <p className="text-ink-muted">Finding this week’s card…</p>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-4">
        <p className="text-center text-ink-muted">One card for the whole community each week. Add your perspective, and see how others approach it.</p>
        <FlipCard card={card} flipped={flipped} onFlip={() => setFlipped((f) => !f)} label="This week’s card" />
      </div>
      <Respond card={card} mine={mine} update={update} name={name} />
    </div>
  );
}

// ---------- Your collection ----------

function Collection({ mine, onPlay }: { mine: Mine; onPlay: () => void }) {
  const ids = [...new Set([...mine.saved, ...Object.keys(mine.reflections)])];
  const list = ids.map((id) => cardById(id)).filter((c): c is ConversationCard => Boolean(c));
  if (!list.length)
    return (
      <div className="rounded-3xl border border-dashed border-line p-8 text-center">
        <p className="font-serif text-xl font-semibold">Nothing saved yet</p>
        <p className="mt-1 text-ink-muted">Save cards you want to come back to, and your reflections collect here too.</p>
        <button type="button" onClick={onPlay} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#008282] px-5 font-semibold text-white">
          Draw a card
        </button>
      </div>
    );
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((c) => {
        const t = themeOf(c.theme);
        const r = mine.reflections[c.id];
        return (
          <li key={c.id} className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface">
            <div className="p-5" style={{ background: t.colour, color: t.ink }}>
              <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em]">
                {t.emoji} {t.name}
              </p>
              <p className="mt-2 font-serif text-lg font-semibold leading-snug">{c.question}</p>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5 text-sm">
              {r ? (
                <>
                  <p className="font-semibold">{r.shared ? "Your shared perspective" : "Your private reflection"}</p>
                  <p className="whitespace-pre-line">{r.text}</p>
                  <p className="mt-auto text-xs text-ink-muted">{formatDate(r.at)}</p>
                </>
              ) : (
                <p className="text-ink-muted">Saved to come back to. Go deeper: {c.deeper}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export const TOTAL_CARDS = cards.length;
