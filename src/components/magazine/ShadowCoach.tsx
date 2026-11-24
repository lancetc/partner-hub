"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { ShadowCoachBlock } from "@/lib/magazine";
import {
  applyMove,
  buildDebrief,
  CAUSES,
  CLASSES,
  contentRefs,
  CUES_NOTICE,
  emptyState,
  ENGINE_VERSION,
  EVIDENCE_KINDS,
  MARK_STATES,
  markLabel,
  MAX_COACH_CHARS,
  MoveError,
  PHASE_ORDER,
  PHASES,
  REVIEWERS,
  RUBRIC_VERSION,
  SHADOW_NOTICE,
  SHADOW_VERSION,
  shadowView,
  STAGES,
  submitProblems,
  WHEN,
  type AvailMap,
  type Cause,
  type Class,
  type Debrief,
  type EvidenceKind,
  type MarkState,
  type Move,
  type Outcome,
  type Reviewer,
  type ShadowState,
  type ShadowView,
  type When,
} from "@/lib/shadowCoach";
import type { ShadowAttemptView, ShadowHome } from "@/server/shadowCoach";
import { Icon } from "../Icon";
import { AidSection } from "../playbooks/AidSection";

/*
  First 100 Days: Shadow & Coach, as a manager uses it (docs/shadow-and-coach.md). Pick an episode of the new
  coordinator's first 100 days, then: inspect and classify, first actions, coach, a two-week plan, the second sample,
  a readiness decision, the debrief. On a wide screen the source sits on the left, the step in the centre and your
  evidence on the right; on a phone one step at a time, with "View source" and "Your marks" a tap away.

  Every line is a button that opens a labelled form, so nothing needs a mouse or a drag. Statuses are words. There is
  no timer. The page holds only what the server sends; in the editor's preview it runs the same engine locally on the
  block as written, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const good = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warn = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const bad = "bg-[#fde4e1] text-[#7a1d12] dark:bg-[#3f1712] dark:text-[#ffb4a8]";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3";

type Body = Record<string, unknown>;
type Call = (body: Body) => Promise<ShadowAttemptView>;
type MoveFn = (m: Move, announce?: string) => Promise<void>;

/** The editor's preview: the same engine, run locally on the block as written. Every content item counts as available. */
function previewEngine(b: ShadowCoachBlock) {
  const avail: AvailMap = Object.fromEntries(contentRefs(b).map((r) => [r.suggestion, { status: "preview", title: r.label, version: "preview", href: "" }]));
  const states: Record<string, { s: ShadowState; status: ShadowAttemptView["status"]; debrief: Debrief | null; n: number }> = {};
  const toView = (sid: string): ShadowAttemptView => {
    const x = states[sid];
    return {
      attemptId: x ? `preview-${sid}-${x.n}` : null,
      attemptNo: x?.n ?? 0,
      scenario: sid,
      status: x?.status ?? "new",
      view: x && x.status === "active" ? shadowView(b, x.s, { avail }) : null,
      debrief: x?.debrief ?? null,
      attempts: x?.n ?? 0,
      versions: { shadow: SHADOW_VERSION, rubric: RUBRIC_VERSION, engine: ENGINE_VERSION, scenario: b.scenarioVersion, rules: "" },
      earlierScenario: false,
    };
  };
  const home = (): ShadowHome => ({
    scenarios: b.scenarios.map((sc) => ({
      id: sc.id,
      title: sc.title,
      day: sc.day,
      stage: sc.stage,
      status: states[sc.id]?.status ?? "new",
      attempts: states[sc.id]?.n ?? 0,
    })),
    current: null,
  });
  const call: Call = async (body) => {
    const sid = String(body.scenario ?? "");
    const x = states[sid];
    try {
      if (body.action === "start" && !x) states[sid] = { s: emptyState(sid), status: "active", debrief: null, n: 1 };
      else if (body.action === "retry" && x && x.status !== "active") states[sid] = { s: emptyState(sid), status: "active", debrief: null, n: x.n + 1 };
      else if (body.action === "viewed" && x?.status === "submitted") x.status = "completed";
      else if (body.action === "submit" && x?.status === "active") {
        const p = submitProblems(b, x.s);
        if (p.length) throw new Error(p[0]);
        x.debrief = buildDebrief(b, x.s);
        x.status = "submitted";
      } else if (body.move && x?.status === "active") x.s = applyMove(b, x.s, body.move as Move, { avail });
    } catch (e) {
      throw new Error(e instanceof MoveError || e instanceof Error ? e.message : "That didn’t work.");
    }
    return toView(sid);
  };
  return { call, home };
}

