"use client";

import { cx } from "@/lib/format";
import type { CashBridgeBlock } from "@/lib/magazine";
import { caseProblems, labApproved, type CashBridgeLabData } from "@/lib/cashBridgeLab";
import { CATEGORIES, CATEGORY_ORDER, CERTAINTY, dateLabel, DEFINITIONS_VERSION, money, safeCalculate, SOURCES, STATUSES } from "@/lib/cashBridge";
import { CASH_BRIDGE_CASES } from "@/content/cashBridgeCases";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a 90-Day Cash Bridge block ("Can we fund the next 90 days?", docs/cash-bridge.md). The frame has
  plain fields; the story, the agreement excerpt, the dated cash events, the options, the Day 30 actuals, the worked
  example, the evidence cards (with their reviewed stage and feedback), the questions and the decisions each have an
  advanced JSON edit, as the sibling calculators' editors do. The case check lists anything that would mislead a
  learner, including a low point the weekly chart can't hide or a worked example that no longer teaches the rule. The
  AI selection rationale (PRD section 9) is recorded with the story, and the author accepts, edits or rejects it.
  Nothing here is generated, and the sign-off starts empty. Use Preview to play it.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const SIGNOFF: [Exclude<keyof CashBridgeLabData["approval"], "approvedOn" | "effectiveFrom" | "reviewBy">, string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["finance", "Finance and the partner commercial agreement owner (fee, remittance and invoice rules)"],
  ["operations", "Care Coordination Operations (staff coverage)"],
  ["quality", "Quality (participant continuity)"],
  ["partnerships", "Partnerships"],
  ["privacy", "Privacy and security (private planning)"],
  ["partnerReps", "Partner business representatives (pilot)"],
];
const RATIONALE: [Exclude<keyof CashBridgeLabData["rationale"], "decision">, string, string][] = [
  ["theme", "Problem evidence", "Verified partner questions, hiring pressure or repeated cash-timing confusion, and where they came from."],
  ["themeOwner", "Evidence owner", "Who owns that evidence."],
  ["audience", "Audience", ""],
  ["behaviour", "Target behaviour", ""],
  ["whyFit", "Why this block", ""],
  ["alternatives", "Alternatives or process fixes", "Learning alone won’t fix a payment calendar or a funding gap."],
  ["reuse", "Existing content to reuse", ""],
  ["measure", "Linked scored outcomes and operational data (owned separately)", ""],
];

