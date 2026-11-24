"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { OneDayBlock } from "@/lib/magazine";
import {
  applyDayAction,
  dayView,
  DIMENSIONS,
  emptyAttempt,
  FICTIONAL_NOTICE,
  LANE_ORDER,
  LANES,
  LEVELS,
  retryFrom,
  STATUSES,
  type Attempt,
  type DayAction,
  type DayView,
  type Pattern,
  type StatusId,
  type ViewEvent,
  type ViewFact,
  type ViewLens,
} from "@/lib/oneDay";
import type { OneDayView } from "@/server/oneDay";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  One Day, Five Perspectives (docs/one-day-five-perspectives.md). Leila's working day in five lanes on a time axis
  (a chronological card stack on a phone), with each client thread shown by name, colour and pattern. Events arrive as
  the learner decides; a role lens is a short visit as someone else, kept visibly apart from what Leila knows. The
  commitments rail stays on screen. At 4:30 the learner gives each thread an honest status, then the debrief shows three
  aligned timelines, the rubric (critical flags first) and four highlights.

  For a learner the server holds the day back: this page only ever has what has arrived. In the editor's preview it
  replays the block as written, locally, and stores nothing. No timers, no autoplay past a decision.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";

const THREAD_COLOURS = ["#0f766e", "#7c3aed", "#b45309", "#be185d", "#1d4ed8"];
function patternStyle(pattern: Pattern, colour: string): React.CSSProperties {
  if (pattern === "dots")
    return { backgroundColor: `${colour}22`, backgroundImage: `radial-gradient(${colour} 1.6px, transparent 1.8px)`, backgroundSize: "7px 7px" };
  if (pattern === "stripes")
    return { backgroundColor: `${colour}22`, backgroundImage: `repeating-linear-gradient(45deg, ${colour} 0 2px, transparent 2px 6px)` };
  return {
    backgroundColor: `${colour}22`,
    backgroundImage: `linear-gradient(135deg, ${colour} 25%, transparent 25%), linear-gradient(225deg, ${colour} 25%, transparent 25%)`,
    backgroundSize: "8px 8px",
    backgroundPosition: "0 0, 4px 0",
  };
}
const KIND_LABEL: Record<ViewFact["kind"], string> = { fact: "Fact", preference: "What they want", belief: "What they believe", status: "Status" };
const EVENT_KIND: Record<ViewEvent["kind"], string> = { scheduled: "Planned", unexpected: "Unexpected", revised: "Changed", waiting: "Waiting on someone" };
const COMMIT_STATUS = { open: "Open", waiting: "Waiting", done: "Done", escalated: "Escalated" } as const;
const ARTEFACT_ICON = { message: "mail", call: "phone", note: "pen", invoice: "file", booking: "calendar", plan: "checklist", email: "mail" } as const;
const clock = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};

type Meta = { attemptNo: number; status: "new" | "active" | "finished"; earlierCase: boolean };
type Refused = NonNullable<OneDayView["refused"]>;

