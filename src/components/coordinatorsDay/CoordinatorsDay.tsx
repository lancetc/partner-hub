"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { coordinatorsDay as content } from "@/content/coordinatorsDay";
import { choose, clock, dayTime, LEVELS, proceed, recap, slideFor, startRun, type Level, type Move, type Run } from "@/lib/coordinatorsDay";
import { useApi, type Me } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import { Icon } from "../Icon";
import { Confetti } from "../Confetti";
import { DayBoard, DayTrack } from "./Board";
import { DayCard } from "./DayCard";
import { clockNow, DayClock, DayClockRunner, savedClock, useClockTens } from "./dayClock";

/*
  The Coordinator's Day: choose a level (the board preview changes with it), play the day card by
  card, hand over, then see the recap. The run is saved on this device for the signed-in person after
  every step, so a refresh carries on exactly where it was (the rules make sure nothing repeats).
  On a computer the board sits beside the card; on a phone the card opens full screen and closes to
  show the move, with the nearby squares and a View board button.
*/

const STORE = "tc-coordinators-day:v1:";
const NAMES = "tc-coordinators-day:names";
type Saved = { run: Run | null };
function load(who: string): Saved {
  try {
    const raw = localStorage.getItem(STORE + who);
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    // A run from older content can't be resumed safely.
    return saved?.run && saved.run.content === content.version ? saved : { run: null };
  } catch {
    return { run: null };
  }
}
function save(who: string, s: Saved) {
  try {
    localStorage.setItem(STORE + who, JSON.stringify(s));
  } catch {}
}

const levelName: Record<Level, string> = { new: "New coordinator", practising: "Practising coordinator", experienced: "Experienced coordinator" };

/** Words for the move just made, read out to screen readers. */
function announce(move: Move | undefined, place: (i: number) => string) {
  if (!move) return "";
  const where = place(move.to);
  if (move.kind === "stay") return `You stay on square ${move.to + 1}.`;
  if (move.kind === "ladder") return `You climb the ladder to ${where}.`;
  if (move.kind === "slide") return `You slide back to ${where}.`;
  if (move.kind === "walk") return `The day draws to a close. You move to ${where}.`;
  return `You move forward to ${where}.`;
}

