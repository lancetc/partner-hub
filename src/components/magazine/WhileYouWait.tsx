"use client";

import { useEffect, useId, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { useHydrated } from "@/lib/store";
import type { BridgeBlock } from "@/lib/magazine";
import {
  BADGES,
  CHSP_REFERRAL,
  compare,
  emptyInput,
  FEE_ESTIMATOR,
  familySummary,
  LIVE_NOTICE,
  PENSION,
  PRACTICE_NOTICE,
  STAGE_ORDER,
  STAGES,
  type Badge,
  type BridgeInput,
  type ChspReferral,
  type Need,
  type Pension,
  type Stage,
} from "@/lib/bridge";
import { aud, CATEGORIES, RULESET, SERVICES, showDate, WEEKDAYS, type ServiceId } from "@/lib/sahRules";
import type { bridgeState, liveStatus } from "@/server/bridge";
import { Icon } from "../Icon";
import { CharacterRow } from "../characters/CharacterPortrait";
import type { InteractiveContext } from "./InteractiveBlocks";

/*
  "While You Wait" (docs/while-you-wait.md). One calculator, two modes:
  - BridgePractice: the Magazine block. A fictional scenario; the learner can change the service pattern, start
    date and wait scenario, then writes the family a summary that's checked against the reviewed points.
  - LiveBridge: the staff tool at /tools/while-you-wait. Everything is entered from checked sources, nothing is
    saved, and the family summary is copied, never sent.
  Every slider has a number field and step buttons, every figure says where it came from, and the totals are
  announced once, quietly. Nothing animates.
*/

export type Patch = (fn: (i: BridgeInput) => BridgeInput) => void;
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const small =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line-strong bg-surface px-3 font-semibold hover:bg-muted disabled:opacity-40";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const good = "rounded-2xl bg-[#e3f4ea] p-4 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const errorText = (e: unknown, d: string) => (e instanceof Error ? e.message : d);

function BadgeText({ b, extra }: { b: Badge; extra?: string }) {
  return (
    <span className="inline-block rounded-full border border-line-strong px-2 py-0.5 text-xs font-semibold">
      {BADGES[b]}
      {extra ? ` ${extra}` : ""}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

/** A number with a labelled field and step buttons: no drag-only control. */
function Stepper({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  const ids = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={ids} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" className={small} aria-label={`Less: ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
          −
        </button>
        <input
          id={ids}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          className={cx(field, "w-24")}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value || min)))}
        />
        <span className="text-sm">{unit}</span>
        <button type="button" className={small} aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
          +
        </button>
      </div>
    </div>
  );
}

/** Dollars in, cents out. Empty is unknown, never zero. */
export function Dollars({
  label,
  cents,
  onChange,
  hint,
}: {
  label: string;
  cents: number | null | undefined;
  onChange: (c: number | null) => void;
  hint?: string;
}) {
  const ids = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={ids} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={ids}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        className={field}
        placeholder="Unknown"
        value={cents === null || cents === undefined ? "" : cents / 100}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))}
      />
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  );
}

