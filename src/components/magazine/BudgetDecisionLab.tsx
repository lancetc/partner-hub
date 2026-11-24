"use client";

import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { BudgetLabBlock } from "@/lib/magazine";
import {
  availabilityOf,
  buildDebrief,
  emptyState,
  fill,
  LAST,
  LEVELS,
  projectionFor,
  startProjection,
  STEPS,
  stepProblems,
  twistOf,
  type Debrief,
  type LabState,
  type Question,
} from "@/lib/budgetLab";
import { BASES, inWindow, money, NEEDS_CHECKING, PRACTICE_LABEL, sessionCost, showDate, type Projection, type Service } from "@/lib/quarterBudget";
import { quarterRules } from "@/lib/quarterEndRules";
import { CATEGORIES } from "@/lib/sandbox";
import type { BudgetLabView } from "@/server/budgetLab";
import { RichText } from "../RichText";
import { Icon } from "../Icon";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import { AidSection } from "../playbooks/AidSection";

/*
  The Quarterly Budget Decision Lab, as learners use it (docs/budget-decision-lab.md). A decision rehearsal, not a game:
  five steps, with the budget strip (current, booked, projected, threshold, above it, her contribution) always on screen
  and every figure labelled. Each change is announced in a sentence; sessions are buttons and date choices, never a drag;
  status is in words and an icon, never colour alone; the projection has a table. The same component renders in a
  Magazine article and on a Topic card (TopicBudgetLab, below), against the same block and attempt.

  In the editor's preview it runs against the block as written, computes the same debrief, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const stop = "bg-[#fde2e0] text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]";
const good = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";

export function BudgetDecisionLab({
  block: b,
  guideId,
  preview = false,
  place = "magazine",
  onFinished,
}: {
  block: BudgetLabBlock;
  guideId: string;
  preview?: boolean;
  place?: string;
  onFinished?: (d: Debrief) => void;
}) {
  const url = `/api/magazine/${guideId}/budgetlab`;
  const loaded = useApi<BudgetLabView>(preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<LabState | null>(preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [meta, setMeta] = useState<Pick<BudgetLabView, "status" | "attemptId" | "earlierCase" | "rules" | "attempts"> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const viewed = useRef(false);

  if (!preview && loaded.data && s === null) {
    setS(loaded.data.state);
    setDebrief(loaded.data.debrief);
    setMeta(loaded.data);
  }
  useEffect(() => {
    if (preview || !s || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api<BudgetLabView>(url, { body: { blockId: b.id, state: s, place } })
        .then((v) => setMeta(v))
        .catch(() => undefined);
    }, 700);
    return () => clearTimeout(t);
  }, [s, preview, url, b.id, place]);
  // Completion needs the feedback viewed: once the debrief is on screen, say so (once).
  useEffect(() => {
    if (!debrief || viewed.current) return;
    viewed.current = true;
    if (preview) {
      onFinished?.(debrief);
      return;
    }
    if (meta?.status === "completed") return;
    api<BudgetLabView>(url, { body: { action: "viewed", blockId: b.id } })
      .then((v) => {
        setMeta(v);
        onFinished?.(debrief);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debrief]);

  if (!preview && loaded.error)
    return (
      <Shell b={b}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!s)
    return (
      <Shell b={b}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  const name = b.story.participant;
  const start = startProjection(b, s.twist);
  const plan = projectionFor(b, s);
  const twist = twistOf(b, s.twist);
  const avail = availabilityOf(b, s.twist);

  const change = (fn: (prev: LabState) => LabState, announce?: (next: LabState) => string) => {
    dirty.current = true;
    setS((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (announce) setSaid(announce(next));
      return next;
    });
  };
  const open = (what: string) => !s.opened.includes(what) && change((p) => ({ ...p, opened: [...p.opened, what] }));
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      const problems = (e as { problems?: string[] }).problems;
      setProblem(problems?.length ? problems.join(" ") : e instanceof Error ? e.message : "That didn’t work. Your attempt is still here.");
    } finally {
      setBusy(false);
    }
  };
  const focusTop = () => requestAnimationFrame(() => top.current?.focus());
  const go = (step: number) =>
    run(async () => {
      const p = step > s.stage ? stepProblems(b, s, step) : [];
      if (p.length) throw new Error(`Not yet. ${p.join(" ")}`);
      const next = { ...s, stage: step };
      if (preview) setS(next);
      else {
        dirty.current = false;
        const v = await api<BudgetLabView>(url, { body: { blockId: b.id, state: next, place } });
        setS(v.state);
        setMeta(v);
      }
      focusTop();
    });
  const announcePlan = (label: string) => (next: LabState) => {
    const after = projectionFor(b, next);
    return `${label}. Projected balance at quarter end: ${money(after.projectedBalanceCents)} (was ${money(plan.projectedBalanceCents)}). Current balance unchanged at ${money(after.actualAvailableCents)}.`;
  };
  const toggleSession = (svc: Service, date: string, review = false) => {
    const on = s.proposed.some((p) => p.serviceId === svc.id && p.date === date);
    change(
      (p) => ({
        ...p,
        unchanged: false,
        proposed: on
          ? p.proposed.filter((x) => !(x.serviceId === svc.id && x.date === date))
          : [...p.proposed, { serviceId: svc.id, date, ...(review && { review: true }) }],
      }),
      announcePlan(
        `${svc.name}, ${showDate(date)}: ${on ? "taken out of the plan" : review ? "care plan review requested (not a session)" : svc.approved && svc.agreed !== "no" ? "proposed" : "added, unresolved"}`,
      ),
    );
  };
  const submit = () =>
    run(async () => {
      const p = stepProblems(b, s, LAST);
      if (p.length) throw new Error(`Not yet. ${p.join(" ")}`);
      if (preview) {
        const done = { ...s, stage: LAST };
        setS(done);
        setDebrief(buildDebrief(b, done));
      } else {
        dirty.current = false;
        await api(url, { body: { blockId: b.id, state: s, place } });
        const v = await api<BudgetLabView>(url, {
          body: { action: "submit", blockId: b.id, explanation: s.explanation, nextStep: s.nextStep, reason: s.reason },
        });
        setS(v.state);
        setMeta(v);
        setDebrief(v.debrief);
      }
      focusTop();
    });
  const retry = () =>
    run(async () => {
      viewed.current = false;
      if (preview) {
        const n = s.retries + 1;
        const t = b.twists.length ? b.twists[(n - 1) % b.twists.length].id : "";
        setS({ ...emptyState(), twist: t, retries: n });
      } else {
        const v = await api<BudgetLabView>(url, { body: { action: "retry", blockId: b.id, from: meta?.attemptId, place } });
        setS(v.state);
        setMeta(v);
      }
      setDebrief(null);
      setSaid("");
      focusTop();
    });

  const reviewRequired = meta?.rules.status === "review-required";
  return (
    <Shell b={b}>
      {reviewRequired && (
        <p className={cx(warn, "mb-3 rounded-2xl px-4 py-2 text-sm font-semibold")}>
          <Icon name="alert" className="mr-1 inline size-4" /> Review required: the rules behind this practice case are being reviewed. Treat it as practice
          only.
        </p>
      )}
      {!preview && meta?.earlierCase && (
        <p className="mb-3 rounded-2xl bg-muted px-4 py-2 text-sm">
          This case has been updated since your attempt began. Your attempt keeps the version it started with.
        </p>
      )}
      <BudgetStrip p={s.stage >= 2 ? plan : start} b={b} label={s.stage >= 2 ? "With your plan" : "Booked schedule"} />
      {twist && (
        <p className={cx(box, "mt-3 text-sm")}>
          <strong>What’s different this time: {twist.label}.</strong> {twist.text}
        </p>
      )}
      <Stepper stage={s.stage} done={Boolean(debrief)} onGo={(i) => (i < s.stage ? void go(i) : undefined)} />
      <h4 ref={top} tabIndex={-1} className="mt-4 font-serif text-xl font-semibold outline-none">
        Step {Math.min(s.stage, LAST) + 1} of {STEPS.length}: {STEPS[s.stage].replace("her", name)}
      </h4>
      <p aria-live="polite" className="mt-1 min-h-6 text-sm font-semibold">
        {said}
      </p>

      {s.stage === 0 && (
        <section aria-label="Read the picture">
          <Story b={b} />
          <p className="mt-4 font-semibold">Open the documents before you decide. The statement and the care plan are required.</p>
          <div className="mt-2 flex flex-col gap-2">
            <Drawer id="statement" title="Practice statement (training snapshot)" opened={s.opened} onOpen={open}>
              <Statement b={b} p={start} />
            </Drawer>
            <Drawer id="schedule" title="Service schedule: the days left" opened={s.opened} onOpen={open}>
              <ProjectionTable p={start} name={name} caption="Booked sessions for the days left in the quarter" />
            </Drawer>
            {b.documents.map((d) => (
              <Drawer key={d.id} id={d.id} title={d.title} opened={s.opened} onOpen={open}>
                <RichText text={d.body} />
              </Drawer>
            ))}
          </div>
          {b.read.map((q) => (
            <Choice
              key={q.id}
              q={q}
              p={start}
              name={name}
              value={s.answers[q.id] ?? ""}
              onPick={(v) => change((p) => ({ ...p, answers: { ...p.answers, [q.id]: v } }))}
            />
          ))}
          <Nav problem={problem} busy={busy} onNext={() => void go(1)} next={`Next: ${STEPS[1].replace("her", name)}`} />
        </section>
      )}

      {s.stage === 1 && (
        <section aria-label={`Check with ${name}`}>
          <blockquote className={cx(box, "text-lg")}>
            <span className="block text-sm font-semibold text-ink-muted">
              {b.story.supporter.name}, {name}’s {b.story.supporter.relation}:
            </span>
            {b.story.supporter.request}
          </blockquote>
          <p className="mt-3 text-sm">{b.story.decisionMaker}</p>
          <Choice q={b.conversation} p={start} name={name} value={s.conversation} onPick={(v) => change((p) => ({ ...p, conversation: v }))} />
          {s.conversation && (
            <div className={cx(box, "mt-3 flex gap-3")}>
              <CharacterPortrait name={name} size="sm" />
              <div>
                <p className="font-semibold">{name} says</p>
                <p className="mt-1 text-lg">{b.story.reply}</p>
              </div>
            </div>
          )}
          <Nav problem={problem} busy={busy} onBack={() => void go(0)} onNext={() => void go(2)} next={`Next: ${STEPS[2]}`} />
        </section>
      )}

      {s.stage === 2 && (
        <section aria-label="Build a possible plan">
          <p className="text-sm">
            Add, take out or move discrete sessions on the dates a supplier can deliver ({plan.days.left} days left, to{" "}
            {showDate(b.figures.quarter.end, { year: true })}). A proposed session changes the projection only: nothing is booked, spent or claimed here.
          </p>
          <Goals b={b} />
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {b.services
              .filter((svc) => svc.route === "ongoing")
              .map((svc) => (
                <ServiceCard key={svc.id} b={b} svc={svc} s={s} dates={avail(svc).filter((x) => inWindow(b.figures, x))} onToggle={toggleSession} />
              ))}
          </ul>
          <label className={cx(box, "mt-3 flex min-h-11 items-start gap-3")}>
            <input
              type="checkbox"
              className="mt-1 size-5"
              disabled={s.proposed.length > 0}
              checked={s.unchanged && !s.proposed.length}
              onChange={(e) =>
                change(
                  (p) => ({ ...p, unchanged: e.target.checked }),
                  () => (e.target.checked ? "Leaving the plan unchanged, on purpose." : ""),
                )
              }
            />
            <span>
              <span className="font-semibold">Leave the plan unchanged, on purpose</span>
              <span className="block text-sm text-ink-muted">
                When nothing more is wanted or can be delivered, that can be the right plan. You’ll explain what may not carry over.
              </span>
            </span>
          </label>
          <Lanes b={b} p={plan} />
          <Choice q={b.equipment} p={plan} name={name} value={s.equipment} onPick={(v) => change((p) => ({ ...p, equipment: v }))} />
          <Summary b={b} p={plan} s={s} />
          <Nav problem={problem} busy={busy} onBack={() => void go(1)} onNext={() => void go(3)} next={`Next: ${STEPS[3]}`} />
        </section>
      )}

      {s.stage === 3 && (
        <section aria-label="Explain and record">
          <Summary b={b} p={plan} s={s} open />
          <Choice q={b.explanation} p={plan} name={name} value={s.explanation} onPick={(v) => change((p) => ({ ...p, explanation: v }))} />
          <Choice q={b.nextStep} p={plan} name={name} value={s.nextStep} onPick={(v) => change((p) => ({ ...p, nextStep: v }))} />
          <label className="mt-4 block font-semibold" htmlFor={`${b.id}-reason`}>
            Your reason, in your own words
          </label>
          <p className="text-sm text-ink-muted">
            Why this plan: a sentence or two, not just a dollar figure. It’s private to you, and never in reports. Any figure you quote is checked against the
            projection.
          </p>
          <textarea
            id={`${b.id}-reason`}
            className="mt-1 min-h-28 w-full rounded-2xl border border-line-strong bg-bg px-3 py-2"
            maxLength={2000}
            value={s.reason}
            onChange={(e) => change((p) => ({ ...p, reason: e.target.value }))}
          />
          <Nav problem={problem} busy={busy} onBack={() => void go(2)} onNext={() => void submit()} next="Submit and see the consequences" />
        </section>
      )}

      {s.stage === LAST && debrief && (
        <DebriefView b={b} d={debrief} place={place} guideId={guideId} preview={preview} onRetry={() => void retry()} busy={busy} />
      )}
      {s.stage === LAST && !debrief && <p className="mt-3 text-ink-muted">Loading the feedback…</p>}
      {preview && <p className="mt-3 text-sm text-ink-muted">Preview: the same calculation and feedback as learners get. Nothing is recorded.</p>}
      {!preview && (
        <p className="mt-3 text-xs text-ink-muted">Your practice attempt is saved as you go. It’s fictional: no real plan, booking or claim is changed.</p>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------------------------

function Shell({ b, children }: { b: BudgetLabBlock; children: React.ReactNode }) {
  return (
    <section
      aria-label={`Quarterly Budget Decision Lab: ${b.title}`}
      className="mx-auto w-full max-w-[72rem] rounded-3xl border border-line-strong bg-surface p-4 sm:p-7"
    >
      <p className="mb-2 flex flex-wrap items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="money" className="size-5" /> Quarterly Budget Decision Lab
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">
        {PRACTICE_LABEL}. Illustrative training figures only: not a client record, an approved service plan or a live budget.
      </p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The budget strip: each figure with its label, a definition, and its source. Labels stay visible at any width. */