export function CashBridgeEdit({ block: b, update }: { block: CashBridgeBlock; update: Update }) {
  const set = (fn: (x: CashBridgeBlock) => void, tag?: string) => update<CashBridgeBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = labApproved(b);
  const r = safeCalculate(b.inputs);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="money" className="size-5" /> 90-Day Cash Bridge
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed && !problems.length
            ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
            : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {problems.length
          ? `The case check finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes.`
          : signed
            ? "The case check passes and the sign-off is recorded: this block can be published."
            : "A draft: the case check passes, but it can’t be published until every reviewer’s sign-off is recorded below."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a case">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = CASH_BRIDGE_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {CASH_BRIDGE_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Story version"
          hint="Change it when the story, figures or feedback change: attempts record the version they used. Reapprove when the commercial model or policy changes."
        >
          <input className={input} value={b.storyVersion} onChange={(e) => set((x) => void (x.storyVersion = e.target.value), "version")} />
        </Field>
        <Field label="Title">
          <input className={input} value={b.title} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
      </div>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">The case, as written</h4>
        {r ? (
          <p className="text-sm">
            {dateLabel(r.startDate)} to {dateLabel(r.endDate)}. Lowest cash {money(r.low.cents)} on {dateLabel(r.low.date)}; opening cash needed to keep{" "}
            {money(r.reserve)}: {money(r.required)}
            {r.additional !== null ? `, an additional ${money(r.additional)}` : ""}. {r.belowReserve.days} {r.belowReserve.days === 1 ? "date" : "dates"} below
            the reserve. Conservative intraday check: {money(r.intraday.cents)} on {dateLabel(r.intraday.date)}.{" "}
            {r.reliable ? "Every material input is supplied." : "Not reliable yet: a material input is missing."}
          </p>
        ) : (
          <p className="text-sm">The figures don’t validate yet, so there’s no result.</p>
        )}
        <JsonEdit
          label="Story (principal, situation, Ava’s transmission and return, the beats)"
          value={b.story}
          onApply={(v) => set((x) => void (x.story = v as CashBridgeLabData["story"]))}
          check={isObj}
        />
        <JsonEdit
          label="The fictional agreement excerpt, and the margin view"
          value={{ agreement: b.agreement, margin: b.margin }}
          onApply={(v) =>
            set((x) => {
              const o = v as Pick<CashBridgeLabData, "agreement" | "margin">;
              x.agreement = o.agreement;
              x.margin = o.margin;
            })
          }
          check={(v) => isObj(v) && isObj((v as Record<string, unknown>).agreement) && Array.isArray((v as Record<string, unknown>).margin)}
        />
        <JsonEdit
          label="The 90 days (start date, opening cash, reserve, agreement terms, caseload, starts, coordinators, dated events, statutory items, credit, capacity)"
          value={b.inputs}
          onApply={(v) => set((x) => void (x.inputs = v as CashBridgeLabData["inputs"]))}
          check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).events)}
        />
        <JsonEdit
          label="Sensitivity cases and actions (one per group; mustTest names the delayed-receipt case)"
          value={{ options: b.options, mustTest: b.mustTest }}
          onApply={(v) =>
            set((x) => {
              const o = v as Pick<CashBridgeLabData, "options" | "mustTest">;
              x.options = o.options;
              x.mustTest = o.mustTest;
            })
          }
          check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).options)}
        />
        <JsonEdit label="Day 30 actuals" value={b.actuals} onApply={(v) => set((x) => void (x.actuals = v as CashBridgeLabData["actuals"]))} check={isObj} />
        <JsonEdit
          label="The worked example (the PRD fixture: its own figures, and the receipt that moves)"
          value={b.example}
          onApply={(v) => set((x) => void (x.example = v as CashBridgeLabData["example"]))}
          check={isObj}
        />
        <JsonEdit
          label="First guess (likely: true marks the expected answer)"
          value={b.prediction}
          onApply={(v) => set((x) => void (x.prediction = v as CashBridgeLabData["prediction"]))}
          check={isObj}
        />
        <JsonEdit
          label="Evidence for the timeline (each with its reviewed stage, whether cash moves, and feedback)"
          value={b.cards}
          onApply={(v) => set((x) => void (x.cards = v as CashBridgeLabData["cards"]))}
          check={Array.isArray}
        />
        <JsonEdit label="A start moves (question)" value={b.slip} onApply={(v) => set((x) => void (x.slip = v as CashBridgeLabData["slip"]))} check={isObj} />
        <JsonEdit
          label="The cash low point (readings, each with a date and flags)"
          value={b.lowPoint}
          onApply={(v) => set((x) => void (x.lowPoint = v as CashBridgeLabData["lowPoint"]))}
          check={isObj}
        />
        <JsonEdit
          label="Explanations"
          value={b.explanations}
          onApply={(v) => set((x) => void (x.explanations = v as CashBridgeLabData["explanations"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Decisions (with feedback, outcome, levels and flags)"
          value={b.decisions}
          onApply={(v) => set((x) => void (x.decisions = v as CashBridgeLabData["decisions"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Day 30 check-in (question)"
          value={b.review}
          onApply={(v) => set((x) => void (x.review = v as CashBridgeLabData["review"]))}
          check={isObj}
        />
        <JsonEdit
          label="Links (related articles and tools: opened by the reader, never prefilled)"
          value={b.links}
          onApply={(v) => set((x) => void (x.links = v as CashBridgeLabData["links"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Public sources (to check during content review)"
          value={b.sources}
          onApply={(v) => set((x) => void (x.sources = v as CashBridgeLabData["sources"]))}
          check={Array.isArray}
        />
        <Field label="Debrief summary" hint="Shown once the attempt is finished.">
          <textarea className={cx(input, "min-h-24 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
        <Field label="Six weeks later" hint="The return visit. Shown in the debrief.">
          <textarea className={cx(input, "min-h-20 py-2")} value={b.followUp} onChange={(e) => set((x) => void (x.followUp = e.target.value), "follow")} />
        </Field>
      </section>

      <details className={cx(group, "mt-4")}>
        <summary className="cursor-pointer font-semibold">
          The shared definitions ({b.definitionsVersion || DEFINITIONS_VERSION})
          {b.definitionsVersion !== DEFINITIONS_VERSION && " · the case uses an earlier version"}
        </summary>
        <p className="text-sm text-ink-muted">
          Every 90-Day Cash Bridge uses the same categories, statuses, sources and earning condition. To change one, change the definitions (with Finance and
          the agreement owner) and their version, not this article.
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {CATEGORY_ORDER.map((k) => (
            <div key={k}>
              <dt className="font-semibold">
                {CATEGORIES[k].label} ({CATEGORIES[k].dir === "in" ? "receipt" : "outflow"})
              </dt>
              <dd className="text-ink-muted">{CATEGORIES[k].hint || "—"}</dd>
            </div>
          ))}
          <div>
            <dt className="font-semibold">Statuses</dt>
            <dd className="text-ink-muted">{Object.values(STATUSES).join(" · ")}</dd>
          </div>
          <div>
            <dt className="font-semibold">Sources</dt>
            <dd className="text-ink-muted">{Object.values(SOURCES).join(" · ")}</dd>
          </div>
          <div>
            <dt className="font-semibold">Start certainty</dt>
            <dd className="text-ink-muted">{Object.values(CERTAINTY).join(" · ")}. Only an agreement or a commencement can earn a fee.</dd>
          </div>
        </dl>
      </details>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Why this block (selection rationale)</h4>
        <p className="text-sm text-ink-muted">
          Problem evidence → target behaviour → why this block → alternatives or process fixes → content to reuse → owner → linked outcomes. Accept it, edit it,
          or reject it. AI may explain a computed bridge; it never invents a payment entitlement, assumes a fee from public funding, changes a number or gives a
          funding recommendation.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {RATIONALE.map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint || undefined}>
              <textarea
                className={cx(input, "min-h-16 py-2")}
                value={b.rationale[k]}
                onChange={(e) => set((x) => void (x.rationale[k] = e.target.value), `ra-${k}`)}
              />
            </Field>
          ))}
          <Field label="Author’s decision">
            <select
              className={input}
              value={b.rationale.decision}
              onChange={(e) => set((x) => void (x.rationale.decision = e.target.value as CashBridgeLabData["rationale"]["decision"]))}
            >
              <option value="">Not decided</option>
              <option value="accepted">Accepted</option>
              <option value="edited">Accepted with edits</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
        </div>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Case check</h4>
        {problems.length ? (
          <ul className="list-disc pl-5 text-sm">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            Passes: the figures validate and are all fictional, every statutory item is answered, there’s an unsecured start, a midweek low below the reserve
            that a reading names, a delayed-receipt and a slipped-start case, a moved hire with the capacity guardrail, Day 30 actuals, a worked example that
            still teaches the rule, and every question has a strong, unflagged answer.
          </p>
        )}
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">
          Finance and the agreement owner approve every fee, remittance and invoice rule; Operations and Quality review staff coverage and participant
          continuity. The Hub owner then publishes a version with effective and review dates.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SIGNOFF.map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} onChange={(e) => set((x) => void (x.approval[k] = e.target.value), `ap-${k}`)} />
            </Field>
          ))}
          <Field label="Approved on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Effective from">
            <input
              type="date"
              className={input}
              value={b.approval.effectiveFrom}
              onChange={(e) => set((x) => void (x.approval.effectiveFrom = e.target.value))}
            />
          </Field>
          <Field label="Review by" hint="After this date it can’t be published until it’s reviewed again.">
            <input type="date" className={input} value={b.approval.reviewBy} onChange={(e) => set((x) => void (x.approval.reviewBy = e.target.value))} />
          </Field>
        </div>
      </section>
    </div>
  );
}

const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