export function CoordinatorsDay() {
  const hydrated = useHydrated();
  const me = useApi<Me>("/api/me").data;
  // The day clock to the nearest ten minutes (the board's light follows it).
  const clockTens = useClockTens();
  const who = me?.user.id ?? "guest";
  const [kept, setKept] = useState<Record<string, Saved>>({});
  const saved = kept[who] ?? (hydrated ? load(who) : { run: null });
  const run = saved.run;
  const put = (r: Run | null) => {
    setKept((k) => ({ ...k, [who]: { run: r } }));
    save(who, { run: r });
  };

  const [view, setView] = useState<"levels" | "play">("levels");
  const [level, setLevel] = useState<Level>("new");
  const [cardOpen, setCardOpen] = useState(true);
  const [boardOpen, setBoardOpen] = useState(false);
  // Square names hint at what's coming, so they're off unless the learner turns them on (remembered on this device).
  const [names, setNamesState] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(NAMES) === "on";
    } catch {
      return false;
    }
  });
  const setNames = (on: boolean) => {
    setNamesState(on);
    try {
      localStorage.setItem(NAMES, on ? "on" : "off");
    } catch {}
  };
  const boardRef = useRef<HTMLElement>(null);

  const start = (l: Level) => {
    put(startRun(content, l, Math.floor(Math.random() * 2 ** 31)));
    setCardOpen(true);
    setView("play");
  };
  const startNew = async (l: Level) => {
    if (run && run.phase !== "done") {
      const ok = await confirmAction(`You’re part way through a ${levelName[run.level].toLowerCase()} day. Starting a new day ends that one.`, {
        title: "Start a new day?",
        confirmLabel: "Start a new day",
      });
      if (!ok) return;
    }
    start(l);
  };

  if (!hydrated) return <div className="min-h-[60vh]" aria-busy="true" />;

  if (view === "levels" || !run) {
    const board = content.boards[level];
    const resumable = run && run.phase !== "done" ? run : null;
    return (
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {resumable && (
            <section aria-labelledby="cd-resume" className="rounded-3xl bg-[#1d2b4f] p-5 text-white">
              <h2 id="cd-resume" className="font-serif text-xl font-semibold">
                Your day is in progress
              </h2>
              <p className="mt-1 text-white/85">
                {levelName[resumable.level]} · {clock(Math.floor(Math.max(savedClock(`${resumable.level}:${resumable.seed}`) ?? 0, resumable.clock ?? 0, dayTime(resumable.square, content.boards[resumable.level].squares.length))))} · square {resumable.square + 1} of {content.boards[resumable.level].squares.length}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCardOpen(true);
                    setView("play");
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#fab53d] px-5 font-semibold text-[#102a43] hover:bg-[#f9c56a]"
                >
                  Resume day <Icon name="arrow-right" className="size-4" />
                </button>
                <button type="button" onClick={() => startNew(resumable.level)} className="inline-flex min-h-11 items-center rounded-full px-4 font-semibold ring-1 ring-white/40 hover:bg-white/10">
                  Start over
                </button>
              </div>
            </section>
          )}
          <fieldset className="flex flex-col gap-3">
            <legend className="font-serif text-xl font-semibold">Choose your experience level</legend>
            {LEVELS.map((l) => {
              const b = content.boards[l];
              const on = level === l;
              return (
                <label
                  key={l}
                  className={cx(
                    "flex cursor-pointer gap-3 rounded-2xl bg-surface p-4 ring-1 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#008282]",
                    on ? "ring-2 ring-[#008282]" : "ring-line hover:ring-[#008282]",
                  )}
                >
                  <input type="radio" name="cd-level" value={l} checked={on} onChange={() => setLevel(l)} className="mt-1 size-4 accent-[#008282]" />
                  <span>
                    <span className="block font-semibold">{b.title}</span>
                    <span className="block text-sm text-ink-muted">{b.blurb}</span>
                    <span className="mt-1 block font-mulish text-xs font-bold text-[#0f5b5b]">
                      {b.squares.length} squares · {b.clients.join(" and ")} · {b.ladders.length} {b.ladders.length === 1 ? "ladder" : "ladders"} ·{" "}
                      {b.checkpoints.length} {b.checkpoints.length === 1 ? "setback" : "setbacks"}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <button
            type="button"
            onClick={() => startNew(level)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#008282] px-6 text-lg font-semibold text-white hover:bg-[#006b6b]"
          >
            Start day <Icon name="arrow-right" className="size-5" />
          </button>
          <HowToPlay />
        </div>
        <section aria-label={`${board.title} board preview`} className="rounded-3xl bg-surface/80 p-3 ring-1 ring-line sm:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Board preview · {board.title}</p>
            <NamesSwitch on={names} onChange={setNames} />
          </div>
          <DayBoard key={level} board={board} square={0} names={names} player={me?.user} />
        </section>
      </div>
    );
  }

  const board = content.boards[run.level];
  // With names off, squares are only numbers, here and in what's read out.
  const name = (i: number) => (names ? board.squares[i] : `square ${i + 1}`);
  const place = (i: number) => (names ? `square ${i + 1}, ${board.squares[i]}` : `square ${i + 1}`);
  const drawn = run.card.type === "event" ? run.events.find((x) => x.event === run.card.id) : undefined;
  const slide = drawn ? slideFor(board, drawn.checkpoint, run.square) : undefined;

  if (run.phase === "done") return <Recap run={run} onAgain={() => start(run.level)} onLevels={() => setView("levels")} />;

  const isPhone = () => window.matchMedia("(max-width: 1023px)").matches;
  // Each answer notes the clock, for the recap and for picking up the day after a break.
  const onChoose = (id: string) => {
    const next = choose(content, run, id);
    const at = clockNow();
    put({ ...next, clock: at, log: next.log.map((l, i) => (i === next.log.length - 1 ? { ...l, clock: at } : l)) });
  };
  const onContinue = () => {
    const retry = run.phase === "feedback" && run.feedback?.outcome === "retry";
    put(proceed(content, run));
    // On a phone, close the card to show where you've moved (a retry stays on the card for another go).
    if (!retry && isPhone()) {
      setCardOpen(false);
      window.setTimeout(() => boardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
    }
  };
  const upNext = run.card.type === "event" ? content.events[run.card.id] : content.scenarios[run.card.id];
  // The time of day to the nearest ten minutes: for the board's light and for screen readers.
  const tens = clockTens;

  return (
    <div className="mt-4">
      {/* The day's clock, racing ahead as you go and turned back when you slide. */}
      <DayClockRunner runKey={`${run.level}:${run.seed}`} square={run.square} squares={board.squares.length} move={run.move} start={run.clock} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-surface/90 px-4 py-2.5 ring-1 ring-line">
        <span className="inline-flex items-center gap-1.5 font-mulish text-lg font-extrabold tabular-nums">
          <Icon name="clock" className="size-5 text-accent" /> <DayClock big />
          <span className="sr-only">{clock(tens)}</span>
        </span>
        <span className="text-sm text-ink-muted">
          Square {run.square + 1} of {board.squares.length}
          {names && (
            <>
              {" "}
              · <strong className="text-ink">{board.squares[run.square]}</strong>
            </>
          )}
        </span>
        <span className="text-sm text-ink-muted">{levelName[run.level]}</span>
        <span className="ml-auto flex gap-1">
          <button type="button" onClick={() => setView("levels")} className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-accent hover:bg-muted">
            Levels
          </button>
          <button type="button" onClick={() => startNew(run.level)} className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-accent hover:bg-muted">
            Start over
          </button>
        </span>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announce(run.phase === "feedback" || run.move?.kind === "slide" || run.move?.kind === "walk" ? run.move : undefined, place)}
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-start">
        {/* On a computer the board stays in view while the card scrolls. */}
        <section ref={boardRef} aria-label="The board" className="flex scroll-mt-24 flex-col gap-3 lg:sticky lg:top-24">
          {/* Phone: the nearby squares, the full board on request. */}
          <div className="lg:hidden">
            <DayTrack board={board} square={run.square} names={names} />
            <button
              type="button"
              aria-expanded={boardOpen}
              onClick={() => setBoardOpen((o) => !o)}
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-accent ring-1 ring-line hover:bg-muted"
            >
              <Icon name="widget" className="size-4" /> {boardOpen ? "Hide board" : "View board"}
            </button>
          </div>
          <div className={cx("rounded-3xl bg-surface/80 p-3 ring-1 ring-line sm:p-5", !boardOpen && "hidden lg:block")}>
            <DayBoard board={board} square={run.square} move={run.move} time={tens} names={names} player={me?.user} label={`${board.title} board. You are on ${place(run.square)}.`} />
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <BoardKey />
              <NamesSwitch on={names} onChange={setNames} />
            </div>
          </div>
          {!cardOpen && (
            <div className="rounded-3xl bg-surface p-4 ring-1 ring-line lg:hidden">
              <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Up next · <DayClock /></p>
              <p className="mt-1 font-serif text-xl font-semibold">{upNext.title}</p>
              <button type="button" onClick={() => setCardOpen(true)} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#008282] px-6 font-semibold text-white">
                Open <Icon name="arrow-right" className="size-4" />
              </button>
            </div>
          )}
        </section>

        <div className={cx(cardOpen ? "fixed inset-0 z-50 overflow-y-auto bg-bg p-3 sm:p-6 lg:static lg:z-auto lg:overflow-visible lg:bg-transparent lg:p-0" : "hidden lg:block")}>
          <div className="mx-auto max-w-xl lg:max-w-none">
            <DayCard
              content={content}
              run={run}
              squareName={name}
              slideTo={slide?.to}
              onChoose={onChoose}
              onContinue={onContinue}
              onClose={() => setCardOpen(false)}
              you={me?.user}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shows or hides the squares' names. */
function NamesSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full px-2 text-sm font-semibold text-ink hover:bg-muted"
    >
      <span aria-hidden className={cx("relative h-5 w-9 rounded-full transition-colors", on ? "bg-[#008282]" : "bg-[#c9d3dc]")}>
        <span className={cx("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", on ? "left-[1.125rem]" : "left-0.5")} />
      </span>
      Square names
    </button>
  );
}

function BoardKey() {
  const items: [string, string][] = [
    ["#dff3ea", "Opportunity: handle it well to climb the ladder"],
    ["#fbe3e1", "Setback risk: something may change, and you slide back"],
    ["#fde9c4", "Handover: finish the day"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-ink-muted" aria-label="Key">
      {items.map(([c, t]) => (
        <li key={t} className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded ring-1 ring-black/10" style={{ background: c }} /> {t}
        </li>
      ))}
    </ul>
  );
}

function HowToPlay() {
  return (
    <details className="rounded-2xl bg-surface/80 p-4 ring-1 ring-line">
      <summary className="cursor-pointer font-semibold">How to play</summary>
      <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
        <li>
          <strong className="text-ink">Decisions:</strong> read the call or message and choose what you’d say or do. A good response moves you forward a square; otherwise you
          stay put, get feedback and try again.
        </li>
        <li>
          <strong className="text-ink">Setbacks:</strong> at points in the day something changes, like a supplier cancelling. You slide back to replan, but the clock keeps
          going and everything you’ve learnt still counts.
        </li>
        <li>
          <strong className="text-ink">Opportunities:</strong> handle an opening well, in a way that suits the client, and you climb a ladder.
        </li>
        <li>
          <strong className="text-ink">Handover:</strong> finish by handing over what’s decided, what’s open and who’s next. About 10 to 15 minutes, with no timer.
        </li>
      </ul>
    </details>
  );
}

function Recap({ run, onAgain, onLevels }: { run: Run; onAgain: () => void; onLevels: () => void }) {
  const r = recap(content, run);
  const board = content.boards[run.level];
  const seen = new Set<string>();
  const timeline = run.log.filter((l) => (seen.has(l.card) ? false : (seen.add(l.card), true)));
  const tries = (id: string) => run.log.filter((l) => l.card === id).length;
  return (
    <div className="mt-6">
      <Confetti />
      <section aria-labelledby="cd-recap" className="rounded-3xl bg-[#1d2b4f] p-6 text-white sm:p-8">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#fab53d]">{board.title} · day complete</p>
        <h2 id="cd-recap" className="mt-1 font-serif text-3xl font-semibold">
          That’s your day handed over
        </h2>
        <dl className="mt-5 grid grid-cols-2 gap-4 font-mulish sm:grid-cols-4">
          {[
            [r.cards, "decisions made"],
            [r.firstTry, "right first time"],
            [r.setbacks.filter((s) => s.recovered).length, r.setbacks.length === 1 ? "setback recovered" : "setbacks recovered"],
            [r.ladders, r.ladders === 1 ? "ladder climbed" : "ladders climbed"],
          ].map(([v, l]) => (
            <div key={String(l)}>
              <dt className="sr-only">{l}</dt>
              <dd className="text-3xl font-extrabold tabular-nums">{v}</dd>
              <dd className="text-sm text-white/80" aria-hidden>
                {l}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {r.echoes.length > 0 && (
        <section aria-labelledby="cd-shaped" className="mt-6 rounded-3xl bg-[#fdf6e6] p-5 ring-1 ring-[#f3e2b8] sm:p-6">
          <h3 id="cd-shaped" className="font-serif text-xl font-semibold">
            How your earlier choices shaped the day
          </h3>
          <ul className="mt-2 space-y-2">
            {r.echoes.map((e) => (
              <li key={e} className="flex gap-2">
                <Icon name="route" className="mt-1 size-4 shrink-0 text-[#7a4a00]" /> {e}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="cd-timeline" className="mt-6 rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-6">
        <h3 id="cd-timeline" className="font-serif text-xl font-semibold">
          Your day
        </h3>
        <ol className="mt-3 divide-y divide-line">
          {timeline.map((l) => {
            const s = content.scenarios[l.card];
            const n = tries(l.card);
            return (
              <li key={l.card} className="flex items-center gap-3 py-2.5">
                <span className="w-20 shrink-0 font-mulish text-sm font-extrabold tabular-nums text-ink-muted">{clock(Math.floor(l.clock ?? (l.square === undefined ? l.time : dayTime(l.square, board.squares.length))))}</span>
                <span className="min-w-0 flex-1">{s.title}</span>
                <span className={cx("shrink-0 rounded-full px-2.5 py-0.5 font-mulish text-xs font-bold", n === 1 ? "bg-[#e3f4f3] text-[#0f5b5b]" : "bg-[#fdf1e4] text-[#7a4a00]")}>
                  {n === 1 ? "First time" : `${n} tries`}
                </span>
              </li>
            );
          })}
          {r.setbacks.map((s) => (
            <li key={s.title} className="flex items-center gap-3 py-2.5">
              <span className="w-20 shrink-0 font-mulish text-sm font-extrabold text-[#a12d31]">Setback</span>
              <span className="min-w-0 flex-1">{s.title}</span>
              <span className="shrink-0 rounded-full bg-[#fbe3e1] px-2.5 py-0.5 font-mulish text-xs font-bold text-[#a12d31]">{s.recovered ? "Recovered" : "Open"}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={onAgain} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#008282] px-6 font-semibold text-white hover:bg-[#006b6b]">
          <Icon name="refresh" className="size-4" /> Play this level again
        </button>
        <button type="button" onClick={onLevels} className="inline-flex min-h-12 items-center rounded-full px-5 font-semibold ring-1 ring-line-strong hover:bg-muted">
          Choose another level
        </button>
        <Link href="/challenges" className="inline-flex min-h-12 items-center rounded-full px-5 font-semibold text-accent hover:underline">
          Back to Challenges
        </Link>
      </div>
    </div>
  );
}
