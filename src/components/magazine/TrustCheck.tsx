"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { TrustCheckBlock } from "@/lib/magazine";
import { money } from "@/lib/quarterBudget";
import {
  applyMove,
  buildDebrief,
  emptyPlan,
  emptyState,
  ENGINE_VERSION,
  LEVELS,
  MoveError,
  PHASE_QUESTIONS,
  RUBRIC_VERSION,
  submitProblems,
  TRUST_NOTICE,
  TRUST_VERSION,
  trustView,
  variationFor,
  type BudgetView,
  type Debrief,
  type Move,
  type OwnerRole,
  type Plan,
  type TrustState,
  type TrustView,
} from "@/lib/trustCheck";
import type { TrustAttemptView } from "@/server/trustCheck";
import { Icon } from "../Icon";
import { AidSection } from "../playbooks/AidSection";

/*
  The 28-Day Trust Check, as learners use it (docs/trust-check.md). On a wide screen the signal board sits beside the
  decisions; on a phone one pane at a time, with "View evidence" a tap away. Every signal is a button that opens its
  card (source, update time, reliability, what we noticed, why it may matter, alternatives, what to verify, who can act),
  every decision a labelled field, and statuses are words. There is no timer and no score until the debrief, and no
  churn score anywhere.

  The page holds only what the server sends: the signals that have arrived and each decision when its turn comes. In
  the editor's preview it runs the same engine locally against the block as written, and stores nothing.
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
type Call = (body: Body) => Promise<TrustAttemptView>;
type Sig = TrustView["signals"][number];
type StepV = TrustView["steps"][number];
type MoveFn = (m: Move, announce?: string, focus?: boolean) => Promise<void>;

/** The editor's preview: the same engine, computed locally from the block as written. Nothing is stored. */
function previewEngine(b: TrustCheckBlock, variation: string) {
  let attemptNo = 0;
  let s: TrustState | null = null;
  let debrief: Debrief | null = null;
  let status: TrustAttemptView["status"] = "new";
  const toView = (): TrustAttemptView => ({
    attemptId: s ? `preview-${attemptNo}` : null,
    attemptNo,
    status,
    view: s ? trustView(b, s) : null,
    debrief,
    attempts: attemptNo,
    versions: { trust: TRUST_VERSION, rubric: RUBRIC_VERSION, engine: ENGINE_VERSION, scenario: b.scenarioVersion, rules: b.ruleSetId },
    earlierScenario: false,
  });
  const begin = (v: string) => {
    attemptNo += 1;
    s = emptyState(v);
    debrief = null;
    status = "active";
  };
  const call: Call = async (body) => {
    try {
      if (body.action === "start" && status === "new") begin(variation);
      else if (body.action === "retry" && status !== "active") begin(variationFor(b, attemptNo + 1));
      else if (body.action === "viewed" && status === "submitted") status = "completed";
      else if (body.action === "submit" && s && status === "active") {
        const problems = submitProblems(b, s);
        if (problems.length) throw new Error(problems[0]);
        debrief = buildDebrief(b, s);
        status = "submitted";
      } else if (body.move && s && status === "active") s = applyMove(b, s, body.move as Move);
    } catch (e) {
      throw new Error(e instanceof MoveError || e instanceof Error ? e.message : "That didn’t work.");
    }
    return toView();
  };
  return { call, view: toView };
}