export function OneDayMap({ block: b, ctx }: { block: OneDayBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/oneday`;
  const loaded = useApi<OneDayView>(ctx.preview ? null : `${url}?block=${b.id}`);
  // The preview's own attempt, replayed locally against the block as written.
  const [local, setLocal] = useState<Attempt>(emptyAttempt);
  const [server, setServer] = useState<{ day: DayView; meta: Meta } | null>(null);
  const [refused, setRefused] = useState<Refused | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(ctx.preview);
  const [selected, setSelected] = useState<string | null>(null);
  const [lens, setLens] = useState<{ event: string; actor: string } | null>(null);
  const [returned, setReturned] = useState<{ actor: string; facts: ViewFact[] } | null>(null);
  // The decision just made, so its feedback stays on screen when the next event takes the panel.
  const [last, setLast] = useState<string | null>(null);
  const [focus, setFocus] = useState<string>("all");
  const [layout, setLayout] = useState<"map" | "list">("map");
  const justFinished = useRef(false);
  const panel = useRef<HTMLDivElement>(null);

  const take = (v: OneDayView) => {
    setServer({ day: v.day, meta: { attemptNo: v.attemptNo, status: v.status, earlierCase: v.earlierCase } });
    setRefused(v.refused);
    if (v.status !== "new") setStarted(true);
  };
  if (!ctx.preview && loaded.data && server === null) take(loaded.data);

  const day: DayView | null = ctx.preview ? dayView(b, local) : (server?.day ?? null);
  const meta: Meta | null = ctx.preview ? { attemptNo: 1, status: "active", earlierCase: false } : (server?.meta ?? null);

  useEffect(() => {
    if (!day?.debrief || ctx.preview || !justFinished.current) return;
    justFinished.current = false;
    ctx.activity(b.id, { outcome: day.debrief.flags.length ? "flagged" : "finished", score: day.debrief.total, total: 21 });
    ctx.engaged(b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.debrief]);

  const actors = useMemo(() => new Map(b.actors.map((a) => [a.id, a])), [b.actors]);
  const threads = useMemo(() => new Map(b.threads.map((t, i) => [t.id, { ...t, colour: THREAD_COLOURS[i % THREAD_COLOURS.length] }])), [b.threads]);
  const nameOf = (id?: string) => (id ? (actors.get(id)?.name ?? id) : "");
  const coordinator = nameOf(b.coordinator) || "the coordinator";

  async function send(x: DayAction | { action: "start" } | { action: "retry"; eventId?: string }) {
    setProblem(null);
    if (ctx.preview) {
      if (x.action === "start") return;
      if (x.action === "retry") {
        setLocal(x.eventId ? retryFrom(b, local, x.eventId) : emptyAttempt());
        setRefused(null);
        setLast(null);
        return;
      }
      const out = applyDayAction(b, local, x);
      if (out.error) return setProblem(out.error);
      setLocal(out.attempt);
      setRefused(out.refused ?? null);
      if (x.action === "choose") setLast(out.refused ? null : x.eventId);
      return;
    }
    setBusy(true);
    try {
      if (x.action === "close") justFinished.current = true;
      const v = await api<OneDayView>(url, { body: { blockId: b.id, ...x } });
      take(v);
      if (x.action === "choose") setLast(v.refused ? null : x.eventId);
      if (x.action === "retry") setLast(null);
    } catch (e) {
      justFinished.current = false;
      setProblem(e instanceof Error ? e.message : "That didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <Shell b={b} attemptNo={meta?.attemptNo ?? 0}>
      {children}
    </Shell>
  );
  if (!ctx.preview && loaded.error) return shell(<p role="alert">{loaded.error}</p>);
  if (!day || !meta) return shell(<p className="text-ink-muted">Loading…</p>);

  if (!started)
    return shell(
      <div className="flex flex-col gap-4">
        <Cast b={b} threads={threads} />
        <button type="button" className={cx(primary, "self-start")} disabled={busy} onClick={() => void send({ action: "start" })}>
          <Icon name="play" className="size-5" /> Start {coordinator}’s day
        </button>
      </div>,
    );

  const events = day.events.filter((e) => focus === "all" || !e.thread || e.thread === focus);
  const current = day.events.find((e) => e.id === day.currentId) ?? null;
  const shown = day.events.find((e) => e.id === (selected ?? day.currentId)) ?? current ?? day.events[day.events.length - 1] ?? null;
  const openLens = lens ? day.lenses.find((l) => l.event === lens.event && l.actor === lens.actor) : undefined;
  const select = (id: string) => {
    setSelected(id);
    setLens(null);
    setReturned(null);
    requestAnimationFrame(() => panel.current?.focus());
  };
  const play = async (eventId: string, actor: string) => {
    setReturned(null);
    await send({ action: "lens", eventId, actorId: actor });
    setLens({ event: eventId, actor });
    requestAnimationFrame(() => panel.current?.focus());
  };
  const leave = () => {
    if (openLens) setReturned({ actor: openLens.actor, facts: openLens.facts.filter((f) => day.learnerOnly.some((x) => x.id === f.id)) });
    setLens(null);
    requestAnimationFrame(() => panel.current?.focus());
  };

  return shell(
    <div className="flex flex-col gap-4">
      {meta.earlierCase && (
        <p className="rounded-2xl bg-muted px-4 py-2 text-sm">This attempt was made on an earlier version of the day. Replay the day to use the current one.</p>
      )}
      {/* Controls: focus one client, and map or list */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Map controls">
        <div role="group" aria-label="Show clients" className="flex flex-wrap gap-1.5">
          <Chip pressed={focus === "all"} onClick={() => setFocus("all")}>
            All clients
          </Chip>
          {[...threads.values()].map((t) => (
            <Chip key={t.id} pressed={focus === t.id} onClick={() => setFocus(focus === t.id ? "all" : t.id)}>
              <Swatch pattern={t.pattern} colour={t.colour} /> {t.name}
            </Chip>
          ))}
        </div>
        <div role="group" aria-label="Layout" className="ml-auto hidden gap-1.5 md:flex">
          <Chip pressed={layout === "map"} onClick={() => setLayout("map")}>
            <Icon name="timeline" className="size-4" /> Map
          </Chip>
          <Chip pressed={layout === "list"} onClick={() => setLayout("list")}>
            <Icon name="list" className="size-4" /> List
          </Chip>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0">
          {/* Desktop: five lanes on the working-day axis */}
          {layout === "map" && (
            <div className="hidden md:block">
              <LaneMap events={events} day={day} threads={threads} nameOf={nameOf} shownId={shown?.id ?? null} onSelect={select} />
            </div>
          )}
          {/* Phone (and the list layout): one chronological stack */}
          <div className={cx(layout === "map" && "md:hidden")}>
            <Stack events={events} day={day} threads={threads} nameOf={nameOf} shownId={shown?.id ?? null} onSelect={select} />
          </div>
          {day.remaining > 0 && (
            <p className="mt-3 rounded-2xl border border-dashed border-line-strong px-4 py-2 text-sm text-ink-muted">
              {day.remaining === 1 ? "One more event" : `${day.remaining} more events`} still to come today. They arrive as {coordinator} decides; nothing moves
              on by itself.
            </p>
          )}
        </div>

        {/* The side panel: the event in focus, or a perspective visit, then what Leila knows and the commitments rail */}
        <div className="grid min-w-0 content-start gap-4 lg:grid-cols-2 2xl:grid-cols-1">
          <div ref={panel} tabIndex={-1} className="outline-none lg:col-span-2 2xl:col-span-1">
            {openLens ? (
              <LensPanel
                l={openLens}
                name={nameOf(openLens.actor)}
                badge={actors.get(openLens.actor)?.badge}
                coordinator={coordinator}
                onReply={(replyId) => void send({ action: "reply", eventId: openLens.event, actorId: openLens.actor, replyId })}
                onLeave={leave}
                busy={busy}
              />
            ) : shown ? (
              <EventPanel
                key={shown.id}
                e={shown}
                isCurrent={shown.id === day.currentId}
                day={day}
                b={b}
                threads={threads}
                nameOf={nameOf}
                coordinator={coordinator}
                refused={refused?.eventId === shown.id ? refused : null}
                returned={returned}
                previous={last && last !== shown.id && shown.id === day.currentId ? day.events.find((x) => x.id === last) : undefined}
                busy={busy}
                onPlay={(actor) => void play(shown.id, actor)}
                onChoose={(optionId) => void send({ action: "choose", eventId: shown.id, optionId })}
                onClose={(closing) => void send({ action: "close", closing })}
                onRetry={() => {
                  setSelected(null);
                  void send({ action: "retry", eventId: shown.id });
                }}
              />
            ) : null}
            {problem && (
              <p role="alert" className="mt-2 rounded-2xl bg-[#fde2e0] px-4 py-2 text-sm text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]">
                {problem}
              </p>
            )}
          </div>
          <Knowledge day={day} coordinator={coordinator} threads={threads} />
          <Commitments day={day} threads={threads} nameOf={nameOf} />
        </div>
      </div>

      {day.debrief && (
        <Debrief
          d={day.debrief}
          b={b}
          coordinator={coordinator}
          nameOf={nameOf}
          busy={busy}
          onRetry={(eventId) => {
            setSelected(null);
            void send({ action: "retry", eventId });
          }}
        />
      )}
    </div>,
  );
}

type ThreadInfo = OneDayBlock["threads"][number] & { colour: string };
type Threads = Map<string, ThreadInfo>;

function Shell({ b, children, attemptNo }: { b: OneDayBlock; children: React.ReactNode; attemptNo: number }) {
  return (
    <section aria-label={`Journey map: ${b.title}`} className="mx-auto w-full max-w-[80rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className={cx(kicker, "mb-2 flex flex-wrap items-center gap-2 text-sm")}>
        <Icon name="timeline" className="size-5" /> One day, five perspectives
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] text-ink">Fictional simulation · {b.version}</span>
        {attemptNo > 1 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] text-ink">Attempt {attemptNo}</span>}
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      {b.day && <p className="mt-1 text-sm text-ink-muted">{b.day}</p>}
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{FICTIONAL_NOTICE}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1",
        pressed ? "bg-action text-on-action ring-action" : "bg-surface ring-line-strong hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Swatch({ pattern, colour, className }: { pattern: Pattern; colour: string; className?: string }) {
  return (
    <span aria-hidden className={cx("inline-block size-3.5 shrink-0 rounded-full ring-1 ring-line-strong", className)} style={patternStyle(pattern, colour)} />
  );
}

function ThreadTag({ id, threads }: { id?: string; threads: Threads }) {
  const t = id ? threads.get(id) : undefined;
  if (!t) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
      <Swatch pattern={t.pattern} colour={t.colour} className="size-3" /> {t.name}
    </span>
  );
}

/** Who's in the day, before it starts: the three people and their goals, and the five lanes. */
function Cast({ b, threads }: { b: OneDayBlock; threads: Threads }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className={box}>
        <h4 className="font-semibold">Three people’s stories</h4>
        <ul className="mt-2 flex flex-col gap-2">
          {[...threads.values()].map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <Swatch pattern={t.pattern} colour={t.colour} className="mt-1" />
              <span>
                <strong>{t.name}</strong>: {t.goal}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className={box}>
        <h4 className="font-semibold">Five lanes</h4>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {LANE_ORDER.map((lane) => (
            <li key={lane}>
              <strong>{LANES[lane]}</strong>:{" "}
              {b.actors
                .filter((a) => a.lane === lane)
                .map((a) => (a.badge ? `${a.name} (${a.badge})` : a.name))
                .join(", ")}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-ink-muted">
          You make {b.actors.find((a) => a.id === b.coordinator)?.name ?? "the coordinator"}’s decisions. At some points you can briefly play someone else; what
          you learn there isn’t known to her until it’s communicated.
        </p>
      </div>
    </div>
  );
}

type CardProps = {
  events: ViewEvent[];
  day: DayView;
  threads: Threads;
  nameOf: (id?: string) => string;
  shownId: string | null;
  onSelect: (id: string) => void;
};

function stateOf(e: ViewEvent, day: DayView) {
  if (e.id === day.currentId) return e.closing ? "Close the day" : "Waiting on you";
  if (e.closing) return "Closed with statuses";
  if (e.chosen) return "Responded";
  return "Seen";
}

function EventCard({
  e,
  day,
  threads,
  nameOf,
  shown,
  onSelect,
  compact,
}: {
  e: ViewEvent;
  day: DayView;
  threads: Threads;
  nameOf: (id?: string) => string;
  shown: boolean;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const t = e.thread ? threads.get(e.thread) : undefined;
  const isCurrent = e.id === day.currentId;
  return (
    <button
      type="button"
      onClick={() => onSelect(e.id)}
      aria-current={shown ? "true" : undefined}
      className={cx(
        "relative w-full overflow-hidden rounded-xl bg-surface p-2.5 text-left text-sm ring-1 transition-shadow hover:shadow-md",
        shown ? "ring-2 ring-action" : "ring-line-strong",
        isCurrent && "shadow-md",
      )}
    >
      {t && <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={patternStyle(t.pattern, t.colour)} />}
      <span className={cx("block", t && "pl-2")}>
        {compact && <span className="block text-xs font-semibold text-ink-muted">{clock(e.time)}</span>}
        <span className="block font-semibold leading-snug break-words hyphens-auto">{e.title}</span>
        {e.actor && <span className="block text-xs text-ink-muted">{nameOf(e.actor)}</span>}
        <span className={cx("mt-1 inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-bold", isCurrent ? "bg-action text-on-action" : "bg-muted")}>
          {stateOf(e, day)}
        </span>
        {e.leilaNew.length > 0 && (
          <span className="ml-1 inline-block rounded-full bg-tealtint px-2 py-0.5 text-[0.7rem] font-bold">+{e.leilaNew.length} new to know</span>
        )}
      </span>
    </button>
  );
}

function LaneMap({ events, day, threads, nameOf, shownId, onSelect }: CardProps) {
  return (
    <div role="table" aria-label="The day, by lane" className="overflow-hidden rounded-2xl ring-1 ring-line">
      <div role="row" className="grid grid-cols-[5rem_repeat(5,minmax(0,1fr))] bg-muted text-xs font-bold">
        <span role="columnheader" className="px-2 py-2">
          Time
        </span>
        {LANE_ORDER.map((lane) => (
          <span key={lane} role="columnheader" className="border-l border-line px-2 py-2">
            {LANES[lane]}
          </span>
        ))}
      </div>
      {events.map((e) => (
        <div key={e.id} role="row" className="grid grid-cols-[5rem_repeat(5,minmax(0,1fr))] border-t border-line">
          <span role="rowheader" className="whitespace-nowrap px-2 py-3 text-sm font-semibold tabular-nums">
            {clock(e.time)}
          </span>
          {LANE_ORDER.map((lane) => (
            <span key={lane} role="cell" className="border-l border-line p-1.5">
              {e.lane === lane && <EventCard e={e} day={day} threads={threads} nameOf={nameOf} shown={shownId === e.id} onSelect={onSelect} />}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Stack({ events, day, threads, nameOf, shownId, onSelect }: CardProps) {
  return (
    <ol aria-label="The day so far" className="flex flex-col gap-2">
      {events.map((e) => (
        <li key={e.id} className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-2">
          <span className="pt-2.5 text-sm font-semibold tabular-nums">{clock(e.time)}</span>
          <div>
            <span className="mb-1 block text-xs font-semibold text-ink-muted">{LANES[e.lane]}</span>
            <EventCard e={e} day={day} threads={threads} nameOf={nameOf} shown={shownId === e.id} onSelect={onSelect} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function FactList({ facts, threads }: { facts: ViewFact[]; threads?: Threads }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {facts.map((f) => (
        <li key={f.id} className="flex flex-col gap-0.5">
          <span>{f.text}</span>
          <span className="flex flex-wrap gap-1 text-[0.7rem] font-bold text-ink-muted">
            <span className="rounded-full bg-muted px-2 py-0.5">{KIND_LABEL[f.kind]}</span>
            {threads && f.thread && <ThreadTag id={f.thread} threads={threads} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EventPanel({
  e,
  isCurrent,
  day,
  b,
  threads,
  nameOf,
  coordinator,
  refused,
  returned,
  previous,
  busy,
  onPlay,
  onChoose,
  onClose,
  onRetry,
}: {
  e: ViewEvent;
  isCurrent: boolean;
  day: DayView;
  b: OneDayBlock;
  threads: Threads;
  nameOf: (id?: string) => string;
  coordinator: string;
  refused: Refused | null;
  returned: { actor: string; facts: ViewFact[] } | null;
  previous?: ViewEvent;
  busy: boolean;
  onPlay: (actor: string) => void;
  onChoose: (optionId: string) => void;
  onClose: (closing: Record<string, string>) => void;
  onRetry: () => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [closing, setClosing] = useState<Record<string, StatusId>>({});
  const opened = new Set(day.lenses.filter((l) => l.event === e.id).map((l) => l.actor));
  return (
    <article aria-labelledby={`od-${e.id}`} className={cx(box, "flex flex-col gap-3")}>
      <header>
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink-muted">
          <span className="tabular-nums">{clock(e.time)}</span> · <span>{LANES[e.lane]}</span> · <span>{EVENT_KIND[e.kind]}</span>
          <ThreadTag id={e.thread} threads={threads} />
        </p>
        <h4 id={`od-${e.id}`} className="mt-1 font-serif text-xl font-semibold">
          {e.title}
        </h4>
      </header>
      {previous?.chosen && (
        <div className="rounded-xl bg-tealtint p-3 text-sm" role="status">
          <p className="text-xs font-bold">
            {clock(previous.time)}, {previous.title}: what happened
          </p>
          <p className="mt-1 font-semibold">{previous.chosen.text}</p>
          <p className="mt-1">{previous.chosen.feedback}</p>
        </div>
      )}
      {returned && (
        <div className="rounded-xl border-2 border-dashed border-accent bg-surface p-3 text-sm" role="status">
          <p className="font-semibold">Back with {coordinator}.</p>
          {returned.facts.length ? (
            <>
              <p className="mt-1">
                As {nameOf(returned.actor)}, you learned {returned.facts.length === 1 ? "something" : `${returned.facts.length} things`} {coordinator} hasn’t
                heard yet:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {returned.facts.map((f) => (
                  <li key={f.id}>{f.text}</li>
                ))}
              </ul>
              <p className="mt-1 text-ink-muted">For {coordinator} to act on it, someone has to tell her: she asks, or it’s handed over properly.</p>
            </>
          ) : (
            <p className="mt-1">Nothing you learned there is new to {coordinator}.</p>
          )}
        </div>
      )}
      <figure className="rounded-xl bg-surface p-3 ring-1 ring-line">
        <figcaption className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
          <Icon name={ARTEFACT_ICON[e.artefact.kind]} className="size-4" /> {e.artefact.from}
        </figcaption>
        <blockquote className="mt-1">{e.artefact.body}</blockquote>
      </figure>
      {e.leilaNew.length > 0 && (
        <div>
          <h5 className="text-sm font-bold">Now known to {coordinator}</h5>
          <FactList facts={e.leilaNew} />
        </div>
      )}
      {e.lensActors.length > 0 && (
        <div>
          <h5 className="text-sm font-bold">Step into someone else’s shoes</h5>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {e.lensActors.map((a) => (
              <button key={a} type="button" className={cx(secondary, "min-h-9 text-sm")} disabled={busy} onClick={() => onPlay(a)}>
                <Icon name="user" className="size-4" /> Play as {nameOf(a)}
                {opened.has(a) && <span className="sr-only"> (visited)</span>}
                {opened.has(a) && <Icon name="check" className="size-4" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {e.chosen && (
        <div className="rounded-xl bg-tealtint p-3 text-sm">
          <p className="font-semibold">
            {coordinator}: {e.chosen.text}
          </p>
          <p className="mt-1">{e.chosen.feedback}</p>
          <button type="button" className={cx(secondary, "mt-2 min-h-9 text-sm")} disabled={busy} onClick={onRetry}>
            <Icon name="refresh" className="size-4" /> Retry from here
          </button>
        </div>
      )}

      {isCurrent && e.decision && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{e.decision.prompt}</legend>
          {e.decision.options.map((o) => (
            <label
              key={o.id}
              className={cx("flex cursor-pointer gap-2 rounded-xl p-2.5 text-sm ring-1", pick === o.id ? "bg-tealtint ring-action" : "ring-line-strong")}
            >
              <input type="radio" name={`od-pick-${e.id}`} className="mt-1" checked={pick === o.id} onChange={() => setPick(o.id)} />
              <span>{o.text}</span>
            </label>
          ))}
          {refused && (
            <div role="alert" className="rounded-xl bg-[#fff1cc] p-3 text-sm text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]">
              <p className="font-semibold">{coordinator} can’t do that yet.</p>
              <p className="mt-1">{refused.feedback}</p>
              <p className="mt-1">
                She doesn’t know {refused.missing === 1 ? "something" : `${refused.missing} things`} it depends on. Choose another way, or go back and find out.
              </p>
            </div>
          )}
          <button type="button" className={cx(primary, "self-start")} disabled={!pick || busy} onClick={() => pick && onChoose(pick)}>
            Decide
          </button>
        </fieldset>
      )}

      {isCurrent && e.closing && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-semibold">Give each person’s story an honest status for the handover.</legend>
          {b.threads.map((t) => (
            <div key={t.id} role="radiogroup" aria-label={t.name} className="rounded-xl p-2.5 ring-1 ring-line-strong">
              <p className="mb-1.5 text-sm font-semibold">
                <ThreadTag id={t.id} threads={threads} />
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                {(Object.keys(STATUSES) as StatusId[]).map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" name={`od-close-${t.id}`} checked={closing[t.id] === s} onChange={() => setClosing((c) => ({ ...c, [t.id]: s }))} />
                    {STATUSES[s]}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className={cx(primary, "self-start")} disabled={busy || b.threads.some((t) => !closing[t.id])} onClick={() => onClose(closing)}>
            Close the day
          </button>
        </fieldset>
      )}
    </article>
  );
}

/** A perspective visit: a different look, and a plain statement that what's here isn't Leila's. */
function LensPanel({
  l,
  name,
  badge,
  coordinator,
  onReply,
  onLeave,
  busy,
}: {
  l: ViewLens;
  name: string;
  badge?: string;
  coordinator: string;
  onReply: (id: string) => void;
  onLeave: () => void;
  busy: boolean;
}) {
  return (
    <article
      aria-label={`Perspective visit: ${name}`}
      className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-accent bg-[color-mix(in_oklab,var(--color-accent,#7c3aed)_6%,transparent)] p-4"
    >
      <p className={kicker}>Perspective visit</p>
      <h4 className="font-serif text-xl font-semibold">
        You’re playing {name}
        {badge ? <span className="text-base font-normal text-ink-muted"> ({badge})</span> : null}
      </h4>
      <p className="rounded-xl bg-surface px-3 py-2 text-sm font-semibold">
        You know this as {name}. {coordinator} doesn’t yet.
      </p>
      <dl className="grid gap-2 text-sm">
        {(
          [
            ["What I know", l.knows],
            ["What I want or worry about", l.wants],
            ["What I can decide", l.canDecide],
            ["What I need from someone else", l.needs],
          ] as const
        ).map(([k, v]) =>
          v ? (
            <div key={k}>
              <dt className="font-bold">{k}</dt>
              <dd>{v}</dd>
            </div>
          ) : null,
        )}
      </dl>
      {l.facts.length > 0 && (
        <div>
          <h5 className="text-sm font-bold">What you’ve learned as {name}</h5>
          <FactList facts={l.facts} />
        </div>
      )}
      {l.reply && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-bold">{l.reply.prompt}</legend>
          {l.reply.options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={busy}
              aria-pressed={l.replied?.id === o.id}
              onClick={() => onReply(o.id)}
              className={cx(
                "rounded-xl p-2.5 text-left text-sm ring-1",
                l.replied?.id === o.id ? "bg-tealtint ring-action" : "bg-surface ring-line-strong hover:bg-muted",
              )}
            >
              {o.text}
            </button>
          ))}
          {l.replied && (
            <p className="text-sm" role="status">
              <strong>How it sounds:</strong> {l.replied.sounds}
            </p>
          )}
        </fieldset>
      )}
      <button type="button" className={cx(primary, "self-start")} onClick={onLeave}>
        <Icon name="arrow-left" className="size-5" /> Return to {coordinator}
      </button>
    </article>
  );
}

function Knowledge({ day, coordinator, threads }: { day: DayView; coordinator: string; threads: Threads }) {
  return (
    <details className={box} open>
      <summary className="cursor-pointer font-semibold">What {coordinator} knows</summary>
      <div className="mt-2">
        <FactList facts={day.leila} threads={threads} />
      </div>
      {day.learnerOnly.length > 0 && (
        <div className="mt-3 rounded-xl border-2 border-dashed border-accent p-3">
          <h5 className="text-sm font-bold">Only you know (from perspective visits)</h5>
          <p className="mb-1.5 text-xs text-ink-muted">{coordinator} hasn’t been told these. She can’t act on them until she is.</p>
          <FactList facts={day.learnerOnly} threads={threads} />
        </div>
      )}
    </details>
  );
}

function Commitments({ day, threads, nameOf }: { day: DayView; threads: Threads; nameOf: (id?: string) => string }) {
  return (
    <section aria-label="Commitments" className={box}>
      <h4 className="flex items-center gap-1.5 font-semibold">
        <Icon name="checklist" className="size-5" /> Commitments
      </h4>
      {day.commitments.length ? (
        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {day.commitments.map((c) => (
            <li key={c.id} className="rounded-xl bg-surface p-2.5 ring-1 ring-line">
              <p className="flex flex-wrap items-center gap-1.5">
                <ThreadTag id={c.thread} threads={threads} />
                <span className={cx("rounded-full px-2 py-0.5 text-[0.7rem] font-bold", c.status === "done" ? "bg-tealtint" : "bg-muted")}>
                  {COMMIT_STATUS[c.status]}
                </span>
              </p>
              <p className="mt-1 font-semibold">{c.action}</p>
              <p className="text-xs text-ink-muted">
                Owner: {nameOf(c.owner)} · Due: {c.due}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">No promises recorded yet.</p>
      )}
    </section>
  );
}

function Debrief({
  d,
  b,
  coordinator,
  nameOf,
  busy,
  onRetry,
}: {
  d: NonNullable<DayView["debrief"]>;
  b: OneDayBlock;
  coordinator: string;
  nameOf: (id?: string) => string;
  busy: boolean;
  onRetry: (eventId?: string) => void;
}) {
  const [from, setFrom] = useState(d.timelines[0]?.event ?? "");
  const h = d.highlights;
  return (
    <section aria-labelledby="od-debrief" className="flex flex-col gap-4 rounded-3xl bg-bg p-5 ring-1 ring-line">
      <h4 id="od-debrief" className="font-serif text-2xl font-semibold">
        The debrief
      </h4>
      {d.flags.length > 0 && (
        <div role="alert" className="rounded-2xl bg-[#fde2e0] p-4 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]">
          <p className="font-semibold">This day needs another look. A high total doesn’t outweigh a critical flag.</p>
          <ul className="mt-1 list-disc pl-5">
            {d.flags.map((f) => (
              <li key={f.flag}>
                {f.text} ({d.timelines.find((t) => t.event === f.event)?.time ? clock(d.timelines.find((t) => t.event === f.event)!.time) : "the close"})
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <caption className="mb-2 text-left font-semibold">The rubric ({d.total} of 21, from the evidence in your choices)</caption>
          <thead>
            <tr className="border-b border-line-strong">
              <th className="py-1.5 pr-2">Dimension</th>
              <th className="py-1.5 pr-2">Level</th>
              <th className="py-1.5">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {d.dims.map((x) => (
              <tr key={x.dim} className="border-b border-line">
                <th className="py-1.5 pr-2 font-semibold">{DIMENSIONS[x.dim]}</th>
                <td className="py-1.5 pr-2">{x.level === null ? "Not shown in this day" : `${x.level}: ${LEVELS[x.level]}`}</td>
                <td className="py-1.5">{x.events.map((id) => clock(d.timelines.find((t) => t.event === id)?.time ?? "00:00")).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Highlight title="A changed request" text={h.changed ? `${clock(h.changed.time)}: ${h.changed.text}` : "No request changed in this day."} />
        <Highlight
          title="A good handoff"
          text={h.goodHandoff ? `${clock(h.goodHandoff.time)}: ${h.goodHandoff.text}` : "No strong handoff this time. Look at who owned each next step."}
        />
        <Highlight title="A preventable delay" text={h.delay ? `${clock(h.delay.time)}: ${h.delay.text}` : "No preventable delay this time."} />
        <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
          <h5 className="font-bold">Still open at 5 pm, with an owner</h5>
          {h.open.length ? (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {h.open.map((c) => (
                <li key={c.id}>
                  {c.action}: {c.ownerName}, {c.due}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm">Nothing left open. Is that honest, or did something get marked done too early?</p>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="mb-2 text-left font-semibold">Three timelines, side by side</caption>
          <thead>
            <tr className="border-b border-line-strong align-bottom">
              <th className="py-1.5 pr-2">Time</th>
              <th className="py-1.5 pr-2">What happened</th>
              <th className="py-1.5 pr-2">What {coordinator} knew and decided</th>
              <th className="py-1.5">What others knew but hadn’t said (hidden at the time)</th>
            </tr>
          </thead>
          <tbody>
            {d.timelines.map((t) => (
              <tr key={t.event} className="border-b border-line align-top">
                <th className="py-2 pr-2 tabular-nums">{clock(t.time)}</th>
                <td className="py-2 pr-2">{t.happened}</td>
                <td className="py-2 pr-2">
                  {t.leila.knew.length > 0 && (
                    <ul className="mb-1 list-disc pl-4">
                      {t.leila.knew.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  )}
                  {t.leila.decided && <p className="font-semibold">{t.leila.decided}</p>}
                </td>
                <td className="py-2">
                  {t.unsaid.length ? (
                    <ul className="list-disc pl-4">
                      {t.unsaid.map((u) => (
                        <li key={u.text}>
                          {u.text}{" "}
                          <span className="text-ink-muted">
                            ({u.who}; {KIND_LABEL[u.kind].toLowerCase()})
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-ink-muted">Nothing hidden here.</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h5 className="font-bold">Your end-of-day statuses</h5>
        <ul className="mt-1 text-sm">
          {d.statuses.map((s) => (
            <li key={s.thread}>
              {s.name}: {s.status ? STATUSES[s.status] : "None given"}
            </li>
          ))}
        </ul>
      </div>
      {d.links.length > 0 && (
        <div>
          <h5 className="font-bold">Practise next</h5>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {d.links.map((l) => (
              <li key={l.href + l.label}>
                <a href={l.href} className="font-semibold underline">
                  {l.label}
                </a>{" "}
                <span className="text-ink-muted">{l.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Retry from
          <select className="min-h-11 rounded-xl border border-line-strong bg-surface px-3" value={from} onChange={(e) => setFrom(e.target.value)}>
            {d.timelines.map((t) => (
              <option key={t.event} value={t.event}>
                {clock(t.time)}: {b.events.find((e) => e.id === t.event)?.title ?? t.happened.split(":")[0]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={secondary} disabled={busy || !from} onClick={() => onRetry(from)}>
          <Icon name="refresh" className="size-5" /> Retry from this event
        </button>
        <button type="button" className={secondary} disabled={busy} onClick={() => onRetry()}>
          <Icon name="play" className="size-5" /> Replay the day
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Feedback comes from the authored rubric for this fictional day ({d.version}), not from AI. {nameOf(b.coordinator)}’s choices here don’t change the
        characters’ story anywhere else in the Hub.
      </p>
    </section>
  );
}

function Highlight({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
      <h5 className="font-bold">{title}</h5>
      <p className="mt-1 text-sm">{text}</p>
    </div>
  );
}