export function ShadowCoach({
  block: b,
  guideId,
  preview = false,
  place = "magazine",
  onFinished,
}: {
  block: ShadowCoachBlock;
  guideId: string;
  preview?: boolean;
  place?: string;
  onFinished?: (d: Debrief) => void;
}) {
  const url = `/api/magazine/${guideId}/shadow-coach`;
  const [engine] = useState(() => (preview ? previewEngine(b) : null));
  const loaded = useApi<ShadowHome>(preview ? null : `${url}?block=${b.id}`);
  const [localHome, setLocalHome] = useState<ShadowHome | null>(() => engine?.home() ?? null);
  const home = engine ? localHome : loaded.data;
  const [v, setV] = useState<ShadowAttemptView | null>(null);

  const call = useCallback<Call>(
    async (body) => {
      const next = engine ? await engine.call(body) : await api<ShadowAttemptView>(url, { body: { blockId: b.id, place, ...body } });
      if (engine) setLocalHome(engine.home());
      return next;
    },
    [engine, url, b.id, place],
  );

  const openScenario = async (sid: string) => {
    setV(engine ? await engine.call({ scenario: sid, action: "peek" }) : ((await api<ShadowHome>(`${url}?block=${b.id}&scenario=${sid}`)).current ?? null));
  };

  return (
    <section
      className="flex w-full min-w-0 flex-col gap-4 rounded-3xl border border-line-strong bg-surface p-4 shadow-sm sm:p-6"
      aria-label={`First 100 Days: Shadow & Coach: ${b.title}`}
    >
      <div>
        <p className="mb-1 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="people" className="size-5" /> First 100 Days · Shadow & Coach
        </p>
        <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
        {b.intro && <p className="mt-1 text-ink-muted">{b.intro}</p>}
        <p className="mt-2 inline-flex flex-wrap gap-x-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold">
          <span>Manager practice</span>
          <span aria-hidden>·</span>
          <span>A fictional coordinator</span>
          <span aria-hidden>·</span>
          <span>Never an HR record</span>
        </p>
      </div>
      {preview && (
        <p className="rounded-2xl border border-dashed border-line-strong p-3 text-sm font-semibold">
          Preview (nothing is saved). It runs the same engine as the server, on the block as written; every suggested Topic, Magazine page and Job Aid counts as
          available here, and the server checks each one for real.
        </p>
      )}
      {!preview && loaded.error ? (
        <p role="alert">{loaded.error}</p>
      ) : !home ? (
        <p className="text-ink-muted">Loading…</p>
      ) : v ? (
        <Attempt
          key={`${v.scenario}-${v.attemptId ?? "new"}`}
          b={b}
          v={v}
          setV={setV}
          call={(body) => call({ scenario: v.scenario, ...body })}
          preview={preview}
          guideId={guideId}
          place={place}
          onBack={() => {
            setV(null);
            if (!engine) loaded.reload?.();
          }}
          onFinished={onFinished}
        />
      ) : (
        <Episodes b={b} home={home} onOpen={openScenario} />
      )}
    </section>
  );
}

const STATUS_WORDS: Record<string, string> = { new: "Not started", active: "In progress", submitted: "Debrief ready", completed: "Completed" };