export function TrustCheck({
  block: b,
  guideId,
  preview = false,
  place = "magazine",
  onFinished,
}: {
  block: TrustCheckBlock;
  guideId: string;
  preview?: boolean;
  place?: string;
  onFinished?: (d: Debrief) => void;
}) {
  const url = `/api/magazine/${guideId}/trust-check`;
  const loaded = useApi<TrustAttemptView>(preview ? null : `${url}?block=${b.id}`);
  const [pVariation, setPVariation] = useState("");
  const [engine, setEngine] = useState(() => (preview ? previewEngine(b, "") : null));
  const [v, setV] = useState<TrustAttemptView | null>(preview ? (engine?.view() ?? null) : null);
  if (!preview && loaded.data && v === null) setV(loaded.data);

  const call = useCallback<Call>(
    async (body) => (engine ? engine.call(body) : api<TrustAttemptView>(url, { body: { blockId: b.id, place, ...body } })),
    [engine, url, b.id, place],
  );

  return (
    <section
      className="flex w-full min-w-0 flex-col gap-4 rounded-3xl border border-line-strong bg-surface p-4 shadow-sm sm:p-6"
      aria-label={`28-Day Trust Check: ${b.title}`}
    >
      <div>
        <p className="mb-1 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="calendar" className="size-5" /> 28-Day Trust Check
        </p>
        <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
        {b.intro && <p className="mt-1 text-ink-muted">{b.intro}</p>}
        <p className="mt-2 inline-flex flex-wrap gap-x-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold">
          <span>Practice</span>
          <span aria-hidden>·</span>
          <span>A fictional case</span>
          <span aria-hidden>·</span>
          <span>Nothing is sent, booked or lodged</span>
        </p>
      </div>
      {preview && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-line-strong p-3 text-sm">
          <p className="w-full font-semibold">Preview (nothing is saved). It runs the same engine as the server, on the block as written.</p>
          <label className="flex flex-col gap-1">
            Branch
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
              <option value="">As written</option>
              {b.variations.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!preview && loaded.error ? (
        <p role="alert">{loaded.error}</p>
      ) : !v ? (
        <p className="text-ink-muted">Loading…</p>
      ) : (
        <Attempt key={v.attemptId ?? "new"} b={b} v={v} setV={setV} call={call} preview={preview} guideId={guideId} place={place} onFinished={onFinished} />
      )}
    </section>
  );
}

/** Focus to move after the next render (kept outside the component: starting an attempt remounts it). */
let pendingFocus = false;

/** One attempt: the start, the case, or the debrief. Exported for the static render checks in the tests. */
export function Attempt({
  b,
  v,
  setV,
  call,
  preview,
  guideId,
  place,
  onFinished,
}: {
  b: TrustCheckBlock;
  v: TrustAttemptView;
  setV: (v: TrustAttemptView) => void;
  call: Call;
  preview: boolean;
  guideId: string;
  place: string;
  onFinished?: (d: Debrief) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [pane, setPane] = useState<"decide" | "evidence">("decide");
  const viewed = useRef(false);

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

  // After a decision, focus moves to the next decision's heading (never on a new signal arriving).
  const openStep = v.view?.steps.find((s) => s.open)?.id ?? (v.view?.plan && !v.view.plan.proposed ? "plan" : v.view?.phase === "submit" ? "submit" : "");
  useEffect(() => {
    if (!pendingFocus) return;
    pendingFocus = false;
    // A new attempt remounts this component, so the request survives in the module; with no decision open yet, the phase heading.
    (document.getElementById(`tc-step-${openStep}`) ?? document.getElementById(`tc-phase-${v.view?.phase}`))?.focus();
  }, [openStep, v.view?.phase]);

  const run = async (body: Body, announce = "", focus = false) => {
    setBusy(true);
    setProblem(null);
    try {
      const next = await call(body);
      setSaid(announce);
      pendingFocus = focus;
      setV(next);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const move = (m: Move, announce = "", focus = false) => run({ move: m }, announce, focus);

  if (v.status === "new")
    return (
      <div className={box}>
        <p className="font-semibold">{b.story.setting}</p>
        <p className="mt-2">{b.story.situation}</p>
        <p className="mt-2 text-sm">{b.story.role}</p>
        {b.story.temptation && (
          <p className={cx(warn, "mt-3 rounded-xl px-3 py-2 text-sm")}>
            <span className="font-semibold">The temptation: </span>
            {b.story.temptation}
          </p>
        )}
        <p className="mt-3 text-sm text-ink-muted">
          About 20 minutes, with no timer. {TRUST_NOTICE} You can stop and come back: it resumes where you left off.
        </p>
        <button type="button" className={cx(primary, "mt-3")} disabled={busy} onClick={() => run({ action: "start" }, "The case is open.", true)}>
          Start the case
        </button>
        {problem && (
          <p role="alert" className={cx(bad, "mt-2 rounded-xl px-3 py-2 text-sm")}>
            {problem}
          </p>
        )}
      </div>
    );

  if (v.status !== "active" && v.debrief)
    return (
      <DebriefView
        b={b}
        d={v.debrief}
        busy={busy}
        preview={preview}
        guideId={guideId}
        place={place}
        onRetry={() => run({ action: "retry", from: v.attemptId }, "A new attempt has started.", true)}
      />
    );
  const view = v.view;
  if (!view) return <p className="text-ink-muted">Loading…</p>;
  const unopened = view.signals.filter((s) => !s.opened).length;

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      {v.earlierScenario && (
        <p className={cx(warn, "rounded-xl px-3 py-2 text-sm")}>
          This attempt uses the case as it was when you started. The next attempt uses the current version.
        </p>
      )}
      {view.variation && <p className={cx(warn, "rounded-xl px-3 py-2 text-sm font-semibold")}>{view.variation.text}</p>}
      <Phases view={view} />
      {problem && (
        <p role="alert" className={cx(bad, "rounded-xl px-3 py-2 text-sm")}>
          {problem}
        </p>
      )}
      <div role="group" aria-label="Show" className="flex gap-1 rounded-full bg-muted p-1 lg:hidden">
        <button
          type="button"
          aria-pressed={pane === "decide"}
          onClick={() => setPane("decide")}
          className={cx("min-h-11 flex-1 rounded-full px-2 text-sm font-semibold", pane === "decide" ? "bg-surface shadow-sm" : "text-ink-muted")}
        >
          Decide
        </button>
        <button
          type="button"
          aria-pressed={pane === "evidence"}
          onClick={() => setPane("evidence")}
          className={cx("min-h-11 flex-1 rounded-full px-2 text-sm font-semibold", pane === "evidence" ? "bg-surface shadow-sm" : "text-ink-muted")}
        >
          View evidence{unopened ? ` (${unopened} unopened)` : ""}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className={cx("min-w-0", pane === "evidence" ? "block" : "hidden", "lg:block")}>
          <SignalBoard view={view} busy={busy} onOpen={(id) => move({ do: "open", signal: id }, "Card opened.")} />
        </div>
        <div className={cx("min-w-0", pane === "decide" ? "block" : "hidden", "lg:block")}>
          <DecidePane
            b={b}
            view={view}
            busy={busy}
            move={move}
            onEvidence={() => setPane("evidence")}
            onSubmit={() => run({ action: "submit" }, "Submitted. Your debrief is below.")}
          />
        </div>
      </div>
    </div>
  );
}

function Phases({ view }: { view: TrustView }) {
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Where you are">
      {view.phases.map((p) => (
        <li
          key={p.id}
          aria-current={p.current ? "step" : undefined}
          className={cx(
            "flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-center text-xs font-semibold",
            p.current ? "bg-action text-on-action" : p.done ? good : "bg-muted text-ink-muted",
          )}
        >
          <Icon name={p.done ? "check" : p.current ? "arrow-right" : "minus"} className="size-4" />
          <span>{p.label}</span>
          <span className="sr-only">{p.done ? "(done)" : p.current ? `(now: ${p.question})` : "(to come)"}</span>
        </li>
      ))}
    </ol>
  );
}

function BudgetTable({ budget }: { budget: BudgetView }) {
  return (
    <div className="mt-2">
      <table className="w-full text-sm">
        <caption className="text-left font-semibold">The money, kept apart (fictional figures)</caption>
        <tbody>
          {budget.lines.map((l) => (
            <tr key={l.id} className="border-t border-line">
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {l.label}
                {l.estimate && <span className="text-ink-muted"> (estimate)</span>}
                <span className="block text-xs text-ink-muted">{l.note}</span>
              </th>
              <td className="py-1 text-right align-top tabular-nums">{l.cents === null ? "Not known" : money(l.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {budget.carryover && <p className="mt-1 text-xs">Carryover limit: {budget.carryover.text}.</p>}
      <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted">
        {budget.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

function SignalCard({ s, busy, onOpen }: { s: Sig; busy: boolean; onOpen: () => void }) {
  return (
    <li className="rounded-2xl bg-surface ring-1 ring-line">
      <button
        type="button"
        aria-expanded={s.opened}
        disabled={busy || s.opened}
        onClick={onOpen}
        className="flex min-h-11 w-full items-start gap-3 rounded-2xl p-3 text-left disabled:cursor-default"
      >
        <Icon name={s.opened ? "eye" : "plus"} className="mt-0.5 size-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{s.title}</span>
          <span className="block text-xs text-ink-muted">
            {s.source} · {s.reliabilityLabel} · updated {s.updated}
          </span>
          {!s.opened && <span className="mt-1 block text-sm font-semibold text-accent">Open this card</span>}
        </span>
      </button>
      {s.opened && (
        <div className="border-t border-line px-3 pb-3 pt-2 text-sm">
          <p>
            <span className="font-semibold">What we noticed: </span>
            {s.noticed}
          </p>
          {s.visits.length > 0 && (
            <table className="mt-2 w-full text-xs">
              <caption className="sr-only">Visits</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="pr-2">
                    Date
                  </th>
                  <th scope="col" className="pr-2">
                    Outcome
                  </th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {s.visits.map((x) => (
                  <tr key={x.date} className="border-t border-line align-top">
                    <td className="pr-2">{x.date}</td>
                    <td className="pr-2">{x.outcome}</td>
                    <td>
                      {x.reason}
                      {x.note && <span className="block text-ink-muted">{x.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {s.budget && <BudgetTable budget={s.budget} />}
          {s.matters && (
            <p className="mt-2">
              <span className="font-semibold">Why it may matter: </span>
              {s.matters}
            </p>
          )}
          {s.alternatives && (
            <p className="mt-1">
              <span className="font-semibold">Alternative explanations: </span>
              {s.alternatives}
            </p>
          )}
          {s.verify && (
            <p className="mt-1">
              <span className="font-semibold">What to verify: </span>
              {s.verify}
            </p>
          )}
          {s.canAct && (
            <p className="mt-1">
              <span className="font-semibold">Who can act: </span>
              {s.canAct}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function SignalBoard({ view, busy, onOpen }: { view: TrustView; busy: boolean; onOpen: (id: string) => void }) {
  const board = view.signals.filter((s) => !s.checkpoint);
  const day7 = view.signals.filter((s) => s.checkpoint === "day7");
  const day28 = view.signals.filter((s) => s.checkpoint === "day28");
  const opened = board.filter((s) => s.opened).length;
  return (
    <section aria-labelledby="tc-board" className="flex flex-col gap-3">
      <div>
        <h4 id="tc-board" className="font-serif text-xl font-semibold">
          Signal board
        </h4>
        <p className="text-sm text-ink-muted">
          Each card shows its source and when it was last updated. Open at least {view.minOpen} before deciding ({opened} open).
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {board.map((s) => (
          <SignalCard key={s.id} s={s} busy={busy} onOpen={() => onOpen(s.id)} />
        ))}
      </ul>
      {[
        ["Day 7 records", day7],
        ["Day 28 records", day28],
      ].map(([label, list]) =>
        (list as Sig[]).length ? (
          <div key={label as string}>
            <h5 className="font-semibold">{label as string}</h5>
            <ul className="mt-1 flex flex-col gap-2">
              {(list as Sig[]).map((s) => (
                <SignalCard key={s.id} s={s} busy={busy} onOpen={() => onOpen(s.id)} />
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  );
}

function StepCard({ step, busy, move }: { step: StepV; busy: boolean; move: MoveFn }) {
  const [picked, setPicked] = useState<string[]>([]);
  const answered = step.answer.length > 0;
  const chosen = step.options.filter((o) => step.answer.includes(o.id));
  const multi = step.max > 1;
  return (
    <div className={cx(box, "flex flex-col gap-2")}>
      <h5 id={`tc-step-${step.id}`} tabIndex={-1} className="font-semibold">
        {step.title}
      </h5>
      {step.prompt && <p className={step.prompt.startsWith("“") ? "italic" : "text-sm"}>{step.prompt}</p>}
      {answered ? (
        <>
          <ul className="flex flex-col gap-1 text-sm">
            {chosen.map((o) => (
              <li key={o.id} className="flex items-start gap-2">
                <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{o.text}</span>
              </li>
            ))}
          </ul>
          {step.replies.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label="What she said">
              {step.replies.map((r) => (
                <li key={r.option} className="rounded-xl bg-muted px-3 py-2 text-sm">
                  <span className="font-semibold">She says: </span>
                  {r.line}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : !step.open ? (
        <p className="text-sm text-ink-muted">{step.why}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            move({ do: "answer", step: step.id, options: picked }, "Decision recorded.", true);
          }}
        >
          <fieldset>
            <legend className="text-sm text-ink-muted">
              {multi ? `Choose ${step.min === step.max ? step.min : `${step.min} to ${step.max}`}.` : "Choose one."}
            </legend>
            <ul className="mt-1 flex flex-col gap-1">
              {step.options.map((o) => (
                <li key={o.id}>
                  <label className="flex min-h-11 items-start gap-2 rounded-xl px-2 py-1 hover:bg-muted">
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={`tc-${step.id}`}
                      className="mt-1 size-5 shrink-0"
                      checked={picked.includes(o.id)}
                      onChange={(e) =>
                        setPicked((p) => (multi ? (e.target.checked ? [...p, o.id] : p.filter((x) => x !== o.id)) : e.target.checked ? [o.id] : []))
                      }
                    />
                    <span>{o.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <button type="submit" className={cx(primary, "mt-2")} disabled={busy || picked.length < step.min || picked.length > step.max}>
            Decide
          </button>
        </form>
      )}
    </div>
  );
}

function PlanBuilder({ b, view, busy, move }: { b: TrustCheckBlock; view: TrustView; busy: boolean; move: MoveFn }) {
  const spec = view.plan!;
  const [p, setP] = useState<Plan>(() => spec.value ?? emptyPlan());
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<Plan>) => setP((x) => ({ ...x, ...patch }));
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));
  const radios = (label: string, name: keyof Plan, options: { id: string; text: string }[]) => (
    <fieldset className="flex flex-col gap-1">
      <legend className="font-semibold">{label}</legend>
      {options.map((o) => (
        <label key={o.id} className="flex min-h-11 items-start gap-2 rounded-xl px-2 py-1 hover:bg-muted">
          <input
            type="radio"
            name={`tc-plan-${name}`}
            className="mt-1 size-5 shrink-0"
            checked={p[name] === o.id}
            disabled={spec.proposed}
            onChange={() => set({ [name]: o.id })}
          />
          <span>{o.text}</span>
        </label>
      ))}
    </fieldset>
  );
  if (spec.proposed && spec.value) {
    const v = spec.value;
    const pickText = (list: { id: string; text: string }[], id: string) => list.find((o) => o.id === id)?.text ?? "";
    return (
      <div className={cx(box, "flex flex-col gap-1 text-sm")}>
        <h5 id="tc-step-plan" tabIndex={-1} className="font-semibold">
          Your plan (proposed)
        </h5>
        <p>
          <span className="font-semibold">Her concern: </span>
          {v.concern}
        </p>
        <p>
          <span className="font-semibold">Actions: </span>
          {spec.actions
            .filter((a) => v.actions.includes(a.id))
            .map((a) => a.text)
            .join("; ")}
        </p>
        <p>
          <span className="font-semibold">Owner: </span>
          {spec.owners.find((o) => o.id === v.owner)?.label}
        </p>
        <p>
          <span className="font-semibold">Next update: </span>
          {pickText(spec.updates, v.update)}
        </p>
        <p>
          <span className="font-semibold">If it fails: </span>
          {pickText(spec.contingencies, v.contingency)}
        </p>
        <p>
          <span className="font-semibold">How you’ll check: </span>
          {pickText(spec.checks, v.check)}
        </p>
      </div>
    );
  }
  const problems = tried ? spec.problems : [];
  return (
    <form
      className={cx(box, "flex flex-col gap-4")}
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        move({ do: "plan", plan: p }, "Plan saved.");
      }}
    >
      <div>
        <h5 id="tc-step-plan" tabIndex={-1} className="font-semibold">
          Build the plan
        </h5>
        <p className="text-sm text-ink-muted">
          A specific, honest commitment: what, who owns it, when she hears back, what happens if it fails, and how you’ll know it helped.
        </p>
      </div>
      <label className="flex flex-col gap-1 font-semibold">
        Her concern, in her words
        <textarea className={cx(field, "min-h-20 py-2 font-normal")} maxLength={400} value={p.concern} onChange={(e) => set({ concern: e.target.value })} />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-semibold">Actions (choose all you’d take)</legend>
        {spec.actions.map((a) => (
          <label key={a.id} className="flex min-h-11 items-start gap-2 rounded-xl px-2 py-1 hover:bg-muted">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              checked={p.actions.includes(a.id)}
              onChange={(e) => set({ actions: toggle(p.actions, a.id, e.target.checked) })}
            />
            <span>
              {a.text}
              {a.owner && <span className="block text-xs text-ink-muted">Owner: {a.owner}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 font-semibold">
        Accountable owner of the main action
        <select className={field} value={p.owner} onChange={(e) => set({ owner: e.target.value as OwnerRole | "" })}>
          <option value="">Choose…</option>
          {spec.owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {radios("When she’ll next hear from you", "update", spec.updates)}
      {radios("If the first fix fails", "contingency", spec.contingencies)}
      {radios("How you’ll check it worked", "check", spec.checks)}
      <fieldset className="flex flex-col gap-1">
        <legend className="font-semibold">What you’ll tell {b.supporter.name || "her supporter"} about (optional)</legend>
        <p className="text-sm text-ink-muted">Check her sharing preferences on the signal board first.</p>
        {spec.sharing.map((t) => (
          <label key={t.id} className="flex min-h-11 items-start gap-2 rounded-xl px-2 py-1 hover:bg-muted">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0"
              checked={p.share.includes(t.id)}
              onChange={(e) => set({ share: toggle(p.share, t.id, e.target.checked) })}
            />
            <span>{t.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 font-semibold">
        What you’ll say to {b.participant.name || "her"} (optional, in your own words)
        <textarea className={cx(field, "min-h-20 py-2 font-normal")} maxLength={600} value={p.say} onChange={(e) => set({ say: e.target.value })} />
      </label>
      {problems.length > 0 && (
        <ul className={cx(warn, "list-disc rounded-xl py-2 pl-8 pr-3 text-sm")}>
          {problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={secondary} disabled={busy}>
          Save the draft
        </button>
        <button
          type="button"
          className={primary}
          disabled={busy}
          onClick={async () => {
            setTried(true);
            await move({ do: "plan", plan: p });
            move({ do: "propose" }, "Plan proposed.", true);
          }}
        >
          Propose the plan
        </button>
      </div>
    </form>
  );
}

function DecidePane({
  b,
  view,
  busy,
  move,
  onEvidence,
  onSubmit,
}: {
  b: TrustCheckBlock;
  view: TrustView;
  busy: boolean;
  move: MoveFn;
  onEvidence: () => void;
  onSubmit: () => void;
}) {
  const phases = view.phases.filter((p) => p.done || p.current);
  return (
    <div className="flex flex-col gap-4">
      {phases.map((p) => (
        <section key={p.id} aria-labelledby={`tc-phase-${p.id}`} className="flex flex-col gap-2">
          <h4 id={`tc-phase-${p.id}`} tabIndex={-1} className="font-serif text-xl font-semibold">
            {p.label}: {PHASE_QUESTIONS[p.id]}
          </h4>
          {p.id === "notice" && !view.steps.some((s) => s.phase === "notice" && s.answer.length) && (
            <button type="button" className={cx(secondary, "w-fit lg:hidden")} onClick={onEvidence}>
              <Icon name="eye" className="size-4" /> View evidence
            </button>
          )}
          {p.id === "act" && view.plan && <PlanBuilder b={b} view={view} busy={busy} move={move} />}
          {view.steps
            .filter((s) => s.phase === p.id && (p.id !== "act" || view.plan?.proposed || !s.afterPlan))
            .map((s) => (
              <StepCard key={s.id} step={s} busy={busy} move={move} />
            ))}
        </section>
      ))}
      {view.phase === "submit" && (
        <div className={box}>
          <h4 id="tc-step-submit" tabIndex={-1} className="font-semibold">
            That’s the case
          </h4>
          <p className="mt-1 text-sm">Submit for your debrief. Your choices can’t change after this, but you can try again.</p>
          <button type="button" className={cx(primary, "mt-2")} disabled={busy} onClick={onSubmit}>
            Submit for the debrief
          </button>
        </div>
      )}
    </div>
  );
}

export function DebriefView({
  b,
  d,
  busy,
  preview,
  guideId,
  place,
  onRetry,
}: {
  b: TrustCheckBlock;
  d: Debrief;
  busy: boolean;
  preview: boolean;
  guideId: string;
  place: string;
  onRetry: () => void;
}) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus(), []);
  return (
    <div className="flex flex-col gap-4">
      <div className={cx("rounded-2xl p-4", d.critical.length ? bad : d.defensible ? good : warn)}>
        <h4 ref={head} tabIndex={-1} className="font-serif text-xl font-semibold">
          {d.endingLabel}
        </h4>
        <p className="mt-1">{d.endingText}</p>
        {d.variation && <p className="mt-1 text-sm">This attempt’s variation: {d.variation.label}.</p>}
      </div>
      {d.critical.length > 0 && (
        <section aria-labelledby="tc-critical" className={cx(box, "border-l-8 border-[#b42318]")}>
          <h5 id="tc-critical" className="font-semibold">
            Critical {d.critical.length === 1 ? "error" : "errors"}: these come before any score
          </h5>
          <ul className="mt-2 flex flex-col gap-2">
            {d.critical.map((c) => (
              <li key={c.code}>
                <p className="font-semibold">{c.text}</p>
                <p className="text-sm">{c.correction}</p>
                {c.source.title && (
                  <p className="text-xs text-ink-muted">
                    Source:{" "}
                    {c.source.url ? (
                      <a href={c.source.url} className="underline" target="_blank" rel="noreferrer">
                        {c.source.title}
                      </a>
                    ) : (
                      c.source.title
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="tc-rubric" className={box}>
        <h5 id="tc-rubric" className="font-semibold">
          How it went: {d.score} of {d.max}
          {d.passed !== null && ` · ${d.passed ? "Passed" : "Not passed"} (pass mark ${d.passMark})`}
        </h5>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Rubric</caption>
          <tbody>
            {d.dims.map((x) => (
              <tr key={x.dim} className="border-t border-line align-top">
                <th scope="row" className="py-1 pr-2 text-left">
                  {x.label}
                  <span className="block text-xs font-normal text-ink-muted">{x.why}</span>
                </th>
                <td className="py-1 text-right">
                  {x.level} · {x.words}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink-muted">Levels: {Object.values(LEVELS).join(", ")}. Whether she stays or moves isn’t scored.</p>
      </section>
      {d.revised && (
        <p className={cx(good, "rounded-xl px-3 py-2 text-sm")}>
          You changed your triage after hearing her, from “{d.revised.from}” to “{d.revised.to}”. That’s good practice, and it isn’t marked down.
        </p>
      )}
      <section aria-labelledby="tc-signals" className={box}>
        <h5 id="tc-signals" className="font-semibold">
          What the signals supported: {d.signals.label}
        </h5>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {d.signals.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        {d.budget && <BudgetTable budget={d.budget} />}
      </section>
      {d.conversation.length > 0 && (
        <section aria-labelledby="tc-conv" className={box}>
          <h5 id="tc-conv" className="font-semibold">
            The conversation
          </h5>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {d.conversation.map((l, i) => (
              <li key={i} className={l.who === "her" ? "rounded-xl bg-muted px-3 py-1" : "px-3 py-1"}>
                <span className="font-semibold">{l.who === "her" ? `${b.participant.name || "She"}: ` : "You: "}</span>
                {l.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.plan && (
        <section aria-labelledby="tc-plan" className={box}>
          <h5 id="tc-plan" className="font-semibold">
            Your plan
          </h5>
          <p className="mt-1 text-sm">
            <span className="font-semibold">Her concern: </span>
            {d.plan.concern}
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {d.plan.actions.map((a) => (
              <li key={a.text}>
                <span className="font-semibold">{a.text}</span> {a.feedback}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm">
            Owner: {d.plan.owner || "none"} · Update: {d.plan.update} · If it fails: {d.plan.contingency} · Check: {d.plan.check}
          </p>
          {d.plan.shared.length > 0 && (
            <ul className="mt-1 text-sm">
              {d.plan.shared.map((s) => (
                <li key={s.label} className="flex items-start gap-2">
                  <Icon name={s.allowed ? "check" : "alert"} className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {s.label}: {s.allowed ? "she agreed this can be shared" : "she hasn’t agreed to share this"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {d.plan.complaint && (
            <p className="mt-1 text-sm">
              In what you’d say: “{d.plan.complaint.quote}”{" "}
              {d.plan.complaint.hedged ? "(softened, so not scored: a reviewer would check it)" : "discourages a complaint."}
            </p>
          )}
        </section>
      )}
      <section aria-labelledby="tc-choices" className={box}>
        <h5 id="tc-choices" className="font-semibold">
          Step by step
        </h5>
        <ol className="mt-1 flex flex-col gap-2 text-sm">
          {d.choices.map((c) => (
            <li key={c.step}>
              <p className="font-semibold">
                {c.title}
                {c.revised && <span className="font-normal text-ink-muted"> (revised later: not scored)</span>}
              </p>
              <p>{c.chosen.join("; ")}</p>
              {c.feedback.map((f) => (
                <p key={f} className="text-ink-muted">
                  {f}
                </p>
              ))}
            </li>
          ))}
        </ol>
      </section>
      {d.missed.length > 0 && (
        <section aria-labelledby="tc-missed" className={box}>
          <h5 id="tc-missed" className="font-semibold">
            Moves you could also have made
          </h5>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {d.missed.map((m) => (
              <li key={m.text}>
                {m.text}. <span className="text-ink-muted">{m.feedback}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm">{d.summary}</p>
      {b.jobAid.snippetId && (
        <AidSection snippetId={b.jobAid.snippetId} why={b.jobAid.why} place={place.startsWith("topic:") ? place : `magazine:${guideId}`} preview={preview} />
      )}
      <section aria-labelledby="tc-sources" className="text-xs text-ink-muted">
        <h5 id="tc-sources" className="font-semibold">
          Sources
        </h5>
        <ul className="mt-1 flex flex-col gap-0.5">
          {d.sources.map((s) => (
            <li key={s.id}>
              {s.url ? (
                <a href={s.url} className="underline" target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}{" "}
              ({s.owner})
            </li>
          ))}
        </ul>
        <p className="mt-1">
          Versions: {d.versions.trust} · {d.versions.rubric} · {d.versions.engine} · scenario {d.versions.scenario} · rules {d.versions.rules}
        </p>
      </section>
      <button type="button" className={cx(secondary, "w-fit")} disabled={busy} onClick={onRetry}>
        <Icon name="refresh" className="size-4" /> Try again
      </button>
    </div>
  );
}
