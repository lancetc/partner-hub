"use client";

import { cx } from "@/lib/format";
import type { SandboxBlock } from "@/lib/magazine";
import {
  CATEGORIES,
  CATEGORY_ORDER,
  computeLedger,
  fixturesPass,
  freshSandbox,
  FUNDING_VARIANTS,
  money,
  planWarnings,
  RATE_TBC,
  ruleSet,
  RULESETS,
  sandboxApproved,
  UNITS,
  type Category,
  type FundingVariant,
  type Unit,
} from "@/lib/sandbox";
import { SANDBOX_CASES } from "@/content/sandboxCases";
import { btn, Field, input } from "./ui";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Budget Sandbox (docs/budget-sandbox.md). The ruleset is fixed policy: the author chooses it, a
  classification it has (or a labelled fictional budget), the quarter, the fictional participant, their goals and
  assessed rates, the approved services and prices, the explanation checks, and a reviewed illustrative plan. The
  preview shows that plan's every ledger line and warning, worked out the same way learners see it.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const area = cx(input, "min-h-20 py-2");
const dollars = (c: number) => (c / 100).toFixed(2);
const toCents = (v: string) => Math.max(0, Math.round(Number(v) * 100) || 0);
const lines = (v: string) => v.split("\n").slice(0, 8);