function Episodes({ b, home, onOpen }: { b: ShadowCoachBlock; home: ShadowHome; onOpen: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className={box}>
        <p className="font-semibold">
          You’re {b.manager.name}. {b.manager.situation}
        </p>
        <p className="mt-2">
          {b.coordinator.label}: {b.coordinator.role}, started {b.coordinator.started}.{" "}
          {b.coordinator.about.replace(/Not a library character, and never named\.?/, "")}
        </p>
        <p className="mt-2 text-sm text-ink-muted">{SHADOW_NOTICE}</p>
      </div>
      <h4 className="font-serif text-xl font-semibold">Her first 100 days</h4>
      <ol className="grid gap-3 sm:grid-cols-2">
        {home.scenarios.map((sc) => (
          <li key={sc.id} className={cx(box, "flex flex-col gap-2")}>
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
              {STAGES[sc.stage as keyof typeof STAGES] ?? `Day ${sc.day}`}
            </p>
            <p className="font-semibold">{sc.title}</p>
            <p className="text-sm">
              Status: <span className="font-semibold">{STATUS_WORDS[sc.status]}</span>
              {sc.attempts > 1 ? ` · ${sc.attempts} attempts` : ""}
            </p>
            <button type="button" className={cx(sc.status === "new" ? primary : secondary, "self-start")} onClick={() => onOpen(sc.id)}>
              {sc.status === "new" ? "Open" : sc.status === "active" ? "Resume" : "See the debrief"}
              <span className="sr-only">: {sc.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One episode attempt: the start, the steps or the debrief. Exported for the static render checks in the tests. */
export function Attempt({
  b,
  v,
  setV,
  call,
  preview,
  guideId,
  place,
  onBack,
  onFinished,
}: {
  b: ShadowCoachBlock;
  v: ShadowAttemptView;
  setV: (v: ShadowAttemptView) => void;
  call: Call;
  preview: boolean;
  guideId: string;
  place: string;
  onBack: () => void;
  onFinished?: (d: Debrief) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [pane, setPane] = useState<"step" | "source" | "marks">("step");
  const viewed = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const phase = v.view?.phase ?? "";
  const lastPhase = useRef(phase);
  const sc = b.scenarios.find((x) => x.id === v.scenario);

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

  // Focus moves to the step's heading when the step changes, never while the learner is working inside it.
  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    heading.current?.focus();
  }, [phase]);

  const run = async (body: Body, announce = "") => {
    setBusy(true);
    setProblem(null);
    try {
      const next = await call(body);
      setSaid(announce);
      setV(next);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const move: MoveFn = (m, announce = "") => run({ move: m }, announce);
  const back = (
    <button type="button" className={cx(secondary, "self-start")} onClick={onBack}>
      <Icon name="arrow-left" className="size-4" /> All episodes
    </button>
  );

  if (v.status === "new")
    return (
      <div className="flex flex-col gap-3">
        {back}
        <div className={box}>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Day {sc?.day}</p>
          <p className="font-serif text-xl font-semibold">{sc?.title}</p>
          <p className="mt-2">{sc?.summary}</p>
          <p className="mt-3 text-sm text-ink-muted">
            About 25 minutes, with no timer. {SHADOW_NOTICE} You can stop and come back: it resumes where you left off.
          </p>
          <button type="button" className={cx(primary, "mt-3")} disabled={busy} onClick={() => run({ action: "start" }, "The sample is open.")}>
            Start this episode
          </button>
          {problem && (
            <p role="alert" className={cx(bad, "mt-2 rounded-xl px-3 py-2 text-sm")}>
              {problem}
            </p>
          )}
        </div>
      </div>
    );

  if (v.status !== "active" && v.debrief)
    return (
      <div className="flex flex-col gap-3">
        {back}
        <DebriefView
          b={b}
          d={v.debrief}
          busy={busy}
          preview={preview}
          guideId={guideId}
          place={place}
          onRetry={() => run({ action: "retry", from: v.attemptId }, "A new attempt has started.")}
        />
      </div>
    );
  const view = v.view;
  if (!view) return <p className="text-ink-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
      {back}
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      {v.earlierScenario && (
        <p className={cx(warn, "rounded-xl px-3 py-2 text-sm")}>
          This attempt uses the case as it was when you started. The next attempt uses the current version.
        </p>
      )}
      <Brief view={view} />
      <ol className="flex flex-wrap gap-1 text-xs font-semibold" aria-label="Steps">
        {PHASE_ORDER.map((p, i) => {
          const at = PHASE_ORDER.indexOf(view.phase);
          return (
            <li
              key={p}
              aria-current={p === view.phase ? "step" : undefined}
              className={cx("rounded-full px-2.5 py-1", p === view.phase ? "bg-action text-on-action" : i < at ? "bg-tealtint" : "bg-muted text-ink-muted")}
            >
              {i < at ? "Done: " : p === view.phase ? "Now: " : ""}
              {PHASES[p]}
            </li>
          );
        })}
      </ol>
      {problem && (
        <p role="alert" className={cx(bad, "rounded-xl px-3 py-2 text-sm")}>
          {problem}
        </p>
      )}
      <div role="group" aria-label="Show" className="flex gap-1 rounded-full bg-muted p-1 lg:hidden">
        {(["step", "source", "marks"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={pane === p}
            onClick={() => setPane(p)}
            className={cx("min-h-11 flex-1 rounded-full px-2 text-sm font-semibold", pane === p ? "bg-surface shadow-sm" : "text-ink-muted")}
          >
            {p === "step" ? "This step" : p === "source" ? "View source" : `Your marks (${view.marks.length})`}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className={cx("min-w-0", pane === "source" ? "block" : "hidden", "lg:block")}>
          <Source view={view} busy={busy} move={move} />
        </div>
        <div className={cx("min-w-0", pane === "step" ? "block" : "hidden", "lg:block")}>
          <h4 ref={heading} tabIndex={-1} className="mb-2 font-serif text-xl font-semibold outline-none">
            {PHASES[view.phase]}
          </h4>
          <Step
            view={view}
            busy={busy}
            move={move}
            onSource={() => setPane("source")}
            onSubmit={() => run({ action: "submit" }, "Submitted. Your debrief is below.")}
          />
        </div>
        <div className={cx("min-w-0", pane === "marks" ? "block" : "hidden", "lg:block")}>
          <Evidence view={view} />
        </div>
      </div>
    </div>
  );
}

function Brief({ view }: { view: ShadowView }) {
  const s = view.scenario;
  return (
    <details className={box} open={view.phase === "inspect"}>
      <summary className="min-h-11 cursor-pointer font-semibold">
        Day {s.day} · {s.stage}: the brief
      </summary>
      <p className="mt-2">{s.summary}</p>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-semibold">What was being handled</dt>
          <dd>{s.brief.handling}</dd>
        </div>
        <div>
          <dt className="font-semibold">What you can see</dt>
          <dd>{s.brief.see}</dd>
        </div>
        <div>
          <dt className="font-semibold">Still unknown</dt>
          <dd>{s.brief.unknown}</dd>
        </div>
      </dl>
      {s.known.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {s.known.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      )}
      {s.rules && (
        <p className="mt-2 text-sm text-ink-muted">
          Contribution rule set {s.rules.ruleSet}, effective {s.rules.effective}. Individual rates come from each person’s Services Australia determination,
          never from this case.
        </p>
      )}
      {view.history.length > 0 && (
        <p className={cx(good, "mt-2 rounded-xl px-3 py-2 text-sm")}>
          Earlier in her 100 days: {view.history.map((h) => `${h.title}: you decided “${h.outcome}”${h.scope ? ` (${h.scope})` : ""}`).join("; ")}.
        </p>
      )}
    </details>
  );
}

type MarkDraft = { kind: EvidenceKind; cls: Class; cause: Cause | ""; why: string };
const blankMark: MarkDraft = { kind: "observation", cls: "coach", cause: "", why: "" };

/** The artefacts, with line numbers. During Inspect each line opens a labelled form: no drag, no mouse-only highlight. */
function Source({ view, busy, move }: { view: ShadowView; busy: boolean; move: MoveFn }) {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<MarkDraft>(blankMark);
  const inspecting = view.phase === "inspect";
  const marks = new Map(view.marks.map((m) => [m.key, m]));
  const startMark = (key: string) => {
    const m = marks.get(key);
    setDraft(m ? { kind: m.kind, cls: m.cls, cause: m.cause, why: m.why } : key.startsWith("omit:") ? { ...blankMark, kind: "missing" } : blankMark);
    setOpen(open === key ? null : key);
  };
  const artefacts = [...view.artefacts, ...(view.followup?.artefact ? [{ ...view.followup.artefact, viewed: true, followup: true }] : [])];
  return (
    <div className="flex flex-col gap-3">
      {artefacts.map((a) => (
        <section key={a.id} className={box} aria-label={`${a.kindLabel}: ${a.title}`}>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
            {"followup" in a ? "Second sample · " : ""}
            {a.kindLabel}
          </p>
          <p className="font-semibold">{a.title}</p>
          <p className="text-xs text-ink-muted">{a.meta}</p>
          {!a.viewed ? (
            <button type="button" className={cx(secondary, "mt-2")} disabled={busy} onClick={() => move({ do: "view", artefact: a.id }, `${a.title} opened.`)}>
              Read it
            </button>
          ) : (
            <ol className="mt-2 flex flex-col gap-1">
              {a.lines.map((l, i) => {
                const m = marks.get(l.id);
                const om = marks.get(`omit:${l.id}`);
                return (
                  <li key={l.id} className="flex flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <span aria-hidden className="w-6 shrink-0 pt-2 text-right text-xs text-ink-muted">
                        {i + 1}
                      </span>
                      {inspecting && !("followup" in a) ? (
                        <button
                          type="button"
                          aria-expanded={open === l.id}
                          onClick={() => startMark(l.id)}
                          className={cx(
                            "min-h-11 flex-1 rounded-xl px-2 py-1 text-left hover:bg-muted",
                            m && "bg-[#fff1cc] underline decoration-2 underline-offset-4 dark:bg-[#3d2f08]",
                          )}
                        >
                          <span className="font-semibold">{l.speaker}: </span>
                          {l.text}
                          {m && <span className="ml-1 text-xs font-semibold">[Marked: {CLASSES[m.cls]}]</span>}
                          <span className="sr-only">
                            . Line {i + 1}. {m ? "Change your mark." : "Mark this line."}
                          </span>
                        </button>
                      ) : (
                        <p className={cx("flex-1 px-2 py-1", m && "underline decoration-2 underline-offset-4")}>
                          <span className="font-semibold">{l.speaker}: </span>
                          {l.text}
                          {m && <span className="ml-1 text-xs font-semibold">[Marked: {CLASSES[m.cls]}]</span>}
                        </p>
                      )}
                    </div>
                    {inspecting && !("followup" in a) && (
                      <button
                        type="button"
                        aria-expanded={open === `omit:${l.id}`}
                        onClick={() => startMark(`omit:${l.id}`)}
                        className="ml-8 min-h-11 self-start rounded-full px-2 text-xs font-semibold text-accent underline underline-offset-2"
                      >
                        {om ? `Missing here: ${CLASSES[om.cls]} (change)` : "Something missing after this line?"}
                      </button>
                    )}
                    {(open === l.id || open === `omit:${l.id}`) && inspecting && (
                      <MarkForm
                        k={open}
                        draft={draft}
                        setDraft={setDraft}
                        busy={busy}
                        marked={marks.has(open)}
                        onSave={async () => {
                          await move({ do: "mark", key: open, ...draft }, "Mark saved.");
                          setOpen(null);
                        }}
                        onRemove={async () => {
                          await move({ do: "unmark", key: open }, "Mark removed.");
                          setOpen(null);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

function MarkForm({
  k,
  draft,
  setDraft,
  busy,
  marked,
  onSave,
  onRemove,
}: {
  k: string;
  draft: MarkDraft;
  setDraft: (d: MarkDraft) => void;
  busy: boolean;
  marked: boolean;
  onSave: () => void;
  onRemove: () => void;
}) {
  const id = `mk-${k.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div
      className="ml-8 flex flex-col gap-2 rounded-xl bg-muted p-3 text-sm"
      role="group"
      aria-label={k.startsWith("omit:") ? "Mark something missing" : "Mark this line"}
    >
      <fieldset>
        <legend className="font-semibold">What kind of evidence is it?</legend>
        <div className="mt-1 flex flex-wrap gap-x-3">
          {(Object.keys(EVIDENCE_KINDS) as EvidenceKind[]).map((x) => (
            <label key={x} className="flex min-h-11 items-center gap-2">
              <input type="radio" name={`${id}-kind`} checked={draft.kind === x} onChange={() => setDraft({ ...draft, kind: x })} />
              {EVIDENCE_KINDS[x]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 font-semibold">
        What does it need?
        <select className={field} value={draft.cls} onChange={(e) => setDraft({ ...draft, cls: e.target.value as Class })}>
          {(Object.keys(CLASSES) as Class[]).map((x) => (
            <option key={x} value={x}>
              {CLASSES[x]}
            </option>
          ))}
        </select>
      </label>
      {draft.cls !== "none" && (
        <label className="flex flex-col gap-1 font-semibold">
          A skill gap or a workflow defect?
          <select className={field} value={draft.cause} onChange={(e) => setDraft({ ...draft, cause: e.target.value as Cause | "" })}>
            <option value="">Not sure yet</option>
            {(Object.keys(CAUSES) as Cause[]).map((x) => (
              <option key={x} value={x}>
                {CAUSES[x]}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 font-semibold">
        Why, in one sentence
        <input className={field} maxLength={200} value={draft.why} onChange={(e) => setDraft({ ...draft, why: e.target.value })} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={busy} onClick={onSave}>
          Save mark
        </button>
        {marked && (
          <button type="button" className={secondary} disabled={busy} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

/** The right-hand panel: what you've marked and decided so far, in words. */
function Evidence({ view }: { view: ShadowView }) {
  const lineText = (key: string) => {
    const id = key.replace(/^omit:/, "");
    const l = view.artefacts.flatMap((a) => a.lines).find((x) => x.id === id);
    return key.startsWith("omit:") ? `Missing after “${l?.text.slice(0, 60) ?? id}…”` : `“${l?.text ?? id}”`;
  };
  return (
    <div className="flex flex-col gap-3">
      <section className={box} aria-label="Your marks">
        <p className="font-semibold">Your marks</p>
        {!view.marks.length ? (
          <p className="text-sm text-ink-muted">Nothing marked yet. Open a line in the source to mark it.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-2 text-sm">
            {view.marks.map((m) => (
              <li key={m.key}>
                <span className="block">{lineText(m.key)}</span>
                <span className="font-semibold">
                  {EVIDENCE_KINDS[m.kind]} · {CLASSES[m.cls]}
                  {m.cause ? ` · ${CAUSES[m.cause]}` : ""}
                </span>
                {m.why && <span className="block text-ink-muted">{m.why}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {view.actions?.chosen && (
        <section className={box} aria-label="Your first actions">
          <p className="font-semibold">Your first actions</p>
          {(["now", "later"] as const).map((w) => (
            <div key={w} className="mt-1 text-sm">
              <p className="font-semibold">{WHEN[w]}</p>
              <ul className="list-disc pl-5">
                {view.actions!.chosen![w].map((id) => (
                  <li key={id}>{view.actions!.options.find((o) => o.id === id)?.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {view.plan?.assigned && (
        <section className={box} aria-label="The plan you shared">
          <p className="font-semibold">The plan you shared</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {view.plan.assigned.map((i) => (
              <li key={i.id}>
                Day {i.due}: {view.plan!.suggestions.find((x) => x.id === i.id)?.label}
                {i.status !== "current" && i.status !== "preview" ? " (author review requested)" : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Step({ view, busy, move, onSource, onSubmit }: { view: ShadowView; busy: boolean; move: MoveFn; onSource: () => void; onSubmit: () => void }) {
  switch (view.phase) {
    case "inspect": {
      const unread = view.artefacts.filter((a) => !a.viewed).length;
      return (
        <div className="flex flex-col gap-3">
          <p>
            Read each artefact in the source. Open any line to mark it: what kind of evidence it is, what it needs, and whether it looks like her skill or a
            workflow defect. You can mark something missing after a line, too. There’s no set number to find.
          </p>
          <button type="button" className={cx(secondary, "self-start lg:hidden")} onClick={onSource}>
            View source{unread ? ` (${unread} unread)` : ""}
          </button>
          <button
            type="button"
            className={cx(primary, "self-start")}
            disabled={busy}
            onClick={() => move({ do: "inspected" }, "Marks saved. Now your first actions.")}
          >
            I’ve finished marking
          </button>
        </div>
      );
    }
    case "act":
      return <Actions view={view} busy={busy} move={move} />;
    case "coach":
      return <Coach view={view} busy={busy} move={move} />;
    case "plan":
      return <PlanStep view={view} busy={busy} move={move} />;
    case "followup":
    case "decide":
      return <Followup view={view} busy={busy} move={move} onSource={onSource} />;
    case "submit":
      return (
        <div className="flex flex-col gap-2">
          <p>Your decision is recorded. The debrief compares it with the reviewed rationale and sources.</p>
          <button type="button" className={cx(primary, "self-start")} disabled={busy} onClick={onSubmit}>
            See the debrief
          </button>
        </div>
      );
  }
}

function Actions({ view, busy, move }: { view: ShadowView; busy: boolean; move: MoveFn }) {
  const a = view.actions!;
  const [pick, setPick] = useState<Record<string, When | "">>(() =>
    Object.fromEntries([...(a.chosen?.now ?? []).map((id) => [id, "now"]), ...(a.chosen?.later ?? []).map((id) => [id, "later"])]),
  );
  const lanes = [...new Set(a.options.map((o) => o.laneLabel))];
  return (
    <div className="flex flex-col gap-3">
      <p>Choose what has to happen now, today, and what comes after. Anything you don’t choose is left out.</p>
      {a.feedback && (
        <div role="alert" className={cx(bad, "rounded-xl px-3 py-2 text-sm")}>
          <p className="font-semibold">Not yet: the participant isn’t protected first.</p>
          {a.feedback.critical.map((c) => (
            <p key={c.label} className="mt-1">
              <span className="font-semibold">{c.label}. </span>
              {c.text}
            </p>
          ))}
          {a.feedback.missing.length > 0 && (
            <>
              <p className="mt-1 font-semibold">Missing from “now”:</p>
              <ul className="list-disc pl-5">
                {a.feedback.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-1">Change your choices and settle them again. This first try stays in your debrief.</p>
        </div>
      )}
      {lanes.map((lane) => (
        <fieldset key={lane} className={box}>
          <legend className="px-1 font-semibold">{lane}</legend>
          {a.options
            .filter((o) => o.laneLabel === lane)
            .map((o) => (
              <label key={o.id} className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
                <span className="flex-1">{o.label}</span>
                <select className={cx(field, "sm:w-44")} value={pick[o.id] ?? ""} onChange={(e) => setPick({ ...pick, [o.id]: e.target.value as When | "" })}>
                  <option value="">Not chosen</option>
                  <option value="now">{WHEN.now}</option>
                  <option value="later">{WHEN.later}</option>
                </select>
              </label>
            ))}
        </fieldset>
      ))}
      <button
        type="button"
        className={cx(primary, "self-start")}
        disabled={busy}
        onClick={() =>
          move(
            {
              do: "act",
              now: Object.keys(pick).filter((k) => pick[k] === "now"),
              later: Object.keys(pick).filter((k) => pick[k] === "later"),
            },
            "First actions checked.",
          )
        }
      >
        Settle first actions
      </button>
    </div>
  );
}

function Coach({ view, busy, move }: { view: ShadowView; busy: boolean; move: MoveFn }) {
  const c = view.coach!;
  const [text, setText] = useState("");
  const [push, setPush] = useState(c.pushback?.chosen ?? "");
  const [reviewer, setReviewer] = useState<Reviewer | "">("");
  return (
    <div className="flex flex-col gap-3">
      <p>
        Talk to her in your own words. A good conversation notices an observable action, asks for her reasoning, agrees a better action, and says how you’ll
        check it. She’ll answer.
      </p>
      {c.turns.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label="The conversation so far">
          {c.turns.map((t, i) => (
            <li key={i} className="flex flex-col gap-1">
              <p className="self-end rounded-2xl bg-tealtint px-3 py-2 text-sm">
                <span className="sr-only">You said: </span>
                {t.text}
              </p>
              <p className="self-start rounded-2xl bg-muted px-3 py-2 text-sm">
                <span className="font-semibold">Your coordinator: </span>
                {t.reply}
              </p>
              {t.cues.map((cue) => (
                <p key={cue} className={cx(warn, "rounded-xl px-3 py-1 text-xs")}>
                  Practice cue: {cue}
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
      {c.turns.some((t) => t.cues.length) && <p className="text-xs text-ink-muted">{CUES_NOTICE}</p>}
      {c.canTurn && (
        <label className="flex flex-col gap-1 font-semibold">
          {c.turns.length ? "What do you say next?" : "How do you open the conversation?"}
          <textarea className={cx(field, "min-h-28 py-2 font-normal")} maxLength={MAX_COACH_CHARS} value={text} onChange={(e) => setText(e.target.value)} />
          <span className="text-xs font-normal text-ink-muted">
            {text.length}/{MAX_COACH_CHARS}. Kept with your attempt only, never in reports.
          </span>
          <button
            type="button"
            className={cx(secondary, "self-start")}
            disabled={busy || text.trim().split(/\s+/).length < 4}
            onClick={async () => {
              await move({ do: "coach", text }, "She has replied.");
              setText("");
            }}
          >
            Say it
          </button>
        </label>
      )}
      {c.pushback && (
        <fieldset className={box}>
          <legend className="px-1 font-semibold">{c.pushback.prompt}</legend>
          {c.pushback.options.map((o) => (
            <label key={o.id} className="mt-1 flex min-h-11 items-start gap-2 text-sm">
              <input type="radio" className="mt-1" name="pushback" checked={push === o.id} onChange={() => setPush(o.id)} />
              {o.label}
            </label>
          ))}
          <button
            type="button"
            className={cx(secondary, "mt-2")}
            disabled={busy || !push || push === c.pushback.chosen}
            onClick={() => move({ do: "pushback", option: push }, "Response saved.")}
          >
            {c.pushback.chosen ? "Change my response" : "Say this"}
          </button>
        </fieldset>
      )}
      <details className={box}>
        <summary className="min-h-11 cursor-pointer font-semibold">Pause and involve a reviewer</summary>
        <p className="mt-1 text-sm">If the evidence needs it, involve Quality or Operations. This records a referral to their process, never their decision.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <select className={cx(field, "sm:w-72")} aria-label="Reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value as Reviewer | "")}>
            <option value="">Choose a reviewer</option>
            {(Object.keys(REVIEWERS) as Reviewer[]).map((r) => (
              <option key={r} value={r}>
                {REVIEWERS[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={secondary}
            disabled={busy || !reviewer}
            onClick={() => reviewer && move({ do: "involve", reviewer }, "Reviewer involved.")}
          >
            Involve
          </button>
        </div>
        {c.involved.length > 0 && <p className="mt-1 text-sm">Involved: {c.involved.map((r) => REVIEWERS[r]).join(", ")}</p>}
      </details>
      <button
        type="button"
        className={cx(primary, "self-start")}
        disabled={busy || !c.turns.length || !c.pushback?.chosen}
        onClick={() => move({ do: "coached" }, "Now the two-week plan.")}
      >
        Finish the conversation
      </button>
    </div>
  );
}

const AVAIL_WORDS: Record<string, string> = {
  current: "Current",
  preview: "Checked on the server",
  missing: "Not in the Hub: becomes an author review request",
  unapproved: "Not approved yet: becomes an author review request",
  withdrawn: "Withdrawn: becomes an author review request",
};

function PlanStep({ view, busy, move }: { view: ShadowView; busy: boolean; move: MoveFn }) {
  const p = view.plan!;
  const [items, setItems] = useState(() => (p.draft.length ? p.draft : p.suggestions.filter((x) => x.required).map((x) => ({ id: x.id, due: x.due }))));
  const has = (id: string) => items.some((i) => i.id === id);
  const minutes = items.reduce((t, i) => t + (p.suggestions.find((x) => x.id === i.id)?.minutes ?? 0), 0);
  const saved = JSON.stringify(items) === JSON.stringify(p.draft);
  return (
    <div className="flex flex-col gap-3">
      <p>
        A proposed plan from the Hub’s current approved content, by authored rules (no AI). Accept, remove or reorder items and set due days. Include one
        supervised practice and one observation: reading alone isn’t evidence.
      </p>
      <ul className="flex flex-col gap-2">
        {p.suggestions.map((x) => (
          <li key={x.id} className={box}>
            <label className="flex min-h-11 items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={has(x.id)}
                disabled={x.required}
                onChange={(e) => setItems(e.target.checked ? [...items, { id: x.id, due: x.due }] : items.filter((i) => i.id !== x.id))}
              />
              <span className="flex-1">
                <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                  {x.kindLabel}
                  {x.minutes ? ` · about ${x.minutes} min` : ""}
                </span>
                <span className="block font-semibold">{x.label}</span>
                <span className="block text-sm">{x.why}</span>
                <span className="block text-xs text-ink-muted">Owner: {x.owner}</span>
                {x.content && (
                  <span
                    className={cx(
                      "mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      x.content.status === "current" || x.content.status === "preview" ? good : warn,
                    )}
                  >
                    {AVAIL_WORDS[x.content.status]}
                    {x.content.version && x.content.status === "current" ? ` · ${x.content.version}` : ""}
                  </span>
                )}
              </span>
            </label>
            {has(x.id) && (
              <label className="ml-6 mt-1 flex items-center gap-2 text-sm">
                Due on day
                <input
                  type="number"
                  min={0}
                  max={21}
                  className={cx(field, "w-20")}
                  disabled={x.kind === "work"}
                  value={items.find((i) => i.id === x.id)?.due ?? x.due}
                  onChange={(e) => setItems(items.map((i) => (i.id === x.id ? { ...i, due: Math.max(0, Math.min(21, Number(e.target.value) || 0)) } : i)))}
                />
                {x.kind === "work" && <span className="text-ink-muted">(today: its own urgent due point)</span>}
              </label>
            )}
            {has(x.id) && (
              <div className="ml-6 mt-1 flex gap-1">
                <button
                  type="button"
                  className="min-h-11 rounded-full px-3 text-sm font-semibold text-accent underline underline-offset-2"
                  onClick={() => {
                    const k = items.findIndex((i) => i.id === x.id);
                    if (k > 0) setItems([...items.slice(0, k - 1), items[k], items[k - 1], ...items.slice(k + 1)]);
                  }}
                >
                  Move up<span className="sr-only">: {x.label}</span>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm">
        About {minutes} minutes of her time over two weeks (a realistic ceiling here is {p.maxMinutes}).
      </p>
      {saved && p.problems.length > 0 && (
        <ul role="alert" className={cx(warn, "list-disc rounded-xl py-2 pl-8 pr-3 text-sm")}>
          {p.problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={busy || saved} onClick={() => move({ do: "plan", items }, "Plan saved.")}>
          Save the plan
        </button>
        <button
          type="button"
          className={primary}
          disabled={busy || !saved || !items.length}
          onClick={() => move({ do: "assign" }, "Plan shared. Two weeks on: the second sample.")}
        >
          Share it with her (simulated)
        </button>
      </div>
    </div>
  );
}

function Followup({ view, busy, move, onSource }: { view: ShadowView; busy: boolean; move: MoveFn; onSource: () => void }) {
  const f = view.followup!;
  const [outcome, setOutcome] = useState<Outcome | "">(f.decision?.outcome ?? "");
  const [scope, setScope] = useState(f.decision?.scope ?? "");
  const [reviewer, setReviewer] = useState<Reviewer | "">(f.decision?.reviewer ?? "");
  if (!f.viewed)
    return (
      <div className="flex flex-col gap-2">
        <p>
          Day {f.day}. Two weeks on, here’s a different piece of her work that tests the same judgement. Check it before you decide anything about readiness.
        </p>
        <button
          type="button"
          className={cx(primary, "self-start")}
          disabled={busy}
          onClick={() => move({ do: "followView" }, "The second sample is in the source.")}
        >
          Open the second sample
        </button>
      </div>
    );
  const all = f.fields.every((x) => x.yours);
  return (
    <div className="flex flex-col gap-3">
      <button type="button" className={cx(secondary, "self-start lg:hidden")} onClick={onSource}>
        View the second sample
      </button>
      <fieldset className={box}>
        <legend className="px-1 font-semibold">What does the second sample show?</legend>
        {f.fields.map((x) => (
          <label key={x.id} className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
            <span className="flex-1">{x.label}</span>
            <select
              className={cx(field, "sm:w-56")}
              value={x.yours}
              disabled={busy}
              onChange={(e) => e.target.value && move({ do: "evidence", field: x.id, state: e.target.value as MarkState }, "Evidence marked.")}
            >
              <option value="">Not marked</option>
              {MARK_STATES.map((s) => (
                <option key={s} value={s}>
                  {markLabel(s)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      {all && (
        <fieldset className={box}>
          <legend className="px-1 font-semibold">Your readiness decision</legend>
          {f.outcomes.map((o) => (
            <label key={o.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name="outcome" checked={outcome === o.id} onChange={() => setOutcome(o.id)} />
              {o.label}
            </label>
          ))}
          {outcome === "signoff" && (
            <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
              Which defined task?
              <select className={field} value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">Choose a task</option>
                {f.scopes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {s.reviewerLabel ? ` (needs ${s.reviewerLabel})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(outcome === "escalate" || outcome === "signoff") && (
            <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
              Reviewer
              <select className={field} value={reviewer} onChange={(e) => setReviewer(e.target.value as Reviewer | "")}>
                <option value="">None</option>
                {(Object.keys(REVIEWERS) as Reviewer[]).map((r) => (
                  <option key={r} value={r}>
                    {REVIEWERS[r]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            A simulation decision: never a credential, an employment status or permission to take higher-risk cases. In real work, the sign-off owner and scope
            come from Trilogy Care’s delegation matrix.
          </p>
          <button
            type="button"
            className={cx(primary, "mt-2")}
            disabled={busy || !outcome}
            onClick={() => outcome && move({ do: "decide", outcome, scope: outcome === "signoff" ? scope : "", reviewer }, "Decision recorded.")}
          >
            Record the decision
          </button>
        </fieldset>
      )}
    </div>
  );
}

const LEVEL_TONE = (l: number) => (l >= 2 ? good : l === 1 ? warn : bad);

export function DebriefView({
  b,
  d,
  busy,
  preview,
  guideId,
  place,
  onRetry,
}: {
  b: ShadowCoachBlock;
  d: Debrief;
  busy: boolean;
  preview: boolean;
  guideId: string;
  place: string;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="flex flex-col gap-4">
      <h4 ref={ref} tabIndex={-1} className="font-serif text-2xl font-semibold outline-none">
        Debrief: {d.endingLabel}
      </h4>
      {d.critical.length > 0 && (
        <div className={cx(bad, "rounded-2xl p-4")}>
          <p className="font-semibold">A critical error comes first. Good coaching doesn’t cancel it.</p>
          {d.critical.map((c) => (
            <p key={c.code} className="mt-2">
              <span className="font-semibold">{c.label}. </span>
              {c.text}
            </p>
          ))}
        </div>
      )}
      <p>
        Practice evidence only: {d.score} of {d.max} on the rubric{d.passed === null ? "" : d.passed ? ", a pass" : ", not a pass"}. It isn’t an observation, a
        QA record or a judgement of anyone real.
        {d.review ? " Part of your wording was softened, so a reviewer would check it rather than the rules guessing." : ""}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {d.dims.map((x) => (
          <li key={x.dim} className={box}>
            <p className="font-semibold">{x.label}</p>
            <p className={cx(LEVEL_TONE(x.level), "mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold")}>
              {x.level} of 3: {x.levelLabel}
            </p>
            {x.did.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm">
                {x.did.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            {x.todo.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm text-ink-muted">
                {x.todo.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <section className={box}>
        <h5 className="font-semibold">What the sample held</h5>
        <ul className="mt-1 flex flex-col gap-2 text-sm">
          {d.findings.map((f) => (
            <li key={f.id}>
              <span className="font-semibold">{f.found ? "You marked: " : "Not marked: "}</span>
              {f.label}
              {f.found && (
                <span className="block text-ink-muted">
                  You said {f.kind.toLowerCase()}, {f.cls.toLowerCase()}
                  {f.cause ? `, ${f.cause.toLowerCase()}` : ""}
                  {f.classRight && f.kindRight && f.causeRight ? "." : ": worth another look."}
                </span>
              )}
              <span className="block">{f.why}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className={box}>
        <h5 className="font-semibold">First actions{d.actionTries > 1 ? ` (settled on try ${d.actionTries})` : ""}</h5>
        <ul className="mt-1 flex flex-col gap-2 text-sm">
          {d.actions
            .filter((a) => a.chosen || a.firstTry || a.verdict === "essential")
            .map((a) => (
              <li key={a.id}>
                <span className="font-semibold">{a.label}</span>
                <span className="block text-ink-muted">
                  First try: {a.firstTry ? WHEN[a.firstTry] : "not chosen"} · Final: {a.chosen ? WHEN[a.chosen] : "not chosen"}
                </span>
                <span className="block">{a.feedback}</span>
              </li>
            ))}
        </ul>
      </section>
      <section className={box}>
        <h5 className="font-semibold">The conversation</h5>
        {d.coaching.turns.map((t, i) => (
          <div key={i} className="mt-2 text-sm">
            <p className="rounded-xl bg-tealtint px-3 py-2">{t.text}</p>
            <p className="mt-1">
              Shown: {t.moves.join(", ") || "nothing from Notice, Ask, Agree or Verify"}. She said: “{t.reply}”
            </p>
            {t.risks.map((r) => (
              <p key={r.label} className={cx(warn, "mt-1 rounded-xl px-3 py-1")}>
                <span className="font-semibold">{r.label}. </span>
                {r.feedback}
              </p>
            ))}
            {t.review.map((r) => (
              <p key={r} className="mt-1 text-ink-muted">
                {r}
              </p>
            ))}
          </div>
        ))}
        {d.coaching.missingMoves.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {d.coaching.missingMoves.map((m) => (
              <li key={m.move}>
                <span className="font-semibold">{m.move}: </span>
                {m.hint}
              </li>
            ))}
          </ul>
        )}
        {d.coaching.pushback && (
          <p className="mt-2 text-sm">
            <span className="font-semibold">Her explanation. </span>
            {d.coaching.pushback.feedback}
          </p>
        )}
        <p className="mt-2 text-sm">
          <span className="font-semibold">One reviewed way to say it: </span>
          {d.coaching.model}
        </p>
        {d.coaching.alternatives.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm text-ink-muted">
            {d.coaching.alternatives.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </section>
      <section className={box}>
        <h5 className="font-semibold">The plan</h5>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {d.plan.map((p) => (
            <li key={p.id}>
              Day {p.due} · {p.kind}: {p.label}
              {p.version ? ` (${p.version})` : ""}
              {p.feedback && <span className="block text-ink-muted">{p.feedback}</span>}
            </li>
          ))}
        </ul>
        {d.reviewRequests.length > 0 && (
          <p className="mt-2 text-sm">
            Author review requested for: {d.reviewRequests.join("; ")}. Nothing was written in their place; supervised practice covers the gap meanwhile.
          </p>
        )}
      </section>
      <section className={box}>
        <h5 className="font-semibold">The second sample</h5>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {d.followup.fields.map((f) => (
            <li key={f.id}>
              <span className="font-semibold">{f.label}: </span>
              {f.right ? `${f.key}.` : `you said ${f.yours.toLowerCase()}; the sample shows ${f.key.toLowerCase()}.`}{" "}
              <span className="text-ink-muted">{f.why}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm">
          Your decision: <span className="font-semibold">{d.followup.outcome}</span>
          {d.followup.scope ? ` (${d.followup.scope})` : ""}
          {d.followup.reviewer ? `, with the ${d.followup.reviewer}` : ""}. {d.followup.feedback}
        </p>
      </section>
      <AidSection snippetId={b.jobAid.snippetId} why={b.jobAid.why} place={place.startsWith("topic:") ? place : `magazine:${guideId}`} preview={preview} />
      <details className={box}>
        <summary className="min-h-11 cursor-pointer font-semibold">Sources and versions</summary>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {d.sources.map((s) => (
            <li key={s.id}>
              {s.url ? (
                <a className="text-accent underline underline-offset-2" href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}{" "}
              <span className="text-ink-muted">
                ({s.owner}
                {s.placeholder ? "; placeholder until Trilogy Care supplies it" : s.checked ? `; checked ${s.checked}` : ""})
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-ink-muted">
          {d.versions.shadow} · {d.versions.rubric} · {d.versions.engine} · scenario {d.versions.scenario}
          {d.versions.rules ? ` · contribution rules ${d.versions.rules}` : ""}
        </p>
      </details>
      <button type="button" className={cx(secondary, "self-start")} disabled={busy} onClick={onRetry}>
        Try this episode again
      </button>
    </div>
  );
}
