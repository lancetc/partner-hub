"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import {
  COLLECTIONS,
  EDITION_LABEL,
  FICTIONAL_NOTICE,
  PEER_NOTICE,
  PLACEHOLDER_LABEL,
  STAGES,
  THEMES,
  TOOLS,
  type Collection,
  type ToolId,
} from "@/lib/businessNotes";
import type { businessDeck, BusinessCardView } from "@/server/businessNotes";
import { MentorCard, type CardView } from "../notes/MentorCard";
import { Icon } from "../Icon";
import { BusinessThread, field, primary, secondary, showDate } from "./BusinessThread";

/*
  The Care Partner Business Field Notes deck (docs/business-field-notes.md), for verified principals.

  - Desktop: a fan of up to five cards to choose from, the active card large enough to read, and its canonical
    discussion beside it. Phone: one card at a time, then an explicit "View discussion" step.
  - A text view lists every card in full, with no flipping, for anyone who'd rather read than turn cards.
  - The fan is real buttons in a list; the 3D turn is decoration, off with reduced motion. Nothing depends on it.
  - Anyone who isn't a principal gets a plain "for business owners" message from the server, and no card content.
*/

type Deck = ReturnType<typeof businessDeck>;
type DeckCard = Deck["cards"][number];
type Tool = DeckCard["tools"][number];