export function Needs({ i, patch, locked }: { i: BridgeInput; patch: Patch; locked?: boolean }) {
  const set = (id: string, p: Partial<Need>) => patch((x) => ({ ...x, needs: x.needs.map((n) => (n.id === id ? { ...n, ...p } : n)) }));
  return (
    <section aria-label="Services needed" className="flex flex-col gap-3">
      <h5 className="font-semibold">Services needed</h5>
      {i.needs.map((n) => (
        <div key={n.id} className={cx(box, "flex flex-col gap-2")}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Service</span>
              <select className={field} disabled={locked} value={n.service} onChange={(e) => set(n.id, { service: e.target.value as ServiceId })}>
                {(Object.keys(SERVICES) as ServiceId[]).map((s) => (
                  <option key={s} value={s}>
                    {SERVICES[s].label}
                  </option>
                ))}
              </select>
            </label>
            <Stepper
              label="Per visit"
              value={n.hoursPerVisit}
              min={0.25}
              max={8}
              step={0.25}
              unit={`${SERVICES[n.service].unit}s`}
              onChange={(v) => set(n.id, { hoursPerVisit: v })}
            />
            {!locked && (
              <button type="button" className={secondary} onClick={() => patch((x) => ({ ...x, needs: x.needs.filter((m) => m.id !== n.id) }))}>
                Remove
              </button>
            )}
          </div>
          <fieldset>
            <legend className="text-sm font-semibold">Visit days ({n.days.length} a week)</legend>
            <div className="mt-1 flex flex-wrap gap-1">
              {WEEKDAYS.map((d, k) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={n.days.includes(k)}
                  className={cx(small, n.days.includes(k) && "bg-muted ring-2 ring-accent")}
                  onClick={() => set(n.id, { days: n.days.includes(k) ? n.days.filter((x) => x !== k) : [...n.days, k].sort() })}
                >
                  {d}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ))}
      {!locked && (
        <div>
          <button
            type="button"
            className={secondary}
            onClick={() =>
              patch((x) => ({ ...x, needs: [...x.needs, { id: `need-${Date.now()}`, service: "domestic_assistance", hoursPerVisit: 1, days: [0] }] }))
            }
          >
            Add a service
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The three panels, and the same thing as a table
// ---------------------------------------------------------------------------------------------

function Panels({ i, today }: { i: BridgeInput; today: string }) {
  const c = compare(i, today);
  const live = `Private: ${c.private.exact && c.private.weeklyCents !== null ? `${aud(c.private.weeklyCents)} a week` : "quote needed"}. CHSP: ${c.chsp.state}. Funded start: ${c.sah.startConfirmed ? showDate(c.sah.startDate) : "not confirmed"}.`;
  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      {c.sah.rulesStale && <p className={warn}>The contribution ruleset is past its review date. Figures can’t be client-ready until it’s reviewed.</p>}
      <div className="grid gap-3 lg:grid-cols-3">
        <section aria-label="Subsidised interim support" className={cx(box, "flex flex-col gap-2")}>
          <h5 className="font-semibold">A. Subsidised interim support (CHSP)</h5>
          <p className="font-semibold">{c.chsp.state}</p>
          {c.chsp.quoted ? (
            <p>
              <BadgeText b="quote" /> {aud(c.chsp.perVisitCents!)} a visit, {aud(c.chsp.weeklyCents!)} a week for {c.chsp.covered.join(" and ").toLowerCase()}.
            </p>
          ) : (
            <p>
              <BadgeText b="confirm" /> Cost to confirm with the CHSP provider.
            </p>
          )}
          <p className="text-sm text-ink-muted">
            CHSP is its own program. Not everyone waiting, or every service, can bridge through it, and each provider sets its contribution under its own
            policy, considering ability to pay.
          </p>
          {c.chsp.interimSah && (
            <p className={good}>
              <BadgeText b="allocation" /> Interim Support at Home funding is allocated. Approved services can be planned within it.
            </p>
          )}
        </section>

        <section aria-label="Private bridge" className={cx(box, "flex flex-col gap-2")}>
          <h5 className="font-semibold">B. Private bridge</h5>
          {c.private.exact ? (
            <>
              <p>
                <BadgeText
                  b={c.private.badge}
                  extra={c.private.badge === "quote" || c.private.badge === "scenario" ? `valid until ${showDate(c.private.validUntil)}` : ""}
                />
              </p>
              <table className="text-sm">
                <caption className="sr-only">Private cost for the quoted pattern</caption>
                <tbody>
                  {c.private.lines.map((l) => (
                    <tr key={l.needId}>
                      <th scope="row" className="py-0.5 pr-2 text-left font-normal">
                        {l.label}: {l.units} {SERVICES[l.service].unit}
                        {l.units === 1 ? "" : "s"}
                        {l.travelCents ? ` + ${aud(l.travelCents)} visit charge` : ""}, {l.perWeek}× a week
                      </th>
                      <td className="py-0.5 text-right tabular-nums">{aud(l.totalCents * l.perWeek)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="pt-1 text-left font-semibold">
                      A week, for this quoted pattern
                    </th>
                    <td className="pt-1 text-right font-semibold tabular-nums">{aud(c.private.weeklyCents!)}</td>
                  </tr>
                </tbody>
              </table>
              {c.private.scenarios.length > 0 && (
                <>
                  <p className="text-sm font-semibold">If private visits continue for this many weeks (from {showDate(i.start)})</p>
                  <ul className="text-sm">
                    {c.private.scenarios.map((s) => (
                      <li key={s.weeks}>
                        {s.weeks} weeks, {s.visits} visits to {showDate(s.end)}: <span className="font-semibold tabular-nums">{aud(s.cents)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <>
              <p>
                <BadgeText b="confirm" /> <span className="font-semibold">Quote needed.</span>
              </p>
              <ul className="list-disc pl-5 text-sm">
                {c.private.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          <p className="text-sm text-ink-muted">Private visits keep their private price. They aren’t reimbursed or backdated when funding starts.</p>
        </section>

        <section aria-label="Funded Support at Home" className={cx(box, "flex flex-col gap-2")}>
          <h5 className="font-semibold">C. What changes under funded Support at Home</h5>
          <p>
            <span className="font-semibold">Status: </span>
            {c.sah.stage}
          </p>
          <p>
            <span className="font-semibold">Allocation: </span>
            {c.sah.allocationConfirmed ? (
              <>
                <BadgeText b="allocation" /> {showDate(c.sah.allocationDate)}
              </>
            ) : (
              <BadgeText b="confirm" />
            )}
          </p>
          <p>
            <span className="font-semibold">Funded services start: </span>
            {c.sah.startConfirmed ? (
              <>
                <BadgeText b="start" /> {showDate(c.sah.startDate)}
              </>
            ) : (
              <BadgeText b="confirm" />
            )}
          </p>
          {c.sah.startNote && <p className="text-sm">{c.sah.startNote}</p>}
          <ul className="flex flex-col gap-1 text-sm">
            {c.sah.lines.map((l) => (
              <li key={l.service}>
                <span className="font-semibold">{l.label}</span>
                {l.category ? ` (${CATEGORIES[l.category].label})` : ""}:{" "}
                {l.contributionCents !== null ? `${aud(l.contributionCents)} a week projected participant contribution. ` : ""}
                {l.note}
              </li>
            ))}
          </ul>
          {c.sah.pensionNote && <p className="text-sm">{c.sah.pensionNote}</p>}
          {c.sah.legacyNote && <p className="text-sm">{c.sah.legacyNote}</p>}
          <p className="text-sm">
            For an indicative estimate, use the official{" "}
            <a className="font-semibold underline" href={FEE_ESTIMATOR} target="_blank" rel="noreferrer">
              My Aged Care costs and contributions guide
            </a>
            . Categories from ruleset {c.sah.rulesVersion}, as at {showDate(c.sah.asAt)}.
          </p>
        </section>
      </div>
      <TextView i={i} today={today} />
    </div>
  );
}

function TextView({ i, today }: { i: BridgeInput; today: string }) {
  const c = compare(i, today);
  const rows: [string, string, string][] = [
    [
      "Stage",
      STAGES[i.stage],
      i.stageSource.source ? `${i.stageSource.source}${i.stageSource.checkedAt ? `, checked ${showDate(i.stageSource.checkedAt)}` : ""}` : "Not recorded",
    ],
    ["Wait (planning scenario only)", `${i.waitWeeks} weeks`, BADGES.scenario],
    ...(i.estimate.text
      ? ([["Government estimate", i.estimate.text, i.estimate.asAt ? `As at ${showDate(i.estimate.asAt)}` : "Undated"]] as [string, string, string][])
      : []),
    ...i.needs.map((n): [string, string, string] => [
      SERVICES[n.service].label,
      `${n.hoursPerVisit} ${SERVICES[n.service].unit}s × ${n.days.map((d) => WEEKDAYS[d]).join(", ") || "no days"}`,
      "Planned pattern",
    ]),
    [
      "Private, a week",
      c.private.exact && c.private.weeklyCents !== null ? aud(c.private.weeklyCents) : "Quote needed",
      c.private.exact ? `${BADGES[c.private.badge]}, valid until ${showDate(c.private.validUntil)}` : BADGES.confirm,
    ],
    ["CHSP", c.chsp.state, c.chsp.quoted ? `${aud(c.chsp.weeklyCents!)} a week, provider quote` : BADGES.confirm],
    [
      "Allocation",
      c.sah.allocationConfirmed ? showDate(c.sah.allocationDate) : "Not confirmed",
      c.sah.allocationConfirmed ? BADGES.allocation : BADGES.confirm,
    ],
    ["Funded start", c.sah.startConfirmed ? showDate(c.sah.startDate) : "Not confirmed", c.sah.startConfirmed ? BADGES.start : BADGES.confirm],
    ...c.sah.lines.map((l): [string, string, string] => [
      `Funded ${l.label.toLowerCase()}`,
      l.contributionCents !== null ? `${aud(l.contributionCents)} a week contribution` : "Rate to confirm",
      l.category ? CATEGORIES[l.category].label : "Not in ruleset",
    ]),
    [
      "Contribution rates",
      i.rates.verified ? `Verified: ${i.rates.source}` : "Not verified",
      i.rates.effectiveOn ? `Effective ${showDate(i.rates.effectiveOn)}` : "",
    ],
    ["Ruleset", RULESET.version, `Review by ${showDate(RULESET.reviewOn)}`],
  ];
  return (
    <details className={box}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">Everything as a table</summary>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Item</th>
            <th className="text-left">Value</th>
            <th className="text-left">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b, c2]) => (
            <tr key={a} className="border-t border-line align-top">
              <th scope="row" className="py-1 pr-2 text-left font-semibold">
                {a}
              </th>
              <td className="py-1 pr-2">{b}</td>
              <td className="py-1">{c2}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Shell({ title, live, children }: { title: string; live?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={`While You Wait: ${title}`} className="w-full rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="money" className="size-5" /> While you wait · {live ? "live call" : "practice"}
      </p>
      <h3 className="font-serif text-2xl font-semibold">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function WaitScenario({ i, patch }: { i: BridgeInput; patch: Patch }) {
  return (
    <div className={cx(box, "flex flex-col gap-2")}>
      <Stepper
        label="Explore a planning scenario: if the wait were this many weeks"
        value={i.waitWeeks}
        min={1}
        max={52}
        step={1}
        unit="weeks"
        onChange={(v) => patch((x) => ({ ...x, waitWeeks: v }))}
      />
      <p className="text-sm text-ink-muted">A scenario for planning, not a forecast. It never becomes a start date.</p>
      {i.estimate.text && (
        <p className="text-sm">
          <BadgeText b="estimate" /> {i.estimate.text}
          {i.estimate.asAt ? ` (as at ${showDate(i.estimate.asAt)})` : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Practice (the Magazine block)
// ---------------------------------------------------------------------------------------------

type Loaded = ReturnType<typeof bridgeState>;
type Checked = { covered: { id: string; label: string; met: boolean }[]; avoided: { phrase: string; why: string }[] };

export function BridgePractice({ block: b, ctx }: { block: BridgeBlock; ctx: InteractiveContext }) {
  const url = `/api/magazine/${ctx.guideId}/bridge`;
  const loaded = useApi<Loaded>(ctx.preview ? null : `${url}?block=${b.id}`);
  const [i, setI] = useState<BridgeInput | null>(ctx.preview ? structuredClone(b.scenario) : null);
  const [summary, setSummary] = useState<string>("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [model, setModel] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = useRef(false);

  if (!ctx.preview && loaded.data && i === null) {
    setI(loaded.data.input ?? structuredClone(b.scenario));
    setSummary(loaded.data.summary);
    setChecked(loaded.data.checked);
    setModel(loaded.data.model);
  }
  useEffect(() => {
    if (ctx.preview || !i || !dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      api(url, { body: { blockId: b.id, input: i, summary } }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [i, summary, ctx.preview, url, b.id]);

  if (!ctx.preview && loaded.error)
    return (
      <Shell title={b.title}>
        <p role="alert">{loaded.error}</p>
      </Shell>
    );
  if (!i)
    return (
      <Shell title={b.title}>
        <p className="text-ink-muted">Loading…</p>
      </Shell>
    );

  // The learner may change the pattern, the start and the wait scenario. Everything else is the author's.
  const patch: Patch = (fn) => {
    dirty.current = true;
    setI((p) => {
      if (!p) return p;
      const n = fn(p);
      return { ...p, needs: n.needs, start: n.start, waitWeeks: n.waitWeeks };
    });
  };
  const check = async () => {
    setProblem(null);
    try {
      if (ctx.preview) {
        const { checkSummary } = await import("@/lib/bridge");
        setChecked(checkSummary(b, summary));
        setModel(b.model);
      } else {
        const out = await api<{ checked: Checked; model: string }>(url, { body: { action: "check", blockId: b.id, summary } });
        setChecked(out.checked);
        setModel(out.model);
        if (!out.checked.avoided.length) {
          ctx.activity(b.id, { outcome: "checked" });
          ctx.engaged(b.id);
        }
      }
    } catch (e) {
      setProblem(errorText(e, "That didn’t send. Your summary is still here."));
    }
  };

  return (
    <Shell title={b.title}>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{PRACTICE_NOTICE}</p>
      {b.intro && <p className="mt-3 text-lg">{b.intro}</p>}
      <article aria-label="The call" className={cx(box, "mt-4")}>
        <CharacterRow names={[b.person.name, b.caller.name]} size="sm">
          <p>
            <span className="font-semibold">{b.person.name}. </span>
            {b.person.about}
          </p>
          <p className="mt-2">
            <span className="font-semibold">
              {b.caller.name}
              {b.caller.relation ? ` (${b.caller.relation})` : ""} asks:{" "}
            </span>
            “{b.ask}”
          </p>
          <p className="mt-2 text-sm">
            {b.caller.authorised
              ? `${b.person.name} has agreed ${b.caller.name} can discuss his arrangements.`
              : `${b.caller.name} isn’t verified as someone ${b.person.name} has authorised: keep it general.`}
          </p>
        </CharacterRow>
      </article>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Needs i={i} patch={patch} locked />
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Earliest private start</span>
            <input type="date" className={field} value={i.start} onChange={(e) => patch((x) => ({ ...x, start: e.target.value }))} />
          </label>
          <WaitScenario i={i} patch={patch} />
        </div>
      </div>
      <div className="mt-4">
        <Panels i={i} today={b.today} />
      </div>

      <section aria-label="Your summary for the family" className="mt-6 flex flex-col gap-2">
        <h4 className="font-serif text-xl font-semibold">Write {b.caller.name || "the family"} a summary</h4>
        <p className="text-sm text-ink-muted">
          Keep a scenario, a quote and an unknown funding date clearly apart. You can start from the template and change it.
        </p>
        <div>
          <button
            type="button"
            className={secondary}
            onClick={() => {
              dirty.current = true;
              setSummary(
                familySummary(
                  i,
                  {
                    to: b.caller.name,
                    participant: b.person.name,
                    worker: "[Your name]",
                    authorised: b.caller.authorised,
                    nextStep: "",
                    owner: "",
                    followUp: "",
                  },
                  b.today,
                ),
              );
            }}
          >
            Start from the template
          </button>
        </div>
        <label className="sr-only" htmlFor={`${b.id}-summary`}>
          Your summary
        </label>
        <textarea
          id={`${b.id}-summary`}
          className={cx(field, "min-h-56")}
          value={summary}
          maxLength={4000}
          onChange={(e) => {
            dirty.current = true;
            setSummary(e.target.value);
          }}
        />
        <div>
          <button type="button" className={primary} disabled={summary.trim().length < 40} onClick={() => void check()}>
            Check my summary
          </button>
        </div>
        {problem && (
          <p role="alert" className={warn}>
            {problem}
          </p>
        )}
        {checked && (
          <div className="flex flex-col gap-2" aria-live="polite">
            {checked.avoided.length > 0 && (
              <div className={warn}>
                <p className="font-semibold">Change these before it goes anywhere:</p>
                <ul className="list-disc pl-5">
                  {checked.avoided.map((a) => (
                    <li key={a.phrase}>
                      “{a.phrase}”: {a.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className={box}>
              {checked.covered.map((c) => (
                <li key={c.id}>
                  <span className="font-semibold">{c.met ? "Covered: " : "Not covered: "}</span>
                  {c.label}
                </li>
              ))}
            </ul>
            {model && (
              <div className={box}>
                <p className="font-semibold">A reviewed example (scenario only)</p>
                <p className="mt-1 whitespace-pre-line">{model}</p>
              </div>
            )}
          </div>
        )}
      </section>
    </Shell>
  );
}

// ---------------------------------------------------------------------------------------------
// Live call (the staff tool)
// ---------------------------------------------------------------------------------------------

type Status = ReturnType<typeof liveStatus>;

export function LiveBridge() {
  const hydrated = useHydrated();
  const status = useApi<Status>("/api/tools/bridge");
  if (status.error) return <p role="alert">{status.error}</p>;
  if (!status.data || !hydrated) return <p className="text-ink-muted">Loading…</p>;
  const s = status.data;
  if (!s.allowed) return <p className={box}>This tool is for Trilogy Care staff and coordinators.</p>;
  return (
    <div className="flex flex-col gap-4">
      {s.canRelease && <ReleasePanel s={s} onChange={(n) => status.setData(n)} />}
      {s.released ? (
        <LiveCalculator />
      ) : (
        <p className={box}>
          The live-call version isn’t released yet. It needs Support at Home Operations, Finance, Quality, Privacy and Communications approval first. The
          practice version is in the Magazine.
        </p>
      )}
    </div>
  );
}

function ReleasePanel({ s, onChange }: { s: Status; onChange: (s: Status) => void }) {
  const [names, setNames] = useState({ operations: "", finance: "", quality: "", privacy: "", communications: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const send = async (released: boolean) => {
    setProblem(null);
    try {
      onChange(await api<Status>("/api/tools/bridge", { body: { action: "release", released, ...names } }));
    } catch (e) {
      setProblem(errorText(e, "That didn’t save."));
    }
  };
  return (
    <details className={box} open={!s.released}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">Superadmin: release {s.released ? "(released)" : "(not released)"}</summary>
      {s.released && s.approvals ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Approved by {s.approvals.operations} (Operations), {s.approvals.finance} (Finance), {s.approvals.quality} (Quality), {s.approvals.privacy} (Privacy)
            and {s.approvals.communications} (Communications).
          </p>
          <div>
            <button type="button" className={secondary} onClick={() => void send(false)}>
              Withdraw the live-call tool
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(names) as (keyof typeof names)[]).map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-sm font-semibold capitalize">{k === "operations" ? "Support at Home Operations" : k}</span>
              <input className={field} value={names[k]} maxLength={120} onChange={(e) => setNames({ ...names, [k]: e.target.value })} />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button type="button" className={primary} onClick={() => void send(true)}>
              Release for staff
            </button>
          </div>
        </div>
      )}
      {problem && (
        <p role="alert" className={cx(warn, "mt-2")}>
          {problem}
        </p>
      )}
    </details>
  );
}

function LiveCalculator() {
  const ids = useId();
  const today = new Date().toISOString().slice(0, 10);
  const [i, setI] = useState<BridgeInput>(() => emptyInput("live"));
  const [to, setTo] = useState("");
  const [participant, setParticipant] = useState("");
  const [worker, setWorker] = useState("");
  const [authorised, setAuthorised] = useState(false);
  const [nextStep, setNextStep] = useState("");
  const [owner, setOwner] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const patch: Patch = (fn) => setI((p) => fn(p));
  const q = i.quote;
  const setQ = (p: Partial<typeof q>) => patch((x) => ({ ...x, quote: { ...x.quote, ...p } }));
  const preview = familySummary(i, { to, participant, worker, authorised, nextStep, owner, followUp }, today);
  const copy = async () => {
    const text = draft ?? preview;
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Copied, not sent. Send it from the approved system, after checking the recipient.");
    } catch {
      area.current?.select();
      setCopied("Your browser didn’t allow copying. The text is selected: copy it from there, or try again.");
    }
    api("/api/tools/bridge", { body: { action: "copied", authorised } }).catch(() => undefined);
  };

  return (
    <Shell title="While you wait" live>
      <p className="mt-2 rounded-2xl bg-muted px-4 py-2 text-sm font-semibold">{LIVE_NOTICE}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={secondary}
          onClick={() => {
            setI(emptyInput("live"));
            setTo("");
            setParticipant("");
            setDraft(null);
            setCopied(null);
            setAuthorised(false);
          }}
        >
          Clear everything
        </button>
      </div>

      <section aria-label="Verify the context" className={cx(box, "mt-4 grid gap-3 md:grid-cols-2")}>
        <h4 className="font-semibold md:col-span-2">1. Context</h4>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Stage</span>
          <select className={field} value={i.stage} onChange={(e) => patch((x) => ({ ...x, stage: e.target.value as Stage }))}>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGES[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Source of the stage</span>
          <input
            className={field}
            value={i.stageSource.source}
            placeholder="e.g. Notice of Decision in the record"
            onChange={(e) => patch((x) => ({ ...x, stageSource: { ...x.stageSource, source: e.target.value } }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Checked by</span>
          <input
            className={field}
            value={i.stageSource.checkedBy}
            onChange={(e) => patch((x) => ({ ...x, stageSource: { ...x.stageSource, checkedBy: e.target.value } }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Checked on</span>
          <input
            type="date"
            className={field}
            value={i.stageSource.checkedAt}
            onChange={(e) => patch((x) => ({ ...x, stageSource: { ...x.stageSource, checkedAt: e.target.value } }))}
          />
        </label>
        {!i.stageSource.source && <p className={cx(warn, "md:col-span-2")}>The stage isn’t verified yet: it’s shown as unverified in the summary.</p>}
        {(i.stage === "interim_allocated" || i.stage === "full_allocated" || i.stage === "commenced") && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Confirmed allocation date</span>
            <input type="date" className={field} value={i.allocationDate} onChange={(e) => patch((x) => ({ ...x, allocationDate: e.target.value }))} />
          </label>
        )}
        {i.stage === "commenced" && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Confirmed funded-service start date</span>
            <input type="date" className={field} value={i.serviceStartDate} onChange={(e) => patch((x) => ({ ...x, serviceStartDate: e.target.value }))} />
          </label>
        )}
        <label className="flex items-center gap-2 md:col-span-2">
          <input type="checkbox" className="size-5" checked={i.urgent} onChange={(e) => patch((x) => ({ ...x, urgent: e.target.checked }))} />
          Something urgent or unsafe has come up
        </label>
        {i.urgent && (
          <p className={cx(warn, "md:col-span-2")}>
            Follow the approved escalation pathway now. Urgent clinical or safety concerns don’t go through pricing, and they don’t wait for a quote.
          </p>
        )}
      </section>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Needs i={i} patch={patch} />
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Earliest private start</span>
            <input type="date" className={field} value={i.start} onChange={(e) => patch((x) => ({ ...x, start: e.target.value }))} />
          </label>
          <WaitScenario i={i} patch={patch} />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Official wait estimate (optional, with its date)</span>
            <input className={field} value={i.estimate.text} onChange={(e) => patch((x) => ({ ...x, estimate: { ...x.estimate, text: e.target.value } }))} />
            <input
              type="date"
              aria-label="Estimate as at"
              className={field}
              value={i.estimate.asAt}
              onChange={(e) => patch((x) => ({ ...x, estimate: { ...x.estimate, asAt: e.target.value } }))}
            />
          </label>
        </div>
      </div>

      <details className={cx(box, "mt-4")} open>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">2. Private quote</summary>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Quote</span>
            <select className={field} value={q.status} onChange={(e) => setQ({ status: e.target.value as typeof q.status })}>
              <option value="none">No quote yet</option>
              <option value="verified">An approved, current quote</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Issuer</span>
            <input className={field} value={q.issuer} onChange={(e) => setQ({ issuer: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Quote id or version</span>
            <input className={field} value={q.version} onChange={(e) => setQ({ version: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Valid until</span>
            <input type="date" className={field} value={q.validUntil} onChange={(e) => setQ({ validUntil: e.target.value })} />
          </label>
          {[...new Set(i.needs.map((n) => n.service))].map((s) => (
            <Dollars
              key={s}
              label={`${SERVICES[s].label}, per ${SERVICES[s].unit}`}
              cents={q.prices[s]}
              onChange={(c) => setQ({ prices: { ...q.prices, [s]: c ?? undefined } })}
            />
          ))}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Visit minimum (hours)</span>
            <input
              type="number"
              min={0}
              step={0.25}
              className={field}
              placeholder="Unknown"
              value={q.minimumHours ?? ""}
              onChange={(e) => setQ({ minimumHours: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
          <Dollars label="Travel or visit charge, per visit" hint="Enter 0 if there’s none." cents={q.travelCents} onChange={(c) => setQ({ travelCents: c })} />
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-5" checked={q.surchargesKnown} onChange={(e) => setQ({ surchargesKnown: e.target.checked })} />
            Weekend and public-holiday surcharges confirmed
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Can the provider deliver this pattern?</span>
            <select
              className={field}
              value={q.available === null ? "unknown" : q.available ? "yes" : "no"}
              onChange={(e) => setQ({ available: e.target.value === "unknown" ? null : e.target.value === "yes" })}
            >
              <option value="unknown">Not confirmed</option>
              <option value="yes">Yes, confirmed</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
      </details>

      <details className={cx(box, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">3. CHSP check</summary>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Referral and eligibility</span>
            <select
              className={field}
              value={i.chsp.referral}
              onChange={(e) => patch((x) => ({ ...x, chsp: { ...x.chsp, referral: e.target.value as ChspReferral } }))}
            >
              {(Object.keys(CHSP_REFERRAL) as ChspReferral[]).map((k) => (
                <option key={k} value={k}>
                  {CHSP_REFERRAL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Provider capacity</span>
            <select
              className={field}
              value={i.chsp.provider}
              onChange={(e) => patch((x) => ({ ...x, chsp: { ...x.chsp, provider: e.target.value as BridgeInput["chsp"]["provider"] } }))}
            >
              <option value="unknown">Not known</option>
              <option value="available">Available</option>
              <option value="none">None available</option>
            </select>
          </label>
          <Dollars
            label="Provider’s quoted contribution, per visit"
            cents={i.chsp.contributionCents}
            onChange={(c) => patch((x) => ({ ...x, chsp: { ...x.chsp, contributionCents: c } }))}
          />
          <fieldset className="md:col-span-3">
            <legend className="text-sm font-semibold">Services it would cover</legend>
            <div className="flex flex-wrap gap-3">
              {[...new Set(i.needs.map((n) => n.service))].map((s) => (
                <label key={s} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={i.chsp.services.includes(s)}
                    onChange={(e) =>
                      patch((x) => ({
                        ...x,
                        chsp: { ...x.chsp, services: e.target.checked ? [...x.chsp.services, s] : x.chsp.services.filter((y) => y !== s) },
                      }))
                    }
                  />
                  {SERVICES[s].label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </details>

      <details className={cx(box, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">4. Contributions under funded Support at Home</summary>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Pension status (an explanation aid only)</span>
            <select className={field} value={i.pension} onChange={(e) => patch((x) => ({ ...x, pension: e.target.value as Pension }))}>
              {(Object.keys(PENSION) as Pension[]).map((k) => (
                <option key={k} value={k}>
                  {PENSION[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Commonwealth Seniors Health Card</span>
            <select className={field} value={i.cshc} onChange={(e) => patch((x) => ({ ...x, cshc: e.target.value as BridgeInput["cshc"] }))}>
              <option value="unknown">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Legacy “no worse off”</span>
            <select className={field} value={i.legacy} onChange={(e) => patch((x) => ({ ...x, legacy: e.target.value as BridgeInput["legacy"] }))}>
              <option value="unknown">Unknown</option>
              <option value="yes">Applies</option>
              <option value="no">Doesn’t apply</option>
            </select>
          </label>
          <label className="flex items-center gap-2 md:col-span-3">
            <input
              type="checkbox"
              className="size-5"
              checked={i.rates.verified}
              onChange={(e) => patch((x) => ({ ...x, rates: { ...x.rates, verified: e.target.checked } }))}
            />
            I have the participant’s Services Australia notice in front of me
          </label>
          {i.rates.verified && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Independence rate, %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  className={field}
                  value={i.rates.independence === null ? "" : i.rates.independence / 100}
                  onChange={(e) =>
                    patch((x) => ({ ...x, rates: { ...x.rates, independence: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) } }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Everyday Living rate, %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  className={field}
                  value={i.rates.everyday === null ? "" : i.rates.everyday / 100}
                  onChange={(e) =>
                    patch((x) => ({ ...x, rates: { ...x.rates, everyday: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) } }))
                  }
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Notice effective from</span>
                <input
                  type="date"
                  className={field}
                  value={i.rates.effectiveOn}
                  onChange={(e) => patch((x) => ({ ...x, rates: { ...x.rates, effectiveOn: e.target.value } }))}
                />
              </label>
            </>
          )}
          {[...new Set(i.needs.map((n) => n.service))].map((s) => (
            <Dollars
              key={s}
              label={`Funded price: ${SERVICES[s].label.toLowerCase()}, per ${SERVICES[s].unit}`}
              cents={i.sahPrices[s]}
              onChange={(c) => patch((x) => ({ ...x, sahPrices: { ...x.sahPrices, [s]: c ?? undefined } }))}
            />
          ))}
        </div>
      </details>

      <div className="mt-4">
        <Panels i={i} today={today} />
      </div>

      <section aria-label="Family summary" className={cx(box, "mt-4 flex flex-col gap-3")}>
        <h4 className="font-semibold">5. Family summary: preview, then copy</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">To</span>
            <input className={field} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Participant</span>
            <input className={field} value={participant} onChange={(e) => setParticipant(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 md:col-span-2">
            <input type="checkbox" className="size-5" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} />
            I’ve verified the recipient is the participant, or someone they’ve authorised to receive this
          </label>
          {!authorised && <p className={cx(warn, "md:col-span-2")}>Until that’s verified, the summary stays general: no personal financial or care details.</p>}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Next step</span>
            <input className={field} value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Who owns it</span>
            <input className={field} value={owner} onChange={(e) => setOwner(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">By</span>
            <input type="date" className={field} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Your name</span>
            <input className={field} value={worker} onChange={(e) => setWorker(e.target.value)} />
          </label>
        </div>
        <label htmlFor={`${ids}-sum`} className="text-sm font-semibold">
          Preview (you can edit it)
        </label>
        <textarea
          id={`${ids}-sum`}
          ref={area}
          className={cx(field, "min-h-56")}
          value={draft ?? preview}
          onChange={(e) => {
            setDraft(e.target.value);
            setCopied(null);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} onClick={() => void copy()}>
            Copy the summary
          </button>
          {draft !== null && (
            <button type="button" className={secondary} onClick={() => setDraft(null)}>
              Back to the generated text
            </button>
          )}
        </div>
        {copied && (
          <p role="status" className="text-sm font-semibold">
            {copied}
          </p>
        )}
      </section>
    </Shell>
  );
}
