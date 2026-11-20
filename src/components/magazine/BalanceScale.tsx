"use client";

import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { BalanceBlock } from "@/lib/magazine";
import {
  advance,
  applyChanges,
  BALANCE_NOTICE,
  buildDebrief,
  EFFECTS,
  emptyState,
  finishProblems,
  GROUPS,
  learnerView,
  NOT_SIGNOFF,
  PANS,
  RISK_KINDS,
  SAYING_KINDS,
  scoreBalance,
  seeEvent,
  STAGES,
  URGENCY,
  type BalanceDebrief,
  type BalanceState,
  type Group,
  type RiskKind,
  type Scale,
  type TensionFeedback,
} from "@/lib/balance";
import type { balanceState } from "@/server/balance";
import { Icon } from "../Icon";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  Dignity of Risk Balance Scale (docs/balance-scale.md). The beam is decoration: everything it shows is also
  said in words beside it, it only moves when the plan changes, and it doesn't move at all for people who've
  asked for reduced motion. Every card is a button. Nothing is timed.

  In the editor's preview it runs against the block as written and stores nothing.
*/

type Loaded = ReturnType<typeof balanceState>;
type Known = ReturnType<typeof learnerView>;
type Change = (patch: Partial<BalanceState> | ((prev: BalanceState) => Partial<BalanceState>)) => void;
const NOTHING: Known = { scale: null, responses: {}, answers: {}, event: null, saying: null };
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const good = "rounded-2xl bg-[#e3f4ea] p-4 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