export function BusinessDeck({ initialId, fromVersion, openChapter }: { initialId?: string; fromVersion?: string; openChapter?: number }) {
  const [collection, setCollection] = useState<Collection | "">("");
  const [theme, setTheme] = useState("");
  const [stage, setStage] = useState("");
  const [tool, setTool] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"cards" | "text">("cards");
  const [picked, setPicked] = useState<string | null>(initialId ?? null);
  const params = new URLSearchParams({ collection, theme, stage, tool, q }).toString();
  const deck = useApi<Deck>(`/api/business-notes?${params}`);
  const cards = deck.data?.cards ?? [];
  const selected = picked && cards.some((c) => c.id === picked) ? picked : (initialId ?? cards[0]?.id ?? null);

  if (deck.error)
    return (
      <div className="mt-6 rounded-3xl bg-surface p-6 ring-1 ring-line">
        <p className="font-serif text-2xl font-semibold">For Care Partner business owners</p>
        <p className="mt-2 max-w-2xl text-ink-muted">
          Business Field Notes are shared only with verified Care Partner principals. If you own a Care Partner business and can’t see them, ask Partnerships to
          confirm your business-owner access.
        </p>
        <Link href="/tools" className={cx(secondary, "mt-4")}>
          Work Tools
        </Link>
      </div>
    );

  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="rounded-2xl bg-[#fff1cc] p-3 text-[#4a3400]">
        <Icon name="info" className="mr-1 inline size-4" />
        {PEER_NOTICE} Your first thoughts, plans and saves are private to you.
      </p>

      <form role="search" className="flex flex-wrap items-end gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line" onSubmit={(e) => e.preventDefault()}>
        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold">Search the deck</span>
          <input type="search" className={field} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Select
          label="Collection"
          value={collection}
          onChange={(v) => setCollection(v as Collection | "")}
          options={Object.entries(COLLECTIONS).map(([k, v]) => [k, v.title])}
        />
        <Select label="Decision" value={theme} onChange={setTheme} options={Object.entries(THEMES)} />
        <Select label="Business stage" value={stage} onChange={setStage} options={Object.entries(STAGES)} />
        <Select label="Work Tool" value={tool} onChange={setTool} options={Object.entries(TOOLS).map(([k, v]) => [k, v.title])} />
        <div className="flex gap-1" role="group" aria-label="View">
          <button
            type="button"
            aria-pressed={view === "cards"}
            className={cx(secondary, view === "cards" && "bg-muted ring-2 ring-action")}
            onClick={() => setView("cards")}
          >
            <Icon name="layers" className="size-4" /> Cards
          </button>
          <button
            type="button"
            aria-pressed={view === "text"}
            className={cx(secondary, view === "text" && "bg-muted ring-2 ring-action")}
            onClick={() => setView("text")}
          >
            <Icon name="list" className="size-4" /> Text
          </button>
        </div>
      </form>
      {collection && <p className="-mt-3 text-ink-muted">{COLLECTIONS[collection].blurb}</p>}

      {!deck.data ? (
        <p className="text-ink-muted">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="rounded-2xl bg-bg p-4 ring-1 ring-line">
          {deck.data.total ? "No cards match. Try clearing a filter." : "There are no reviewed Business Field Notes yet. Reviewed cards will appear here."}
        </p>
      ) : view === "text" ? (
        <TextList
          cards={cards}
          onOpen={(id) => {
            setPicked(id);
            setView("cards");
          }}
        />
      ) : (
        <>
          <Fan cards={cards} selected={selected} onPick={setPicked} />
          {selected && (
            <Selected
              key={selected}
              id={selected}
              fromVersion={selected === initialId ? fromVersion : undefined}
              openChapter={selected === initialId ? openChapter : undefined}
              position={`Card ${cards.findIndex((c) => c.id === selected) + 1} of ${cards.length}`}
            />
          )}
        </>
      )}
      <p className="text-sm text-ink-muted">
        Want to share a decision of your own?{" "}
        <Link href="/business-notes/contribute" className="font-semibold text-accent underline">
          Contribute a note
        </Link>
        . It’s optional, and it’s reviewed with you before anyone sees it.
      </p>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The fan: up to five cards to choose from. Real buttons; the slight rotation is decoration and stops with reduced motion. */
function Fan({ cards, selected, onPick }: { cards: DeckCard[]; selected: string | null; onPick: (id: string) => void }) {
  const at = Math.max(
    0,
    cards.findIndex((c) => c.id === selected),
  );
  const start = Math.max(0, Math.min(at - 2, cards.length - 5));
  const shown = cards.slice(start, start + 5);
  return (
    <nav aria-label="Cards in the deck" className="flex flex-col items-center gap-3">
      <ol className="flex w-full justify-center gap-2 overflow-x-auto px-1 pb-2 sm:gap-0">
        {shown.map((c, i) => {
          const mid = (shown.length - 1) / 2;
          const on = c.id === selected;
          return (
            <li key={c.id} className="shrink-0">
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                aria-label={`Field Note ${c.data.business?.number ?? ""}: ${c.data.hook}${c.data.illustrative ? " (fictional illustration)" : ""}`}
                onClick={() => onPick(c.id)}
                className={cx(
                  "flex h-40 w-32 flex-col rounded-2xl border-t-[6px] border-[#e0a63a] bg-[#0f3f45] p-3 text-left text-white shadow-lg ring-1 ring-black/10 transition-transform motion-reduce:transition-none sm:-mx-2",
                  on ? "z-10 -translate-y-2 ring-4 ring-action" : "opacity-90 hover:-translate-y-1",
                )}
                style={{ rotate: `${(i - mid) * 4}deg` }}
              >
                <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-[#9fe3e0]">
                  No. {String(c.data.business?.number ?? 0).padStart(2, "0")}
                </span>
                <span className="mt-1 line-clamp-5 font-serif text-sm leading-snug">{c.data.hook}</span>
                {c.data.illustrative && <span className="mt-auto text-[0.65rem] font-semibold text-[#ffd98a]">Fictional illustration</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex gap-2">
        <button type="button" className={secondary} disabled={at === 0} onClick={() => onPick(cards[at - 1].id)}>
          <Icon name="arrow-left" className="size-4" /> Previous
        </button>
        <button type="button" className={secondary} disabled={at >= cards.length - 1} onClick={() => onPick(cards[at + 1].id)}>
          Next <Icon name="arrow-right" className="size-4" />
        </button>
      </div>
    </nav>
  );
}

/** The selected card, its check-ins, the reader's private plan, its tools, and its discussion. */
function Selected({ id, position, fromVersion, openChapter }: { id: string; position: string; fromVersion?: string; openChapter?: number }) {
  const detail = useApi<BusinessCardView>(`/api/business-notes?id=${encodeURIComponent(id)}${fromVersion ? `&v=${encodeURIComponent(fromVersion)}` : ""}`);
  const [flipped, setFlipped] = useState(false);
  const [card, setCard] = useState<CardView | null>(null);
  const [showThread, setShowThread] = useState(false);
  const d = detail.data;
  // The front was seen: counted once per card and version, never what anyone wrote.
  useEffect(() => {
    api("/api/business-notes", { body: { action: "front", noteId: id } }).catch(() => undefined);
  }, [id]);
  if (detail.error) return <p role="alert">{detail.error}</p>;
  if (!d) return <p className="text-ink-muted">Loading the card…</p>;
  const c = (card && card.id === d.card.id ? { ...d.card, ...card } : d.card) as CardView & DeckCard;
  const chapters = d.chapters;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-4">
        {d.updatedFrom && (
          <p role="status" className="rounded-xl bg-[#fff1cc] p-3 text-[#4a3400]">
            This card has been updated since the version you saved or followed (version {d.updatedFrom}). You’re reading version {d.card.version}.
          </p>
        )}
        {d.card.state === "needs_review" && (
          <p className="rounded-xl bg-[#fff1cc] p-3 text-[#4a3400]">
            Being re-reviewed: a rule it mentions may have changed. Check the current approved guidance.
          </p>
        )}
        <MentorCard
          c={c}
          position={position}
          flipped={flipped}
          think
          instinct={d.mine.thought}
          onInstinct={(text) => void api("/api/business-notes", { body: { action: "thought", noteId: id, text } }).then(() => detail.reload())}
          onFlip={(to) => {
            setFlipped(to);
            if (to) api("/api/business-notes", { body: { action: "flip", noteId: id } }).catch(() => undefined);
          }}
          onChange={(next) => setCard(next)}
          discussionHref="#discussion"
        />
        <Tools noteId={id} tools={c.tools} />
        <CheckIn noteId={id} mine={d.mine} onSaved={detail.reload} />
        {chapters.length > 0 && <Chapters noteId={id} chapters={chapters} open={openChapter} />}
        {d.history.length > 1 && (
          <details className="rounded-2xl bg-bg p-3 ring-1 ring-line">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">Version history</summary>
            <ul className="mt-2 text-sm">
              {d.history.map((h) => (
                <li key={h.version}>
                  Version {h.version} · {h.state === "withdrawn" ? "withdrawn" : "published"} {showDate(h.at)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <section id="discussion" aria-labelledby="discussion-h" className="scroll-mt-24 rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="discussion-h" className="font-serif text-2xl font-semibold">
            Discussion
          </h2>
          <button
            type="button"
            className={cx(secondary, "lg:hidden")}
            aria-expanded={showThread}
            aria-controls="discussion-body"
            onClick={() => {
              setShowThread(!showThread);
              if (!showThread) api("/api/business-notes", { body: { action: "thread", noteId: id } }).catch(() => undefined);
            }}
          >
            <Icon name="chat" className="size-4" /> {showThread ? "Hide discussion" : `View discussion (${d.thread.questions.length})`}
          </button>
        </div>
        <div id="discussion-body" className={cx("mt-3", !showThread && "hidden lg:block")}>
          <BusinessThread noteId={id} thread={d.thread} chapters={chapters.map((x) => ({ number: x.number, title: x.title }))} onChange={detail.reload} />
        </div>
      </section>
    </div>
  );
}

/** The related Work Tools: one click opens an available one; a planned one is labelled, never a dead link. */
function Tools({ noteId, tools }: { noteId: string; tools: Tool[] }) {
  const [problem, setProblem] = useState("");
  if (!tools.length) return null;
  return (
    <section aria-labelledby={`tools-${noteId}`} className="rounded-3xl bg-surface p-4 ring-1 ring-line">
      <h2 id={`tools-${noteId}`} className="font-semibold">
        Open a related tool
      </h2>
      <p className="text-sm text-ink-muted">Test your own assumptions privately. Nothing you enter is shared with the deck.</p>
      <ul className="mt-2 flex flex-col gap-2">
        {tools.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-semibold">{t.title}</span>
              <span className="block text-sm text-ink-muted">{t.available ? t.use : t.kind === "placeholder" ? PLACEHOLDER_LABEL : "Not published yet"}</span>
            </span>
            <button
              type="button"
              className={cx(secondary, "min-h-9 px-3 text-sm")}
              disabled={!t.available}
              onClick={() =>
                void api<{ href: string }>("/api/business-notes", { body: { action: "tool", noteId, tool: t.id as ToolId } })
                  .then((r) => window.location.assign(r.href))
                  .catch((e: Error) => setProblem(e.message))
              }
            >
              <Icon name="external" className="size-4" /> Open
            </button>
          </li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-[#b3261e]">
          {problem}
        </p>
      )}
    </section>
  );
}

/** "Check in later": one small private action and a date. Following the card brings a check-in chapter to the Inbox. */
function CheckIn({ noteId, mine, onSaved }: { noteId: string; mine: BusinessCardView["mine"]; onSaved: () => void }) {
  const [action, setAction] = useState(mine.action);
  const [on, setOn] = useState(mine.checkinOn);
  const [follow, setFollow] = useState(mine.follow || !mine.action);
  const [status, setStatus] = useState("");
  return (
    <section aria-labelledby={`plan-${noteId}`} className="rounded-3xl bg-surface p-4 ring-1 ring-line">
      <h2 id={`plan-${noteId}`} className="font-semibold">
        Check in later (private)
      </h2>
      <label className="mt-2 flex flex-col gap-1">
        <span className="text-sm font-semibold">One small thing you’ll try in your business</span>
        <input className={field} maxLength={300} value={action} onChange={(e) => setAction(e.target.value)} />
      </label>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Check in on</span>
          <input type="date" className={field} value={on} onChange={(e) => setOn(e.target.value)} />
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          Tell me when this card gets a check-in
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={primary}
          onClick={() =>
            void api("/api/business-notes", { body: { action: "checkin", noteId, text: action, on, follow } }).then(
              () => {
                setStatus("Saved. Only you can see it.");
                onSaved();
              },
              (e: Error) => setStatus(e.message),
            )
          }
        >
          Save my plan
        </button>
        <span role="status" className="text-sm">
          {status}
        </span>
      </div>
    </section>
  );
}

/** "The story continues": dated check-ins, with the original card kept above them. */
function Chapters({ noteId, chapters, open }: { noteId: string; chapters: BusinessCardView["chapters"]; open?: number }) {
  return (
    <section aria-labelledby={`ch-${noteId}`} className="rounded-3xl bg-[#fbf8f1] p-4 ring-1 ring-[#e7dfcc] dark:bg-[#2a2722] dark:ring-[#3d382f]">
      <h2 id={`ch-${noteId}`} className="font-serif text-xl font-semibold">
        The story continues
      </h2>
      <p className="text-sm opacity-80">Later updates from the same contributor. The original card above stays as it was.</p>
      <ol className="mt-2 flex flex-col gap-2">
        {chapters.map((c) => (
          <li key={c.number}>
            <details
              open={open === c.number}
              className="rounded-2xl bg-surface p-3 ring-1 ring-line"
              onToggle={(e) => {
                if ((e.currentTarget as HTMLDetailsElement).open)
                  api("/api/business-notes", { body: { action: "chapter", noteId, chapter: c.number } }).catch(() => undefined);
              }}
            >
              <summary className="min-h-11 cursor-pointer content-center font-semibold">
                Check-in {c.number}: {c.title} <span className="font-normal text-ink-muted">· dated {showDate(c.dated)}</span>
              </summary>
              {c.correction && (
                <p className="mt-2 rounded-xl bg-[#fff1cc] p-2 text-sm text-[#4a3400]">
                  <span className="font-semibold">Correction to the original:</span> {c.correctionNote}
                </p>
              )}
              <p className="mt-2 whitespace-pre-line">“{c.whatChanged}”</p>
              {c.nowThink && (
                <p className="mt-2">
                  <span className="font-semibold">What I think now:</span> {c.nowThink}
                </p>
              )}
              <p className="mt-2 text-xs text-ink-muted">
                Published {showDate(c.publishedAt)}. Version {c.version}.
              </p>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Every card in full, as plain text: no flipping, nothing hidden behind motion. */
function TextList({ cards, onOpen }: { cards: DeckCard[]; onOpen: (id: string) => void }) {
  return (
    <ol className="flex flex-col gap-4">
      {cards.map((c) => {
        const b = c.data.business!;
        return (
          <li key={c.id}>
            <article aria-labelledby={`t-${c.id}`} className="rounded-3xl bg-surface p-5 ring-1 ring-line">
              <p className="text-sm font-semibold text-accent">
                {EDITION_LABEL} No. {String(b.number).padStart(2, "0")} · {THEMES[b.theme]} · {STAGES[b.stage]}
              </p>
              {c.data.illustrative && <p className="mt-1 rounded-xl bg-[#fff1cc] px-3 py-1 text-sm font-semibold text-[#4a3400]">{FICTIONAL_NOTICE}</p>}
              <h2 id={`t-${c.id}`} className="mt-2 font-serif text-2xl font-semibold">
                {c.data.hook}
              </h2>
              <h3 className="mt-3 font-semibold">The moment</h3>
              <p>{c.data.scenario}</p>
              <p className="text-sm text-ink-muted">{[b.era, b.context].filter(Boolean).join(" · ")}</p>
              {b.choice && (
                <p className="mt-1">
                  <span className="font-semibold">Before you read on:</span> {b.choice}
                </p>
              )}
              <h3 className="mt-3 font-semibold">Note to my younger self</h3>
              <p>“{c.data.note}”</p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["What I believed then", b.believed],
                    ["What I tried", b.tried],
                    ["What didn’t work", b.failed],
                    ["The trade-off", b.tradeoff],
                    ["Try this", c.data.phrase],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="font-semibold">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-2 text-sm">
                — {c.data.authorName}
                {c.data.authorRole && `, ${c.data.authorRole}`} · version {c.version} · {c.chapters} check-in{c.chapters === 1 ? "" : "s"} · {c.questions}{" "}
                question
                {c.questions === 1 ? "" : "s"}
              </p>
              <button type="button" className={cx(secondary, "mt-3")} onClick={() => onOpen(c.id)}>
                Open the card and its discussion
              </button>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
