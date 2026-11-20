"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { MissionBlock } from "@/lib/magazine";
import {
  ACTION_ROLES,
  advance,
  ALLOCATION_NOTE,
  allocationClock,
  buildDebrief,
  CARE_MODELS,
  checkDecision,
  dayDate,
  dayOf,
  decide,
  finishProblems,
  firstStatement,
  INFORMED,
  initialState,
  LEARNER_ROLES,
  MISSION_NOTICE,
  MISSION_STATUSES,
  moveProblem,
  NOT_RETENTION,
  learnerView,
  openItems,
  READINESS,
  scoreMission,
  showDate,
  STATUSES,
  TARGET_KINDS,
  targetDate,
  type DecisionFeedback,
  type MissionDebrief,
  type MissionState,
  type MissionStatus,
  type MissionTask,
} from "@/lib/mission";
import type { missionState } from "@/server/mission";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  First 30 Days Mission Board (docs/mission-board.md). A participant's first month as a board of tasks,
  a few dated events to decide on, and a close-the-loop step. Every move has a button: dragging a card is a
  shortcut, never the only way. Status, dates and urgency are written out, not shown by colour alone, and
  nothing animates. Nothing is timed: the dates are the made-up case's.

  In the editor's preview it runs against the block as written and stores nothing.
*/

