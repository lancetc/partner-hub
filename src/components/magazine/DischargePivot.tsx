"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { DischargeBlock } from "@/lib/magazine";
import {
  applyMove,
  buildDebrief,
  cleanHandover,
  DECLARATIONS,
  deskView,
  emptyState,
  ENGINE_VERSION,
  handoverProblems,
  LANE_HINTS,
  LANE_ORDER,
  LANES,
  minutesWords,
  MoveError,
  OWNER_ROLES,
  PIVOT_VERSION,
  RELIABILITY,
  RUBRIC_VERSION,
  STATED,
  VERDICTS,
  type Debrief,
  type Declaration,
  type DeskView,
  type GateStatus,
  type Handover,
  type Move,
  type OwnerRole,
  type PivotState,
  type Stated,
  variationFor,
} from "@/lib/dischargePivot";
import type { DischargeView } from "@/server/dischargePivot";
import { Icon, type IconName } from "../Icon";
import { AidSection } from "../playbooks/AidSection";

/*
  The 72-Hour Discharge Pivot, as learners use it (docs/discharge-pivot.md). A coordinator's desk: incoming alerts,
  the handover record, an action board (Verify, Arrange, Escalate, Follow up) and a readiness panel, then a handover
  and a debrief. Every decision is a labelled button: nothing is drag-only. On a phone the four areas are tabs; on a
  wide screen they sit side by side. New alerts are announced politely without moving focus.

  The page holds only what the server sends: what has arrived, the record and the cards that can be used now. The
  scenario, its feedback and the rubric stay on the server until the handover is submitted. In the editor's preview it
  runs the same engine locally against the block as written, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const good = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warn = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const bad = "bg-[#fde4e1] text-[#7a1d12] dark:bg-[#3f1712] dark:text-[#ffb4a8]";
const plain = "bg-muted text-ink";

const GATE_LOOK: Record<GateStatus, { icon: IconName; cls: string }> = {
  confirmed: { icon: "check", cls: good },
  pending: { icon: "clock", cls: warn },
  unresolved: { icon: "alert", cls: bad },
  unknown: { icon: "info", cls: plain },
};
const RELIABLE_ICON: Record<keyof typeof RELIABILITY, IconName> = { verified: "shield", unverified: "info", hearsay: "chat" };

type Body = Record<string, unknown>;
type Call = (body: Body) => Promise<DischargeView>;

/** The editor's preview: the same engine, computed locally from the block as written. Nothing is stored. */
function previewEngine(b: DischargeBlock, variation: string) {
  let attemptNo = 0;
  let s: PivotState | null = null;
  let debrief: Debrief | null = null;
  let status: DischargeView["status"] = "new";
  const toView = (): DischargeView => ({
    attemptId: s ? `preview-${attemptNo}` : null,
    attemptNo,
    status,
    desk: s ? deskView(b, s) : null,
    debrief,
    attempts: attemptNo,
    usable: { ok: true, reason: "" },
    versions: { pivot: PIVOT_VERSION, rubric: RUBRIC_VERSION, engine: ENGINE_VERSION, scenario: b.scenarioVersion },
    earlierScenario: false,
  });
  const begin = (mode: unknown, v: string) => {
    attemptNo += 1;
    s = applyMove(b, emptyState(v), { do: "start", mode: mode === "untimed" ? "untimed" : "timed" });
    debrief = null;
    status = "active";
  };
  const call: Call = async (body) => {
    try {
      if (body.action === "start" && status === "new") begin(body.mode, variation);
      else if (body.action === "retry" && status !== "active") begin(body.mode, variationFor(b, attemptNo + 1));
      else if (body.action === "viewed" && status === "submitted") status = "completed";
      else if (body.action === "submit" && s && status === "active") {
        const next: PivotState = { ...s, handover: cleanHandover(b, body.handover) };
        const problems = handoverProblems(b, next);
        if (problems.length) throw new Error(`Not yet. ${problems[0]}`);
        s = next;
        debrief = buildDebrief(b, next);
        status = "submitted";
      } else if (body.move && s && status === "active") s = applyMove(b, s, body.move as Move);
    } catch (e) {
      throw new Error(e instanceof MoveError || e instanceof Error ? e.message : "That didn’t work.");
    }
    return toView();
  };
  return { call, view: toView };
}