export function SandboxEdit({ block: b, update }: { block: SandboxBlock; update: Update }) {
  const set = (fn: (x: SandboxBlock) => void, tag?: string) => update<SandboxBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const rules = ruleSet(b.rulesetId) ?? RULESETS[0];
  const ledger = computeLedger(b, b.illustrative.lines);
  const warnings = planWarnings(b, b.illustrative.lines, ledger);
  const fixtures = fixturesPass();
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="money" className="size-5" /> Budget Sandbox
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          sandboxApproved(b) && fixtures
            ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
            : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {!fixtures
          ? "The calculation’s reviewed fixtures don’t pass: nothing can be published."
          : sandboxApproved(b)
            ? "Signed off: this scenario can be published."
            : "A draft: it can’t be published until Support at Home operations, Finance, Quality and accessibility sign-off is recorded below."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a scenario">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = SANDBOX_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this scenario with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, freshSandbox(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {SANDBOX_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction" className="sm:col-span-2">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
      </div>

      <div className={cx(group, "mt-4")}>
        <p className="font-semibold">Funding and rules</p>
        <p className="text-xs text-ink-muted">
          {rules.label}, effective {rules.effectiveFrom}, review by {rules.reviewBy}. Care management {rules.careManagementPercent}%; carryover capped at the
          higher of {money(rules.carryover.minimumCapCents)} or {rules.carryover.percentCap}%. {rules.categoryChanges.map((c) => c.note).join(" ")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Kind of budget">
            <select className={input} value={b.funding.variant} onChange={(e) => set((x) => void (x.funding.variant = e.target.value as FundingVariant))}>
              {(Object.keys(FUNDING_VARIANTS) as FundingVariant[]).map((v) => (
                <option key={v} value={v}>
                  {FUNDING_VARIANTS[v]}
                </option>
              ))}
            </select>
          </Field>
          {b.funding.variant === "ongoing" ? (
            <Field label="Classification" hint="Only the ones the ruleset has been given.">
              <select className={input} value={b.funding.classification} onChange={(e) => set((x) => void (x.funding.classification = e.target.value))}>
                <option value="">Choose…</option>
                {Object.entries(rules.classifications).map(([k, v]) => (
                  <option key={k} value={k}>
                    Classification {k}: {money(v)} a quarter
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Fictional quarterly amount ($)" hint="Shown to learners as a fictional practice budget.">
              <input
                type="number"
                min={0}
                step={0.01}
                className={input}
                value={dollars(b.funding.fictionalQuarterlyCents)}
                onChange={(e) => set((x) => void (x.funding.fictionalQuarterlyCents = toCents(e.target.value)))}
              />
            </Field>
          )}
          <Field label="Carried over from last quarter ($)">
            <input
              type="number"
              min={0}
              step={0.01}
              className={input}
              value={dollars(b.funding.startingCarryoverCents)}
              onChange={(e) => set((x) => void (x.funding.startingCarryoverCents = toCents(e.target.value)))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quarter starts">
              <input type="date" className={input} value={b.quarter.start} onChange={(e) => set((x) => void (x.quarter.start = e.target.value))} />
            </Field>
            <Field label="Quarter ends">
              <input type="date" className={input} value={b.quarter.end} onChange={(e) => set((x) => void (x.quarter.end = e.target.value))} />
            </Field>
          </div>
        </div>
      </div>

      <div className={cx(group, "mt-3")}>
        <p className="font-semibold">The participant (fictional)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Name">
            <input className={input} value={b.participant.name} maxLength={80} onChange={(e) => set((x) => void (x.participant.name = e.target.value), "pn")} />
          </Field>
          <Field label="What they can afford, a quarter ($)" hint="Plans above it are flagged to talk through.">
            <input
              type="number"
              min={0}
              step={0.01}
              className={input}
              value={dollars(b.participant.affordabilityCents)}
              onChange={(e) => set((x) => void (x.participant.affordabilityCents = toCents(e.target.value)))}
            />
          </Field>
          <Field label="About them" className="sm:col-span-2">
            <textarea
              className={area}
              value={b.participant.about}
              maxLength={600}
              onChange={(e) => set((x) => void (x.participant.about = e.target.value), "pa")}
            />
          </Field>
          <Field label="Assessed needs, one per line">
            <textarea
              className={area}
              value={b.participant.needs.join("\n")}
              onChange={(e) => set((x) => void (x.participant.needs = lines(e.target.value)), "pnd")}
            />
          </Field>
          <Field label="Risks, one per line">
            <textarea
              className={area}
              value={b.participant.risks.join("\n")}
              onChange={(e) => set((x) => void (x.participant.risks = lines(e.target.value)), "pr")}
            />
          </Field>
          <Field label="Preferred schedule">
            <input
              className={input}
              value={b.participant.schedule}
              maxLength={300}
              onChange={(e) => set((x) => void (x.participant.schedule = e.target.value), "ps")}
            />
          </Field>
          <Field label="Affordability, in words">
            <input
              className={input}
              value={b.participant.affordability}
              maxLength={300}
              onChange={(e) => set((x) => void (x.participant.affordability = e.target.value), "paf")}
            />
          </Field>
        </div>
        <p className="font-semibold">Goals, in their own words</p>
        {b.goals.map((g, i) => (
          <div key={g.id} className="flex flex-wrap items-end gap-2">
            <Field label={`Goal ${i + 1}`} className="min-w-64 flex-1">
              <input className={input} value={g.text} maxLength={200} onChange={(e) => set((x) => void (x.goals[i].text = e.target.value), `g${i}`)} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5" checked={g.priority} onChange={(e) => set((x) => void (x.goals[i].priority = e.target.checked))} />
              Matters most
            </label>
          </div>
        ))}
        {b.goals.length < 8 && (
          <button
            type="button"
            className={cx(btn.secondary, "self-start")}
            onClick={() => set((x) => void x.goals.push({ id: `goal-${Date.now().toString(36)}`, text: "", priority: false }))}
          >
            <Icon name="plus" className="size-4" /> Add a goal
          </button>
        )}
      </div>

      <div className={cx(group, "mt-3")}>
        <p className="font-semibold">Assessed contribution rates (from a fictional notice)</p>
        <p className="text-xs text-ink-muted">
          Clinical Supports are always 0%. Leave a rate blank for “{RATE_TBC}”: learners then see no dollar amount for it.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["independence", "everyday"] as const).map((c) => (
            <Field key={c} label={`${CATEGORIES[c]} (%)`}>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className={input}
                value={b.rates[c] === null ? "" : b.rates[c]! / 100}
                onChange={(e) =>
                  set((x) => void (x.rates[c] = e.target.value === "" ? null : Math.round(Math.min(100, Math.max(0, Number(e.target.value))) * 100)))
                }
              />
            </Field>
          ))}
        </div>
      </div>

      <div className={cx(group, "mt-3")}>
        <p className="font-semibold">Services and agreed prices</p>
        {b.services.map((s, i) => (
          <div key={s.id} className="grid gap-2 rounded-xl bg-surface p-3 sm:grid-cols-3">
            <Field label="Service" className="sm:col-span-2">
              <input className={input} value={s.name} maxLength={80} onChange={(e) => set((x) => void (x.services[i].name = e.target.value), `sn${i}`)} />
            </Field>
            <Field label="Category">
              <select className={input} value={s.category} onChange={(e) => set((x) => void (x.services[i].category = e.target.value as Category))}>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIES[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Purpose" className="sm:col-span-3">
              <input
                className={input}
                value={s.purpose}
                maxLength={200}
                onChange={(e) => set((x) => void (x.services[i].purpose = e.target.value), `sp${i}`)}
              />
            </Field>
            <Field label="Price ($)">
              <input
                type="number"
                min={0}
                step={0.01}
                className={input}
                value={dollars(s.unitPriceCents)}
                onChange={(e) => set((x) => void (x.services[i].unitPriceCents = toCents(e.target.value)))}
              />
            </Field>
            <Field label="Per">
              <select className={input} value={s.unit} onChange={(e) => set((x) => void (x.services[i].unit = e.target.value as Unit))}>
                {(Object.keys(UNITS) as Unit[]).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Units each time">
              <input
                type="number"
                min={0.25}
                step={0.25}
                className={input}
                value={s.unitsEach}
                onChange={(e) => set((x) => void (x.services[i].unitsEach = Number(e.target.value)))}
              />
            </Field>
            <Field label="Most a week">
              <input
                type="number"
                min={0.5}
                step={0.5}
                className={input}
                value={s.maxPerWeek}
                onChange={(e) => set((x) => void (x.services[i].maxPerWeek = Number(e.target.value)))}
              />
            </Field>
            <Field label="Kind" hint="“personal-care” follows the ruleset’s category change.">
              <input className={input} value={s.kind} maxLength={40} onChange={(e) => set((x) => void (x.services[i].kind = e.target.value), `sk${i}`)} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 self-end text-sm">
              <input type="checkbox" className="size-5" checked={s.approved} onChange={(e) => set((x) => void (x.services[i].approved = e.target.checked))} />
              In the approved care plan
            </label>
            <Field label="Availability" className="sm:col-span-3">
              <input
                className={input}
                value={s.availability}
                maxLength={200}
                onChange={(e) => set((x) => void (x.services[i].availability = e.target.value), `sa${i}`)}
              />
            </Field>
            <fieldset className="flex flex-wrap gap-3 sm:col-span-3">
              <legend className="text-sm font-semibold">Goals it can serve</legend>
              {b.goals.map((g) => (
                <label key={g.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={s.goalIds.includes(g.id)}
                    onChange={() =>
                      set((x) => void (x.services[i].goalIds = s.goalIds.includes(g.id) ? s.goalIds.filter((y) => y !== g.id) : [...s.goalIds, g.id]))
                    }
                  />
                  {g.text.slice(0, 50) || g.id}
                </label>
              ))}
            </fieldset>
            <button type="button" className={cx(btn.quiet, "justify-self-start")} onClick={() => set((x) => void x.services.splice(i, 1))}>
              <Icon name="trash" className="size-4" /> Remove
            </button>
          </div>
        ))}
        {b.services.length < 12 && (
          <button
            type="button"
            className={cx(btn.secondary, "self-start")}
            onClick={() =>
              set(
                (x) =>
                  void x.services.push({
                    id: `svc-${Date.now().toString(36)}`,
                    name: "",
                    purpose: "",
                    kind: "",
                    category: "everyday",
                    unit: "hour",
                    unitPriceCents: 0,
                    unitsEach: 1,
                    maxPerWeek: 2,
                    approved: true,
                    availability: "",
                    goalIds: [],
                  }),
              )
            }
          >
            <Icon name="plus" className="size-4" /> Add a service
          </button>
        )}
      </div>

      <div className={cx(group, "mt-3")}>
        <p className="font-semibold">Explaining it</p>
        <Field label="What the participant asks">
          <textarea className={area} value={b.explain.prompt} maxLength={600} onChange={(e) => set((x) => void (x.explain.prompt = e.target.value), "ep")} />
        </Field>
        {b.explain.checklist.map((c, i) => (
          <div key={c.id} className="grid gap-2 sm:grid-cols-2">
            <Field label={`Point ${i + 1}`}>
              <input
                className={input}
                value={c.label}
                maxLength={200}
                onChange={(e) => set((x) => void (x.explain.checklist[i].label = e.target.value), `ec${i}`)}
              />
            </Field>
            <Field label="Words that show it (commas)">
              <input
                className={input}
                value={c.anyOf.join(", ")}
                onChange={(e) =>
                  set(
                    (x) =>
                      void (x.explain.checklist[i].anyOf = e.target.value
                        .split(",")
                        .map((w) => w.trim().toLowerCase())
                        .filter(Boolean)),
                    `ew${i}`,
                  )
                }
              />
            </Field>
          </div>
        ))}
        {b.explain.avoid.map((a, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-2">
            <Field label={`Phrase to avoid ${i + 1}`}>
              <input
                className={input}
                value={a.phrase}
                maxLength={120}
                onChange={(e) => set((x) => void (x.explain.avoid[i].phrase = e.target.value.toLowerCase()), `ea${i}`)}
              />
            </Field>
            <Field label="Why">
              <input className={input} value={a.why} maxLength={300} onChange={(e) => set((x) => void (x.explain.avoid[i].why = e.target.value), `ey${i}`)} />
            </Field>
          </div>
        ))}
      </div>

      <div className={cx(group, "mt-3")}>
        <p className="font-semibold">The reviewed illustrative plan</p>
        <p className="text-xs text-ink-muted">
          One viable way, shown beside the learner’s plan. Every line and warning below is worked out the same way learners see it.
        </p>
        {b.illustrative.lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <Field label="Service" className="min-w-48 flex-1">
              <select className={input} value={l.serviceId} onChange={(e) => set((x) => void (x.illustrative.lines[i].serviceId = e.target.value))}>
                {b.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="A week">
              <input
                type="number"
                min={0}
                step={0.5}
                className={cx(input, "w-24")}
                value={l.perWeek}
                onChange={(e) => set((x) => void (x.illustrative.lines[i].perWeek = Number(e.target.value)))}
              />
            </Field>
            <Field label="Units each">
              <input
                type="number"
                min={0.25}
                step={0.25}
                className={cx(input, "w-24")}
                value={l.unitsEach}
                onChange={(e) => set((x) => void (x.illustrative.lines[i].unitsEach = Number(e.target.value)))}
              />
            </Field>
            <button type="button" className={btn.quiet} onClick={() => set((x) => void x.illustrative.lines.splice(i, 1))}>
              <Icon name="trash" className="size-4" /> Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "self-start")}
          onClick={() =>
            set(
              (x) =>
                void x.illustrative.lines.push({
                  serviceId: x.services[0]?.id ?? "",
                  perWeek: 1,
                  unitsEach: x.services[0]?.unitsEach ?? 1,
                  goalId: "",
                  review: false,
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add a line
        </button>
        <div className="rounded-xl bg-surface p-3 text-sm">
          {ledger.lines.map((x) => (
            <p key={x.serviceId}>
              {x.name}: {x.units} {x.unit}s, {money(x.fullPriceCents)}; participant {x.participantCents === undefined ? RATE_TBC : money(x.participantCents)};
              government {x.governmentCents === undefined ? RATE_TBC : money(x.governmentCents)}
            </p>
          ))}
          <p className="mt-1 font-semibold">
            Total {money(ledger.grossCents)}; participant {money(ledger.participantCents)}; government {money(ledger.governmentCents)};{" "}
            {ledger.remaining.high < 0 ? `${money(-ledger.remaining.high)} short` : `${money(ledger.remaining.high)} remaining`} of{" "}
            {money(ledger.availableCents)}.
          </p>
          {warnings.map((w) => (
            <p key={w.id} className="mt-1">
              {w.tone === "stop" ? "Needs changing" : w.tone === "check" ? "Talk it through" : "Note"}: {w.text}
            </p>
          ))}
        </div>
        <Field label="Why it looks like this">
          <textarea
            className={area}
            value={b.illustrative.why}
            maxLength={1200}
            onChange={(e) => set((x) => void (x.illustrative.why = e.target.value), "iw")}
          />
        </Field>
        <Field label="Debrief message">
          <textarea className={area} value={b.debrief} maxLength={1500} onChange={(e) => set((x) => void (x.debrief = e.target.value), "db")} />
        </Field>
      </div>

      <div className={cx(group, "mt-3")}>
        <p className="font-semibold">Sign-off</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["owner", "Content owner (learning design)"],
              ["operations", "Support at Home operations"],
              ["finance", "Finance"],
              ["quality", "Quality or policy"],
              ["accessibility", "Accessibility"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} maxLength={120} onChange={(e) => set((x) => void (x.approval[k] = e.target.value), `ap-${k}`)} />
            </Field>
          ))}
          <Field label="Date signed off">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
        </div>
      </div>
    </div>
  );
}