type Loaded = ReturnType<typeof missionState>;
type Known = ReturnType<typeof learnerView>;
const NOTHING_KNOWN: Known = { told: [], promises: [] };
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const small =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-muted disabled:opacity-40";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const good = "rounded-2xl bg-[#e3f4ea] p-4 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);
const BLANK_CLOSE = { owner: "", date: "", resolved: false };

export function MissionBoard({ block: b, ctx }: { block: MissionBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/mission`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<MissionState | null>(ctx.preview ? initialState(b) : null);
  const [known, setKnown] = useState<Known>(NOTHING_KNOWN);
  const [debrief, setDebrief] = useState<MissionDebrief | null>(null);
  const [feedback, setFeedback] = useState<DecisionFeedback | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [boardNote, setBoardNote] = useState<string | null>(null);
  const [view, setView] = useState<"staff" | "participant">("staff");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);

  if (!ctx.preview && loaded.data && s === null) {
    setS(loaded.data.state);
    setKnown(loaded.data.known);
    setDebrief(loaded.data.debrief);
  }
  // Saved a moment after each change, so leaving and coming back picks up here.
  useEffect(() => {
    if (ctx.preview || !s || !dirty.current || debrief) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, state: s } }).then(
        () => setSaved(true),
        () => setSaved(false),
      );
    }, 800);
    return () => clearTimeout(t);
  }, [s, ctx.preview, url, b.id, debrief]);

  if (!ctx.preview && loaded.error)
    return (
      <Shell title={b.title}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!s)
    return (
      <Shell title={b.title}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const set = (next: MissionState) => {
    dirty.current = true;
    setSaved(false);
    setS(next);
  };
  const focusTop = () => requestAnimationFrame(() => top.current?.focus());
  const c = b.checkpoints[s.at];
  const day = dayOf(b, s.at);
  const decision = c ? s.decisions[c.id] : undefined;
  const name = b.participant.name || "the participant";

  const move = (id: string, status: MissionStatus) => {
    const p = moveProblem(b, s, id, status);
    if (p) {
      setBoardNote(p);
      set({ ...s, refusals: s.refusals + 1 });
      return;
    }
    setBoardNote(null);
    set({ ...s, board: { ...s.board, [id]: status } });
  };
  const reorder = (id: string, by: -1 | 1) => {
    const order = [...s.order];
    const i = order.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set({ ...s, order });
  };

  const decideNow = async () => {
    if (!c) return;
    setBusy(true);
    setProblem(null);
    try {
      const message = s.drafts[c.id] ?? "";
      if (ctx.preview) {
        const out = decide(b, s, { checkpoint: c.id, actions: chosen, message });
        if ("problem" in out) throw new Error(out.problem);
        setS(out.state);
        setKnown(learnerView(b, out.state));
        setFeedback(out.feedback);
      } else {
        const out = await api<{ feedback: DecisionFeedback; state: MissionState; known: Known }>(url, {
          body: { action: "decide", blockId: b.id, checkpoint: c.id, actions: chosen, message, state: s },
        });
        dirty.current = false;
        setS(out.state);
        setKnown(out.known);
        setFeedback(out.feedback);
      }
    } catch (e) {
      setProblem(errorText(e, "That didn’t send. Your choices are still here."));
    } finally {
      setBusy(false);
    }
  };
  const advanceNow = async () => {
    setBusy(true);
    setProblem(null);
    try {
      let next: MissionState;
      if (ctx.preview) {
        const out = advance(b, s);
        if ("problem" in out) {
          if (out.missing.length) setS({ ...s, refusals: s.refusals + 1 });
          throw new Error(out.missing.length ? `${out.problem} Still to do: ${out.missing.join("; ")}.` : out.problem);
        }
        next = out.state;
        setKnown(learnerView(b, next));
      } else {
        const out = await api<{ state: MissionState; known: Known }>(url, { body: { action: "advance", blockId: b.id, state: s } });
        next = out.state;
        setKnown(out.known);
        dirty.current = false;
      }
      setS(next);
      setFeedback(null);
      setChosen([]);
      setBoardNote(null);
      focusTop();
    } catch (e) {
      const msg = errorText(e, "That didn’t send.");
      setProblem(msg);
      // The server has already counted a refusal by the board; keep the local count in step.
      if (!ctx.preview && msg.includes("Still to do")) setS({ ...s, refusals: s.refusals + 1 });
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (ctx.preview) {
        const p = finishProblems(b, s);
        if (p.length) throw new Error(p.join(" "));
        setDebrief(buildDebrief(b, s, scoreMission(b, s)));
      } else {
        const out = await api<Loaded>(url, { body: { action: "finish", blockId: b.id, state: s } });
        dirty.current = false;
        setS(out.state);
        setDebrief(out.debrief);
        // Working the case through to the debrief is what counts as having done it.
        ctx.activity(b.id, { outcome: "finished" });
        ctx.engaged(b.id);
      }
      focusTop();
    } catch (e) {
      setProblem(errorText(e, "That didn’t send. Your work is still here."));
    } finally {
      setBusy(false);
    }
  };
  const again = async () => {
    setDebrief(null);
    setFeedback(null);
    setChosen([]);
    setProblem(null);
    if (ctx.preview) {
      setS(initialState(b));
      setKnown(NOTHING_KNOWN);
    } else {
      const out = await api<Loaded>(url, { body: { action: "restart", blockId: b.id } });
      setS(out.state);
      setKnown(out.known);
    }
    focusTop();
  };

  if (debrief)
    return (
      <Shell title={b.title}>
        <div ref={top} tabIndex={-1} className="outline-none">
          <Debrief block={b} d={debrief} preview={Boolean(ctx.preview)} url={url} onAgain={() => void again()} />
        </div>
      </Shell>
    );

  return (
    <Shell title={b.title}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{MISSION_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      <Overview block={b} day={day} />
      <DateRail block={b} at={s.at} />

      <div role="group" aria-label="Whose view" className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={view === "staff"}
          className={cx(secondary, view === "staff" && "bg-muted ring-2 ring-accent")}
          onClick={() => setView("staff")}
        >
          Your board
        </button>
        <button
          type="button"
          aria-pressed={view === "participant"}
          className={cx(secondary, view === "participant" && "bg-muted ring-2 ring-accent")}
          onClick={() => setView("participant")}
        >
          What {name} knows
        </button>
      </div>

      {view === "participant" ? (
        <ParticipantView block={b} s={s} known={known} />
      ) : (
        <>
          <div ref={top} tabIndex={-1} className="mt-4 outline-none">
            <p className="text-sm font-semibold text-ink-muted" aria-live="polite">
              {c ? `Day ${c.day} · ${showDate(dayDate(b, c.day))}` : `Day ${day} · ${showDate(dayDate(b, day))}`}
              {!ctx.preview && saved ? " · Saved" : ""}
            </p>
            <h4 className="font-serif text-xl font-semibold">{c ? c.title : "Close the loop"}</h4>
          </div>
          {problem && (
            <p role="alert" className={cx(warn, "mt-3")}>
              {problem}
            </p>
          )}

          {c ? (
            <div className="mt-3 flex flex-col gap-3">
              <ul className="list-disc space-y-1 pl-6">
                {c.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {!decision?.settled && (
                <Choose
                  block={b}
                  c={c}
                  chosen={chosen}
                  setChosen={setChosen}
                  draft={s.drafts[c.id] ?? ""}
                  setDraft={(v) => set({ ...s, drafts: { ...s.drafts, [c.id]: v } })}
                  critical={feedback?.critical ?? []}
                  busy={busy}
                  onDecide={() => void decideNow()}
                />
              )}
              {decision?.settled && (
                <>
                  {feedback && <Feedback f={feedback} />}
                  {!feedback && <p className="text-ink-muted">You’ve decided this one.</p>}
                  <div>
                    <button type="button" className={primary} disabled={busy} onClick={() => void advanceNow()}>
                      {b.checkpoints[s.at + 1] ? `Move on to Day ${b.checkpoints[s.at + 1].day}` : `Move on to Day ${dayOf(b, s.at + 1)}: close the loop`}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Close block={b} s={s} known={known} set={set} busy={busy} onFinish={() => void finish()} />
          )}

          <Board
            block={b}
            s={s}
            day={day}
            note={boardNote}
            move={move}
            reorder={reorder}
            setOwner={(id, v) => set({ ...s, owners: { ...s.owners, [id]: v } })}
          />
        </>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`First 30 Days Mission Board: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="calendar" className="size-5" /> First 30 Days Mission Board · training case
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** The participant, the funding clock and the first statement: the dates every decision sits against. */
function Overview({ block: b, day }: { block: MissionBlock; day: number }) {
  const clock = allocationClock(b, day);
  const st = firstStatement(b);
  const model = CARE_MODELS[b.careModel];
  const role = LEARNER_ROLES[b.learnerRole];
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-3">
      <article className={box} aria-label="The participant">
        <CharacterRow names={[b.participant.name]} size="sm">
          <h4 className="font-serif text-lg font-semibold">
            {b.participant.name}
            {b.participant.age ? `, ${b.participant.age}` : ""}
          </h4>
        </CharacterRow>
        {b.participant.about && <p className="mt-1">{b.participant.about}</p>}
        {b.participant.consent && (
          <p className="mt-2 text-sm">
            <span className="font-semibold">Who may be involved: </span>
            {b.participant.consent}
          </p>
        )}
        <p className="mt-2 text-sm">
          <span className="font-semibold">{model.label}. </span>
          {model.sourcing}
        </p>
        <p className="mt-2 text-sm">
          <span className="font-semibold">You: {role.label}. </span>
          {b.roleNote ? `${b.roleNote} ` : ""}
          {role.text}
        </p>
      </article>
      <article className={box} aria-label="Funding allocation clock">
        <h4 className="font-semibold">Funding allocation clock</h4>
        {clock ? (
          <>
            <p className="mt-1">
              Allocated {showDate(clock.allocated)}
              {clock.beforeReferral > 0 ? `, ${clock.beforeReferral} days before the referral was accepted` : ", the same day the referral was accepted"}.
            </p>
            <p className="mt-1">
              An agreement in place and services started by <span className="font-semibold">{showDate(clock.startBy)}</span> (56 days). {b.participant.name} can
              ask My Aged Care for a 28-day extension, to {showDate(clock.extendedTo)}.
            </p>
            <p className="mt-1 font-semibold">
              Now: day {Math.min(clock.used, 56)} of 56{clock.used > 56 ? `, ${clock.used - 56} days past it` : ""}.
            </p>
            <p className="mt-2 text-sm text-ink-muted">{ALLOCATION_NOTE}</p>
          </>
        ) : (
          <p className="text-ink-muted">The case’s dates aren’t set.</p>
        )}
      </article>
      <article className={box} aria-label="First monthly statement">
        <h4 className="font-semibold">First monthly statement</h4>
        {st ? (
          <>
            <p className="mt-1">
              It covers {st.month}, and is due by <span className="font-semibold">{showDate(st.due)}</span>. In this case it’s issued on {showDate(st.issued)}{" "}
              (Day {st.issuedDay}).
            </p>
            {st.noServices && <p className="mt-1">No services are delivered in {st.month}. A statement still comes.</p>}
            {st.afterDay30 && (
              <p className="mt-1">That’s after Day 30, so walking through it stays open past the end of this case. A sample isn’t the statement.</p>
            )}
          </>
        ) : (
          <p className="text-ink-muted">The case’s dates aren’t set.</p>
        )}
      </article>
    </div>
  );
}

function DateRail({ block: b, at }: { block: MissionBlock; at: number }) {
  const stops = [
    ...b.checkpoints.map((c, i) => ({ i, day: c.day, title: c.title })),
    { i: b.checkpoints.length, day: dayOf(b, b.checkpoints.length), title: "Close the loop" },
  ];
  return (
    <nav aria-label="The case’s days" className="mt-4">
      <ol className="flex flex-wrap gap-2">
        {stops.map((x) => (
          <li
            key={x.i}
            aria-current={x.i === at ? "step" : undefined}
            className={cx(
              "rounded-full px-3 py-1 text-sm ring-1 ring-line",
              x.i === at ? "bg-action font-semibold text-on-action" : x.i < at ? "bg-muted" : "bg-surface",
            )}
          >
            Day {x.day} · {x.title}
            <span className="sr-only">{x.i === at ? " (now)" : x.i < at ? " (done)" : " (to come)"}</span>
            {x.i < at && <span aria-hidden> ✓</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Choose({
  block: b,
  c,
  chosen,
  setChosen,
  draft,
  setDraft,
  critical,
  busy,
  onDecide,
}: {
  block: MissionBlock;
  c: MissionBlock["checkpoints"][number];
  chosen: string[];
  setChosen: (v: string[]) => void;
  draft: string;
  setDraft: (v: string) => void;
  critical: string[];
  busy: boolean;
  onDecide: () => void;
}) {
  const ids = useId();
  return (
    <div className="flex flex-col gap-3">
      {critical.length > 0 && (
        <div role="alert" className={warn}>
          <p className="font-semibold">Before you go on, look at this again.</p>
          {critical.map((x) => (
            <p key={x} className="mt-1">
              {x}
            </p>
          ))}
        </div>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">What do you do? Choose all that you would.</legend>
        {c.actions.map((a) => (
          <label key={a.id} className={cx(box, "flex min-h-11 cursor-pointer items-start gap-3 py-3")}>
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={chosen.includes(a.id)}
              onChange={(e) => setChosen(e.target.checked ? [...chosen, a.id] : chosen.filter((x) => x !== a.id))}
            />
            <span>{a.label}</span>
          </label>
        ))}
      </fieldset>
      {c.message && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-msg`} className="font-semibold">
            {c.message.prompt}
          </label>
          <p id={`${ids}-hint`} className="text-sm text-ink-muted">
            In your own words, as you’d say it to {b.participant.name}. Nothing is sent.
          </p>
          <textarea
            id={`${ids}-msg`}
            aria-describedby={`${ids}-hint`}
            className={cx(field, "min-h-28")}
            value={draft}
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
      )}
      <div>
        <button type="button" className={primary} disabled={busy || !chosen.length} onClick={onDecide}>
          Decide
        </button>
      </div>
    </div>
  );
}

function Statuses({ f }: { f: DecisionFeedback["status"] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      <div className={box}>
        <dt className="text-sm text-ink-muted">Service readiness</dt>
        <dd className="font-semibold">{READINESS[f.readiness]}</dd>
      </div>
      <div className={box}>
        <dt className="text-sm text-ink-muted">Promises</dt>
        <dd className="font-semibold">{f.promises.made ? `${f.promises.made} made, ${f.promises.kept} kept, ${f.promises.open} open` : "None made yet"}</dd>
      </div>
      <div className={box}>
        <dt className="text-sm text-ink-muted">Participant informed</dt>
        <dd className="font-semibold">{INFORMED[f.informed]}</dd>
      </div>
      <div className={box}>
        <dt className="text-sm text-ink-muted">Outstanding risk</dt>
        <dd className="font-semibold">{f.risk || "None noted"}</dd>
      </div>
    </dl>
  );
}

function Feedback({ f }: { f: DecisionFeedback }) {
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <ul className="flex flex-col gap-2">
        {f.chosen.map((a) => (
          <li key={a.id} className={box}>
            <p className="font-semibold">{a.label}</p>
            <p className="text-sm text-ink-muted">{ACTION_ROLES[a.role]}</p>
            <p className="mt-1">{a.feedback}</p>
            {a.consequence && <p className="mt-1 text-sm italic">In the made-up timeline: {a.consequence}</p>}
          </li>
        ))}
      </ul>
      {f.missed.length > 0 && (
        <div className={warn}>
          <p className="font-semibold">Also needed here:</p>
          <ul className="mt-1 list-disc pl-6">
            {f.missed.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <Statuses f={f.status} />
      {f.message && (
        <div className={box}>
          <p className="font-semibold">One way to say it</p>
          <p className="mt-1">{f.message.model}</p>
          {f.message.checklist.length > 0 && (
            <>
              <p className="mt-2 font-semibold">Did yours…</p>
              <ul className="mt-1 list-disc pl-6">
                {f.message.checklist.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Board({
  block: b,
  s,
  day,
  note,
  move,
  reorder,
  setOwner,
}: {
  block: MissionBlock;
  s: MissionState;
  day: number;
  note: string | null;
  move: (id: string, status: MissionStatus) => void;
  reorder: (id: string, by: -1 | 1) => void;
  setOwner: (id: string, v: string) => void;
}) {
  const [layout, setLayout] = useState<"columns" | "list">("columns");
  const [dragging, setDragging] = useState<string | null>(null);
  const tasks = s.order.map((id) => b.tasks.find((t) => t.id === id)).filter((t): t is MissionTask => Boolean(t));
  return (
    <section aria-label="Mission board" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-serif text-xl font-semibold">The board</h4>
        <div role="group" aria-label="Board layout" className="flex gap-2">
          <button
            type="button"
            aria-pressed={layout === "columns"}
            className={cx(small, layout === "columns" && "bg-muted ring-2 ring-accent")}
            onClick={() => setLayout("columns")}
          >
            Columns
          </button>
          <button
            type="button"
            aria-pressed={layout === "list"}
            className={cx(small, layout === "list" && "bg-muted ring-2 ring-accent")}
            onClick={() => setLayout("list")}
          >
            List by date
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Keep each task where it really is. Work can run side by side, but the board won’t mark something done before what it depends on.
      </p>
      {note && (
        <p role="alert" className={cx(warn, "mt-2")}>
          {note}
        </p>
      )}
      {layout === "list" ? (
        <ol className="mt-3 flex flex-col gap-2">
          {[...tasks]
            .sort((x, y) => targetDate(b, x).localeCompare(targetDate(b, y)))
            .map((t) => (
              <li key={t.id}>
                <Card block={b} s={s} t={t} day={day} move={move} reorder={reorder} setOwner={setOwner} />
              </li>
            ))}
        </ol>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {MISSION_STATUSES.map((st) => {
            const here = tasks.filter((t) => s.board[t.id] === st);
            return (
              <section
                key={st}
                aria-label={`${STATUSES[st].label}: ${here.length}`}
                className={cx("flex min-h-24 flex-col gap-2 rounded-2xl bg-muted p-2", dragging && "ring-2 ring-dashed ring-line-strong")}
                onDragOver={(e) => dragging && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging) move(dragging, st);
                  setDragging(null);
                }}
              >
                <h5 className="px-1 font-semibold">
                  {STATUSES[st].label} <span className="font-normal text-ink-muted">({here.length})</span>
                </h5>
                {here.map((t) => (
                  <div key={t.id} draggable onDragStart={() => setDragging(t.id)} onDragEnd={() => setDragging(null)}>
                    <Card block={b} s={s} t={t} day={day} move={move} reorder={reorder} setOwner={setOwner} compact />
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Card({
  block: b,
  s,
  t,
  day,
  move,
  reorder,
  setOwner,
  compact,
}: {
  block: MissionBlock;
  s: MissionState;
  t: MissionTask;
  day: number;
  move: (id: string, status: MissionStatus) => void;
  reorder: (id: string, by: -1 | 1) => void;
  setOwner: (id: string, v: string) => void;
  compact?: boolean;
}) {
  const ids = useId();
  const status = s.board[t.id];
  const target = targetDate(b, t);
  const deps = t.dependsOn.map((id) => b.tasks.find((x) => x.id === id)).filter((x): x is MissionTask => Boolean(x));
  const late = status !== "done" && target && target < dayDate(b, day);
  const i = s.order.indexOf(t.id);
  return (
    <article aria-labelledby={`${ids}-t`} className="rounded-xl bg-surface p-3 text-sm ring-1 ring-line">
      <h6 id={`${ids}-t`} className="text-base font-semibold">
        {t.title}
      </h6>
      <p className="mt-1">
        <span className="text-ink-muted">Owner: </span>
        {s.owners[t.id] || t.owner}
      </p>
      <p className="mt-1">
        <span className="text-ink-muted">Target: </span>
        {target ? showDate(target) : "not set"} · {TARGET_KINDS[t.target.kind]}
        {late ? " · past its target" : ""}
      </p>
      {deps.length > 0 && (
        <p className="mt-1">
          <span className="text-ink-muted">After: </span>
          {deps.map((d) => `${d.title}${s.board[d.id] === "done" ? " (done)" : " (not done)"}`).join("; ")}
        </p>
      )}
      <details className="mt-1">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">What it needs{compact ? "" : " and who owns it"}</summary>
        <p>{t.needs}</p>
        {t.notBeforeDay !== null && <p className="mt-1">Can’t be done before Day {t.notBeforeDay}.</p>}
        <label className="mt-2 flex flex-col gap-1">
          <span className="font-semibold">Hand it to (a role)</span>
          <input className={field} value={s.owners[t.id] ?? ""} placeholder={t.owner} maxLength={120} onChange={(e) => setOwner(t.id, e.target.value)} />
        </label>
      </details>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex min-w-36 flex-1 flex-col gap-1">
          <span className="font-semibold">Status</span>
          <select className={field} value={status} onChange={(e) => move(t.id, e.target.value as MissionStatus)}>
            {MISSION_STATUSES.map((x) => (
              <option key={x} value={x}>
                {STATUSES[x].label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={small} disabled={i <= 0} aria-label={`Move “${t.title}” earlier`} onClick={() => reorder(t.id, -1)}>
          ↑
        </button>
        <button type="button" className={small} disabled={i >= s.order.length - 1} aria-label={`Move “${t.title}” later`} onClick={() => reorder(t.id, 1)}>
          ↓
        </button>
      </div>
    </article>
  );
}

function Close({
  block: b,
  s,
  known,
  set,
  busy,
  onFinish,
}: {
  block: MissionBlock;
  s: MissionState;
  known: Known;
  set: (s: MissionState) => void;
  busy: boolean;
  onFinish: () => void;
}) {
  // Open tasks come from the board; open promises from the server, which has the full case.
  const items = [
    ...openItems(b, s).filter((i) => i.kind === "task"),
    ...known.promises.filter((p) => !p.keptAt).map((p) => ({ key: `promise:${p.id}`, label: p.text, kind: "promise" as const, owner: "", target: "" })),
  ];
  const put = (key: string, patch: Partial<MissionState["close"][string]>) =>
    set({ ...s, close: { ...s.close, [key]: { ...BLANK_CLOSE, ...s.close[key], ...patch } } });
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p>
        Day 30 isn’t the end of {b.participant.name}’s care. Before you close, everything still open needs an owner and a date, or to be marked resolved, and
        the next check-in needs agreeing. An honest “still open, owned, dated” is a good answer.
      </p>
      <p className="text-sm text-ink-muted">If something below is already finished, mark it Done on the board and it drops off this list.</p>
      {items.length === 0 && <p className={good}>Nothing is open.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const v = s.close[it.key] ?? { owner: "", date: "", resolved: false };
          return (
            <li key={it.key} className={box}>
              <p className="font-semibold">
                {it.kind === "promise" ? "Promise: " : "Task: "}
                {it.label}
              </p>
              {it.target && <p className="text-sm text-ink-muted">Target {showDate(it.target)}</p>}
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">Owner (a role)</span>
                  <input
                    className={field}
                    value={v.owner}
                    placeholder={it.owner}
                    maxLength={120}
                    disabled={v.resolved}
                    onChange={(e) => put(it.key, { owner: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">By</span>
                  <input type="date" className={field} value={v.date} disabled={v.resolved} onChange={(e) => put(it.key, { date: e.target.value })} />
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="size-5" checked={v.resolved} onChange={(e) => put(it.key, { resolved: e.target.checked })} />
                  Resolved
                </label>
              </div>
            </li>
          );
        })}
      </ul>
      <label className="flex max-w-xs flex-col gap-1">
        <span className="font-semibold">Next check-in agreed with {b.participant.name}</span>
        <input type="date" className={field} value={s.nextCheckIn} onChange={(e) => set({ ...s, nextCheckIn: e.target.value })} />
      </label>
      <div>
        <button type="button" className={primary} disabled={busy} onClick={onFinish}>
          Close the loop and see the debrief
        </button>
      </div>
    </div>
  );
}

function ParticipantView({ block: b, s, known }: { block: MissionBlock; s: MissionState; known: Known }) {
  const { told } = known;
  const open = known.promises.filter((p) => !p.keptAt);
  return (
    <section aria-label={`What ${b.participant.name} knows`} className="mt-4 flex flex-col gap-3">
      <p className="text-ink-muted">
        Only what {b.participant.name} has actually been told, by the choices you made and the words you wrote. What’s on your board doesn’t count until it’s
        said.
      </p>
      {told.length === 0 ? (
        <p className={box}>Nothing yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {told.map((x) => (
            <li key={x.day} className={box}>
              <p className="text-sm font-semibold text-ink-muted">
                Day {x.day} · {showDate(x.date)} · {x.title}
              </p>
              <ul className="mt-1 list-disc pl-6">
                {x.told.map((line) => (
                  <li key={line}>“{line}”</li>
                ))}
              </ul>
              {x.message && <p className="mt-2 whitespace-pre-line">In your words: “{x.message}”</p>}
            </li>
          ))}
        </ol>
      )}
      {open.length > 0 && (
        <div className={box}>
          <p className="font-semibold">Promised and not yet kept</p>
          <ul className="mt-1 list-disc pl-6">
            {open.map((p) => (
              <li key={p.id}>
                {p.text} (Day {p.day})
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className={box}>
        Who to call: their {LEARNER_ROLES[b.learnerRole].label}.{s.nextCheckIn ? ` Next check-in: ${showDate(s.nextCheckIn)}.` : ""}
      </p>
    </section>
  );
}

function Debrief({ block: b, d, preview, url, onAgain }: { block: MissionBlock; d: MissionDebrief; preview: boolean; url: string; onAgain: () => void }) {
  const [redo, setRedo] = useState<string | null>(null);
  const [redoChosen, setRedoChosen] = useState<string[]>([]);
  const [redoFb, setRedoFb] = useState<DecisionFeedback | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const tryAgain = async () => {
    if (!redo) return;
    setProblem(null);
    try {
      if (preview) {
        const c = b.checkpoints.find((x) => x.id === redo)!;
        setRedoFb(checkDecision(b, c, redoChosen, initialState(b)));
      } else
        setRedoFb(
          (await api<{ feedback: DecisionFeedback }>(url, { body: { action: "redo", blockId: b.id, checkpoint: redo, actions: redoChosen } })).feedback,
        );
    } catch (e) {
      setProblem(errorText(e, "That didn’t send."));
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <h4 className="font-serif text-xl font-semibold">Debrief</h4>
      <p className="text-ink-muted">{NOT_RETENTION}</p>

      <section aria-label="How it read">
        <h5 className="font-semibold">How it read</h5>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {d.dims.map((x) => (
            <li key={x.id} className={box}>
              <p>
                <span className="font-semibold">{x.label}: </span>
                {x.rating}
              </p>
              {x.notes.length > 0 && (
                <ul className="mt-1 list-disc pl-6 text-sm">
                  {x.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="What happened">
        <h5 className="font-semibold">What happened</h5>
        <ol className="mt-2 flex flex-col gap-3">
          {d.timeline.map((t) => (
            <li key={t.id} className={box}>
              <p className="text-sm font-semibold text-ink-muted">
                Day {t.day} · {showDate(t.date)}
              </p>
              <p className="font-serif text-lg font-semibold">{t.title}</p>
              {t.firstTry.length > 0 && <p className="mt-1">You first chose: {t.firstTry.join("; ")}. Then you changed course.</p>}
              <ul className="mt-2 flex flex-col gap-1">
                {t.chosen.map((a) => (
                  <li key={a.label}>
                    <span className="font-semibold">{a.label}</span> ({ACTION_ROLES[a.role].toLowerCase()}). {a.feedback}
                  </li>
                ))}
              </ul>
              {t.missed.length > 0 && <p className="mt-1">Also needed: {t.missed.join("; ")}.</p>}
              <div className="mt-2">
                <Statuses f={t.status} />
              </div>
              {t.message && <p className="mt-2 whitespace-pre-line">You said: “{t.message}”</p>}
              {t.model && <p className="mt-1 text-sm">One way to say it: {t.model.model}</p>}
              {(t.firstTry.length > 0 || t.missed.length > 0) && redo !== t.id && (
                <button
                  type="button"
                  className={cx(secondary, "mt-2")}
                  onClick={() => {
                    setRedo(t.id);
                    setRedoChosen([]);
                    setRedoFb(null);
                  }}
                >
                  Try this moment again
                </button>
              )}
              {redo === t.id && (
                <fieldset className="mt-3 flex flex-col gap-2">
                  <legend className="font-semibold">Try it again. Your record stays as it was.</legend>
                  {t.actions.map((a) => (
                    <label key={a.id} className="flex min-h-11 items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-5"
                        checked={redoChosen.includes(a.id)}
                        onChange={(e) => setRedoChosen(e.target.checked ? [...redoChosen, a.id] : redoChosen.filter((x) => x !== a.id))}
                      />
                      <span>{a.label}</span>
                    </label>
                  ))}
                  <div>
                    <button type="button" className={primary} disabled={!redoChosen.length} onClick={() => void tryAgain()}>
                      Decide
                    </button>
                  </div>
                  {problem && <p role="alert">{problem}</p>}
                  {redoFb &&
                    (redoFb.critical.length ? (
                      <div role="alert" className={warn}>
                        {redoFb.critical.join(" ")}
                      </div>
                    ) : (
                      <Feedback f={redoFb} />
                    ))}
                </fieldset>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Promises">
        <h5 className="font-semibold">Promises made and kept</h5>
        {d.promises.length === 0 ? (
          <p className="text-ink-muted">You didn’t make any promises in this case.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {d.promises.map((p) => (
              <li key={p.id}>
                <span className="font-semibold">Day {p.day}: </span>
                {p.text}.{" "}
                {p.keptAt
                  ? `Kept (${p.keptAt}).`
                  : p.handover?.resolved
                    ? "Marked resolved."
                    : p.handover
                      ? `Still open: ${p.handover.owner}, by ${showDate(p.handover.date)}.`
                      : "Still open."}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Still open">
        <h5 className="font-semibold">Still open after Day 30</h5>
        <ul className="mt-2 flex flex-col gap-1">
          {d.open
            .filter((o) => o.kind === "task")
            .map((o) => (
              <li key={o.key}>
                {o.label}: {o.close?.resolved ? "marked resolved" : o.close ? `${o.close.owner}, by ${showDate(o.close.date)}` : "no owner"}
              </li>
            ))}
        </ul>
        {d.statement && (
          <p className="mt-2">
            First statement: covers {d.statement.month}, issued {showDate(d.statement.issued)}, due by {showDate(d.statement.due)}.
            {d.statement.afterDay30 ? " Walking through it was always going to happen after Day 30." : ""}
          </p>
        )}
        {d.nextCheckIn && <p className="mt-1">Next check-in: {showDate(d.nextCheckIn)}.</p>}
      </section>

      {d.closing && (
        <section aria-label="A well-closed loop" className={box}>
          <h5 className="font-semibold">A well-closed loop, from a reviewer</h5>
          <p className="mt-1">{d.closing}</p>
        </section>
      )}
      {(d.source.title || d.source.version) && (
        <p className="text-sm text-ink-muted">
          Checked against: {d.source.title}
          {d.source.version ? `, ${d.source.version}` : ""}.
        </p>
      )}
      <div>
        <button type="button" className={secondary} onClick={onAgain}>
          Start the case again
        </button>
      </div>
    </div>
  );
}
