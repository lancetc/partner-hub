"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { CoverageBlock } from "@/lib/magazine";
import {
  absence,
  AVAILABILITY,
  BACKUP,
  blankCell,
  blankInputs,
  blankSupply,
  calculate,
  CAPABILITIES,
  CAPABILITY_ORDER,
  dateLabel,
  DAY_NAMES,
  DAYS,
  fmtUnits,
  HORIZON,
  inputChanges,
  MODEL_VERSION,
  PREFERENCES,
  resultChanges,
  SERVICE_ORDER,
  SERVICES,
  STATE_HINTS,
  STATE_ORDER,
  STATUS,
  SUPPLY_STATES,
  TIERS,
  timeLabel,
  USE_ORDER,
  USES,
  validateInputs,
  whenOf,
  WHEN,
  windowLabel,
  type Availability,
  type AvailabilityStatus,
  type Capability,
  type CellResult,
  type CoverageInputs,
  type CoverageResult,
  type Day,
  type DemandCell,
  type InputError,
  type Num,
  type Preference,
  type Service,
  type SupplyRow,
  type SupplyState,
  type Unit,
  type Use,
} from "@/lib/suburbCoverage";
import { buildDebrief, emptyState, finishProblems, LAST, LEVELS, STEPS, updatedInputs, type CoverageDebrief, type CoverageState } from "@/lib/coverageLab";
import type { CoverageView } from "@/server/suburbCoverage";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  "Is this suburb ready for growth?" (docs/suburb-growth.md). A feature-article decision, not a bare calculator: a
  tempting overview and a prediction; what clients need, by service and time; supply cards tagged usable now,
  potential after verification, unavailable or already committed; the coverage comparison; a fragile plan; an
  immediate action and a network priority with the evidence; a story update to revisit; then the debrief and a Local
  Coverage Brief. The figures come from the shared model (lib/suburbCoverage); the debrief comes from the server.

  The map is for orientation only: every area and every row is also in a list and a table, with the same figures.
  Status is in words as well as colour and pattern; blank, unknown and zero are shown apart; every figure has a
  number field; nothing animates or times the reader. On a phone the comparison is a list, one row at a time.

  "Plan my local area" appears only for a business owner and the members they've authorised (the server decides). It
  starts blank, never with the story's figures, asks for aggregate, anonymous rows (never a participant's or
  contractor's name, address or diagnosis), saves only when asked, and keeps unsaved entries in this page alone.

  In the editor's preview it runs against the block as written, locally, and stores nothing.
*/

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const small = "min-h-10 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm";
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";
const TONE = {
  good: "bg-[#dff3ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]",
  warn: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  bad: "bg-[#fde2e0] text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]",
};
/** Told apart by pattern as well as colour. */
const BAR = {
  booked: { label: "Booked", style: { background: "#008282" } as React.CSSProperties },
  spare: { label: "Covered by usable spare", style: { background: "repeating-linear-gradient(45deg, #008282 0 4px, #8fd3cf 4px 8px)" } as React.CSSProperties },
  gap: { label: "Current gap", style: { background: "repeating-linear-gradient(135deg, #b3261e 0 5px, #f2b8b5 5px 9px)" } as React.CSSProperties },
  forecast: { label: "Forecast range (separate band)", style: { border: "2px dashed #7a5c00", background: "transparent" } as React.CSSProperties },
};
const FICTIONAL =
  "Fictional case: Maya, the suburbs, the contractors, the clients and every figure are invented for practice. They aren’t real Trilogy Care coverage, a supplier list or a backup ratio.";
const safeCalc = (i: CoverageInputs) => (validateInputs(i).length ? null : calculate(i));
const statusTone = (s: CellResult["status"]) => TONE[STATUS[s].tone];