export function BalanceScale({ block: b, ctx }: { block: BalanceBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/balance`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<BalanceState | null>(ctx.preview ? emptyState() : null);
  const [known, setKnown] = useState<Known>(NOTHING);
  const [debrief, setDebrief] = useState<BalanceDebrief | null>(null);
  const [tension, setTension] = useState<TensionFeedback | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);

  if (!ctx.preview && loaded.data && s === null) {
    setS(loaded.data.state);
    setKnown(loaded.data.known);
    setDebrief(loaded.data.debrief);
  }
  // Each change is saved a moment later, and the server answers with the scale and anything the person said.
  useEffect(() => {
    if (ctx.preview || !s || !dirty.current || debrief) return;
    const t = setTimeout(() => {
      dirty.current = false;
      setUpdating(true);
      api<{ state: BalanceState; known: Known }>(url, { body: { blockId: b.id, state: s } })
        .then((out) => setKnown(out.known))
        .catch(() => undefined)
        .finally(() => setUpdating(false));
    }, 350);
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

  const name = b.person.name || "the person";
  // Each change works from the latest state, so quick clicks in a row all land.
  const change: Change = (patch) => {
    if (!ctx.preview) {
      dirty.current = true;
      setUpdating(true);
    }
    setS((prev) => {
      if (!prev) return prev;
      const p = typeof patch === "function" ? patch(prev) : patch;
      return ctx.preview ? applyChanges(b, prev, { ...prev, ...p }) : { ...prev, ...p };
    });
  };
  // In the editor's preview the full case is here, so the scale is worked out on the page.
  const shown = ctx.preview ? learnerView(b, s) : known;
  const focusTop = () => requestAnimationFrame(() => top.current?.focus());
  const run = async <T,>(fn: () => Promise<T> | T) => {
    setBusy(true);
    setProblem(null);
    try {
      return await fn();
    } catch (e) {
      setProblem(errorText(e, "That didn’t send. Your work is still here."));
    } finally {
      setBusy(false);
    }
  };

  const next = () =>
    run(async () => {
      if (ctx.preview) {
        const out = advance(b, s);
        if ("tension" in out && out.tension) setTension(out.tension);
        if ("problem" in out) {
          if (out.state) setS(out.state);
          throw new Error(out.problem);
        }
        setS(out.state);
        setKnown(learnerView(b, out.state));
      } else {
        const out = await api<{ ok: boolean; problem: string | null; tension: TensionFeedback | null; state: BalanceState; known: Known }>(url, {
          body: { action: "advance", blockId: b.id, state: s },
        });
        dirty.current = false;
        if (out.tension) setTension(out.tension);
        setS(out.state);
        setKnown(out.known);
        if (!out.ok) throw new Error(out.problem ?? "Not yet.");
      }
      focusTop();
    });
  const event = () =>
    run(async () => {
      if (ctx.preview) {
        const out = seeEvent(b, s);
        if ("problem" in out) throw new Error(out.problem);
        setS(out.state);
        setKnown(learnerView(b, out.state));
      } else {
        const out = await api<{ state: BalanceState; known: Known }>(url, { body: { action: "event", blockId: b.id, state: s } });
        dirty.current = false;
        setS(out.state);
        setKnown(out.known);
      }
    });
  const finish = () =>
    run(async () => {
      if (ctx.preview) {
        const p = finishProblems(b, s);
        if (p.length) throw new Error(`Not yet. ${p.join(" ")}`);
        setDebrief(buildDebrief(b, s, scoreBalance(b, s)));
      } else {
        const out = await api<Loaded>(url, { body: { action: "finish", blockId: b.id, state: s } });
        dirty.current = false;
        setS(out.state);
        setDebrief(out.debrief);
        ctx.activity(b.id, { outcome: "finished" });
        ctx.engaged(b.id);
      }
      focusTop();
    });
  const again = () =>
    run(async () => {
      setDebrief(null);
      setTension(null);
      if (ctx.preview) {
        setS(emptyState());
        setKnown(NOTHING);
      } else {
        const out = await api<Loaded>(url, { body: { action: "restart", blockId: b.id } });
        setS(out.state);
        setKnown(out.known);
      }
      focusTop();
    });

  if (debrief)
    return (
      <Shell title={b.title}>
        <div ref={top} tabIndex={-1} className="outline-none">
          <Debrief block={b} d={debrief} onAgain={() => void again()} />
        </div>
      </Shell>
    );

  return (
    <Shell title={b.title}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{BALANCE_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      <Situation block={b} />

      <div ref={top} tabIndex={-1} className="mt-5 outline-none">
        <p className="text-sm font-semibold text-ink-muted">
          Step {s.stage + 1} of {STAGES.length}
        </p>
        <h4 className="font-serif text-xl font-semibold">{STAGES[s.stage]}</h4>
      </div>
      {problem && (
        <p role="alert" className={cx(warn, "mt-3 whitespace-pre-line")}>
          {problem}
        </p>
      )}

      {s.stage === 0 && (
        <div className="mt-3 flex flex-col gap-3">
          <p>What do you need to understand before you plan anything? Ask as many as you like.</p>
          <ul className="flex flex-col gap-2">
            {b.questions.map((q) => {
              const asked = s.asked.includes(q.id);
              return (
                <li key={q.id} className={box}>
                  <button
                    type="button"
                    className={cx(secondary, "h-auto w-full justify-start py-2 text-left")}
                    aria-expanded={asked}
                    onClick={() => !asked && change((p) => ({ asked: [...p.asked, q.id] }))}
                  >
                    {q.label}
                  </button>
                  {asked && (
                    <p className="mt-2" aria-live="polite">
                      {shown.answers[q.id] ?? "…"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div>
            <button type="button" className={primary} disabled={busy || !s.asked.length} onClick={() => void next()}>
              Name the tension
            </button>
          </div>
        </div>
      )}

      {s.stage === 1 && <Tension block={b} s={s} change={change} tension={tension} busy={busy} onNext={() => void next()} />}

      {s.stage >= 2 && (
        <div className="mt-3 flex flex-col gap-4">
          {s.stage === 3 && <Test block={b} s={s} known={shown} change={change} busy={busy} onEvent={() => void event()} />}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Cards block={b} s={s} known={shown} change={change} />
            <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
              <Beam scale={shown.scale} updating={updating} name={name} />
              <PlanText block={b} s={s} known={shown} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {s.stage === 2 ? (
              <>
                <button type="button" className={primary} disabled={busy || updating} onClick={() => void next()}>
                  Test this plan
                </button>
                {shown.scale && !shown.scale.balanced && <p className="text-sm text-ink-muted">It isn’t balanced yet. You can still test it.</p>}
              </>
            ) : (
              (!b.event || s.eventSeen) && (
                <button type="button" className={primary} disabled={busy || updating} onClick={() => void finish()}>
                  Finish and see the debrief
                </button>
              )
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Balance Scale: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="sliders" className="size-5" /> Dignity of Risk Balance Scale · training case
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Situation({ block: b }: { block: BalanceBlock }) {
  return (
    <article aria-label="The situation" className={cx(box, "mt-4")}>
      <h4 className="font-serif text-lg font-semibold">
        {b.person.name}
        {b.person.age ? `, ${b.person.age}` : ""}
      </h4>
      {b.person.about && <p className="mt-1">{b.person.about}</p>}
      <blockquote className="mt-3 border-l-4 border-accent pl-4 font-serif text-lg italic">“{b.quote}”</blockquote>
      <p className="mt-3">{b.situation}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        {b.currentPlan && (
          <>
            <dt className="font-semibold">Current plan</dt>
            <dd>{b.currentPlan}</dd>
          </>
        )}
        {b.signal && (
          <>
            <dt className="font-semibold">Risk signal</dt>
            <dd>
              {b.signal} <span className="font-semibold">({URGENCY[b.urgency]})</span>
            </dd>
          </>
        )}
        <dt className="font-semibold">You</dt>
        <dd>{b.learnerRole}</dd>
      </dl>
      {b.facts.length > 0 && (
        <ul className="mt-3 list-disc pl-6 text-sm">
          {b.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Tension({
  block: b,
  s,
  change,
  tension,
  busy,
  onNext,
}: {
  block: BalanceBlock;
  s: BalanceState;
  change: Change;
  tension: TensionFeedback | null;
  busy: boolean;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">What is {b.person.name || "the person"} trying to keep? Choose one.</legend>
        {b.goals.map((g) => (
          <label key={g.id} className={cx(box, "flex min-h-11 cursor-pointer items-start gap-3 py-3")}>
            <input type="radio" name={`${b.id}-goal`} className="mt-1 size-5" checked={s.goal === g.id} onChange={() => change({ goal: g.id })} />
            <span>{g.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-semibold">What risks do the facts point to? Choose any that apply, and only those.</legend>
        {(Object.keys(RISK_KINDS) as RiskKind[])
          .filter((k) => b.risks.some((r) => r.kind === k))
          .map((k) => (
            <div key={k}>
              <p className="text-sm font-semibold text-ink-muted">{RISK_KINDS[k]}</p>
              <div className="mt-1 flex flex-col gap-2">
                {b.risks
                  .filter((r) => r.kind === k)
                  .map((r) => (
                    <label key={r.id} className={cx(box, "flex min-h-11 cursor-pointer items-start gap-3 py-3")}>
                      <input
                        type="checkbox"
                        className="mt-1 size-5"
                        checked={s.risks.includes(r.id)}
                        onChange={(e) => {
                          const on = e.target.checked;
                          change((p) => ({ risks: on ? [...p.risks, r.id] : p.risks.filter((x) => x !== r.id) }));
                        }}
                      />
                      <span>{r.label}</span>
                    </label>
                  ))}
              </div>
            </div>
          ))}
      </fieldset>
      {tension && !tension.ok && (
        <div className={warn} aria-live="polite">
          {tension.goal && (
            <p>
              <span className="font-semibold">{tension.goal.right ? "The goal: yes. " : "The goal: look again. "}</span>
              {tension.goal.why}
            </p>
          )}
          {tension.risks
            .filter((r) => !r.real)
            .map((r) => (
              <p key={r.id} className="mt-1">
                <span className="font-semibold">“{r.label}”: </span>
                {r.why}
              </p>
            ))}
          {tension.missing > 0 && (
            <p className="mt-1">The facts point to {tension.missing === 1 ? "a risk" : `${tension.missing} risks`} you haven’t named yet.</p>
          )}
        </div>
      )}
      <div>
        <button type="button" className={primary} disabled={busy || !s.goal || !s.risks.length} onClick={onNext}>
          Check the tension
        </button>
      </div>
    </div>
  );
}

function Cards({ block: b, s, known, change }: { block: BalanceBlock; s: BalanceState; known: Known; change: Change }) {
  const available = b.actions.filter((a) => !a.after || s.eventSeen);
  return (
    <section aria-label="Plan cards" className="flex flex-col gap-4">
      <p>Add the cards you’d use, in any order. Remove any you change your mind about. There’s no set number.</p>
      {(Object.keys(GROUPS) as Group[]).map((g) => {
        const cards = available.filter((a) => a.group === g);
        if (!cards.length) return null;
        return (
          <div key={g}>
            <h5 className="font-semibold">{GROUPS[g]}</h5>
            <ul className="mt-2 flex flex-col gap-2">
              {cards.map((a) => {
                const on = s.plan.includes(a.id);
                const r = known.responses[a.id];
                return (
                  <li key={a.id} className={cx(box, on && "ring-2 ring-accent")}>
                    <div className="flex items-start gap-3">
                      <p className="flex-1">
                        {a.label}
                        {a.after && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">New</span>}
                      </p>
                      <button
                        type="button"
                        aria-pressed={on}
                        className={cx(secondary, "shrink-0", on && "bg-muted")}
                        onClick={() => change((p) => ({ plan: p.plan.includes(a.id) ? p.plan.filter((x) => x !== a.id) : [...p.plan, a.id] }))}
                      >
                        {on ? "Remove" : "Add"}
                        <span className="sr-only">: {a.label}</span>
                      </button>
                    </div>
                    {on && a.asks && (
                      <p className="mt-2 text-sm" aria-live="polite">
                        {r ? (
                          <>
                            <span className="font-semibold">{r.accepts ? `${b.person.name} agrees. ` : `${b.person.name} declines, for now. `}</span>
                            {r.response}
                          </>
                        ) : (
                          `Asking ${b.person.name}…`
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

/** The scale, as a picture and in words. The words are the assessment; the picture is a helper. */
function Beam({ scale, updating, name }: { scale: Scale | null; updating: boolean; name: string }) {
  const tilt = scale?.tilt ?? 0;
  return (
    <section aria-label="The scale" className={box}>
      <svg viewBox="0 0 240 120" className="w-full" aria-hidden="true">
        <polygon points="120,62 104,112 136,112" className="fill-muted stroke-line-strong" strokeWidth="2" />
        <g style={{ transform: `rotate(${tilt * 7}deg)`, transformOrigin: "120px 60px" }} className="motion-safe:transition-transform motion-safe:duration-500">
          <line x1="24" y1="60" x2="216" y2="60" className="stroke-ink" strokeWidth="4" strokeLinecap="round" />
          <circle cx="120" cy="60" r="5" className="fill-ink" />
          <line x1="30" y1="60" x2="30" y2="78" className="stroke-ink-muted" strokeWidth="2" />
          <line x1="210" y1="60" x2="210" y2="78" className="stroke-ink-muted" strokeWidth="2" />
          <path d="M6 78 h48 a24 10 0 0 1 -48 0z" className="fill-accent/30 stroke-accent" strokeWidth="2" />
          <path d="M186 78 h48 a24 10 0 0 1 -48 0z" className="fill-action/30 stroke-action" strokeWidth="2" />
        </g>
      </svg>
      <div className="mt-1 grid grid-cols-2 gap-2 text-xs font-semibold">
        <p>{PANS.person}</p>
        <p className="text-right">{PANS.safety}</p>
      </div>
      <div aria-live="polite" className="mt-3">
        {!scale ? (
          <p className="text-ink-muted">Add a card to see how the plan balances.</p>
        ) : (
          <>
            <p className={cx("font-semibold", scale.balanced && good, "rounded-xl")}>{updating ? "Updating…" : scale.label}</p>
            {scale.note && <p className="mt-1 text-sm">{scale.note}</p>}
            <p className="mt-2 text-sm">
              <span className="font-semibold">{name}’s side: </span>
              {scale.person}
            </p>
            <p className="mt-1 text-sm">
              <span className="font-semibold">Safety side: </span>
              {scale.safety}
            </p>
            {scale.prompts.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {scale.prompts.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** The plan as plain text: the same information as the scale, in a list. */
function PlanText({ block: b, s, known }: { block: BalanceBlock; s: BalanceState; known: Known }) {
  const cards = s.plan.map((id) => b.actions.find((a) => a.id === id)).filter((a): a is BalanceBlock["actions"][number] => Boolean(a));
  return (
    <section aria-label="Your plan as text" className={box}>
      <h5 className="font-semibold">Your plan</h5>
      {cards.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">Nothing yet.</p>
      ) : (
        <ol className="mt-1 list-decimal pl-5 text-sm">
          {cards.map((a) => {
            const r = known.responses[a.id];
            return (
              <li key={a.id}>
                {a.label}
                {a.asks && r ? (r.accepts ? " (agreed)" : " (offered, declined)") : ""}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Test({
  block: b,
  s,
  known,
  change,
  busy,
  onEvent,
}: {
  block: BalanceBlock;
  s: BalanceState;
  known: Known;
  change: Change;
  busy: boolean;
  onEvent: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">What would you say to {b.person.name}?</legend>
        {b.sayings.map((x) => (
          <label key={x.id} className={cx(box, "flex min-h-11 cursor-pointer items-start gap-3 py-3")}>
            <input type="radio" name={`${b.id}-say`} className="mt-1 size-5" checked={s.saying === x.id} onChange={() => change({ saying: x.id })} />
            <span>“{x.text}”</span>
          </label>
        ))}
      </fieldset>
      {known.saying && (
        <p className={known.saying.kind === "good" ? good : warn} aria-live="polite">
          <span className="font-semibold">{SAYING_KINDS[known.saying.kind]}. </span>
          {known.saying.feedback}
        </p>
      )}
      {b.event && !s.eventSeen && (
        <div>
          <button type="button" className={primary} disabled={busy || !s.saying} onClick={onEvent}>
            See what happens next
          </button>
        </div>
      )}
      {known.event && (
        <article aria-label="A new fact" className={cx(warn, "flex flex-col gap-1")}>
          <h5 className="font-semibold">New fact: {known.event.title}</h5>
          {known.event.facts.map((f) => (
            <p key={f}>{f}</p>
          ))}
          <p className="mt-1 font-semibold">Update the plan. New cards are marked.</p>
        </article>
      )}
    </div>
  );
}

function Debrief({ block: b, d, onAgain }: { block: BalanceBlock; d: BalanceDebrief; onAgain: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h4 className="font-serif text-xl font-semibold">Debrief</h4>
      <div className={d.balanced ? good : warn}>
        <p className="font-semibold">{d.scale.label}</p>
        {d.scale.note && <p className="mt-1">{d.scale.note}</p>}
      </div>

      <section aria-label="How it read">
        <h5 className="font-semibold">How it read, area by area</h5>
        <ul className="mt-2 grid gap-2 md:grid-cols-2">
          {d.areas.map((a) => (
            <li key={a.id} className={box}>
              <p>
                <span className="font-semibold">{a.label}: </span>
                {a.rating}
              </p>
              {a.notes.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {a.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {(d.flags.overControl || d.flags.underResponse) && (
          <p className="mt-2 text-sm">
            {d.flags.overControl && "At some point your plan or words leaned towards control. "}
            {d.flags.underResponse && "At some point your plan or words left the risk unmanaged."}
          </p>
        )}
      </section>

      <section aria-label="The criteria">
        <h5 className="font-semibold">What a balanced plan needed here</h5>
        <ul className="mt-2 flex flex-col gap-1">
          {d.criteria.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">{c.met ? "Met: " : "Missing: "}</span>
              {c.label}
              {c.after ? " (after the new fact)" : ""}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Your plan">
        <h5 className="font-semibold">Your plan</h5>
        <ul className="mt-2 flex flex-col gap-2">
          {d.plan.map((a) => (
            <li key={a.id} className={box}>
              <p className="font-semibold">{a.label}</p>
              <p className="text-sm text-ink-muted">
                {EFFECTS[a.effect]}
                {a.asks ? (a.accepts ? ` · ${b.person.name} agreed` : ` · offered, ${b.person.name} declined`) : ""}
              </p>
              <p className="mt-1">{a.rationale}</p>
              {a.asks && <p className="mt-1 text-sm">{a.response}</p>}
            </li>
          ))}
        </ul>
        {d.left.length > 0 && (
          <details className="mt-2">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">The cards you left out</summary>
            <ul className="flex flex-col gap-1">
              {d.left.map((a) => (
                <li key={a.id}>
                  <span className="font-semibold">{a.label}</span> ({EFFECTS[a.effect].toLowerCase()}). {a.rationale}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-label="Understanding">
        <h5 className="font-semibold">The questions</h5>
        <ul className="mt-2 flex flex-col gap-1">
          {d.questions.map((q) => (
            <li key={q.id}>
              <span className="font-semibold">
                {q.label} {q.asked ? "(you asked)" : "(not asked)"}
              </span>{" "}
              {q.why}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          <span className="font-semibold">{b.person.name}’s goal: </span>
          {d.goal}
        </p>
      </section>

      {d.saying && (
        <section aria-label="What you said">
          <h5 className="font-semibold">What you said</h5>
          {d.firstSaying && (
            <p className="mt-1">
              You first chose: “{d.firstSaying.text}” {d.firstSaying.feedback}
            </p>
          )}
          <p className="mt-1">
            “{d.saying.text}” {d.saying.feedback}
          </p>
          {d.saying.kind !== "good" && d.goodSaying && <p className="mt-1">One way to say it: “{d.goodSaying.text}”</p>}
        </section>
      )}

      {d.event && (
        <section aria-label="The new fact">
          <h5 className="font-semibold">New fact: {d.event.title}</h5>
          {d.event.facts.map((f) => (
            <p key={f}>{f}</p>
          ))}
        </section>
      )}

      <section aria-label="What remains" className={box}>
        {d.residual && (
          <p>
            <span className="font-semibold">Residual risk: </span>
            {d.residual}
          </p>
        )}
        <p className="mt-1">
          <span className="font-semibold">Review owner: </span>
          {d.reviewOwner}
        </p>
        <p className="mt-1">
          <span className="font-semibold">Review trigger: </span>
          {d.reviewTrigger}
        </p>
      </section>

      <section aria-label="A teaching example" className={box}>
        <h5 className="font-semibold">A care-plan note: fictional teaching example</h5>
        <p className="mt-1 text-sm text-ink-muted">Not a real record, and nothing is added to one.</p>
        <p className="mt-2 whitespace-pre-line">{d.note}</p>
      </section>

      <p className="text-sm text-ink-muted">{NOT_SIGNOFF}</p>
      {(d.source.title || d.source.version) && (
        <p className="text-sm text-ink-muted">
          Checked against: {d.source.title}
          {d.source.version ? `, ${d.source.version}` : ""}
          {d.source.policyId ? ` (${d.source.policyId})` : ""}.
        </p>
      )}
      <div>
        <button type="button" className={secondary} onClick={onAgain}>
          Try a different plan
        </button>
      </div>
    </div>
  );
}
