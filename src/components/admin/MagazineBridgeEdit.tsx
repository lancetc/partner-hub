"use client";

import { cx } from "@/lib/format";
import type { BridgeBlock } from "@/lib/magazine";
import {
  bridgeApproved,
  CHSP_REFERRAL,
  compare,
  PENSION,
  STAGE_ORDER,
  STAGES,
  type BridgeInput,
  type ChspReferral,
  type Pension,
  type Stage,
} from "@/lib/bridge";
import { aud, SERVICES } from "@/lib/sahRules";
import { BRIDGE_CASES } from "@/content/bridgeCases";
import { Dollars, Needs, type Patch } from "../magazine/WhileYouWait";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a While You Wait practice block (docs/while-you-wait.md): the fictional people and call, the
  scenario's stage, services, quote, CHSP branch, rates and prices (every number fictional), what a good family
  summary covers and the phrases to avoid, the model summary, and the sign-off. A summary of the computed figures
  sits at the top so Finance can check them in place.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";

export function BridgeEdit({ block: b, update }: { block: BridgeBlock; update: Update }) {
  const set = (fn: (x: BridgeBlock) => void, tag?: string) => update<BridgeBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const patch: Patch = (fn) => set((x) => void (x.scenario = fn(x.scenario)));
  const sc = b.scenario;
  const scSet = (p: Partial<BridgeInput>, tag?: string) => set((x) => void Object.assign(x.scenario, p), tag);
  const signed = bridgeApproved(b);
  const c = compare(sc, b.today || "2026-01-01");
  const services = [...new Set(sc.needs.map((n) => n.service))];
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="money" className="size-5" /> While You Wait calculator (practice)
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.approval.operations} (Operations), ${b.approval.finance} (Finance), ${b.approval.quality} (Quality), ${b.approval.privacy} (Privacy) and ${b.approval.communications} (Communications) on ${b.approval.approvedOn}.`
          : "Sign-off required. This can’t be published until Operations, Finance, Quality, Privacy and Communications sign-off and the source version are recorded below."}
      </p>
      <p className="mt-2 rounded-2xl bg-muted p-3 text-sm">
        <span className="font-semibold">The scenario’s figures: </span>
        private {c.private.exact && c.private.weeklyCents !== null ? `${aud(c.private.weeklyCents)} a week` : `quote needed (${c.private.reasons.join(" ")})`}
        {c.private.scenarios.length ? `; ${c.private.scenarios.map((s) => `${s.weeks} weeks ${aud(s.cents)}`).join(", ")}` : ""}. CHSP: {c.chsp.state}. Funded
        start: {c.sah.startConfirmed ? "confirmed" : "not confirmed"}. All fictional.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from:</span>
        {BRIDGE_CASES.map((x) => (
          <button
            key={x.id}
            type="button"
            className={btn.secondary}
            title={x.teaches}
            onClick={() => {
              if (window.confirm(`Replace this block with “${x.name}”? What’s in it now is lost, including any sign-off recorded.`))
                set((y) => void Object.assign(y, structuredClone(x.data)));
            }}
          >
            {x.name}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="The person" hint="A made-up name.">
          <input className={input} value={b.person.name} maxLength={80} onChange={(e) => set((x) => void (x.person.name = e.target.value), "pn")} />
        </Field>
        <Field label="About them">
          <input className={input} value={b.person.about} maxLength={400} onChange={(e) => set((x) => void (x.person.about = e.target.value), "pa")} />
        </Field>
        <Field label="Caller">
          <input className={input} value={b.caller.name} maxLength={80} onChange={(e) => set((x) => void (x.caller.name = e.target.value), "cn")} />
        </Field>
        <Field label="Relationship">
          <input className={input} value={b.caller.relation} maxLength={60} onChange={(e) => set((x) => void (x.caller.relation = e.target.value), "cr")} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2">
          <input type="checkbox" className="size-5" checked={b.caller.authorised} onChange={(e) => set((x) => void (x.caller.authorised = e.target.checked))} />
          The person has authorised the caller to discuss their arrangements
        </label>
        <Field label="What the caller asks" className="sm:col-span-2">
          <textarea className={area} value={b.ask} maxLength={600} onChange={(e) => set((x) => void (x.ask = e.target.value), "ask")} />
        </Field>
        <Field label="Scenario “as at” date">
          <input type="date" className={input} value={b.today} onChange={(e) => set((x) => void (x.today = e.target.value))} />
        </Field>
      </div>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Stage, dates and services</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Stage">
            <select className={input} value={sc.stage} onChange={(e) => scSet({ stage: e.target.value as Stage })}>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGES[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source of the stage (fictional)">
            <input
              className={input}
              value={sc.stageSource.source}
              onChange={(e) => scSet({ stageSource: { ...sc.stageSource, source: e.target.value } }, "ss")}
            />
          </Field>
          <Field label="Wait estimate text (optional)">
            <input className={input} value={sc.estimate.text} onChange={(e) => scSet({ estimate: { ...sc.estimate, text: e.target.value } }, "et")} />
          </Field>
          <Field label="Estimate as at">
            <input type="date" className={input} value={sc.estimate.asAt} onChange={(e) => scSet({ estimate: { ...sc.estimate, asAt: e.target.value } })} />
          </Field>
          <Field label="Confirmed allocation date (if the stage has one)">
            <input type="date" className={input} value={sc.allocationDate} onChange={(e) => scSet({ allocationDate: e.target.value })} />
          </Field>
          <Field label="Confirmed funded start date (only when commenced)">
            <input type="date" className={input} value={sc.serviceStartDate} onChange={(e) => scSet({ serviceStartDate: e.target.value })} />
          </Field>
          <Field label="Earliest private start">
            <input type="date" className={input} value={sc.start} onChange={(e) => scSet({ start: e.target.value })} />
          </Field>
          <Field label="Wait scenario (weeks)">
            <input
              type="number"
              min={1}
              max={52}
              className={input}
              value={sc.waitWeeks}
              onChange={(e) => scSet({ waitWeeks: Number(e.target.value || 1) }, "ww")}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Needs i={sc} patch={patch} />
        </div>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The fictional quote, CHSP and rates</summary>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Quote valid until">
            <input type="date" className={input} value={sc.quote.validUntil} onChange={(e) => scSet({ quote: { ...sc.quote, validUntil: e.target.value } })} />
          </Field>
          {services.map((s) => (
            <Dollars
              key={s}
              label={`Quoted ${SERVICES[s].label.toLowerCase()}, per ${SERVICES[s].unit}`}
              cents={sc.quote.prices[s]}
              onChange={(v) => scSet({ quote: { ...sc.quote, prices: { ...sc.quote.prices, [s]: v ?? undefined } } })}
            />
          ))}
          <Field label="Visit minimum (hours, blank unknown)">
            <input
              type="number"
              min={0}
              step={0.25}
              className={input}
              value={sc.quote.minimumHours ?? ""}
              onChange={(e) => scSet({ quote: { ...sc.quote, minimumHours: e.target.value === "" ? null : Number(e.target.value) } })}
            />
          </Field>
          <Dollars
            label="Visit charge"
            hint="Blank is unknown; 0 is none."
            cents={sc.quote.travelCents}
            onChange={(v) => scSet({ quote: { ...sc.quote, travelCents: v } })}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5"
              checked={sc.quote.surchargesKnown}
              onChange={(e) => scSet({ quote: { ...sc.quote, surchargesKnown: e.target.checked } })}
            />
            Surcharges confirmed
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5"
              checked={sc.quote.available === true}
              onChange={(e) => scSet({ quote: { ...sc.quote, available: e.target.checked ? true : null } })}
            />
            Provider can deliver it
          </label>
          <Field label="CHSP referral">
            <select className={input} value={sc.chsp.referral} onChange={(e) => scSet({ chsp: { ...sc.chsp, referral: e.target.value as ChspReferral } })}>
              {(Object.keys(CHSP_REFERRAL) as ChspReferral[]).map((k) => (
                <option key={k} value={k}>
                  {CHSP_REFERRAL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="CHSP provider">
            <select
              className={input}
              value={sc.chsp.provider}
              onChange={(e) => scSet({ chsp: { ...sc.chsp, provider: e.target.value as BridgeInput["chsp"]["provider"] } })}
            >
              <option value="unknown">Not known</option>
              <option value="available">Available</option>
              <option value="none">None</option>
            </select>
          </Field>
          <Dollars
            label="CHSP contribution, per visit"
            cents={sc.chsp.contributionCents}
            onChange={(v) => scSet({ chsp: { ...sc.chsp, contributionCents: v } })}
          />
          <Field label="Pension status">
            <select className={input} value={sc.pension} onChange={(e) => scSet({ pension: e.target.value as Pension })}>
              {(Object.keys(PENSION) as Pension[]).map((k) => (
                <option key={k} value={k}>
                  {PENSION[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Legacy “no worse off”">
            <select className={input} value={sc.legacy} onChange={(e) => scSet({ legacy: e.target.value as BridgeInput["legacy"] })}>
              <option value="unknown">Unknown</option>
              <option value="yes">Applies</option>
              <option value="no">Doesn’t apply</option>
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5"
              checked={sc.rates.verified}
              onChange={(e) => scSet({ rates: { ...sc.rates, verified: e.target.checked } })}
            />
            A fictional “verified notice” with rates
          </label>
          {sc.rates.verified && (
            <>
              <Field label="Independence rate, %">
                <input
                  type="number"
                  className={input}
                  value={sc.rates.independence === null ? "" : sc.rates.independence / 100}
                  onChange={(e) => scSet({ rates: { ...sc.rates, independence: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) } })}
                />
              </Field>
              <Field label="Everyday Living rate, %">
                <input
                  type="number"
                  className={input}
                  value={sc.rates.everyday === null ? "" : sc.rates.everyday / 100}
                  onChange={(e) => scSet({ rates: { ...sc.rates, everyday: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) } })}
                />
              </Field>
            </>
          )}
          {services.map((s) => (
            <Dollars
              key={`sah-${s}`}
              label={`Funded price: ${SERVICES[s].label.toLowerCase()}`}
              cents={sc.sahPrices[s]}
              onChange={(v) => scSet({ sahPrices: { ...sc.sahPrices, [s]: v ?? undefined } })}
            />
          ))}
        </div>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The family summary: what it’s checked for</summary>
        {b.checklist.map((x, i) => (
          <div key={x.id} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              aria-label={`Point ${i + 1}`}
              className={input}
              value={x.label}
              onChange={(e) => set((y) => void (y.checklist[i].label = e.target.value), `cl${i}`)}
            />
            <input
              aria-label={`Words for point ${i + 1}, separated by commas`}
              className={input}
              value={x.anyOf.join(", ")}
              onChange={(e) =>
                set(
                  (y) =>
                    void (y.checklist[i].anyOf = e.target.value
                      .split(",")
                      .map((w) => w.trimStart())
                      .filter((w, j, all) => w || j === all.length - 1)),
                  `cw${i}`,
                )
              }
            />
            <button type="button" className={btn.quiet} aria-label={`Remove point ${i + 1}`} onClick={() => set((y) => void y.checklist.splice(i, 1))}>
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => set((y) => void y.checklist.push({ id: rid("point"), label: "", anyOf: [] }))}
        >
          <Icon name="plus" className="size-4" /> Add a point
        </button>
        <p className="mt-3 text-sm font-semibold">Phrases that make it wrong</p>
        {b.avoid.map((x, i) => (
          <div key={i} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              aria-label={`Phrase ${i + 1}`}
              className={input}
              value={x.phrase}
              onChange={(e) => set((y) => void (y.avoid[i].phrase = e.target.value), `ap${i}`)}
            />
            <input
              aria-label={`Why phrase ${i + 1} is wrong`}
              className={input}
              value={x.why}
              onChange={(e) => set((y) => void (y.avoid[i].why = e.target.value), `aw${i}`)}
            />
            <button type="button" className={btn.quiet} aria-label={`Remove phrase ${i + 1}`} onClick={() => set((y) => void y.avoid.splice(i, 1))}>
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => set((y) => void y.avoid.push({ phrase: "", why: "" }))}>
          <Icon name="plus" className="size-4" /> Add a phrase
        </button>
        <div className={inner}>
          <Field label="The reviewed model summary (shown after the learner checks theirs)">
            <textarea
              className={cx(area, "min-h-40")}
              value={b.model}
              maxLength={2500}
              onChange={(e) => set((y) => void (y.model = e.target.value), "model")}
            />
          </Field>
        </div>
      </details>

      <details className={cx(group, "mt-3")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Source and sign-off</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source" className="sm:col-span-2">
            <input className={input} value={b.source.title} maxLength={200} onChange={(e) => set((y) => void (y.source.title = e.target.value), "st")} />
          </Field>
          <Field label="Its version">
            <input className={input} value={b.source.version} maxLength={80} onChange={(e) => set((y) => void (y.source.version = e.target.value), "sv")} />
          </Field>
          {(
            [
              ["owner", "Content owner"],
              ["operations", "Support at Home Operations"],
              ["finance", "Finance and pricing"],
              ["quality", "Quality or policy"],
              ["privacy", "Privacy"],
              ["communications", "Communications"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} maxLength={120} onChange={(e) => set((y) => void (y.approval[k] = e.target.value), `a${k}`)} />
            </Field>
          ))}
          <Field label="Signed off on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((y) => void (y.approval.approvedOn = e.target.value))} />
          </Field>
        </div>
      </details>
    </div>
  );
}