export function DischargePivot({
  block: b,
  guideId,
  preview = false,
  place = "magazine",
  onFinished,
}: {
  block: DischargeBlock;
  guideId: string;
  preview?: boolean;
  place?: string;
  onFinished?: (d: Debrief) => void;
}) {
  const url = `/api/magazine/${guideId}/discharge`;
  const loaded = useApi<DischargeView>(preview ? null : `${url}?block=${b.id}`);
  const [pVariation, setPVariation] = useState("");
  const [engine, setEngine] = useState(() => (preview ? previewEngine(b, "") : null));
  const [v, setV] = useState<DischargeView | null>(preview ? (engine?.view() ?? null) : null);
  if (!preview && loaded.data && v === null) setV(loaded.data);
  // Once the learner has done something, each new stage takes the focus (not on first load). Kept here, so it survives a new attempt.
  const acted = useRef(false);

  const call = useCallback<Call>(
    async (body) => (engine ? engine.call(body) : api<DischargeView>(url, { body: { blockId: b.id, place, ...body } })),
    [engine, url, b.id, place],
  );

  if (!preview && loaded.error)
    return (
      <Shell b={b}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  return (
    <Shell b={b}>
      {preview && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-line-strong p-3 text-sm">
          <p className="w-full font-semibold">Preview (nothing is saved). It runs the same engine as the server, on the block as written.</p>
          <label className="flex flex-col gap-1">
            Play
            <select
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-2"
              value={pVariation}
              onChange={(e) => {
                setPVariation(e.target.value);
                const next = previewEngine(b, e.target.value);
                setEngine(next);
                setV(next.view());
              }}
            >
              <option value="">First attempt</option>
              {b.variations.map((x) => (
                <option key={x.id} value={x.id}>
                  Retry variation: {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!v ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <Attempt
          key={v.attemptId ?? "new"}
          b={b}
          v={v}
          setV={setV}
          call={call}
          actedRef={acted}
          preview={preview}
          guideId={guideId}
          place={place}
          onFinished={onFinished}
        />
      )}
    </Shell>
  );
}

function Shell({ b, children }: { b: DischargeBlock; children: React.ReactNode }) {
  return (
    <section
      className="flex w-full min-w-0 flex-col gap-4 rounded-3xl border border-line-strong bg-surface p-4 shadow-sm sm:p-6"
      aria-label={`72-Hour Discharge Pivot: ${b.title}`}
    >
      <div>
        <p className="mb-1 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="clipboard" className="size-5" /> 72-Hour Discharge Pivot
        </p>
        <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
        {b.intro && <p className="mt-1 text-ink-muted">{b.intro}</p>}
        <p className="mt-2 inline-flex flex-wrap gap-x-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold">
          <span>Practice</span>
          <span aria-hidden>·</span>
          <span>A fictional case</span>
          <span aria-hidden>·</span>
          <span>Nothing is booked, sent or changed</span>
        </p>
      </div>
      {children}
    </section>
  );
}

function Attempt({
  b,
  v,
  setV,
  call,
  actedRef,
  preview,
  guideId,
  place,
  onFinished,
}: {
  b: DischargeBlock;
  v: DischargeView;
  setV: (v: DischargeView) => void;
  call: Call;
  actedRef: React.RefObject<boolean>;
  preview: boolean;
  guideId: string;
  place: string;
  onFinished?: (d: Debrief) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [mode, setMode] = useState<"timed" | "untimed">("timed");
  const heading = useRef<HTMLHeadingElement>(null);
  const viewed = useRef(false);
  const stage = v.status === "active" ? (v.desk?.stage ?? "desk") : v.status;

  useEffect(() => {
    if (actedRef.current) heading.current?.focus();
  }, [stage, actedRef]);
  // Completion needs the debrief seen: once it's on screen, say so (once).
  useEffect(() => {
    if (!v.debrief || viewed.current || v.status !== "submitted") return;
    viewed.current = true;
    const d = v.debrief;
    call({ action: "viewed" })
      .then((next) => {
        setV(next);
        onFinished?.(d);
      })
      .catch(() => undefined);
  }, [v.debrief, v.status, call, setV, onFinished]);

  const run = async (body: Body, announce = "") => {
    setBusy(true);
    setProblem(null);
    actedRef.current = true;
    try {
      const next = await call(body);
      const before = new Set(v.desk?.alerts.map((a) => a.id) ?? []);
      const fresh = (next.desk?.alerts ?? []).filter((a) => !before.has(a.id));
      setSaid([announce, ...fresh.map((a) => `New alert from ${a.from}.`)].filter(Boolean).join(" "));
      setV(next);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const move = (m: Move, announce = "") => run({ move: m }, announce);

  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      {problem && (
        <p role="alert" className={cx(bad, "rounded-xl px-3 py-2 text-sm")}>
          {problem}
        </p>
      )}
      {v.status === "new" ? (
        <Start b={b} v={v} mode={mode} setMode={setMode} busy={busy} heading={heading} onStart={() => run({ action: "start", mode })} />
      ) : v.status === "active" && v.desk ? (
        v.desk.stage === "handover" ? (
          <HandoverForm desk={v.desk} busy={busy} heading={heading} preview={preview} call={call} onBack={() => move({ do: "desk" })} run={run} />
        ) : (
          <Desk desk={v.desk} busy={busy} heading={heading} move={move} />
        )
      ) : v.debrief ? (
        <DebriefView
          d={v.debrief}
          b={b}
          heading={heading}
          busy={busy}
          preview={preview}
          guideId={guideId}
          place={place}
          onRetry={() => run({ action: "retry", from: v.attemptId, mode: v.debrief?.play ?? mode })}
        />
      ) : null}
    </div>
  );
}

function Start({
  b,
  v,
  mode,
  setMode,
  busy,
  heading,
  onStart,
}: {
  b: DischargeBlock;
  v: DischargeView;
  mode: "timed" | "untimed";
  setMode: (m: "timed" | "untimed") => void;
  busy: boolean;
  heading: React.RefObject<HTMLHeadingElement | null>;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        Before you start
      </h4>
      <div className={box}>
        <p className="font-semibold">{b.participant.name}</p>
        <p className="text-sm">{b.participant.about}</p>
        <p className="mt-2 text-sm">
          <span className="font-semibold">Who decides:</span> {b.decisionMaker}
        </p>
        {b.supporter.name && (
          <p className="text-sm">
            <span className="font-semibold">{b.supporter.name}:</span> {b.supporter.status}
          </p>
        )}
        <p className="mt-2 text-sm">{b.clock.dischargeText}</p>
      </div>
      <div className={box}>
        <p className="font-semibold">How it works</p>
        <ul className="mt-1 list-disc pl-5 text-sm">
          <li>Alerts arrive as the story moves. Read them, and check the handover record: reading costs no time.</li>
          <li>Each card on the board is a decision: verify, arrange, escalate or follow up. Using one moves the story clock on.</li>
          <li>The readiness panel shows what’s actually confirmed. It doesn’t turn green because you used cards.</li>
          <li>When you’re ready, record the handover. An honest “not ready, and escalated” can be the right answer.</li>
        </ul>
      </div>
      <fieldset className={box}>
        <legend className="font-semibold">How would you like to play?</legend>
        {(
          [
            [
              "timed",
              "With the story clock",
              "Replies arrive over story time, and one may close if you leave it too long. The clock moves only when you act or wait.",
            ],
            ["untimed", "Untimed practice", "The clock is hidden and nothing closes while you think. The same decisions and feedback."],
          ] as const
        ).map(([id, label, hint]) => (
          <label key={id} className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
            <input type="radio" name="pivot-mode" className="mt-1 size-5" checked={mode === id} onChange={() => setMode(id)} />
            <span>
              <span className="font-semibold">{label}</span>
              <span className="block text-sm text-ink-muted">{hint}</span>
            </span>
          </label>
        ))}
        <p className="mt-2 text-sm text-ink-muted">You can pause at any time, and come back to where you were.</p>
      </fieldset>
      {!v.usable.ok ? (
        <p className={cx(warn, "rounded-xl px-3 py-2 text-sm")}>{v.usable.reason}</p>
      ) : (
        <div>
          <button type="button" className={primary} disabled={busy} onClick={onStart}>
            <Icon name="play" className="size-4" /> Start at the desk
          </button>
        </div>
      )}
    </div>
  );
}

const TABS = [
  ["alerts", "Alerts"],
  ["record", "Handover record"],
  ["board", "Action board"],
  ["ready", "Readiness"],
] as const;
type Tab = (typeof TABS)[number][0];

function Desk({
  desk,
  busy,
  heading,
  move,
}: {
  desk: DeskView;
  busy: boolean;
  heading: React.RefObject<HTMLHeadingElement | null>;
  move: (m: Move, say?: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("alerts");
  const unread = desk.alerts.filter((a) => !a.read).length;
  const untimed = desk.play === "untimed";
  return (
    <div className="flex flex-col gap-3">
      <h4 ref={heading} tabIndex={-1} className="sr-only">
        The coordinator’s desk
      </h4>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted p-3">
        <p className="mr-auto text-sm">
          {untimed ? (
            <>
              <span className="font-semibold">Untimed practice.</span> The story waits for you.
            </>
          ) : (
            <>
              <Icon name="clock" className="mr-1 inline size-4 align-[-3px]" />
              <span className="font-semibold">{desk.clock.label}.</span>{" "}
              {desk.clock.closed ? "It’s the proposed discharge time." : `Proposed discharge ${desk.clock.discharge} (${minutesWords(desk.clock.left)} away).`}
            </>
          )}
        </p>
        {!desk.paused && !desk.clock.closed && (
          <button type="button" className={secondary} disabled={busy} onClick={() => move({ do: "wait", at: desk.clock.minute }, "You waited for replies.")}>
            <Icon name="clock" className="size-4" /> Wait for replies
          </button>
        )}
        <button
          type="button"
          className={secondary}
          disabled={busy}
          aria-pressed={desk.paused}
          onClick={() => move({ do: desk.paused ? "resume" : "pause" }, desk.paused ? "Resumed." : "Paused.")}
        >
          <Icon name={desk.paused ? "play" : "pause"} className="size-4" /> {desk.paused ? "Resume" : "Pause"}
        </button>
        <button type="button" className={primary} disabled={busy || desk.paused} onClick={() => move({ do: "handover" })}>
          Record the handover
        </button>
      </div>
      {desk.variation && (
        <p className={cx(plain, "rounded-xl px-3 py-2 text-sm")}>
          <span className="font-semibold">This attempt: {desk.variation.label}.</span> {desk.variation.text}
        </p>
      )}
      {desk.paused ? (
        <div className={box}>
          <p className="font-semibold">Paused</p>
          <p className="text-sm">The story clock only moves when you act, so nothing changes while you’re away. Resume when you’re ready.</p>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Desk areas" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:hidden">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`pivot-${id}`}
                className={cx("min-h-11 rounded-xl px-3 text-sm font-semibold ring-1 ring-line", tab === id ? "bg-action text-on-action" : "bg-surface")}
                onClick={() => setTab(id)}
              >
                {label}
                {id === "alerts" && unread > 0 ? ` (${unread} new)` : ""}
              </button>
            ))}
          </div>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <div id="pivot-alerts" className={cx("min-w-0 lg:block", tab !== "alerts" && "hidden")}>
              <Alerts desk={desk} busy={busy} move={move} />
            </div>
            <div id="pivot-ready" className={cx("min-w-0 lg:block", tab !== "ready" && "hidden")}>
              <Readiness desk={desk} />
            </div>
            <div id="pivot-record" className={cx("min-w-0 lg:block", tab !== "record" && "hidden")}>
              <RecordPanel desk={desk} busy={busy} move={move} />
            </div>
            <div id="pivot-board" className={cx("min-w-0 lg:block", tab !== "board" && "hidden")}>
              <Board desk={desk} busy={busy} move={move} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Alerts({ desk, busy, move }: { desk: DeskView; busy: boolean; move: (m: Move, say?: string) => void }) {
  return (
    <section aria-labelledby="pivot-alerts-h" className="flex flex-col gap-2">
      <h5 id="pivot-alerts-h" className="font-semibold">
        Incoming alerts
      </h5>
      {!desk.alerts.length && <p className="text-sm text-ink-muted">Nothing yet.</p>}
      <ul className="flex flex-col gap-2">
        {desk.alerts.map((a) => (
          <li key={a.id} className={cx(box, !a.read && "ring-2 ring-accent")}>
            <p className="flex flex-wrap items-center gap-x-2 text-sm">
              <span className="font-semibold">{a.from}</span>
              {desk.play === "timed" && <span className="text-ink-muted">{a.at}</span>}
              {!a.read && <span className="rounded-full bg-accent px-2 text-xs font-bold text-on-action">New</span>}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
              <Icon name={RELIABLE_ICON[a.reliability]} className="size-3.5" /> {RELIABILITY[a.reliability]}
            </p>
            <p className="mt-2 text-sm">{a.body}</p>
            {a.access && <p className="mt-1 text-xs text-ink-muted">Who can know: {a.access}</p>}
            {!a.read && (
              <button type="button" className={cx(secondary, "mt-2")} disabled={busy} onClick={() => move({ do: "read", alert: a.id })}>
                Mark as read
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecordPanel({ desk, busy, move }: { desk: DeskView; busy: boolean; move: (m: Move, say?: string) => void }) {
  const groups = [...new Set(desk.facts.map((f) => f.group))];
  return (
    <section aria-labelledby="pivot-record-h" className="flex flex-col gap-2">
      <h5 id="pivot-record-h" className="font-semibold">
        Handover record
      </h5>
      <p className="text-xs text-ink-muted">Open a field to check it. Checking costs no time.</p>
      {groups.map((g) => (
        <div key={g} className={box}>
          <p className="text-sm font-semibold">{g}</p>
          <ul className="mt-1 flex flex-col divide-y divide-line">
            {desk.facts
              .filter((f) => f.group === g)
              .map((f) => (
                <li key={f.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-auto">{f.label}</span>
                    <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", statusTone(f.status))}>{f.statusLabel}</span>
                  </div>
                  {f.inspected ? (
                    <p className="mt-1 text-ink-muted">{f.text}</p>
                  ) : (
                    <button
                      type="button"
                      className="mt-1 min-h-11 rounded-lg px-2 text-left text-sm font-semibold underline underline-offset-2 hover:bg-muted"
                      disabled={busy}
                      onClick={() => move({ do: "inspect", fact: f.id }, `${f.label}: ${f.statusLabel}. ${f.text}`)}
                    >
                      Check “{f.label}”
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

const statusTone = (s: string) =>
  ["confirmed", "approved", "booked", "delivered", "reviewed", "agreed", "recorded"].includes(s)
    ? good
    : ["missing", "declined", "not-approved", "unverified"].includes(s)
      ? bad
      : ["requested", "pending", "accepted", "recommended", "proposed"].includes(s)
        ? warn
        : plain;

function Board({ desk, busy, move }: { desk: DeskView; busy: boolean; move: (m: Move, say?: string) => void }) {
  return (
    <section aria-labelledby="pivot-board-h" className="flex flex-col gap-3">
      <h5 id="pivot-board-h" className="font-semibold">
        Action board
      </h5>
      <p className="text-xs text-ink-muted">
        New cards appear as information arrives. A card asks; only a confirmed answer from the right source settles anything.
      </p>
      {LANE_ORDER.map((lane) => {
        const cards = desk.board.filter((c) => c.lane === lane);
        return (
          <div key={lane} className={box}>
            <p className="font-semibold">{LANES[lane]}</p>
            <p className="text-xs text-ink-muted">{LANE_HINTS[lane]}</p>
            {!cards.length && <p className="mt-1 text-sm text-ink-muted">Nothing here yet.</p>}
            <ul className="mt-2 flex flex-col gap-2">
              {cards.map((c) => (
                <li key={c.id} className={cx("rounded-xl p-3 ring-1 ring-line", c.done ? "bg-muted" : "bg-surface")}>
                  <p className="text-sm font-semibold">{c.label}</p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                    <dt className="font-semibold">Who</dt>
                    <dd>{c.owner}</dd>
                    {c.needs && (
                      <>
                        <dt className="font-semibold">Needs</dt>
                        <dd>{c.needs}</dd>
                      </>
                    )}
                    <dt className="font-semibold">Depends on</dt>
                    <dd>{c.dependency}</dd>
                    {desk.play === "timed" && (
                      <>
                        <dt className="font-semibold">Takes</dt>
                        <dd>About {minutesWords(c.minutes)}</dd>
                      </>
                    )}
                    {c.consequence && (
                      <>
                        <dt className="font-semibold">Might</dt>
                        <dd>{c.consequence}</dd>
                      </>
                    )}
                    <dt className="font-semibold">Status</dt>
                    <dd>
                      {c.done ? `Done${desk.play === "timed" ? ` ${c.done}` : ""}` : "Not started"}
                      {c.state ? ` · ${c.state}` : ""}
                    </dd>
                  </dl>
                  {!c.done && (
                    <button
                      type="button"
                      className={cx(secondary, "mt-2")}
                      disabled={busy}
                      onClick={() => move({ do: "take", action: c.id }, `Done: ${c.label}.`)}
                    >
                      Do this
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function Readiness({ desk }: { desk: DeskView }) {
  const n = desk.gates.filter((g) => g.essential && g.status === "confirmed").length;
  const total = desk.gates.filter((g) => g.essential).length;
  return (
    <section aria-labelledby="pivot-ready-h" className="flex flex-col gap-2">
      <h5 id="pivot-ready-h" className="font-semibold">
        Readiness
      </h5>
      <p className={cx("rounded-xl px-3 py-2 text-sm font-semibold", desk.ready ? good : plain)}>
        {desk.ready ? "Every essential gate is confirmed." : `Not ready: ${n} of ${total} essential gates confirmed.`}
      </p>
      <ul className="flex flex-col gap-2">
        {desk.gates.map((g) => (
          <li key={g.id} className={box}>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", GATE_LOOK[g.status].cls)}>
                <Icon name={GATE_LOOK[g.status].icon} className="size-3.5" /> {g.statusLabel}
              </span>
              {g.escalated && g.status !== "confirmed" && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">Escalated</span>}
              {g.contingency && g.status !== "confirmed" && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">Contingency documented</span>
              )}
              {!g.essential && <span className="text-xs text-ink-muted">Not essential before discharge</span>}
            </p>
            <p className="mt-1 text-sm font-semibold">{g.label}</p>
            <ul className="mt-1 text-xs text-ink-muted">
              {g.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HandoverForm({
  desk,
  busy,
  heading,
  preview,
  call,
  onBack,
  run,
}: {
  desk: DeskView;
  busy: boolean;
  heading: React.RefObject<HTMLHeadingElement | null>;
  preview: boolean;
  call: Call;
  onBack: () => void;
  run: (body: Body, say?: string) => Promise<void>;
}) {
  const [h, setH] = useState<Handover>(desk.handover);
  const dirty = useRef(false);
  // Saved as it's filled in (a moment after the last change), so a refresh keeps it.
  useEffect(() => {
    if (preview || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      call({ move: { do: "record", handover: h } }).catch(() => undefined);
    }, 700);
    return () => clearTimeout(t);
  }, [h, preview, call]);
  const set = (fn: (x: Handover) => Handover) => {
    dirty.current = true;
    setH(fn);
  };
  const gate = (id: string) => h.gates[id] ?? { status: "" as const, owner: "" as const };
  return (
    <div className="flex flex-col gap-4">
      <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        Record the handover
      </h4>
      <p className="text-sm">Say where each gate really stands and who owns its next step. Unresolved and escalated is a valid answer.</p>
      <Readiness desk={desk} />
      <div className="flex flex-col gap-3">
        {desk.gates.map((g) => (
          <fieldset key={g.id} className={box}>
            <legend className="font-semibold">{g.label}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(STATED) as Stated[]).map((st) => (
                <label key={st} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 ring-1 ring-line hover:bg-muted">
                  <input
                    type="radio"
                    name={`gate-${g.id}`}
                    className="size-5"
                    checked={gate(g.id).status === st}
                    onChange={() => set((x) => ({ ...x, gates: { ...x.gates, [g.id]: { ...gate(g.id), status: st } } }))}
                  />
                  {STATED[st]}
                </label>
              ))}
            </div>
            <label className="mt-2 flex flex-col gap-1 text-sm">
              Who owns the next step
              <select
                className="min-h-11 rounded-xl border border-line-strong bg-surface px-2"
                value={gate(g.id).owner}
                onChange={(e) => set((x) => ({ ...x, gates: { ...x.gates, [g.id]: { ...gate(g.id), owner: e.target.value as OwnerRole } } }))}
              >
                <option value="">Choose…</option>
                {(Object.keys(OWNER_ROLES) as OwnerRole[]).map((o) => (
                  <option key={o} value={o}>
                    {OWNER_ROLES[o]}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ))}
      </div>
      {desk.questions.map((q) => (
        <fieldset key={q.id} className={box}>
          <legend className="font-semibold">{q.prompt}</legend>
          {q.options.map((o) => (
            <label key={o.id} className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
              <input
                type="radio"
                name={`q-${q.id}`}
                className="mt-1 size-5"
                checked={h.answers[q.id] === o.id}
                onChange={() => set((x) => ({ ...x, answers: { ...x.answers, [q.id]: o.id } }))}
              />
              <span className="text-sm">{o.text}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <fieldset className={box}>
        <legend className="font-semibold">Is the handover ready?</legend>
        {(Object.keys(DECLARATIONS) as Declaration[]).map((k) => (
          <label key={k} className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-muted">
            <input
              type="radio"
              name="declaration"
              className="mt-1 size-5"
              checked={h.declaration === k}
              onChange={() => set((x) => ({ ...x, declaration: k }))}
            />
            <span className="text-sm">{DECLARATIONS[k]}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={busy || desk.clock.closed} onClick={onBack}>
          Back to the desk
        </button>
        <button type="button" className={primary} disabled={busy} onClick={() => run({ action: "submit", handover: h })}>
          Submit the handover
        </button>
      </div>
      {desk.clock.closed && <p className="text-xs text-ink-muted">It’s the proposed discharge time, so the desk is closed. Record what stands.</p>}
    </div>
  );
}

function DebriefView({
  d,
  b,
  heading,
  busy,
  preview,
  guideId,
  place,
  onRetry,
}: {
  d: Debrief;
  b: DischargeBlock;
  heading: React.RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  preview: boolean;
  guideId: string;
  place: string;
  onRetry: () => void;
}) {
  const [step, setStep] = useState(0);
  const line = d.timeline[Math.min(step, d.timeline.length - 1)];
  return (
    <div className="flex flex-col gap-4">
      <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        What happened
      </h4>
      <div className={cx(d.defensible ? good : d.ending === "unsafe" ? bad : warn, "rounded-2xl p-4")}>
        <p className="font-semibold">{d.endingLabel}</p>
        <p className="text-sm">{d.endingText}</p>
        {d.variation && <p className="mt-1 text-xs">This attempt: {d.variation.label}.</p>}
      </div>
      {d.critical.length > 0 && (
        <div className={cx(bad, "rounded-2xl p-4")}>
          <p className="font-semibold">Critical {d.critical.length === 1 ? "error" : "errors"}</p>
          <ul className="mt-1 flex flex-col gap-2 text-sm">
            {d.critical.map((c) => (
              <li key={c.code}>
                <span className="font-semibold">{c.label}.</span> {c.detail}
              </li>
            ))}
          </ul>
          {d.mode === "assessed" && <p className="mt-2 text-xs">In an assessed attempt, a critical error means it isn’t a pass, whatever the score.</p>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={box}>
          <p className="font-semibold">What was actually confirmed</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{d.confirmed.length ? d.confirmed.map((x) => <li key={x}>{x}</li>) : <li>Nothing.</li>}</ul>
        </div>
        <div className={box}>
          <p className="font-semibold">What remained uncertain</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{d.uncertain.length ? d.uncertain.map((x) => <li key={x}>{x}</li>) : <li>Nothing.</li>}</ul>
        </div>
        <div className={box}>
          <p className="font-semibold">Who was contacted</p>
          <p className="text-sm">{d.contacted.length ? d.contacted.join("; ") : "Nobody outside your own desk."}</p>
        </div>
        <div className={box}>
          <p className="font-semibold">The first check after the return home</p>
          <p className="text-sm">{d.firstCheck}</p>
        </div>
      </div>
      <div className={box}>
        <p className="font-semibold">Your handover, against what actually stood</p>
        <ul className="mt-1 flex flex-col gap-2 text-sm">
          {d.handover.map((g) => (
            <li key={g.gate}>
              <span className="font-semibold">{g.label}:</span> you said {g.stated ? STATED[g.stated].toLowerCase() : "nothing"}; it was{" "}
              {g.actual === "unknown" ? "not checked" : g.actual}
              {g.escalated && g.actual !== "confirmed" ? ", escalated" : ""}. {g.overstated ? "That overstated it. " : ""}
              {g.owner ? `Owner: ${g.owner}${g.ownerOk ? "." : " (not the owner of this step)."}` : ""}
            </li>
          ))}
        </ul>
      </div>
      <div className={box}>
        <p className="font-semibold">The rubric, in words</p>
        <p className="text-xs text-ink-muted">Practice evidence, not proof that a real discharge was safe. The clock is never part of it.</p>
        <ul className="mt-2 flex flex-col gap-3 text-sm">
          {d.dims.map((x) => (
            <li key={x.dim}>
              <p>
                <span className="font-semibold">{x.label}:</span> {x.words}
                {x.capped && <span> (held back: {x.capped.toLowerCase()})</span>}
              </p>
              {x.met.length > 0 && <p className="text-ink-muted">You did: {x.met.join("; ")}.</p>}
              {x.missed.length > 0 && <p className="text-ink-muted">Still to do: {x.missed.join("; ")}.</p>}
            </li>
          ))}
        </ul>
        {d.mode === "assessed" && (
          <p className="mt-2 text-sm font-semibold">
            {d.score} of {d.max}. {d.passed ? "Passed." : `Not a pass (the pass mark is ${d.passMark}, with no critical error).`}
          </p>
        )}
      </div>
      {d.answers.some((a) => a.chosen) && (
        <div className={box}>
          <p className="font-semibold">What you’d tell people, and the first check</p>
          <ul className="mt-1 flex flex-col gap-2 text-sm">
            {d.answers.map((a) => (
              <li key={a.prompt}>
                <span className="font-semibold">{a.prompt}</span> You chose “{a.chosen}”. {a.feedback}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(d.orderNote || d.recognised !== null) && (
        <div className={box}>
          <p className="font-semibold">Order and timing</p>
          {d.recognised !== null && d.play === "timed" && (
            <p className="text-sm">
              In the story, you escalated the uncovered visit {d.recognised ? `${minutesWords(d.recognised)} after` : "as soon as"} the provider declined.
              Context only: it isn’t scored.
            </p>
          )}
          {d.orderNote && <p className="mt-1 text-sm">{d.orderNote}</p>}
        </div>
      )}
      {d.missedKey.length > 0 && (
        <details className={box}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Moves you didn’t make ({d.missedKey.length})</summary>
          <ul className="flex flex-col gap-2 text-sm">
            {d.missedKey.map((m) => (
              <li key={m.label}>
                <span className="font-semibold">{m.label}.</span> {m.feedback}
              </li>
            ))}
          </ul>
        </details>
      )}
      {d.timeline.length > 0 && (
        <div className={box}>
          <p className="font-semibold">Replay your timeline</p>
          <p className="text-xs text-ink-muted">
            Step {Math.min(step, d.timeline.length - 1) + 1} of {d.timeline.length}
          </p>
          <div aria-live="polite" className="mt-2 rounded-xl bg-surface p-3 text-sm ring-1 ring-line">
            <p className="text-xs text-ink-muted">
              {d.play === "timed" ? line.at : ""} {line.kind === "alert" ? "· Alert" : line.kind === "wait" ? "· Waited" : "· Your decision"}
            </p>
            <p className="font-semibold">{line.title}</p>
            {line.detail && <p>{line.detail}</p>}
            {line.verdict && (
              <p className={cx(line.verdict === "strong" ? good : line.verdict === "unsafe" ? bad : warn, "mt-1 rounded-lg px-2 py-1")}>
                <span className="font-semibold">{VERDICTS[line.verdict]}.</span> {line.feedback}
              </p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={secondary} disabled={step <= 0} onClick={() => setStep((n) => Math.max(0, n - 1))}>
              Previous
            </button>
            <button
              type="button"
              className={secondary}
              disabled={step >= d.timeline.length - 1}
              onClick={() => setStep((n) => Math.min(d.timeline.length - 1, n + 1))}
            >
              Next
            </button>
          </div>
          <details className="mt-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">The whole timeline as a list</summary>
            <ol className="flex flex-col gap-2 text-sm">
              {d.timeline.map((t, i) => (
                <li key={i}>
                  <span className="text-ink-muted">{d.play === "timed" ? `${t.at}: ` : ""}</span>
                  <span className="font-semibold">{t.title}</span>
                  {t.verdict ? ` (${VERDICTS[t.verdict].toLowerCase()})` : ""}
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
      {d.matters && (
        <div className={cx(good, "rounded-2xl p-4")}>
          <p className="font-semibold">Why it matters</p>
          <p className="text-sm">{d.matters}</p>
        </div>
      )}
      {b.jobAid.snippetId && (
        <AidSection snippetId={b.jobAid.snippetId} why={b.jobAid.why} place={place.startsWith("topic:") ? place : `magazine:${guideId}`} preview={preview} />
      )}
      {d.sources.length > 0 && (
        <details className={box}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Sources and owners</summary>
          <ul className="list-disc pl-5 text-sm">
            {d.sources.map((s) => (
              <li key={s.id}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
                {s.owner ? ` (owner: ${s.owner})` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-muted">Trilogy Care’s current approved procedures, contacts and thresholds govern a real discharge.</p>
        </details>
      )}
      <p className="text-xs text-ink-muted">
        Practice: a score here is practice evidence, not proof that a real discharge was safe. Versions: {d.versions.pivot}, rubric {d.versions.rubric},
        scenario {d.versions.scenario}.
      </p>
      <div>
        <button type="button" className={secondary} disabled={busy} onClick={onRetry}>
          <Icon name="refresh" className="size-4" /> Try again
        </button>
        <p className="mt-1 text-xs text-ink-muted">A new attempt, with a variation where there is one. This one is kept as it is.</p>
      </div>
    </div>
  );
}

/**
  A discharge simulation placed on a Topic card by reference (lessons.ts `pivotRef`): the published Magazine block and
  the learner's own attempt, loaded from the course. Shown only to people who can read that course.
*/
export function TopicDischargePivot({ guide, block, why, topic }: { guide: string; block: string; why?: string; topic: string }) {
  const loaded = useApi<DischargeView>(`/api/magazine/${encodeURIComponent(guide)}/discharge?block=${encodeURIComponent(block)}&embed=1`);
  if (loaded.error) return <p className="rounded-2xl bg-muted px-4 py-3 text-sm">This practice simulation isn’t available to you here. {loaded.error}</p>;
  const v = loaded.data;
  if (!v?.block || !v.guideId) return <div aria-hidden className="h-40 w-full animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />;
  return (
    <div className="text-left">
      {why && <p className="mb-2 text-sm font-semibold">{why}</p>}
      <DischargePivot block={v.block} guideId={v.guideId} place={`topic:${topic}`} />
    </div>
  );
}