function BudgetStrip({ p, b, label }: { p: Projection; b: BudgetLabBlock; label: string }) {
  const rules = quarterRules(b.ruleSetId);
  const items: [string, number, string, string?][] = [
    [
      "Current balance (actual)",
      p.actualAvailableCents,
      `What’s in ${b.story.participant}’s direct-service balance on ${showDate(b.figures.snapshot, { year: true })}.`,
    ],
    ["Booked estimate", p.bookedEstimateCents, "Agreed sessions for the days left: their government-funded share. Not spent or claimed until delivered."],
    ...(p.proposedEstimateCents
      ? ([["Your proposed sessions", p.proposedEstimateCents, "Sessions you’ve proposed: an estimate."]] as [string, number, string][])
      : []),
    ["Projected at quarter end", p.projectedBalanceCents, "If every booked and proposed session happens as estimated. A projection, not a fact.", "strong"],
    ["Carryover threshold", p.threshold.cents, p.threshold.text],
    ["Projected above the threshold", p.projectedAboveThresholdCents, "Likely not to carry over. Information to explain, not a target."],
  ];
  return (
    <section aria-label="Budget strip" className={cx(box, "lg:sticky lg:top-20 lg:z-10")}>
      <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
        <span>
          {b.story.participant}’s quarter: {showDate(b.figures.quarter.start, { weekday: false })} to{" "}
          {showDate(b.figures.quarter.end, { weekday: false, year: true })} ({p.days.quarter} days) · {p.days.left} days left
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{label}</span>
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map(([k, v, def, em]) => (
          <div key={k} className={cx("rounded-xl p-2", em ? "bg-tealtint ring-2 ring-action" : "bg-surface ring-1 ring-line")}>
            <dt className="text-xs font-semibold leading-tight">{k}</dt>
            <dd className="font-serif text-xl font-semibold tabular-nums motion-safe:transition-all">{money(v)}</dd>
            <dd className="text-xs leading-snug text-ink-muted">{def}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-muted">
        {p.contribution.complete
          ? `${b.story.participant}’s estimated contributions on these sessions: ${money(p.contribution.knownCents)}, paid as they’re delivered, not from the balance.`
          : `${b.story.participant}’s contribution ${NEEDS_CHECKING} for ${p.contribution.unknown.join(", ")}. Known so far: ${money(p.contribution.knownCents)}.`}{" "}
        {BASES[b.figures.basis]}. Rules: {rules?.label ?? b.ruleSetId}, effective {showDate(p.effectiveDate, { weekday: false, year: true })}.
      </p>
    </section>
  );
}

function Stepper({ stage, done, onGo }: { stage: number; done: boolean; onGo: (i: number) => void }) {
  return (
    <ol className="mt-3 flex flex-wrap gap-1 text-sm" aria-label="Steps">
      {STEPS.map((label, i) => {
        const state = i < stage || (done && i === stage) ? "done" : i === stage ? "current" : "not yet";
        return (
          <li key={label}>
            <button
              type="button"
              aria-current={i === stage ? "step" : undefined}
              disabled={i >= stage}
              onClick={() => onGo(i)}
              className={cx(
                "flex min-h-10 items-center gap-1 rounded-full border px-3",
                state === "current" ? "border-action bg-tealtint font-semibold" : "border-line-strong",
                i < stage && "hover:bg-muted",
              )}
            >
              <Icon name={state === "done" ? "check" : state === "current" ? "arrow-right" : "lock"} className="size-3.5" />
              <span className="sr-only">{state}: </span>
              {i + 1}. {label.replace("her", "the person")}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Story({ b }: { b: BudgetLabBlock }) {
  return (
    <div className={cx(box, "flex flex-col gap-3 sm:flex-row")}>
      <CharacterPortrait name={b.story.participant} size="md" />
      <div>
        <p>{b.story.about}</p>
        <Goals b={b} />
      </div>
    </div>
  );
}

function Goals({ b }: { b: BudgetLabBlock }) {
  return (
    <div className="mt-2">
      <p className="text-sm font-semibold">{b.story.participant}’s goals, in her own words</p>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {b.story.goals.map((g) => (
          <li key={g.id}>
            “{g.text}”{g.priority && <span className="ml-1 rounded-full bg-tealtint px-2 text-xs font-semibold">matters most</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Drawer({
  id,
  title,
  opened,
  onOpen,
  children,
}: {
  id: string;
  title: string;
  opened: string[];
  onOpen: (x: string) => void;
  children: React.ReactNode;
}) {
  const seen = opened.includes(`doc:${id}`);
  return (
    <details className={box} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onOpen(`doc:${id}`)}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
        <Icon name={seen ? "circle-check" : "file"} className="size-4" />
        {title}
        <span className="text-xs font-normal text-ink-muted">{seen ? "(opened)" : "(not opened yet)"}</span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function Statement({ b, p }: { b: BudgetLabBlock; p: Projection }) {
  const f = b.figures;
  const rows: [string, string][] = [
    [
      "Quarter",
      `${showDate(f.quarter.start, { year: true })} to ${showDate(f.quarter.end, { year: true })}, ${p.days.quarter} days. Snapshot ${showDate(f.snapshot, { year: true })}.`,
    ],
    [
      f.classificationLabel || "Quarterly budget",
      `${money(f.quarterlyBudgetCents)} including supplements${f.supplementsCents ? ` (${money(f.supplementsCents)})` : " (none apply)"}`,
    ],
    ["Care management", BASES[f.basis]],
    ["Direct-service balance (actual)", money(p.actualAvailableCents)],
    ["Booked to quarter end (estimate)", `${money(p.bookedEstimateCents)} government-funded share; ${money(p.fullPriceCents)} at full price`],
    [
      "Estimated contributions on bookings",
      p.contribution.complete ? money(p.contribution.knownCents) : `${NEEDS_CHECKING} (${money(p.contribution.knownCents)} known)`,
    ],
    ["Contribution basis", b.ratesBasis],
    ["Other funding", "No AT–HM allocation, unspent HCP funds or short-term funds in this case. They’d be separate pools with their own rules."],
  ];
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">Practice statement</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-line align-top">
            <th scope="row" className="py-1.5 pr-3 font-semibold">
              {k}
            </th>
            <td className="py-1.5 tabular-nums">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STATUS: Record<string, { label: string; icon: "calendar" | "plus" | "alert" | "flag" | "minus" }> = {
  booked: { label: "Booked (estimate)", icon: "calendar" },
  proposed: { label: "Proposed", icon: "plus" },
  unresolved: { label: "Unresolved: not counted", icon: "alert" },
  review: { label: "Review requested: not a session", icon: "flag" },
  cancelled: { label: "Cancelled: not counted", icon: "minus" },
};

/** The projection as a table: the text alternative to the strip, line by line. */
function ProjectionTable({ p, name, caption }: { p: Projection; name: string; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="mb-1 text-left font-semibold">{caption}</caption>
        <thead>
          <tr className="border-b border-line-strong">
            <th scope="col" className="py-1 pr-2">
              Date
            </th>
            <th scope="col" className="py-1 pr-2">
              Service
            </th>
            <th scope="col" className="py-1 pr-2">
              Status
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              Full price
            </th>
            <th scope="col" className="py-1 pr-2 text-right">
              {name}’s contribution
            </th>
            <th scope="col" className="py-1 text-right">
              From the balance
            </th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l) => (
            <tr key={l.key} className="border-b border-line align-top">
              <td className="py-1 pr-2 whitespace-nowrap">{showDate(l.date)}</td>
              <td className="py-1 pr-2">
                {l.name}
                <span className="block text-xs text-ink-muted">{CATEGORIES[l.cost.category]}</span>
              </td>
              <td className="py-1 pr-2">
                <Icon name={STATUS[l.status].icon} className="mr-1 inline size-3.5" />
                {STATUS[l.status].label}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{money(l.cost.fullCents)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{l.cost.contributionCents === null ? NEEDS_CHECKING : money(l.cost.contributionCents)}</td>
              <td className="py-1 text-right tabular-nums">
                {l.status === "booked" || l.status === "proposed" ? money(l.cost.governmentCents) : "not counted"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td colSpan={3} className="py-1">
              Counted in the projection
            </td>
            <td className="py-1 pr-2 text-right tabular-nums">{money(p.fullPriceCents)}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{p.contribution.complete ? money(p.contribution.knownCents) : NEEDS_CHECKING}</td>
            <td className="py-1 text-right tabular-nums">{money(p.scheduledEstimatedCents)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ServiceCard({
  b,
  svc,
  s,
  dates,
  onToggle,
}: {
  b: BudgetLabBlock;
  svc: Service;
  s: LabState;
  dates: string[];
  onToggle: (svc: Service, date: string, review?: boolean) => void;
}) {
  const cost = sessionCost(b, svc, dates[0] ?? b.figures.snapshot);
  const mine = s.proposed.filter((p) => p.serviceId === svc.id);
  return (
    <li className={cx(box, "flex flex-col gap-2")}>
      <p className="font-semibold">{svc.name}</p>
      <p className="text-sm">{svc.purpose}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="font-semibold">Approval</dt>
        <dd>
          <Icon name={svc.approved ? "circle-check" : "alert"} className="mr-1 inline size-3.5" />
          {svc.approved ? "In the approved care plan" : "Not in the approved care plan"}
        </dd>
        <dt className="font-semibold">Price</dt>
        <dd className="tabular-nums">
          {money(cost.fullCents)} a session ({svc.unitsEach} {svc.unit}
          {svc.unitsEach === 1 ? "" : "s"} at {money(svc.unitPriceCents)})
        </dd>
        <dt className="font-semibold">Contribution</dt>
        <dd>
          {cost.contributionCents === null
            ? `${NEEDS_CHECKING}: ${cost.why}`
            : `${money(cost.contributionCents)} a session (${CATEGORIES[cost.category]}, ${(cost.rateBp ?? 0) / 100}%)`}
        </dd>
        <dt className="font-semibold">Funding</dt>
        <dd>Ongoing quarterly budget</dd>
        <dt className="font-semibold">Supplier</dt>
        <dd>{svc.supplier}</dd>
      </dl>
      {s.stage >= 2 && svc.says && (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm">
          <span className="font-semibold">{b.story.participant}:</span> {svc.says}
        </p>
      )}
      {dates.length ? (
        <div role="group" aria-label={`${svc.name}: sessions`} className="flex flex-wrap gap-2">
          {dates.map((d) => {
            const on = mine.some((p) => p.date === d && !p.review);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(svc, d)}
                disabled={mine.some((p) => p.date === d && p.review)}
                className={cx(
                  "min-h-11 rounded-full border px-3 text-sm",
                  on ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted",
                )}
              >
                <Icon name={on ? "check" : "plus"} className="mr-1 inline size-3.5" />
                {on ? `Session on ${showDate(d)}` : `Add ${showDate(d)}`}
              </button>
            );
          })}
          {!svc.approved && (
            <button
              type="button"
              aria-pressed={mine.some((p) => p.review)}
              onClick={() => onToggle(svc, dates[0], true)}
              disabled={mine.some((p) => !p.review)}
              className={cx(
                "min-h-11 rounded-full border px-3 text-sm",
                mine.some((p) => p.review) ? "border-action bg-tealtint font-semibold" : "border-line-strong hover:bg-muted",
              )}
            >
              <Icon name="flag" className="mr-1 inline size-3.5" /> Request a care plan review instead
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No new sessions can be delivered before the quarter ends.</p>
      )}
      {mine.some((p) => !p.review && (!svc.approved || svc.agreed === "no")) && (
        <p className={cx(warn, "rounded-xl px-3 py-2 text-sm")}>
          <Icon name="alert" className="mr-1 inline size-3.5" />
          Unresolved: {!svc.approved ? "not in the approved care plan" : `${b.story.participant} hasn’t agreed to this`}. It isn’t counted in the projection.
        </p>
      )}
      <p className="text-xs text-ink-muted">Price source: {svc.priceSource}</p>
    </li>
  );
}

/** Funding lanes: ongoing, AT–HM and HCP, only as present. A contribution category isn't a pool of money. */
function Lanes({ b, p }: { b: BudgetLabBlock; p: Projection }) {
  const item = b.services.find((x) => x.route === "at-hm");
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className={box}>
        <p className="font-semibold">Ongoing services</p>
        <p className="text-sm">
          Current {money(p.actualAvailableCents)} · projected {money(p.projectedBalanceCents)} · up to {money(p.threshold.cents)} carries over
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Clinical Supports, Independence and Everyday Living are contribution categories within this one pool, not separate money.
        </p>
      </div>
      <div className={box}>
        <p className="font-semibold">AT–HM (assistive technology and home modifications)</p>
        <p className="text-sm">
          {p.pools.atHmCents === null ? "No AT–HM allocation in this case." : `${money(p.pools.atHmCents)} allocated.`} Never drawn from the ongoing budget.
        </p>
        {item && (
          <p className="mt-1 text-sm">
            <Icon name="lock" className="mr-1 inline size-3.5" />
            {item.name} ({money(item.unitPriceCents)}, fictional): {b.story.equipment} Can’t be added to ongoing spend.
          </p>
        )}
        {p.pools.hcpUnspentCents === null && <p className="mt-1 text-xs text-ink-muted">No unspent HCP funds in this case.</p>}
      </div>
    </div>
  );
}

/** The decision summary: actual against projected, her choice, what's unknown, and what will be documented. */
function Summary({ b, p, s, open }: { b: BudgetLabBlock; p: Projection; s: LabState; open?: boolean }) {
  const checks = p.checks.filter((c) => c.severity !== "info" || c.code === "ABOVE_THRESHOLD_NOT_TARGET");
  return (
    <details className={cx(box, "mt-4")} open={open}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">Decision summary and the projection table</summary>
      <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="font-semibold">Actual now</dt>
        <dd>{money(p.actualAvailableCents)} (unchanged by any booking or proposal)</dd>
        <dt className="font-semibold">Projected at quarter end</dt>
        <dd>
          {money(p.projectedBalanceCents)}: up to {money(p.projectedCarryoverCents)} carries over, about {money(p.projectedAboveThresholdCents)} above the
          threshold
        </dd>
        <dt className="font-semibold">{b.story.participant}’s choice</dt>
        <dd>{s.conversation ? "In her words, at step 2." : "Not asked yet."}</dd>
        <dt className="font-semibold">Unknowns and checks</dt>
        <dd>
          {checks.length ? (
            <ul className="list-disc pl-5">
              {checks.map((c, i) => (
                <li key={i}>
                  <span className="font-semibold">{c.result === "unresolved" ? "Unresolved" : c.severity === "critical" ? "Stop" : "Note"}:</span> {c.text}
                </li>
              ))}
            </ul>
          ) : (
            "Nothing unresolved."
          )}
        </dd>
      </dl>
      <div className="mt-3">
        <ProjectionTable p={p} name={b.story.participant} caption="Sessions to quarter end, with your plan" />
      </div>
    </details>
  );
}

function Choice({ q, p, name, value, onPick }: { q: Question; p: Projection; name: string; value: string; onPick: (v: string) => void }) {
  return (
    <fieldset className="mt-4">
      <legend className="font-semibold">{fill(q.prompt, p, name)}</legend>
      <div className="mt-2 flex flex-col gap-2">
        {q.options.map((o) => (
          <label
            key={o.id}
            className={cx(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2",
              value === o.id ? "border-action bg-tealtint" : "border-line-strong",
            )}
          >
            <input type="radio" name={q.id} className="mt-1 size-5" checked={value === o.id} onChange={() => onPick(o.id)} />
            <span>{fill(o.text, p, name)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Nav({ problem, busy, onBack, onNext, next }: { problem: string | null; busy: boolean; onBack?: () => void; onNext: () => void; next: string }) {
  return (
    <>
      {problem && (
        <p role="alert" className={cx(warn, "mt-3 rounded-2xl p-3")}>
          {problem}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {onBack && (
          <button type="button" className={secondary} disabled={busy} onClick={onBack}>
            <Icon name="arrow-left" className="size-4" /> Back
          </button>
        )}
        <button type="button" className={primary} disabled={busy} onClick={onNext}>
          {next} <Icon name="arrow-right" className="size-4" />
        </button>
      </div>
    </>
  );
}

function DebriefView({
  b,
  d,
  place,
  guideId,
  preview,
  onRetry,
  busy,
}: {
  b: BudgetLabBlock;
  d: Debrief;
  place: string;
  guideId: string;
  preview: boolean;
  onRetry: () => void;
  busy: boolean;
}) {
  const name = b.story.participant;
  return (
    <section aria-label="The consequences" className="flex flex-col gap-4">
      {d.unsafe && (
        <p role="alert" className={cx(stop, "rounded-2xl p-3 font-semibold")}>
          <Icon name="alert" className="mr-1 inline size-4" /> A critical error needs resolving:{" "}
          {d.flags
            .filter((f) => f.critical)
            .map((f) => f.text.toLowerCase())
            .join("; ")}
          .{d.mode === "assessed" ? " It prevents a pass, whatever the score." : " In an assessed version it would prevent a pass, whatever the score."}
        </p>
      )}
      <div className={box}>
        <p className="font-semibold">What your plan does</p>
        <p className="mt-1">{d.endingText}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Compare label="Before your plan" p={d.start} />
          <Compare label="With your plan" p={d.plan} />
        </div>
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">The projection, line by line</summary>
          <ProjectionTable p={d.plan} name={name} caption="Your plan to quarter end" />
        </details>
      </div>
      <div className={box}>
        <p className="font-semibold">
          Practice rubric: {d.score} of {d.max}
          {d.passed === null
            ? " (practice: a score is evidence of practice, not of performance)"
            : d.passed
              ? " · passed"
              : ` · not passed (pass mark ${d.passMark}, with no critical error)`}
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {d.dims.map((x) => (
            <li key={x.dim} className="text-sm">
              <span className="font-semibold">
                {x.label}: {LEVELS[x.rating]} ({x.rating} of 3).
              </span>{" "}
              {x.why}
            </li>
          ))}
        </ul>
        {d.flags.length > 0 && (
          <>
            <p className="mt-3 font-semibold">To look at again</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {d.flags.map((f) => (
                <li key={f.id}>
                  <Icon name={f.critical ? "alert" : "flag"} className="mr-1 inline size-3.5" />
                  {f.critical && <span className="font-semibold">Critical: </span>}
                  {f.text}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className={box}>
        <p className="font-semibold">Your choices, with feedback</p>
        <dl className="mt-2 flex flex-col gap-2 text-sm">
          {[
            ...d.answers.map((a) => [a.prompt, a.text, a.feedback]),
            [`Checking with ${name}`, d.conversation.text, d.conversation.feedback],
            ["The equipment route", d.equipment.text, d.equipment.feedback],
            [`Explaining it to ${name}`, d.explanation.text, d.explanation.feedback],
            ["What you’ll record and check", d.nextStep.text, d.nextStep.feedback],
          ].map(([q, a, f], i) => (
            <div key={i}>
              <dt className="font-semibold">{q}</dt>
              <dd>You chose: {a}</dd>
              <dd className="text-ink-muted">{f}</dd>
            </div>
          ))}
        </dl>
        {(d.reason.unsupported.length > 0 || d.reason.avoided.length > 0) && (
          <p className={cx(warn, "mt-2 rounded-xl px-3 py-2 text-sm")}>
            Your reason: {d.reason.unsupported.length ? `${d.reason.unsupported.join(", ")} isn’t a figure in the projection. ` : ""}
            {d.reason.avoided.map((a) => `“${a.phrase}”: ${a.why}`).join(" ")}
          </p>
        )}
      </div>
      <div className={box}>
        <p className="font-semibold">{name}’s priorities</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {d.priorities.map((x) => (
            <li key={x.text}>
              <Icon name={x.kept ? "circle-check" : "alert"} className="mr-1 inline size-3.5" />“{x.text}”: {x.note}
            </li>
          ))}
        </ul>
      </div>
      {d.summary && <p className={cx(good, "rounded-2xl p-3")}>{d.summary}</p>}
      {b.jobAid.snippetId && (
        <div>
          <p className="mb-2 text-sm font-semibold">For a real participant: the Quarterly Budget Check</p>
          <AidSection snippetId={b.jobAid.snippetId} why={b.jobAid.why} place={place.startsWith("topic:") ? place : `magazine:${guideId}`} preview={preview} />
        </div>
      )}
      {b.sources.length > 0 && (
        <details className={box}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Current guidance and sources</summary>
          <ul className="list-disc pl-5 text-sm">
            {b.sources.map((x) => (
              <li key={x.url}>
                <a href={x.url} target="_blank" rel="noreferrer" className="underline">
                  {x.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-ink-muted">
        Versions: scenario {d.versions.scenario}, rules {d.versions.ruleSet}, rubric {d.versions.rubric}, model {d.versions.model}.{" "}
        {d.twist ? `Variation: ${d.twist.label}.` : ""}
      </p>
      <div>
        <button type="button" className={secondary} disabled={busy} onClick={onRetry}>
          <Icon name="refresh" className="size-4" /> Try again with a variation
        </button>
        <p className="mt-1 text-xs text-ink-muted">A new attempt with something changed. This one is kept as it is.</p>
      </div>
    </section>
  );
}

function Compare({ label, p }: { label: string; p: Projection }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 rounded-xl bg-surface p-3 text-sm ring-1 ring-line">
      <dt className="col-span-2 font-semibold">{label}</dt>
      <dt>Current (actual)</dt>
      <dd className="text-right tabular-nums">{money(p.actualAvailableCents)}</dd>
      <dt>Booked and proposed (estimate)</dt>
      <dd className="text-right tabular-nums">{money(p.scheduledEstimatedCents)}</dd>
      <dt className="font-semibold">Projected</dt>
      <dd className="text-right font-semibold tabular-nums">{money(p.projectedBalanceCents)}</dd>
      <dt>Projected carryover</dt>
      <dd className="text-right tabular-nums">{money(p.projectedCarryoverCents)}</dd>
      <dt>Above the threshold</dt>
      <dd className="text-right tabular-nums">{money(p.projectedAboveThresholdCents)}</dd>
      <dt>Contributions (estimate)</dt>
      <dd className="text-right tabular-nums">{p.contribution.complete ? money(p.contribution.knownCents) : NEEDS_CHECKING}</dd>
    </dl>
  );
}

/**
  A lab placed on a Topic card by reference (lessons.ts `labRef`): the published Magazine block, its rules and the
  learner's own attempt, loaded from the course. Shown only to people who can read that course.
*/
export function TopicBudgetLab({ guide, block, why, topic }: { guide: string; block: string; why?: string; topic: string }) {
  const loaded = useApi<BudgetLabView>(`/api/magazine/${encodeURIComponent(guide)}/budgetlab?block=${encodeURIComponent(block)}&embed=1`);
  if (loaded.error) return <p className="rounded-2xl bg-muted px-4 py-3 text-sm">This practice lab isn’t available to you here. {loaded.error}</p>;
  const v = loaded.data;
  if (!v?.block || !v.guideId) return <div aria-hidden className="h-40 w-full animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />;
  return (
    <div className="text-left">
      {why && <p className="mb-2 text-sm font-semibold">{why}</p>}
      <BudgetDecisionLab block={v.block} guideId={v.guideId} place={`topic:${topic}`} />
    </div>
  );
}