export function LocalCoverageLab({ block: b, ctx }: { block: CoverageBlock; ctx: InteractiveContext }) {
  const business = useApi<{ access: { orgName: string; role: string } | null }>(ctx.preview ? null : "/api/tools/coverage");
  const [mode, setMode] = useState<"story" | "business">("story");
  const canPlan = Boolean(business.data?.access);
  return (
    <section
      aria-label={`Local Coverage Comparison: ${b.title}`}
      className="mx-auto w-full max-w-[72rem] rounded-3xl border border-line-strong bg-surface p-5 sm:p-7"
    >
      <p className={cx(kicker, "mb-2 flex flex-wrap items-center gap-2 text-sm")}>
        <Icon name="pin" className="size-5" /> Local Coverage Comparison
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] text-ink">
          {mode === "story" ? `Fictional case · ${b.storyVersion}` : "Your business · private"}
        </span>
      </p>
      <h3 className="font-serif text-2xl font-semibold">{b.title}</h3>
      {b.intro && <p className="mt-1 text-lg">{b.intro}</p>}
      {canPlan && (
        <div role="tablist" aria-label="Mode" className="mt-3 inline-flex flex-wrap rounded-full border border-line-strong p-0.5">
          {(
            [
              ["story", "Practise with the story"],
              ["business", "Plan my local area"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cx("min-h-10 rounded-full px-4 text-sm font-semibold", mode === m ? "bg-action text-on-action" : "text-ink-muted hover:bg-muted")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "story" ? <Practice b={b} ctx={ctx} /> : <PlanMyArea orgName={business.data?.access?.orgName ?? ""} b={b} />}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Practise with the story
// ---------------------------------------------------------------------------------------------

function Practice({ b, ctx }: { b: CoverageBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/coverage`;
  const loaded = useApi<CoverageView>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [s, setS] = useState<CoverageState | null>(ctx.preview ? emptyState() : null);
  const [debrief, setDebrief] = useState<CoverageDebrief | null>(null);
  const [attemptNo, setAttemptNo] = useState(0);
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const justFinished = useRef(false);

  const take = (v: CoverageView) => {
    setS(v.state);
    setDebrief(v.debrief);
    setAttemptNo(v.attemptNo);
    setStep(Math.min(v.state.stage, LAST));
  };
  if (!ctx.preview && loaded.data && s === null) take(loaded.data);

  useEffect(() => {
    if (ctx.preview || !s || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, state: s } }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [s, ctx.preview, url, b.id]);
  useEffect(() => {
    if (!debrief || ctx.preview || !justFinished.current) return;
    justFinished.current = false;
    ctx.activity(b.id, { outcome: "finished", score: debrief.score, total: debrief.max });
    ctx.engaged(b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debrief]);

  const r = useMemo(() => safeCalc(b.inputs), [b.inputs]);
  const after = useMemo(() => safeCalc(updatedInputs(b)), [b]);
  if (!ctx.preview && loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!s) return <p className="mt-4 text-ink-muted">Loading…</p>;
  if (!r) return <p className="mt-4 text-ink-muted">This case’s figures don’t validate yet.</p>;

  const update = (fn: (prev: CoverageState) => CoverageState) => {
    dirty.current = true;
    setS((prev) => (prev ? fn(prev) : prev));
  };
  const go = (to: number) => {
    setStep(to);
    if (to > s.stage) update((p) => ({ ...p, stage: Math.max(p.stage, to) }));
    requestAnimationFrame(() => top.current?.focus());
  };
  const send = async (body: Record<string, unknown>, local: () => CoverageState) => {
    setProblem(null);
    if (ctx.preview) {
      const next = local();
      setS(next);
      if (next.stage === LAST) setDebrief(buildDebrief(b, next, MODEL_VERSION));
      return next;
    }
    setBusy(true);
    try {
      dirty.current = false;
      const v = await api<CoverageView>(url, { body: { blockId: b.id, ...body } });
      take(v);
      return v.state;
    } catch (e) {
      const err = e as Error & { problems?: string[] };
      setProblem([err.message, ...(err.problems ?? []).map((p) => `• ${p}`)].join("\n"));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const open = (key: string) => {
    if (!s.opened.includes(key)) update((p) => (p.opened.includes(key) ? p : { ...p, opened: [...p.opened, key] }));
  };
  const usedFilter = (name: string) => {
    if (!s.filters.includes(name)) update((p) => (p.filters.includes(name) ? p : { ...p, filters: [...p.filters, name] }));
  };

  const finished = s.stage === LAST && debrief;
  const shown = finished ? step : Math.min(step, LAST - 1);
  const allTagged = b.cards.every((c) => s.tags[c.id]);

  return (
    <div className="mt-3">
      <p className="rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{FICTIONAL}</p>
      <ol aria-label="Where you are" className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {STEPS.map((label, i) => {
          const reachable = i <= s.stage && (i < LAST || Boolean(finished));
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable}
                aria-current={i === shown ? "step" : undefined}
                onClick={() => go(i)}
                className={cx(
                  "min-h-8 rounded-full px-2.5 py-1 font-semibold",
                  i === shown ? "bg-action text-on-action" : reachable ? "bg-tealtint hover:underline" : "bg-muted text-ink-muted",
                )}
              >
                {i + 1}. {label}
              </button>
            </li>
          );
        })}
        {attemptNo > 1 && <li className="rounded-full bg-muted px-2.5 py-1 font-semibold">Attempt {attemptNo}</li>}
      </ol>

      <div className="mt-4">
        <h4 ref={top} tabIndex={-1} className="sr-only">
          {STEPS[shown]}
        </h4>
        {shown === 0 && <Opportunity b={b} r={r} onNext={() => go(1)} />}
        {shown === 1 && (
          <Prediction
            b={b}
            s={s}
            busy={busy}
            onSubmit={async (area) => {
              const next = await send({ action: "predict", prediction: { area } }, () => ({ ...s, prediction: { area }, stage: Math.max(s.stage, 2) }));
              if (next) go(2);
            }}
            onNext={() => go(2)}
          />
        )}
        {shown === 2 && <Needs b={b} r={r} opened={s.opened} onOpen={open} onFilter={usedFilter} onNext={() => go(3)} />}
        {shown === 3 && (
          <div className="flex flex-col gap-4">
            <p>
              These are the people on Maya’s map. For each card, say how it stands against the need it’s read against: <strong>usable now</strong>,{" "}
              <strong>potential after verification</strong>, <strong>unavailable</strong> or <strong>already committed</strong>.
            </p>
            <StateGuide />
            {b.cards.map((c) => {
              const row = b.inputs.supply.find((x) => x.id === c.supply);
              const cell = b.inputs.demand.find((x) => x.id === c.cell);
              if (!row || !cell) return null;
              return (
                <SupplyCard
                  key={c.id}
                  id={c.id}
                  row={row}
                  need={r.cells.find((x) => x.id === cell.id)!.label}
                  inputs={b.inputs}
                  value={s.tags[c.id] ?? ""}
                  onTag={(u) => update((p) => ({ ...p, tags: { ...p.tags, [c.id]: u } }))}
                />
              );
            })}
            {allTagged ? (
              <>
                <h5 className="font-serif text-xl font-semibold">The coverage comparison</h5>
                <p className="text-sm">
                  Now the model’s reading: each need by service, place and time window, against provider-approved, confirmed, uncommitted capacity.{" "}
                  <strong>Open a row</strong> to see why, what would change it, and who acts.
                </p>
                <AreaMap inputs={b.inputs} r={r} reveal selected="" onSelect={(id) => open(`area:${id}`)} />
                <Comparison inputs={b.inputs} r={r} opened={s.opened} onOpen={(id) => open(`cell:${id}`)} onFilter={usedFilter} />
              </>
            ) : (
              <p className="text-sm text-ink-muted">Tag every card to see the coverage comparison.</p>
            )}
            <Next
              disabled={!allTagged || !s.opened.some((x) => x.startsWith("cell:"))}
              hint="Tag every card, then open at least one row of the comparison."
              onClick={() => go(4)}
              label="The fragile plan"
            />
          </div>
        )}
        {shown === 4 && <Fragile b={b} r={r} seen={s.absence} onSee={() => update((p) => ({ ...p, absence: true }))} onNext={() => go(5)} />}
        {shown === 5 && <Decide b={b} r={r} s={s} onPick={(k, v) => update((p) => ({ ...p, [k]: v }))} onNext={() => go(6)} />}
        {shown === 6 && !finished && (
          <FollowUp
            b={b}
            r={r}
            after={after}
            s={s}
            busy={busy}
            onPick={(k, v) => update((p) => ({ ...p, [k]: v }))}
            onFinish={async () => {
              justFinished.current = true;
              const body = {
                action: "finish",
                immediate: s.immediate,
                network: s.network,
                explanation: s.explanation,
                followUp: s.followUp,
                revised: s.revised,
              };
              const next = await send(body, () => ({ ...s, revised: s.revised || s.network, stage: LAST }));
              if (next?.stage === LAST) go(LAST);
            }}
          />
        )}
        {shown >= 6 && finished && debrief && (
          <Debrief
            b={b}
            after={after ?? r}
            d={debrief}
            busy={busy}
            onPrint={() => {
              if (!ctx.preview) api(url, { body: { blockId: b.id, action: "printed" } }).catch(() => undefined);
              printBrief();
            }}
            onRetry={async () => {
              const next = await send({ action: "retry" }, () => ({ ...emptyState(), retries: s.retries + 1 }));
              if (next) {
                setDebrief(null);
                setStep(0);
              }
            }}
          />
        )}
        {problem && (
          <p role="alert" className="mt-3 whitespace-pre-line rounded-2xl border border-danger/60 p-3 text-sm">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}

function Next({ onClick, label, disabled, hint }: { onClick: () => void; label: string; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={primary} onClick={onClick} disabled={disabled}>
        {label} <Icon name="arrow-right" className="size-4" />
      </button>
      {disabled && hint && <span className="text-sm text-ink-muted">{hint}</span>}
    </div>
  );
}

function StateGuide() {
  return (
    <details className={box}>
      <summary className="min-h-11 cursor-pointer font-semibold">What each supply state means</summary>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        {STATE_ORDER.map((x) => (
          <div key={x}>
            <dt className="font-semibold">{SUPPLY_STATES[x]}</dt>
            <dd className="text-ink-muted">{STATE_HINTS[x]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm">
        Spare capacity counts only when it’s <strong>provider approved</strong> for the service, in the right area, free in the matching time window,{" "}
        <strong>confirmed</strong> (not provisional), and verified within the owner’s freshness rule.
      </p>
    </details>
  );
}

function Opportunity({ b, r, onNext }: { b: CoverageBlock; r: CoverageResult; onNext: () => void }) {
  const st = b.story;
  return (
    <div className="flex flex-col gap-4">
      {st.transmission.text && (
        <figure className="rounded-2xl border-l-4 border-[#008282] bg-bg p-4 ring-1 ring-line">
          <blockquote className="font-serif text-lg italic">“{st.transmission.text}”</blockquote>
          <figcaption className="mt-2 text-sm text-ink-muted">{st.transmission.who}</figcaption>
        </figure>
      )}
      <div className={box}>
        <CharacterRow names={[st.character]} size="lg">
          <div className="min-w-0">
            <p className={kicker}>{st.role || "The story"}</p>
            <p className="mt-1">{st.situation}</p>
          </div>
        </CharacterRow>
      </div>
      <div className={box}>
        <p className={kicker}>The map Maya sees</p>
        <p className="mt-1 text-sm">Contractors listed in each area, in any state. It looks like plenty.</p>
        <AreaMap inputs={b.inputs} r={r} reveal={false} selected="" />
      </div>
      {st.voice.text && (
        <figure className="rounded-2xl bg-bg p-4 ring-1 ring-line">
          <blockquote className="font-serif text-lg">“{st.voice.text}”</blockquote>
          <figcaption className="mt-2 text-sm text-ink-muted">{st.voice.who}</figcaption>
        </figure>
      )}
      {st.dilemma && (
        <p className="font-serif text-xl font-semibold">
          {st.character.split(" ")[0]}: “{st.dilemma}”
        </p>
      )}
      <Next onClick={onNext} label="Make a prediction" />
    </div>
  );
}

function Prediction({
  b,
  s,
  busy,
  onSubmit,
  onNext,
}: {
  b: CoverageBlock;
  s: CoverageState;
  busy: boolean;
  onSubmit: (area: string) => void;
  onNext: () => void;
}) {
  const done = s.prediction;
  const [area, setArea] = useState(done?.area ?? "");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (area) onSubmit(area);
      }}
    >
      <fieldset className="flex flex-col gap-2" disabled={Boolean(done)}>
        <legend className="mb-1 text-lg">{b.prediction.prompt}</legend>
        {b.prediction.options.map((o) => (
          <label key={o.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted">
            <input type="radio" name="area" className="size-5 accent-[var(--color-action)]" checked={area === o.id} onChange={() => setArea(o.id)} />
            {o.text}
          </label>
        ))}
      </fieldset>
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">Your prediction is in. You’ll compare it with the coverage at the end; it isn’t marked.</p>
          <Next onClick={onNext} label="See what clients need" />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primary} disabled={busy || !area}>
            Lock in my prediction
          </button>
          <span className="text-sm text-ink-muted">You can’t change it afterwards. A guess is fine.</span>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// The map: orientation only, never the only source
// ---------------------------------------------------------------------------------------------

function AreaMap({
  inputs,
  r,
  reveal,
  selected,
  onSelect,
}: {
  inputs: CoverageInputs;
  r: CoverageResult;
  reveal: boolean;
  selected: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-tealtint/40 ring-1 ring-line sm:aspect-[16/7]">
        {/* Roads and a creek: decoration only. */}
        <svg aria-hidden viewBox="0 0 100 60" preserveAspectRatio="none" className="absolute inset-0 size-full text-line-strong">
          <path d="M0 40 C 25 35, 45 45, 100 30" fill="none" stroke="currentColor" strokeWidth="0.6" />
          <path d="M45 0 C 48 20, 40 40, 52 60" fill="none" stroke="currentColor" strokeWidth="0.6" />
          <path d="M0 12 C 30 20, 60 8, 100 14" fill="none" stroke="#7fb8d8" strokeWidth="0.8" strokeDasharray="1.5 1" />
        </svg>
        {r.areas.map((a) => {
          const area = inputs.areas.find((x) => x.id === a.id)!;
          const label = (
            <>
              <span className="block font-semibold">{a.name}</span>
              <span className="block text-xs">
                {a.listed} {a.listed === 1 ? "contractor" : "contractors"} listed
              </span>
              {reveal && <span className="mt-0.5 block text-xs font-bold">{STATUS[a.status].label}</span>}
            </>
          );
          const cls = cx(
            "absolute min-h-11 max-w-[45%] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-3 py-1.5 text-left text-sm shadow-sm ring-1 ring-line-strong sm:min-w-28 sm:max-w-none sm:text-base",
            reveal ? TONE[STATUS[a.status].tone] : "bg-surface",
            selected === a.id && "outline outline-[3px] outline-offset-2 outline-[var(--color-action)]",
          );
          // Kept inside the frame, whatever position an author or owner gives.
          const pos = { left: `${Math.min(80, Math.max(20, area.x))}%`, top: `${Math.min(84, Math.max(16, area.y))}%` };
          return onSelect ? (
            <button
              key={a.id}
              type="button"
              className={cx(cls, "hover:brightness-95")}
              style={pos}
              aria-pressed={selected === a.id}
              onClick={() => onSelect(a.id)}
            >
              {label}
            </button>
          ) : (
            <div key={a.id} className={cls} style={pos}>
              {label}
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="sr-only">Every area on the map, with the same figures</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th scope="col" className="py-1 pr-2 font-semibold">
                Area
              </th>
              <th scope="col" className="px-2 font-semibold">
                Listed
              </th>
              <th scope="col" className="px-2 font-semibold">
                Provider approved
              </th>
              {reveal && (
                <>
                  <th scope="col" className="px-2 font-semibold">
                    Counted as usable
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Current gap
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Status
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {r.areas.map((a) => (
              <tr key={a.id} className="border-b border-line">
                <th scope="row" className="py-1.5 pr-2 font-semibold">
                  {a.name}
                </th>
                <td className="px-2">{a.listed}</td>
                <td className="px-2">{a.approved}</td>
                {reveal && (
                  <>
                    <td className="px-2">{a.usable}</td>
                    <td className="px-2">
                      {[a.gapHours ? `${a.gapHours} h` : "", a.gapVisits ? `${a.gapVisits} visits` : ""].filter(Boolean).join(" and ") || "None"}
                    </td>
                    <td className="px-2">
                      {STATUS[a.status].label}
                      {a.fragile ? ` · ${a.fragile} with fragile backup` : ""}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// What clients need
// ---------------------------------------------------------------------------------------------

function Needs({
  b,
  r,
  opened,
  onOpen,
  onFilter,
  onNext,
}: {
  b: CoverageBlock;
  r: CoverageResult;
  opened: string[];
  onOpen: (key: string) => void;
  onFilter: (name: string) => void;
  onNext: () => void;
}) {
  const [area, setArea] = useState("");
  const [service, setService] = useState<Service | "">("");
  const [when, setWhen] = useState<keyof typeof WHEN | "">("");
  const cells = b.inputs.demand.filter((c) => (!area || c.area === area) && (!service || c.service === service) && (!when || whenOf(c.window) === when));
  return (
    <div className="flex flex-col gap-4">
      <p>
        Choose an area on the map to see what its clients actually need: <strong>which service, which capability, and when</strong>. Demand is kept in tiers:
        confirmed planned, approved but being arranged, forecast, and unknown or paused.
      </p>
      <AreaMap
        inputs={b.inputs}
        r={r}
        reveal={false}
        selected={area}
        onSelect={(id) => {
          setArea((x) => (x === id ? "" : id));
          onOpen(`area:${id}`);
        }}
      />
      <Filters>
        <FilterSelect
          label="Area"
          value={area}
          onChange={(v) => {
            setArea(v);
            if (v) onOpen(`area:${v}`);
            onFilter("area");
          }}
          options={b.inputs.areas.map((a) => [a.id, a.name])}
        />
        <FilterSelect
          label="Service"
          value={service}
          onChange={(v) => {
            setService(v as Service | "");
            onFilter("service");
          }}
          options={SERVICE_ORDER.map((x) => [x, SERVICES[x]])}
        />
        <FilterSelect
          label="Day and time"
          value={when}
          onChange={(v) => {
            setWhen(v as keyof typeof WHEN | "");
            onFilter("when");
          }}
          options={Object.entries(WHEN)}
        />
      </Filters>
      <div role="status" className="sr-only">
        {cells.length} {cells.length === 1 ? "need" : "needs"} shown
      </div>
      {cells.map((c) => (
        <NeedCard key={c.id} c={c} inputs={b.inputs} />
      ))}
      {!cells.length && <p className="text-sm text-ink-muted">No needs match those filters.</p>}
      <Next disabled={!opened.some((x) => x.startsWith("area:"))} hint="Choose at least one area first." onClick={onNext} label="See who is usable" />
    </div>
  );
}

function NeedCard({ c, inputs }: { c: DemandCell; inputs: CoverageInputs }) {
  const u = (v: Num) => (v === null ? "blank" : fmtUnits(v, c.unit));
  const area = inputs.areas.find((a) => a.id === c.area)?.name ?? "";
  return (
    <article className={box} aria-label={`${SERVICES[c.service]} in ${area}`}>
      <p className={kicker}>{area}</p>
      <h5 className="font-serif text-xl font-semibold">
        {SERVICES[c.service]}
        {c.capability ? ` (${CAPABILITIES[c.capability].toLowerCase()})` : ""}, {windowLabel(c.window)}
      </h5>
      {c.note && <p className="mt-1">{c.note}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            [TIERS.confirmed, `${u(c.planned)} a week`],
            ["Booked", `${u(c.booked)} a week`],
            [TIERS.arranging, `${u(c.arranging)} a week`],
            [TIERS.forecast, `${u(c.forecast.low)} to ${u(c.forecast.high)} more`],
            [TIERS.unknown, c.unknown === null ? "blank" : `${c.unknown} to confirm`],
            ["Visit length", c.visitHours === null ? "blank" : `${c.visitHours} h`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface p-2 ring-1 ring-line">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-muted">
        {c.neededFrom ? `Needed from ${dateLabel(c.neededFrom)}. ` : "Needed now. "}
        {PREFERENCES[c.preference]}. Source: {c.source || "not recorded"}, {c.owner || "owner not named"}, verified{" "}
        {c.verifiedOn ? dateLabel(c.verifiedOn) : "never"}.
      </p>
    </article>
  );
}

function Filters({ children }: { children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <legend className="sr-only">Filters</legend>
      {children}
    </fieldset>
  );
}
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold">
      {label}
      <select className={small} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------------------------
// What is usable: supply cards
// ---------------------------------------------------------------------------------------------

function SupplyCard({
  id,
  row,
  need,
  inputs,
  value,
  onTag,
}: {
  id: string;
  row: SupplyRow;
  need: string;
  inputs: CoverageInputs;
  value: Use | "";
  onTag: (u: Use) => void;
}) {
  const name = `card-${id}`;
  return (
    <article aria-labelledby={`${name}-title`} className={box}>
      <p className={kicker}>Read against: {need}</p>
      <h5 id={`${name}-title`} className="font-serif text-xl font-semibold">
        {row.label}
      </h5>
      {row.note && <p className="mt-1">{row.note}</p>}
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <Fact k="State" v={SUPPLY_STATES[row.state]} />
        <Fact
          k="Service"
          v={`${SERVICES[row.service]}${row.capabilities.length ? ` · ${row.capabilities.map((c) => CAPABILITIES[c].toLowerCase()).join(", ")}` : ""}`}
        />
        <Fact k="Travels to" v={row.areas.map((a) => inputs.areas.find((x) => x.id === a)?.name ?? a).join(", ") || "Not recorded"} />
        <Fact
          k="Availability"
          v={row.slots.map((a) => `${windowLabel(a)}, ${a.hours ?? "?"} h a week (${AVAILABILITY[a.status].toLowerCase()})`).join("; ") || "None recorded"}
        />
        <Fact k="Verified" v={row.verifiedOn ? dateLabel(row.verifiedOn) : "Never"} />
        <Fact k="Source" v={`${row.source || "Not recorded"} · ${row.owner || "owner not named"}`} />
      </dl>
      <fieldset className="mt-3 grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <legend className="font-semibold">How does {row.label} stand against this need?</legend>
        {USE_ORDER.map((u) => (
          <label key={u} className="flex min-h-11 items-center gap-2 rounded-xl px-2 hover:bg-muted">
            <input type="radio" name={name} className="size-4 accent-[var(--color-action)]" checked={value === u} onChange={() => onTag(u)} />
            {USES[u]}
          </label>
        ))}
      </fieldset>
    </article>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-semibold">{k}:</dt>
      <dd>{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The coverage comparison: the main visual, a list on a phone, and a table with every figure
// ---------------------------------------------------------------------------------------------

type TierView = "confirmed" | "arranging" | "forecast";

function Comparison({
  inputs,
  r,
  opened,
  onOpen,
  onFilter,
  stale = false,
}: {
  inputs: CoverageInputs;
  r: CoverageResult;
  opened: string[];
  onOpen: (cellId: string) => void;
  onFilter?: (name: string) => void;
  stale?: boolean;
}) {
  const [area, setArea] = useState("");
  const [service, setService] = useState<Service | "">("");
  const [when, setWhen] = useState<keyof typeof WHEN | "">("");
  const [week, setWeek] = useState(0);
  const [tier, setTier] = useState<TierView>("confirmed");
  const [readiness, setReadiness] = useState<Use | "">("");
  const [selected, setSelected] = useState("");
  const f = (name: string) => onFilter?.(name);
  const cells = r.cells.filter((c) => {
    const d = inputs.demand.find((x) => x.id === c.id)!;
    return (!area || c.area === area) && (!service || c.service === service) && (!when || whenOf(d.window) === when);
  });
  const current = cells.find((c) => c.id === selected);
  return (
    <div className={cx("flex flex-col gap-3", stale && "opacity-70")}>
      <Filters>
        <FilterSelect
          label="Area"
          value={area}
          onChange={(v) => {
            setArea(v);
            f("area");
          }}
          options={inputs.areas.map((a) => [a.id, a.name])}
        />
        <FilterSelect
          label="Service"
          value={service}
          onChange={(v) => {
            setService(v as Service | "");
            f("service");
          }}
          options={SERVICE_ORDER.map((x) => [x, SERVICES[x]])}
        />
        <FilterSelect
          label="Day and time"
          value={when}
          onChange={(v) => {
            setWhen(v as keyof typeof WHEN | "");
            f("when");
          }}
          options={Object.entries(WHEN)}
        />
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Week
          <select
            className={small}
            value={week}
            onChange={(e) => {
              setWeek(Number(e.target.value));
              f("week");
            }}
          >
            {r.weeks.map((w) => (
              <option key={w.index} value={w.index}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Demand tier
          <select
            className={small}
            value={tier}
            onChange={(e) => {
              setTier(e.target.value as TierView);
              f("tier");
            }}
          >
            <option value="confirmed">Confirmed only</option>
            <option value="arranging">With being arranged</option>
            <option value="forecast">With the forecast band</option>
          </select>
        </label>
        <FilterSelect
          label="Supplier readiness"
          value={readiness}
          onChange={(v) => {
            setReadiness(v as Use | "");
            f("readiness");
          }}
          options={USE_ORDER.map((u) => [u, USES[u]])}
        />
      </Filters>
      <p className="text-xs text-ink-muted">
        {r.weeks[week]?.label} · {r.timezone}. As of {dateLabel(r.asOf)}. Freshness rule: {inputs.freshness.days ?? "not set"} days, set by{" "}
        {inputs.freshness.setBy || "the operational owner (not named)"}.
      </p>
      <BarLegend tier={tier} />
      <ul className="flex flex-col gap-2" aria-label="Coverage by service, place and time window">
        {cells.map((c) => (
          <li key={c.id}>
            <CoverageRow
              c={c}
              week={week}
              tier={tier}
              open={selected === c.id}
              seen={opened.includes(`cell:${c.id}`)}
              onOpen={() => {
                setSelected((x) => (x === c.id ? "" : c.id));
                onOpen(c.id);
              }}
            />
            {selected === c.id && current && <CellDetail c={current} readiness={readiness} />}
          </li>
        ))}
      </ul>
      {!cells.length && <p className="text-sm text-ink-muted">No needs match those filters.</p>}
      <CoverageTable r={r} cells={cells} week={week} />
    </div>
  );
}

function BarLegend({ tier }: { tier: TierView }) {
  return (
    <p className="flex flex-wrap gap-4 text-xs text-ink-muted">
      {(["booked", "spare", "gap", ...(tier === "confirmed" ? [] : ["forecast"])] as (keyof typeof BAR)[]).map((k) => (
        <span key={k} className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-3 w-5 rounded" style={BAR[k].style} />{" "}
          {tier === "arranging" && k === "forecast" ? "Being arranged" : BAR[k].label}
        </span>
      ))}
    </p>
  );
}

function CoverageRow({ c, week, tier, open, seen, onOpen }: { c: CellResult; week: number; tier: TierView; open: boolean; seen: boolean; onOpen: () => void }) {
  const w = c.weeks[week] ?? c.weeks[0];
  const extra = tier === "forecast" ? c.forecast.high : tier === "arranging" ? c.arranging : 0;
  const whole = Math.max(1e-9, w.planned + extra);
  const pct = (v: number) => `${(Math.max(0, v) / whole) * 100}%`;
  const covered = Math.min(w.spare, w.unfilled);
  const status = week === 0 ? c.status : w.gap > 0 ? "gap" : c.status;
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onOpen}
      className={cx("w-full rounded-2xl bg-bg p-3 text-left ring-1 ring-line hover:ring-line-strong", open && "ring-2 ring-[var(--color-action)]")}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{c.label}</span>
        <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold", statusTone(status))}>
          {STATUS[status].label}
          {c.estimate ? " · estimate, confirm in scheduling" : ""}
        </span>
      </span>
      <span className="mt-2 flex h-5 w-full overflow-hidden rounded-md bg-muted" aria-hidden>
        <span style={{ ...BAR.booked.style, width: pct(w.booked) }} />
        <span style={{ ...BAR.spare.style, width: pct(covered) }} />
        <span style={{ ...BAR.gap.style, width: pct(w.gap) }} />
        {extra > 0 && <span style={{ ...BAR.forecast.style, width: pct(extra) }} />}
      </span>
      <span className="mt-1 block text-sm">
        {w.active ? (
          <>
            {fmtUnits(w.planned, c.unit)} planned · {fmtUnits(w.booked, c.unit)} booked · {fmtUnits(w.spare, c.unit)} usable spare ·{" "}
            <strong>{fmtUnits(w.gap, c.unit)} current gap</strong>
            {tier === "arranging" && ` · near-term gap with being arranged ${fmtUnits(w.nearTermGap, c.unit)}`}
            {tier === "forecast" && ` · forecast gap ${fmtUnits(w.forecastGap.low, c.unit)}–${fmtUnits(w.forecastGap.high, c.unit)} (a separate band)`}
            {" · "}
            {BACKUP[c.backup.state]}
          </>
        ) : (
          `Not needed yet this week (from ${dateLabel(c.neededFrom)}).`
        )}
        {seen ? "" : " · Open for why"}
      </span>
    </button>
  );
}

function CellDetail({ c, readiness }: { c: CellResult; readiness: Use | "" }) {
  const supply = c.supply.filter((x) => !readiness || x.use === readiness);
  return (
    <div className="mt-2 grid gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line md:grid-cols-2">
      <div>
        <p className={kicker}>Why</p>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {c.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {c.changeIf.length > 0 && (
          <>
            <p className={cx(kicker, "mt-3")}>What would change it</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {c.changeIf.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        )}
        <p className={cx(kicker, "mt-3")}>Who acts</p>
        <p className="mt-1 text-sm">{c.owner}</p>
        {c.choices.length > 0 && (
          <p className={cx("mt-3 rounded-xl px-3 py-2 text-sm", TONE.warn)}>
            {c.choices.map((x) => `${x.label}: chosen by the participant, at “${SUPPLY_STATES[x.state].toLowerCase()}”.`).join(" ")} Route: the provider’s
            verification and agreement. A choice to assess, not spare capacity, and not dropped.
          </p>
        )}
      </div>
      <div>
        <p className={kicker}>Each supply row{readiness ? ` (${USES[readiness].toLowerCase()})` : ""}</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {supply.map((x) => (
            <li key={x.id} className="rounded-xl bg-bg p-2 ring-1 ring-line">
              <span className="font-semibold">{x.label}</span> · {USES[x.use]}
              {x.hours > 0 ? ` · ${fmtUnits(x.hours, c.unit)} counted` : ""}
              <span className="block text-ink-muted">{x.reason}</span>
            </li>
          ))}
          {!supply.length && <li className="text-ink-muted">None.</li>}
        </ul>
        <p className={cx(kicker, "mt-3")}>Backup</p>
        <p className="mt-1 text-sm">
          {BACKUP[c.backup.state]}: {c.backup.available} suitable {c.backup.available === 1 ? "backup" : "backups"}
          {c.backup.target !== null ? `, against the owner’s target of ${c.backup.target}` : ""}
          {c.backup.continuity ? ` (including: ${c.backup.continuity})` : ""}. A candidate is never counted as a safe backup.
        </p>
        <p className={cx(kicker, "mt-3")}>Evidence</p>
        <p className="mt-1 text-sm">
          {c.source || "Source not recorded"}, verified {c.verifiedOn ? dateLabel(c.verifiedOn) : "never"}
          {c.staleDemand ? " (older than the freshness rule: needs confirmation)" : ""}. Gap in {c.recurs} of {c.weeks.length} weeks.
          {c.estimate ? " A coverage estimate: confirm the match in scheduling." : ""}
        </p>
      </div>
    </div>
  );
}

function CoverageTable({ r, cells, week }: { r: CoverageResult; cells: CellResult[]; week: number }) {
  const head = ["Service and time", "Confirmed planned", "Booked", "Usable spare", "Current gap", "Forecast range", "Backup", "Evidence"];
  return (
    <details className={box}>
      <summary className="min-h-11 cursor-pointer font-semibold">Table: every figure ({r.weeks[week]?.label})</summary>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[56rem] text-left text-sm">
          <caption className="sr-only">Coverage by service, place and time window, with every figure the chart shows</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              {head.map((h) => (
                <th key={h} scope="col" className="px-2 py-1 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => {
              const w = c.weeks[week] ?? c.weeks[0];
              return (
                <tr key={c.id} className="border-b border-line align-top">
                  <th scope="row" className="px-2 py-1.5 font-semibold">
                    {c.label}
                    <span className="block font-normal text-ink-muted">
                      {STATUS[week === 0 ? c.status : w.gap > 0 ? "gap" : c.status].label}
                      {c.estimate ? " · estimate, confirm in scheduling" : ""}
                    </span>
                  </th>
                  <td className="px-2">{fmtUnits(w.planned, c.unit)} a week</td>
                  <td className="px-2">{fmtUnits(w.booked, c.unit)}</td>
                  <td className="px-2">{fmtUnits(w.spare, c.unit)}</td>
                  <td className="px-2 font-semibold">{fmtUnits(w.gap, c.unit)}</td>
                  <td className="px-2">
                    +{fmtUnits(c.forecast.low, c.unit)} to +{fmtUnits(c.forecast.high, c.unit)} demand; gap {fmtUnits(w.forecastGap.low, c.unit)}–
                    {fmtUnits(w.forecastGap.high, c.unit)}
                  </td>
                  <td className="px-2">
                    {c.backup.available}
                    {c.backup.target !== null ? ` of ${c.backup.target}` : " (no target)"} · {BACKUP[c.backup.state]}
                  </td>
                  <td className="px-2">
                    {c.source || "Not recorded"}, {c.verifiedOn ? dateLabel(c.verifiedOn) : "never verified"}
                    {c.staleDemand ? " · needs confirmation" : ""}
                    {c.unknown > 0 ? ` · ${c.unknown} unknown or paused` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------------------------
// The fragile plan, the decisions and the follow-up
// ---------------------------------------------------------------------------------------------

function Fragile({ b, r, seen, onSee, onNext }: { b: CoverageBlock; r: CoverageResult; seen: boolean; onSee: () => void; onNext: () => void }) {
  const a = absence(b.inputs, b.story.absentWorker);
  const chosen = r.cells.flatMap((c) => c.choices.map((x) => ({ ...x, need: c.label })));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">{b.story.fragile}</p>
      <div className={box}>
        <p className={kicker}>An absence</p>
        {!seen ? (
          <button type="button" className={cx(secondary, "mt-2")} onClick={onSee}>
            See what happens if {a?.worker ?? "they’re"} away
          </button>
        ) : a ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">The current visits {a.worker}’s absence would affect</caption>
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th scope="col" className="py-1 pr-2 font-semibold">
                    Need
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Booked with {a.worker}
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Suitable backup could cover
                  </th>
                  <th scope="col" className="px-2 font-semibold">
                    Left uncovered
                  </th>
                </tr>
              </thead>
              <tbody>
                {a.affected.map((x) => (
                  <tr key={x.cell} className="border-b border-line">
                    <th scope="row" className="py-1.5 pr-2 font-semibold">
                      {x.label}
                    </th>
                    <td className="px-2">{fmtUnits(x.lost, x.unit)} a week</td>
                    <td className="px-2">{fmtUnits(x.covered, x.unit)}</td>
                    <td className="px-2 font-semibold">{fmtUnits(x.uncovered, x.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-sm">
              Today every one of those visits is booked, so there’s no current gap. But the only suitable backup is the spare that isn’t already counted, and it
              covers part of it. Unverified candidates aren’t counted as a safe backup. How much backup is enough is for the accountable Operations/Quality
              owner to set, not a universal ratio.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">This case doesn’t name a worker for the absence.</p>
        )}
      </div>
      {chosen.length > 0 && (
        <div className={box}>
          <p className={kicker}>A participant’s choice</p>
          {chosen.map((x) => (
            <p key={x.id} className="mt-1 text-sm">
              <strong>{x.label}</strong> was chosen by a participant ({x.need}) and is at “{SUPPLY_STATES[x.state].toLowerCase()}”. The choice is respected: the
              route is the provider’s verification and agreement. Until then they aren’t spare capacity, and they aren’t dropped from the plan.
            </p>
          ))}
        </div>
      )}
      <Next disabled={!seen} hint="Look at the absence first." onClick={onNext} label="Make two decisions" />
    </div>
  );
}

function Lists({ r }: { r: CoverageResult }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className={box}>
        <p className={kicker}>Act on current service gaps</p>
        <ul className="mt-1 flex flex-col gap-2 text-sm">
          {r.immediate.map((x) => (
            <li key={x.cell}>
              {x.text}
              <span className="block text-ink-muted">Who acts: {x.owner}.</span>
            </li>
          ))}
          {!r.immediate.length && <li>No current gap.</li>}
        </ul>
        <p className="mt-2 text-xs text-ink-muted">Listed by when they’re needed. The model never sets a clinical priority, and never by margin or funding.</p>
      </div>
      <div className={box}>
        <p className={kicker}>Build the local bench: the evidence</p>
        <ol className="mt-1 flex list-decimal flex-col gap-2 pl-5 text-sm">
          {r.network.map((p) => (
            <li key={p.cell}>
              <strong>{p.label}.</strong> {p.why}
              <span className="block text-ink-muted">
                {p.backup}. {p.lead} {p.freshness}. {p.preference}.
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ink-muted">
          Suggested order: the largest confirmed gap, then the forecast gap, then how often it recurs. Not a suburb score.
        </p>
      </div>
    </div>
  );
}

function Choice({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { id: string; text: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className="flex min-h-11 items-start gap-3 rounded-xl px-2 py-2 hover:bg-muted">
          <input
            type="radio"
            name={name}
            className="mt-1 size-5 shrink-0 accent-[var(--color-action)]"
            checked={value === o.id}
            onChange={() => onChange(o.id)}
          />
          {o.text}
        </label>
      ))}
    </fieldset>
  );
}

function Decide({
  b,
  r,
  s,
  onPick,
  onNext,
}: {
  b: CoverageBlock;
  r: CoverageResult;
  s: CoverageState;
  onPick: (k: "immediate" | "network" | "explanation", v: string) => void;
  onNext: () => void;
}) {
  const ready = Boolean(s.immediate && s.network && s.explanation);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">Two decisions, kept apart: what can’t wait, and where to build the network over the next six to eight weeks.</p>
      <Lists r={r} />
      <Choice
        legend="1. The immediate action: what happens about current gaps?"
        name="immediate"
        options={b.immediate}
        value={s.immediate}
        onChange={(v) => onPick("immediate", v)}
      />
      <Choice
        legend="2. The network priority: where to build the local bench first?"
        name="network"
        options={b.network}
        value={s.network}
        onChange={(v) => onPick("network", v)}
      />
      <Choice
        legend="3. The evidence you’d give for them"
        name="explanation"
        options={b.explanations}
        value={s.explanation}
        onChange={(v) => onPick("explanation", v)}
      />
      <Next disabled={!ready} hint="Choose an action, a priority and the evidence." onClick={onNext} label="Three weeks later" />
    </div>
  );
}

function FollowUp({
  b,
  r,
  after,
  s,
  busy,
  onPick,
  onFinish,
}: {
  b: CoverageBlock;
  r: CoverageResult;
  after: CoverageResult | null;
  s: CoverageState;
  busy: boolean;
  onPick: (k: "followUp" | "revised", v: string) => void;
  onFinish: () => void;
}) {
  const [opened, setOpened] = useState<string[]>([]);
  const u = updatedInputs(b);
  const changes = [...inputChanges(b.inputs, u), ...(after ? resultChanges(r, after) : [])];
  const problems = finishProblems(b, s);
  return (
    <div className="flex flex-col gap-4">
      <div className={box}>
        <p className={kicker}>{b.update.title || "Later"}</p>
        <p className="mt-1 text-lg">{b.update.text}</p>
      </div>
      {changes.length > 0 && (
        <div role="status" className={box}>
          <p className={kicker}>What changed?</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {changes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {after && <Comparison inputs={u} r={after} opened={opened} onOpen={(id) => setOpened((x) => [...x, `cell:${id}`])} />}
      <Choice legend={b.followUp.prompt} name="followUp" options={b.followUp.options} value={s.followUp} onChange={(v) => onPick("followUp", v)} />
      <label className="flex max-w-2xl flex-col gap-1 text-sm font-semibold">
        Would you keep your network priority, or change it?
        <select className={small} value={s.revised} onChange={(e) => onPick("revised", e.target.value)}>
          <option value="">Keep it</option>
          {b.network
            .filter((o) => o.id !== s.network)
            .map((o) => (
              <option key={o.id} value={o.id}>
                Change to: {o.text.length > 110 ? `${o.text.slice(0, 110)}…` : o.text}
              </option>
            ))}
        </select>
      </label>
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-ink-muted">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className={primary} disabled={busy || problems.length > 0} onClick={onFinish}>
          Finish and see the debrief
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The debrief
// ---------------------------------------------------------------------------------------------

function Debrief({
  b,
  after,
  d,
  busy,
  onPrint,
  onRetry,
}: {
  b: CoverageBlock;
  after: CoverageResult;
  d: CoverageDebrief;
  busy: boolean;
  onPrint: () => void;
  onRetry: () => void;
}) {
  const choice = after.cells.flatMap((c) =>
    c.choices.map((x) => `A participant’s chosen worker for ${c.label}: ${SUPPLY_STATES[x.state].toLowerCase()}; route: the provider’s checks.`),
  );
  return (
    <div className="flex flex-col gap-4">
      {d.flags.length > 0 && (
        <div role="alert" className={cx("rounded-2xl p-4", TONE.bad)}>
          <p className="font-semibold">Before anything else</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {d.flags.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
        </div>
      )}
      <div className={box}>
        <p className={kicker}>What happened next</p>
        <p className="mt-1">{d.immediate.outcome}</p>
        <p className="mt-1">{d.network.outcome}</p>
        {(
          [
            ["Your immediate action", d.immediate],
            ["Your network priority", d.network],
            ["Your evidence", d.explanation],
          ] as const
        ).map(([k, x]) => (
          <div key={k} className="mt-2 text-sm">
            <p>
              <strong>{k}:</strong> {x.text}
            </p>
            <p className="mt-0.5">{x.feedback}</p>
          </div>
        ))}
        <div className="mt-2 text-sm">
          <p>
            <strong>After the update:</strong> {d.followUp.text}
          </p>
          <p className="mt-0.5">{d.followUp.feedback}</p>
          {d.followUp.changed && <p className="mt-0.5">You changed your network priority to: {d.followUp.revised}</p>}
        </div>
      </div>
      <div className={box}>
        <p className={kicker}>
          How you did · {d.score} of {d.max}
        </p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {d.dims.map((x) => (
            <div key={x.dim} className="rounded-xl bg-surface p-3 ring-1 ring-line">
              <dt className="font-semibold">
                {x.label}: {LEVELS[x.rating]} ({x.rating}/3)
              </dt>
              <dd className="mt-1 text-sm">{x.why}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          It scores sound reasoning and honest communication, never how many clients are taken on or workers recruited.
        </p>
      </div>
      <div className={box}>
        <p className={kicker}>Your tags beside the coverage reading</p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Each supply card: your tag and the model’s reading</caption>
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className="py-1 pr-2 font-semibold">
                  Card
                </th>
                <th scope="col" className="px-2 font-semibold">
                  Yours
                </th>
                <th scope="col" className="px-2 font-semibold">
                  The reading
                </th>
              </tr>
            </thead>
            <tbody>
              {d.cards.map((c) => (
                <tr key={c.id} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pr-2 font-semibold">
                    {c.label}
                    <span className="block font-normal text-ink-muted">{c.need}</span>
                  </th>
                  <td className="px-2 py-2">
                    {c.yours ? USES[c.yours] : "Not tagged"} {c.matches ? "(matches)" : "(differs)"}
                  </td>
                  <td className="px-2 py-2">
                    {USES[c.answer]}
                    <span className="block text-ink-muted">{c.reason}</span>
                    <p className="mt-1">{c.feedback}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={box}>
        <p className={kicker}>Your prediction</p>
        <p className="mt-1 text-sm">
          You predicted <strong>{d.prediction.chosen.toLowerCase() || "(none chosen)"}</strong>.{" "}
          {d.prediction.likely.length ? `The comparison points to: ${d.prediction.likely.join("; ").toLowerCase()}.` : ""}
        </p>
      </div>
      <div className={box}>
        <p className={kicker}>The case</p>
        <p className="mt-1">{d.summary}</p>
        <Handoff b={b} />
        {b.links.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {b.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="font-semibold text-accent underline underline-offset-2">
                  {l.label}
                </Link>{" "}
                <span className="text-ink-muted">{l.why}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Brief
        title="Local Coverage Brief (learning copy, fictional)"
        period={`${dateLabel(after.asOf)}, ${after.weeks.length} weeks (${b.update.title.toLowerCase() || "after the update"})`}
        r={after}
        inputs={updatedInputs(b)}
        order={[]}
        owner={`${b.story.character} (fictional)`}
        reviewBy="When Worker P’s checks complete, or in three weeks"
        assumptions="Fictional figures. Availability counts only when provider approved, confirmed and verified within the 30-day rule set for the case."
        choice={choice.join(" ")}
        versions={`${d.versions.story} · ${d.versions.model} · ${d.versions.taxonomy}`}
        sources={b.sources}
      />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondary} onClick={onPrint}>
          <Icon name="print" className="size-4" /> Print or save the brief
        </button>
        <button type="button" className={secondary} disabled={busy} onClick={onRetry}>
          <Icon name="refresh" className="size-4" /> Look again
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Versions: {d.versions.lab}, story {d.versions.story}, rubric {d.versions.rubric}, model {d.versions.model}, taxonomy {d.versions.taxonomy}. Every
        attempt is kept.
      </p>
    </div>
  );
}

/** The Contractor Network Builder handoff: a labelled placeholder until that Work Tool exists. */
function Handoff({ b }: { b: Pick<CoverageBlock, "handoff"> }) {
  if (!b.handoff.label) return null;
  return (
    <div className={cx("mt-3 rounded-xl px-3 py-2 text-sm", TONE.warn)}>
      <p className="font-semibold">Next step: {b.handoff.label} · placeholder</p>
      <p className="mt-0.5">{b.handoff.note}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The Local Coverage Brief
// ---------------------------------------------------------------------------------------------

/** Prints the brief alone, using the Hub's print rule for a decision sheet (globals.css). */
function printBrief() {
  document.body.classList.add("printing-growth-sheet");
  const done = () => {
    document.body.classList.remove("printing-growth-sheet");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

function Brief({
  title,
  period,
  r,
  inputs,
  order,
  owner,
  reviewBy,
  assumptions,
  choice,
  notes,
  versions,
  sources = [],
}: {
  title: string;
  period: string;
  r: CoverageResult;
  inputs: CoverageInputs;
  order: { cell: string; reason: string }[];
  owner: string;
  reviewBy: string;
  assumptions: string;
  choice: string;
  notes?: string;
  versions: string;
  sources?: { title: string; url: string }[];
}) {
  const ranked = orderedNetwork(r, order);
  const gaps = r.cells.filter((c) => c.gap > 0).sort((a, b) => b.gap - a.gap);
  return (
    <section className="growth-sheet rounded-2xl bg-bg p-4 ring-1 ring-line" aria-label={title}>
      <p className={kicker}>{title}</p>
      <h5 className="mt-1 font-serif text-xl font-semibold">{period}</h5>
      <p className="text-sm text-ink-muted">
        {r.weeks[0]?.from ? `${dateLabel(r.weeks[0].from)} to ${dateLabel(r.weeks.at(-1)!.to)}` : ""} · {r.timezone} · {versions}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="font-semibold">Top service-time-area gaps</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {gaps.slice(0, 5).map((c) => (
              <li key={c.id}>
                {c.label}: {fmtUnits(c.gap, c.unit)} a week ({STATUS[c.status].label.toLowerCase()})
              </li>
            ))}
            {!gaps.length && <li>No current gap.</li>}
          </ul>
          <p className="mt-2 font-semibold">Immediate continuity actions</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {r.immediate.map((x) => (
              <li key={x.cell}>
                {x.text} <span className="text-ink-muted">Who: {x.owner}.</span>
              </li>
            ))}
            {!r.immediate.length && <li>None needed now.</li>}
          </ul>
        </div>
        <div>
          <p className="font-semibold">Network priorities</p>
          <ol className="mt-1 list-decimal pl-5 text-sm">
            {ranked.map(({ p, reason }) => (
              <li key={p.cell}>
                {p.label}. {p.why}
                {reason && <span className="block text-ink-muted">Moved: {reason}</span>}
              </li>
            ))}
            {!ranked.length && <li>None.</li>}
          </ol>
        </div>
      </div>
      <p className="mt-3 font-semibold">Sources and timestamps</p>
      <ul className="mt-1 list-disc pl-5 text-sm">
        {inputs.demand.map((c) => (
          <li key={c.id}>
            {r.cells.find((x) => x.id === c.id)?.label}: {c.source || "source not recorded"}, verified {c.verifiedOn ? dateLabel(c.verifiedOn) : "never"}
          </li>
        ))}
        <li>
          Availability freshness rule: {inputs.freshness.days ?? "not set"} days, set by {inputs.freshness.setBy || "not named"}
          {inputs.freshness.from ? ` from ${dateLabel(inputs.freshness.from)}` : ""}.
        </li>
      </ul>
      <p className="mt-3 font-semibold">Assumptions</p>
      <p className="text-sm">{assumptions || "None recorded."}</p>
      {choice && (
        <>
          <p className="mt-3 font-semibold">Participant choice (anonymous status and route)</p>
          <p className="text-sm">{choice}</p>
        </>
      )}
      {notes && <p className="mt-2 whitespace-pre-line text-sm">{notes}</p>}
      <p className="mt-2 text-sm">
        <strong>Owner:</strong> {owner || "not named yet"} · <strong>Review date:</strong> {reviewBy || "set one"}
      </p>
      {sources.length > 0 && <p className="mt-2 text-xs text-ink-muted">Sources: {sources.map((x) => x.title).join("; ")}.</p>}
      <p className="mt-1 text-xs text-ink-muted">
        A planning summary from aggregate figures: no participant’s name, address or diagnosis. It doesn’t approve a contractor, set a clinical priority or
        promise a service date.
      </p>
    </section>
  );
}

function orderedNetwork(r: CoverageResult, order: { cell: string; reason: string }[]) {
  const byCell = new Map(r.network.map((p) => [p.cell, p]));
  const first = order.filter((o) => byCell.has(o.cell)).map((o) => ({ p: byCell.get(o.cell)!, reason: o.reason }));
  const rest = r.network.filter((p) => !order.some((o) => o.cell === p.cell)).map((p) => ({ p, reason: "" }));
  return [...first, ...rest];
}

// ---------------------------------------------------------------------------------------------
// Plan my local area
// ---------------------------------------------------------------------------------------------

type BriefFields = {
  period: string;
  assumptions: string;
  order: { cell: string; reason: string }[];
  choice: string;
  owner: string;
  reviewBy: string;
  notes: string;
};
const blankBrief = (): BriefFields => ({ period: "", assumptions: "", order: [], choice: "", owner: "", reviewBy: "", notes: "" });
type PlanSummary = { id: string; name: string; versions: number; updatedAt: string; updatedBy: string };
type Plan = {
  id: string;
  name: string;
  version: number;
  versions: { number: number; savedAt: string; savedBy: string; note: string; modelVersion: string }[];
  inputs: CoverageInputs;
  brief: BriefFields;
  previous: { number: number; savedAt: string; inputs: CoverageInputs; brief: BriefFields } | null;
  earlierModel: boolean;
};

const isoToday = () => new Date().toISOString().slice(0, 10);

function PlanMyArea({ orgName, b }: { orgName: string; b: CoverageBlock }) {
  const home = useApi<{ access: { orgName: string } | null; plans: PlanSummary[] }>("/api/tools/coverage");
  // Unsaved entries live in this page only: never in the browser's storage, so a shared device doesn't keep them.
  const [inputs, setInputs] = useState<CoverageInputs | null>(null);
  const [baseline, setBaseline] = useState<CoverageInputs | null>(null);
  const [brief, setBrief] = useState<BriefFields>(blankBrief());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [opened, setOpened] = useState<string[]>([]);
  // The last valid result stays, labelled, while a field is blank or out of range.
  const [lastGood, setLastGood] = useState<CoverageInputs | null>(null);

  const load = async (id: string, version?: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const p = await api<Plan>(`/api/tools/coverage?id=${encodeURIComponent(id)}${version ? `&version=${version}` : ""}`);
      setPlan(p);
      setInputs(p.inputs);
      setBaseline(p.inputs);
      setBrief(p.brief);
      setName(p.name);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startBlank = () => {
    const fresh = blankInputs(isoToday());
    setPlan(null);
    setInputs(fresh);
    setBaseline(fresh);
    setBrief(blankBrief());
    setName("");
  };
  const save = async () => {
    if (!inputs) return;
    setBusy(true);
    setMessage(null);
    try {
      const p = await api<Plan>("/api/tools/coverage", { body: { id: plan?.id, name, inputs, brief, note } });
      setPlan(p);
      setBaseline(p.inputs);
      setNote("");
      setMessage(`Saved as version ${p.version}.`);
      home.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const list = home.data?.plans ?? [];
  const errors = inputs ? validateInputs(inputs) : [];
  const r = inputs && !errors.length ? calculate(inputs) : null;
  if (inputs && r && lastGood !== inputs) setLastGood(inputs);
  const fallback = !r && lastGood && !validateInputs(lastGood).length ? lastGood : null;
  const shown = r ?? (fallback ? calculate(fallback) : null);
  const shownInputs = r ? inputs : fallback;
  const prev = plan?.previous && !validateInputs(plan.previous.inputs).length ? plan.previous : null;
  const changes = inputs && prev ? inputChanges(prev.inputs, inputs) : inputs && baseline ? inputChanges(baseline, inputs) : [];
  const resultDelta = r && prev ? resultChanges(calculate(prev.inputs), r) : [];
  const set = (fn: (i: CoverageInputs) => CoverageInputs) => setInputs((x) => (x ? fn(x) : x));
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="rounded-2xl bg-muted px-4 py-3 text-sm">
        <p>
          <strong>Private to {orgName || "your business"}:</strong> only you and the people you’ve authorised can see these plans, checked on the server for
          every read and save. Trilogy Care staff, course authors and other businesses can’t see them, and they never appear in anyone’s dashboard.
        </p>
        <p className="mt-1">
          <strong>What to enter:</strong> <strong>aggregate, anonymous</strong> rows: hours or visits a week by service, area and time window, and supply rows
          labelled “Agency row 1” or “Worker A”. No participant names, addresses, diagnoses or care plans; no contractor contact details. If an area has only
          one or two clients, use a wider area so nobody can be identified.
        </p>
        <p className="mt-1">
          <strong>Kept:</strong> nothing until you choose Save. Each save is a new version, kept for your business until you ask for it to be removed.
        </p>
      </div>
      {!inputs && (
        <div className="flex flex-col gap-3">
          {list.length > 0 && (
            <button type="button" className={cx(primary, "self-start")} disabled={busy} onClick={() => load(list[0].id)}>
              Resume my plan: {list[0].name}
            </button>
          )}
          {list.length > 1 && (
            <ul className="flex flex-col gap-1 text-sm">
              {list.slice(1).map((x) => (
                <li key={x.id}>
                  <button type="button" className="min-h-10 font-semibold text-accent underline underline-offset-2" onClick={() => load(x.id)}>
                    {x.name}
                  </button>{" "}
                  <span className="text-ink-muted">
                    {x.versions} {x.versions === 1 ? "version" : "versions"} · {x.updatedBy}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={cx(list.length ? secondary : primary, "self-start")} onClick={startBlank}>
            Start a blank plan
          </button>
        </div>
      )}
      {inputs && (
        <>
          {plan && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{plan.name}</span>
              <label className="flex items-center gap-2">
                Version
                <select className={cx(small, "w-auto")} value={plan.version} onChange={(e) => load(plan.id, Number(e.target.value))}>
                  {plan.versions.map((v) => (
                    <option key={v.number} value={v.number}>
                      {v.number} · {v.savedAt.slice(0, 10)} · {v.savedBy}
                      {v.note ? ` · ${v.note}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {plan.earlierModel && (
                <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold", TONE.warn)}>Saved under an earlier model: recalculated now</span>
              )}
            </div>
          )}
          {errors.length > 0 && (
            <div role="status" className={cx("rounded-2xl p-3 text-sm", TONE.warn)}>
              <p className="font-semibold">{shown ? "Showing the last valid result (a prior result)." : "No result yet."} Fix these first:</p>
              <ul className="mt-1 list-disc pl-5">
                {errors.slice(0, 6).map((e) => (
                  <li key={e.field + e.message}>{e.message}</li>
                ))}
                {errors.length > 6 && <li>and {errors.length - 6} more</li>}
              </ul>
            </div>
          )}
          {shown && shownInputs && (
            <>
              <AreaMap inputs={shownInputs} r={shown} reveal selected="" />
              <Comparison inputs={shownInputs} r={shown} opened={opened} onOpen={(id) => setOpened((x) => [...x, `cell:${id}`])} stale={!r} />
              <Lists r={shown} />
              <NetworkOrder r={shown} order={brief.order} onChange={(order) => setBrief((x) => ({ ...x, order }))} />
              <Handoff b={b} />
            </>
          )}
          <details className={box} open={!r}>
            <summary className="min-h-11 cursor-pointer font-semibold">Enter or edit the figures</summary>
            <div className="mt-3 flex flex-col gap-4">
              <SettingsEditor inputs={inputs} errors={errors} onChange={setInputs} />
              <AreasEditor inputs={inputs} errors={errors} onChange={set} />
              <NeedsEditor inputs={inputs} errors={errors} onChange={set} />
              <SupplyEditor inputs={inputs} errors={errors} onChange={set} />
            </div>
          </details>
          {(changes.length > 0 || resultDelta.length > 0) && (
            <div className={box}>
              <p className={kicker}>What changed since {prev ? `version ${prev.number}` : plan ? `version ${plan.version}` : "you started"}?</p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {[...changes, ...resultDelta].slice(0, 24).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-ink-muted">
                A contractor added to the list isn’t an improvement until they’re approved, available, verified and delivering.
              </p>
            </div>
          )}
          <fieldset className={box}>
            <legend className="sr-only">Local Coverage Brief</legend>
            <p className={kicker}>Your Local Coverage Brief</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["period", "Planning period", "e.g. the next eight weeks from 1 March"],
                  ["owner", "Owner (a role is fine)", ""],
                  ["choice", "Participant-choice issue (status and route only, no names)", "e.g. a chosen worker in provider verification"],
                ] as const
              ).map(([k, label, placeholder]) => (
                <label key={k} className="flex flex-col gap-1 text-xs font-semibold">
                  {label}
                  <input className={small} value={brief[k]} placeholder={placeholder} onChange={(e) => setBrief((x) => ({ ...x, [k]: e.target.value }))} />
                </label>
              ))}
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Review date
                <input type="date" className={small} value={brief.reviewBy} onChange={(e) => setBrief((x) => ({ ...x, reviewBy: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                Assumptions (what you couldn’t confirm, and what you’ve estimated)
                <textarea
                  className={cx(small, "min-h-16 py-2")}
                  value={brief.assumptions}
                  onChange={(e) => setBrief((x) => ({ ...x, assumptions: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                Notes (who agreed what, who you’ve told)
                <textarea className={cx(small, "min-h-16 py-2")} value={brief.notes} onChange={(e) => setBrief((x) => ({ ...x, notes: e.target.value }))} />
              </label>
            </div>
          </fieldset>
          {r && (
            <Brief
              title="Local Coverage Brief (private)"
              period={brief.period || "Period not set"}
              r={r}
              inputs={inputs}
              order={brief.order}
              owner={brief.owner}
              reviewBy={brief.reviewBy ? dateLabel(brief.reviewBy) : ""}
              assumptions={brief.assumptions}
              choice={brief.choice}
              notes={brief.notes}
              versions={`${plan ? `${plan.name}, version ${plan.version}` : "unsaved"} · ${MODEL_VERSION}`}
            />
          )}
          <div className="flex flex-wrap items-end gap-3">
            {!plan && (
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Plan name
                <input className={cx(small, "w-56")} value={name} onChange={(e) => setName(e.target.value)} placeholder="North side, March" />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold">
              What changed (optional)
              <input className={cx(small, "w-64")} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="button" className={primary} disabled={busy || (!plan && !name.trim())} onClick={save}>
              {plan ? "Save a new version" : "Save"}
            </button>
            {r && (
              <button type="button" className={secondary} onClick={printBrief}>
                <Icon name="print" className="size-4" /> Print or save the brief
              </button>
            )}
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setInputs(null);
                setPlan(null);
              }}
            >
              Close
            </button>
          </div>
        </>
      )}
      {message && (
        <p role="status" className="text-sm font-semibold">
          {message}
        </p>
      )}
    </div>
  );
}

/** The owner's own order for the network priorities: each move needs a recorded reason. */
function NetworkOrder({
  r,
  order,
  onChange,
}: {
  r: CoverageResult;
  order: { cell: string; reason: string }[];
  onChange: (o: { cell: string; reason: string }[]) => void;
}) {
  const ranked = orderedNetwork(r, order);
  if (ranked.length < 2) return null;
  const move = (k: number, dir: -1 | 1) => {
    const next = ranked.map((x) => ({ cell: x.p.cell, reason: x.reason }));
    const j = k + dir;
    if (j < 0 || j >= next.length) return;
    [next[k], next[j]] = [next[j], next[k]];
    onChange(next);
  };
  return (
    <fieldset className={box}>
      <legend className="sr-only">Your order for the network priorities</legend>
      <p className={kicker}>Your order for the network priorities</p>
      <p className="mt-1 text-sm text-ink-muted">Reorder if you know something the figures don’t, and record why. The reason goes in the brief.</p>
      <ol className="mt-2 flex flex-col gap-2">
        {ranked.map(({ p, reason }, k) => (
          <li key={p.cell} className="grid gap-2 rounded-xl bg-surface p-2 ring-1 ring-line sm:grid-cols-[minmax(0,1fr)_16rem_auto]">
            <span className="text-sm font-semibold">
              {k + 1}. {p.label}
            </span>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Reason for this position
              <input
                className={small}
                value={reason}
                onChange={(e) => onChange(ranked.map((x, j) => ({ cell: x.p.cell, reason: j === k ? e.target.value : x.reason })))}
              />
            </label>
            <span className="flex gap-1 self-end">
              <button type="button" className={cx(secondary, "min-h-10 px-3")} disabled={k === 0} onClick={() => move(k, -1)} aria-label={`Move ${p.label} up`}>
                <Icon name="arrow-up" className="size-4" />
              </button>
              <button
                type="button"
                className={cx(secondary, "min-h-10 px-3")}
                disabled={k === ranked.length - 1}
                onClick={() => move(k, 1)}
                aria-label={`Move ${p.label} down`}
              >
                <Icon name="arrow-down" className="size-4" />
              </button>
            </span>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------------------------
// Editing figures
// ---------------------------------------------------------------------------------------------

const errorFor = (errors: InputError[], field: string) => errors.find((e) => e.field === field)?.message;

function NumField({
  label,
  value,
  onChange,
  error,
  unit,
  step = 0.5,
}: {
  label: string;
  value: Num;
  onChange: (v: Num) => void;
  error?: string;
  unit: string;
  step?: number;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
      <span>
        {label} <span className="font-normal text-ink-muted">({unit})</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        className={cx(small, error && "border-danger")}
        value={value ?? ""}
        aria-invalid={Boolean(error)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      {error && <span className="font-normal text-danger">{error}</span>}
    </label>
  );
}

/** A time of day as hours (7.5 is 7:30 am). Blank stays blank. */
function TimeField({ label, value, onChange, error }: { label: string; value: Num; onChange: (v: Num) => void; error?: string }) {
  const text = value === null ? "" : `${String(Math.floor(value)).padStart(2, "0")}:${String(Math.round((value % 1) * 60)).padStart(2, "0")}`;
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold">
      {label}
      <input
        type="time"
        step={900}
        className={cx(small, error && "border-danger")}
        value={text}
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          const m = /^(\d{2}):(\d{2})$/.exec(e.target.value);
          onChange(m ? Number(m[1]) + Number(m[2]) / 60 : null);
        }}
      />
      {error && <span className="font-normal text-danger">{error}</span>}
    </label>
  );
}

function DaysField({ value, onChange, label }: { value: Day[]; onChange: (d: Day[]) => void; label: string }) {
  return (
    <fieldset className="flex flex-wrap gap-x-2 text-xs">
      <legend className="font-semibold">{label}</legend>
      {DAYS.map((d) => (
        <label key={d} className="flex min-h-10 items-center gap-1">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-action)]"
            checked={value.includes(d)}
            onChange={(e) => onChange(e.target.checked ? DAYS.filter((x) => x === d || value.includes(x)) : value.filter((x) => x !== d))}
          />
          {DAY_NAMES[d]}
        </label>
      ))}
    </fieldset>
  );
}

function SettingsEditor({ inputs, errors, onChange }: { inputs: CoverageInputs; errors: InputError[]; onChange: (i: CoverageInputs) => void }) {
  return (
    <fieldset className={box}>
      <legend className="sr-only">Planning period and rules</legend>
      <p className={kicker}>Planning period and rules</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Starts (as of)
          <input type="date" className={small} value={inputs.asOf} onChange={(e) => onChange({ ...inputs, asOf: e.target.value })} />
        </label>
        <NumField
          label={`Horizon (${HORIZON.min}–${HORIZON.max})`}
          unit="weeks"
          step={1}
          value={inputs.weeks}
          error={errorFor(errors, "weeks")}
          onChange={(v) => onChange({ ...inputs, weeks: v })}
        />
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Time zone
          <input className={small} value={inputs.timezone} onChange={(e) => onChange({ ...inputs, timezone: e.target.value })} />
        </label>
        <NumField
          label="Availability freshness rule"
          unit="days"
          step={1}
          value={inputs.freshness.days}
          error={errorFor(errors, "freshness.days")}
          onChange={(v) => onChange({ ...inputs, freshness: { ...inputs.freshness, days: v } })}
        />
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Rule set by (the operational owner)
          <input
            className={small}
            value={inputs.freshness.setBy}
            onChange={(e) => onChange({ ...inputs, freshness: { ...inputs.freshness, setBy: e.target.value } })}
          />
        </label>
        <NumField
          label="Weeks from interest to approval"
          unit="weeks"
          step={1}
          value={inputs.leadWeeks}
          error={errorFor(errors, "leadWeeks")}
          onChange={(v) => onChange({ ...inputs, leadWeeks: v })}
        />
      </div>
    </fieldset>
  );
}

function AreasEditor({
  inputs,
  errors,
  onChange,
}: {
  inputs: CoverageInputs;
  errors: InputError[];
  onChange: (fn: (i: CoverageInputs) => CoverageInputs) => void;
}) {
  return (
    <fieldset className={box}>
      <legend className="sr-only">Areas</legend>
      <p className={kicker}>Areas or travel zones</p>
      <ul className="mt-2 flex flex-col gap-2">
        {inputs.areas.map((a, k) => (
          <li key={a.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Name
              <input
                className={cx(small, errorFor(errors, `area.${a.id}.name`) && "border-danger")}
                value={a.name}
                onChange={(e) => onChange((i) => ({ ...i, areas: i.areas.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) }))}
              />
            </label>
            <NumField
              label="Map across"
              unit="0–100"
              step={5}
              value={a.x}
              onChange={(v) => onChange((i) => ({ ...i, areas: i.areas.map((x, j) => (j === k ? { ...x, x: v ?? 50 } : x)) }))}
            />
            <NumField
              label="Map down"
              unit="0–100"
              step={5}
              value={a.y}
              onChange={(v) => onChange((i) => ({ ...i, areas: i.areas.map((x, j) => (j === k ? { ...x, y: v ?? 50 } : x)) }))}
            />
            <button
              type="button"
              className={cx(secondary, "self-end")}
              disabled={inputs.areas.length <= 1}
              onClick={() => onChange((i) => ({ ...i, areas: i.areas.filter((_, j) => j !== k) }))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={cx(secondary, "mt-2")}
        disabled={inputs.areas.length >= 12}
        onClick={() =>
          onChange((i) => ({
            ...i,
            areas: [
              ...i.areas,
              {
                id: nextId(
                  i.areas.map((x) => x.id),
                  "area",
                ),
                name: "",
                x: 50,
                y: 50,
              },
            ],
          }))
        }
      >
        <Icon name="plus" className="size-4" /> Add an area
      </button>
    </fieldset>
  );
}

function nextId(used: string[], prefix: string) {
  for (let k = used.length + 1; ; k += 1) if (!used.includes(`${prefix}-${k}`)) return `${prefix}-${k}`;
}

function NeedsEditor({
  inputs,
  errors,
  onChange,
}: {
  inputs: CoverageInputs;
  errors: InputError[];
  onChange: (fn: (i: CoverageInputs) => CoverageInputs) => void;
}) {
  const edit = (k: number, patch: Partial<DemandCell>) => onChange((i) => ({ ...i, demand: i.demand.map((x, j) => (j === k ? { ...x, ...patch } : x)) }));
  return (
    <fieldset className={box}>
      <legend className="sr-only">Service needs</legend>
      <p className={kicker}>What clients need (aggregate, a week)</p>
      <ul className="mt-2 flex flex-col gap-3">
        {inputs.demand.map((c, k) => {
          const e = (f: string) => errorFor(errors, `cell.${c.id}.${f}`);
          const unit = c.unit === "hours" ? "h" : "visits";
          return (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl bg-surface p-3 ring-1 ring-line">
              <div className="grid gap-2 sm:grid-cols-4">
                <Select
                  label="Service"
                  value={c.service}
                  onChange={(v) => edit(k, { service: v as Service })}
                  options={SERVICE_ORDER.map((x) => [x, SERVICES[x]])}
                />
                <Select
                  label="Capability needed"
                  value={c.capability}
                  onChange={(v) => edit(k, { capability: v as Capability | "" })}
                  options={[["", "None beyond the service"], ...CAPABILITY_ORDER.map((x) => [x, CAPABILITIES[x]] as [string, string])]}
                />
                <Select
                  label="Area"
                  value={c.area}
                  onChange={(v) => edit(k, { area: v })}
                  options={[["", "Choose…"], ...inputs.areas.map((a) => [a.id, a.name || "(unnamed)"] as [string, string])]}
                />
                <Select
                  label="Counted in"
                  value={c.unit}
                  onChange={(v) => edit(k, { unit: v as Unit })}
                  options={[
                    ["hours", "Hours"],
                    ["visits", "Visits"],
                  ]}
                />
              </div>
              <DaysField label="Days" value={c.window.days} onChange={(d) => edit(k, { window: { ...c.window, days: d } })} />
              <div className="grid gap-2 sm:grid-cols-4">
                <TimeField label="Window from" value={c.window.from} error={e("window.from")} onChange={(v) => edit(k, { window: { ...c.window, from: v } })} />
                <TimeField label="Window to" value={c.window.to} error={e("window.to")} onChange={(v) => edit(k, { window: { ...c.window, to: v } })} />
                <NumField label="Each visit" unit="h" step={0.25} value={c.visitHours} error={e("visitHours")} onChange={(v) => edit(k, { visitHours: v })} />
                <NumField label="Backup target (owner sets)" unit="workers" step={1} value={c.backupTarget} onChange={(v) => edit(k, { backupTarget: v })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <NumField label={TIERS.confirmed} unit={unit} value={c.planned} error={e("planned")} onChange={(v) => edit(k, { planned: v })} />
                <NumField label="Booked" unit={unit} value={c.booked} error={e("booked")} onChange={(v) => edit(k, { booked: v })} />
                <NumField label={TIERS.arranging} unit={unit} value={c.arranging} error={e("arranging")} onChange={(v) => edit(k, { arranging: v })} />
                <NumField label={TIERS.unknown} unit="needs" step={1} value={c.unknown} error={e("unknown")} onChange={(v) => edit(k, { unknown: v })} />
                <NumField
                  label="Forecast: low"
                  unit={unit}
                  value={c.forecast.low}
                  error={e("forecast.low")}
                  onChange={(v) => edit(k, { forecast: { ...c.forecast, low: v } })}
                />
                <NumField
                  label="Forecast: base"
                  unit={unit}
                  value={c.forecast.base}
                  error={e("forecast.base")}
                  onChange={(v) => edit(k, { forecast: { ...c.forecast, base: v } })}
                />
                <NumField
                  label="Forecast: high"
                  unit={unit}
                  value={c.forecast.high}
                  error={e("forecast.high")}
                  onChange={(v) => edit(k, { forecast: { ...c.forecast, high: v } })}
                />
                <Select
                  label="Preference"
                  value={c.preference}
                  onChange={(v) => edit(k, { preference: v as Preference })}
                  options={Object.entries(PREFERENCES) as [string, string][]}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Needed from
                  <input type="date" className={small} value={c.neededFrom} onChange={(ev) => edit(k, { neededFrom: ev.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Source
                  <input className={small} value={c.source} onChange={(ev) => edit(k, { source: ev.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Source owner
                  <input className={small} value={c.owner} onChange={(ev) => edit(k, { owner: ev.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Last verified
                  <input type="date" className={small} value={c.verifiedOn} onChange={(ev) => edit(k, { verifiedOn: ev.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-3">
                  Approved continuity arrangement (if any)
                  <input className={small} value={c.continuity} onChange={(ev) => edit(k, { continuity: ev.target.value })} />
                </label>
                <button
                  type="button"
                  className={cx(secondary, "self-end")}
                  disabled={inputs.demand.length <= 1}
                  onClick={() => onChange((i) => ({ ...i, demand: i.demand.filter((_, j) => j !== k) }))}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={cx(secondary, "mt-2")}
        disabled={inputs.demand.length >= 40}
        onClick={() =>
          onChange((i) => ({
            ...i,
            demand: [
              ...i.demand,
              blankCell(
                nextId(
                  i.demand.map((x) => x.id),
                  "need",
                ),
                i.areas[0]?.id ?? "",
              ),
            ],
          }))
        }
      >
        <Icon name="plus" className="size-4" /> Add a need
      </button>
    </fieldset>
  );
}

function SupplyEditor({
  inputs,
  errors,
  onChange,
}: {
  inputs: CoverageInputs;
  errors: InputError[];
  onChange: (fn: (i: CoverageInputs) => CoverageInputs) => void;
}) {
  const edit = (k: number, patch: Partial<SupplyRow>) => onChange((i) => ({ ...i, supply: i.supply.map((x, j) => (j === k ? { ...x, ...patch } : x)) }));
  return (
    <fieldset className={box}>
      <legend className="sr-only">Supply</legend>
      <p className={kicker}>Supply (anonymous rows)</p>
      <ul className="mt-2 flex flex-col gap-3">
        {inputs.supply.map((s, k) => {
          const editSlot = (j: number, patch: Partial<Availability>) => edit(k, { slots: s.slots.map((a, m) => (m === j ? { ...a, ...patch } : a)) });
          return (
            <li key={s.id} className="flex flex-col gap-2 rounded-xl bg-surface p-3 ring-1 ring-line">
              <div className="grid gap-2 sm:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Label (no names)
                  <input className={small} value={s.label} onChange={(e) => edit(k, { label: e.target.value })} />
                </label>
                <Select
                  label="Service"
                  value={s.service}
                  onChange={(v) => edit(k, { service: v as Service })}
                  options={SERVICE_ORDER.map((x) => [x, SERVICES[x]])}
                />
                <Select
                  label="State"
                  value={s.state}
                  onChange={(v) => edit(k, { state: v as SupplyState })}
                  options={STATE_ORDER.map((x) => [x, SUPPLY_STATES[x]])}
                />
                <label className="flex min-h-10 items-center gap-2 self-end text-xs font-semibold">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-action)]"
                    checked={s.aggregate}
                    onChange={(e) => edit(k, { aggregate: e.target.checked })}
                  />
                  Aggregate row (several workers: an estimate)
                </label>
              </div>
              <fieldset className="flex flex-wrap gap-x-3 text-xs">
                <legend className="font-semibold">Approved capabilities</legend>
                {CAPABILITY_ORDER.map((c) => (
                  <label key={c} className="flex min-h-10 items-center gap-1">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-action)]"
                      checked={s.capabilities.includes(c)}
                      onChange={(e) => edit(k, { capabilities: e.target.checked ? [...s.capabilities, c] : s.capabilities.filter((x) => x !== c) })}
                    />
                    {CAPABILITIES[c]}
                  </label>
                ))}
              </fieldset>
              <fieldset className="flex flex-wrap gap-x-3 text-xs">
                <legend className="font-semibold">Travels to</legend>
                {inputs.areas.map((a) => (
                  <label key={a.id} className="flex min-h-10 items-center gap-1">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-action)]"
                      checked={s.areas.includes(a.id)}
                      onChange={(e) => edit(k, { areas: e.target.checked ? [...s.areas, a.id] : s.areas.filter((x) => x !== a.id) })}
                    />
                    {a.name || "(unnamed)"}
                  </label>
                ))}
              </fieldset>
              {s.slots.map((a, j) => (
                <div key={a.id} className="flex flex-col gap-2 rounded-lg bg-bg p-2 ring-1 ring-line">
                  <DaysField label={`Availability ${j + 1}: days`} value={a.days} onChange={(d) => editSlot(j, { days: d })} />
                  <div className="grid gap-2 sm:grid-cols-5">
                    <TimeField label="From" value={a.from} error={errorFor(errors, `slot.${s.id}.${a.id}.from`)} onChange={(v) => editSlot(j, { from: v })} />
                    <TimeField label="To" value={a.to} error={errorFor(errors, `slot.${s.id}.${a.id}.to`)} onChange={(v) => editSlot(j, { to: v })} />
                    <NumField
                      label="Hours a week"
                      unit="h"
                      value={a.hours}
                      error={errorFor(errors, `slot.${s.id}.${a.id}.hours`)}
                      onChange={(v) => editSlot(j, { hours: v })}
                    />
                    <Select
                      label="Status"
                      value={a.status}
                      onChange={(v) => editSlot(j, { status: v as AvailabilityStatus })}
                      options={Object.entries(AVAILABILITY) as [string, string][]}
                    />
                    <button
                      type="button"
                      className={cx(secondary, "self-end")}
                      onClick={() => edit(k, { slots: s.slots.filter((_, m) => m !== j) })}
                      aria-label={`Remove availability ${j + 1} of ${s.label || "this row"}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  className={cx(secondary, "self-end")}
                  disabled={s.slots.length >= 8}
                  onClick={() =>
                    edit(k, {
                      slots: [
                        ...s.slots,
                        {
                          id: nextId(
                            s.slots.map((x) => x.id),
                            "a",
                          ),
                          days: [],
                          from: null,
                          to: null,
                          hours: null,
                          status: "confirmed",
                          effectiveFrom: "",
                        },
                      ],
                    })
                  }
                >
                  <Icon name="plus" className="size-4" /> Availability
                </button>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Availability last verified
                  <input type="date" className={small} value={s.verifiedOn} onChange={(e) => edit(k, { verifiedOn: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold">
                  Source and owner
                  <input className={small} value={s.source} onChange={(e) => edit(k, { source: e.target.value })} />
                </label>
                <Select
                  label="Chosen by a participant for"
                  value={s.preferredFor}
                  onChange={(v) => edit(k, { preferredFor: v })}
                  options={[["", "No one"], ...inputs.demand.map((c, m) => [c.id, `Need ${m + 1}: ${SERVICES[c.service]}`] as [string, string])]}
                />
              </div>
              <button
                type="button"
                className={cx(secondary, "self-start")}
                onClick={() => onChange((i) => ({ ...i, supply: i.supply.filter((_, j) => j !== k) }))}
              >
                Remove this row
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className={cx(secondary, "mt-2")}
        disabled={inputs.supply.length >= 60}
        onClick={() =>
          onChange((i) => {
            const id = nextId(
              i.supply.map((x) => x.id),
              "row",
            );
            return { ...i, supply: [...i.supply, blankSupply(id, `Supply row ${i.supply.length + 1}`)] };
          })
        }
      >
        <Icon name="plus" className="size-4" /> Add a supply row
      </button>
      <p className="mt-2 text-xs text-ink-muted">
        A listing or an interested contractor isn’t capacity. A row counts only when it’s provider approved, free in the matching window, confirmed and verified
        within your freshness rule. {timeLabel(7)} visits need {timeLabel(7)} availability.
      </p>
    </fieldset>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold">
      {label}
      <select className={small} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
