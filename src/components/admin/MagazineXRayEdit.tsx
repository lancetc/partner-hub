"use client";

import { cx } from "@/lib/format";
import type { XRayBlock } from "@/lib/magazine";
import {
  ACCOUNTS,
  expectedSplit,
  freshXRay,
  isEligible,
  money,
  OUTCOME_ORDER,
  OUTCOMES,
  PHASES,
  RATE_TBC,
  SCRIPT_PARTS,
  xrayApproved,
  type FundingAccount,
  type LineOutcome,
  type Phase,
  type ScriptPart,
} from "@/lib/xray";
import { XRAY_CASES } from "@/content/xrayCases";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for an Invoice X-Ray (docs/invoice-xray.md): the document and its lines, the answer key with the
  evidence behind each answer, the reviewed split worked out from the prices (so Finance can check the
  arithmetic here), the explanation and what it's checked for, the changed fact, and the sign-off. The answer
  key is authored and deterministic: nothing here is generated.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string) => v.split("\n");
const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

export function XRayEdit({ block: b, update }: { block: XRayBlock; update: Update }) {
  const set = (fn: (x: XRayBlock) => void, tag?: string) => update<XRayBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = xrayApproved(b);
  const split = expectedSplit(b);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="search" className="size-5" /> Invoice X-Ray
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.approval.finance} (Finance), ${b.approval.operations} (Care Operations) and ${b.approval.quality} (Quality) on ${b.approval.approvedOn}.`
          : "Sign-off required. This case can’t be published until Finance, Care Operations and Quality sign-off and the ruleset version are recorded below."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from a case:</span>
        {XRAY_CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={btn.secondary}
            title={c.teaches}
            onClick={() => {
              if (window.confirm(`Replace this block with the starter case “${c.name}”? What’s in the block now is lost, including any sign-off recorded.`))
                set((x) => void Object.assign(x, freshXRay(c.data)));
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Starter cases are fictional drafts written from the PRD, with synthetic rates. Reviewers check every line, rule, figure and script before signing off.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="Document">
          <select className={input} value={b.phase} onChange={(e) => set((x) => void (x.phase = e.target.value as Phase))}>
            {(Object.keys(PHASES) as Phase[]).map((k) => (
              <option key={k} value={k}>
                {PHASES[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supplier" hint="A made-up business. No real branding.">
          <input className={input} value={b.supplier} maxLength={120} onChange={(e) => set((x) => void (x.supplier = e.target.value), "sup")} />
        </Field>
        <Field label="Document number">
          <input className={input} value={b.docNumber} maxLength={40} onChange={(e) => set((x) => void (x.docNumber = e.target.value), "num")} />
        </Field>
        <Field label="Document date">
          <input type="date" className={input} value={b.docDate} onChange={(e) => set((x) => void (x.docDate = e.target.value))} />
        </Field>
        <Field label="Decision date" hint="Dated rules apply as at this day.">
          <input type="date" className={input} value={b.decisionDate} onChange={(e) => set((x) => void (x.decisionDate = e.target.value))} />
        </Field>
        <Field label="The participant" hint="A made-up name.">
          <input className={input} value={b.participant.name} maxLength={80} onChange={(e) => set((x) => void (x.participant.name = e.target.value), "pn")} />
        </Field>
        <Field label="About them" className="sm:col-span-2">
          <input
            className={input}
            value={b.participant.about}
            maxLength={400}
            onChange={(e) => set((x) => void (x.participant.about = e.target.value), "pa")}
          />
        </Field>
        <Field label="What the learner checks against, one fact per line" hint="Plan extract, approvals, agreed work." className="sm:col-span-2">
          <textarea className={area} value={b.facts.join("\n")} onChange={(e) => set((x) => void (x.facts = lines(e.target.value)), "facts")} />
        </Field>
        <Field label="Contribution category">
          <input className={input} value={b.rate.category} maxLength={120} onChange={(e) => set((x) => void (x.rate.category = e.target.value), "rc")} />
        </Field>
        <Field label="Synthetic rate, %" hint={`Blank shows “${RATE_TBC}”.`}>
          <input
            type="number"
            step="0.01"
            min={0}
            max={100}
            className={input}
            value={b.rate.basisPoints === null ? "" : b.rate.basisPoints / 100}
            onChange={(e) => set((x) => void (x.rate.basisPoints = e.target.value === "" ? null : Math.round(Number(e.target.value) * 100)), "rb")}
          />
        </Field>
      </div>

      <p className="mt-3 rounded-2xl bg-muted p-3 text-sm">
        <span className="font-semibold">The reviewed split, from the prices: </span>
        {money(split.total)} total = {money(split.eligible)} eligible + {money(split.private)} private + {money(split.pending)} pending. Of the eligible:{" "}
        {split.subsidy === null ? RATE_TBC : money(split.subsidy)} subsidy and {split.contribution === null ? RATE_TBC : money(split.contribution)}{" "}
        contribution.
      </p>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">
          Reasons ({b.reasons.length}) and missing-evidence options ({b.checks.length})
        </summary>
        <p className="text-xs text-ink-muted">
          Include tempting wrong reasons (“bathrooms aren’t funded”, “there’s budget left”) so learners can see why they fail.
        </p>
        {b.reasons.map((r, i) => (
          <div key={r.id} className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              aria-label={`Reason ${i + 1}`}
              className={input}
              value={r.text}
              maxLength={240}
              onChange={(e) => set((x) => void (x.reasons[i].text = e.target.value), `r${i}`)}
            />
            <button type="button" className={btn.quiet} aria-label={`Remove reason ${i + 1}`} onClick={() => set((x) => void x.reasons.splice(i, 1))}>
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => set((x) => void x.reasons.push({ id: rid("reason"), text: "" }))}>
          <Icon name="plus" className="size-4" /> Add a reason
        </button>
        {b.checks.map((r, i) => (
          <div key={r.id} className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input
              aria-label={`Missing evidence ${i + 1}`}
              className={input}
              value={r.text}
              maxLength={200}
              onChange={(e) => set((x) => void (x.checks[i].text = e.target.value), `e${i}`)}
            />
            <button type="button" className={btn.quiet} aria-label={`Remove missing evidence ${i + 1}`} onClick={() => set((x) => void x.checks.splice(i, 1))}>
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => set((x) => void x.checks.push({ id: rid("check"), text: "" }))}>
          <Icon name="plus" className="size-4" /> Add a missing-evidence option
        </button>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The lines and their answers ({b.lines.length})</summary>
        {b.lines.map((l, i) => {
          const put = (fn: (x: XRayBlock["lines"][number]) => void, tag?: string) => set((x) => fn(x.lines[i]), tag && `l${i}${tag}`);
          return (
            <details key={l.id} className={inner}>
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                {i + 1}. {l.description || "untitled"}, {money(l.amountCents)} · {OUTCOMES[l.outcome].label}
              </summary>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Description">
                  <input className={input} value={l.description} maxLength={160} onChange={(e) => put((x) => void (x.description = e.target.value), "d")} />
                </Field>
                <Field label="Detail">
                  <input className={input} value={l.detail} maxLength={200} onChange={(e) => put((x) => void (x.detail = e.target.value), "dt")} />
                </Field>
                <Field label="Amount, $ (incl. GST)">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className={input}
                    value={l.amountCents / 100}
                    onChange={(e) => put((x) => void (x.amountCents = Math.round(Number(e.target.value || 0) * 100)), "a")}
                  />
                </Field>
                <Field label="Reviewed outcome">
                  <select className={input} value={l.outcome} onChange={(e) => put((x) => void (x.outcome = e.target.value as LineOutcome))}>
                    {OUTCOME_ORDER.map((o) => (
                      <option key={o} value={o}>
                        {OUTCOMES[o].label}
                      </option>
                    ))}
                  </select>
                </Field>
                {isEligible(l.outcome) && (
                  <Field label="Funded from">
                    <select className={input} value={l.account} onChange={(e) => put((x) => void (x.account = e.target.value as FundingAccount))}>
                      {(Object.keys(ACCOUNTS) as FundingAccount[]).map((a) => (
                        <option key={a} value={a}>
                          {ACCOUNTS[a]}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-semibold">Reasons that explain it correctly</legend>
                {b.reasons.map((r) => (
                  <label key={r.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={l.reasons.includes(r.id)}
                      onChange={(e) => put((x) => void (x.reasons = toggle(x.reasons, r.id, e.target.checked)))}
                    />
                    {r.text || "untitled reason"}
                  </label>
                ))}
              </fieldset>
              {l.outcome === "needs_review" && (
                <fieldset className="flex flex-col gap-1">
                  <legend className="text-sm font-semibold">What the learner must name as missing</legend>
                  {b.checks.map((r) => (
                    <label key={r.id} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={l.evidence.includes(r.id)}
                        onChange={(e) => put((x) => void (x.evidence = toggle(x.evidence, r.id, e.target.checked)))}
                      />
                      {r.text || "untitled"}
                    </label>
                  ))}
                </fieldset>
              )}
              <Field label="Why the tempting shortcut fails">
                <textarea className={area} value={l.feedback} maxLength={600} onChange={(e) => put((x) => void (x.feedback = e.target.value), "f")} />
              </Field>
              <Field label="What changes the answer?">
                <input className={input} value={l.changes} maxLength={400} onChange={(e) => put((x) => void (x.changes = e.target.value), "c")} />
              </Field>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="The rule it rests on">
                  <input className={input} value={l.source.rule} maxLength={300} onChange={(e) => put((x) => void (x.source.rule = e.target.value), "sr")} />
                </Field>
                <Field label="The participant fact">
                  <input className={input} value={l.source.fact} maxLength={300} onChange={(e) => put((x) => void (x.source.fact = e.target.value), "sf")} />
                </Field>
                <Field label="The procedure">
                  <input
                    className={input}
                    value={l.source.procedure}
                    maxLength={300}
                    onChange={(e) => put((x) => void (x.source.procedure = e.target.value), "sp")}
                  />
                </Field>
              </div>
              <div>
                <button type="button" className={btn.quiet} onClick={() => set((x) => void x.lines.splice(i, 1))}>
                  <Icon name="trash" className="size-4" /> Remove this line
                </button>
              </div>
            </details>
          );
        })}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() =>
            set(
              (x) =>
                void x.lines.push({
                  id: rid("line"),
                  description: "",
                  detail: "",
                  amountCents: 0,
                  outcome: "needs_review",
                  account: "none",
                  reasons: [],
                  evidence: [],
                  feedback: "",
                  changes: "",
                  source: { rule: "", fact: "", procedure: "" },
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add a line
        </button>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">What happens with the document now</summary>
        <Field label="Question">
          <input className={input} value={b.next.prompt} maxLength={240} onChange={(e) => set((x) => void (x.next.prompt = e.target.value), "np")} />
        </Field>
        {b.next.options.map((o, i) => (
          <div key={o.id} className={inner}>
            <Field label={`Option ${i + 1}`}>
              <input className={input} value={o.text} maxLength={240} onChange={(e) => set((x) => void (x.next.options[i].text = e.target.value), `n${i}t`)} />
            </Field>
            <div className="flex flex-wrap gap-4">
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input
                  type="radio"
                  name={`${b.id}-next-right`}
                  className="size-5"
                  checked={o.right}
                  onChange={() =>
                    set((x) => void x.next.options.forEach((y, j) => Object.assign(y, { right: j === i, critical: j === i ? false : y.critical })))
                  }
                />
                The right answer
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-5"
                  disabled={o.right}
                  checked={o.critical}
                  onChange={(e) => set((x) => void (x.next.options[i].critical = e.target.checked))}
                />
                A critical mistake (claiming a quote, promising payment)
              </label>
            </div>
            <Field label="Why">
              <input className={input} value={o.why} maxLength={400} onChange={(e) => set((x) => void (x.next.options[i].why = e.target.value), `n${i}w`)} />
            </Field>
            <div>
              <button type="button" className={btn.quiet} onClick={() => set((x) => void x.next.options.splice(i, 1))}>
                <Icon name="trash" className="size-4" /> Remove this option
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => set((x) => void x.next.options.push({ id: rid("next"), text: "", right: false, critical: false, why: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add an option
        </button>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The explanation</summary>
        <div className="grid gap-2">
          <Field label="The line explained">
            <select className={input} value={b.explain.lineId} onChange={(e) => set((x) => void (x.explain.lineId = e.target.value))}>
              <option value="">Choose a line</option>
              {b.lines.map((l, i) => (
                <option key={l.id} value={l.id}>
                  {i + 1}. {l.description}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What the family asks">
            <textarea className={area} value={b.explain.ask} maxLength={400} onChange={(e) => set((x) => void (x.explain.ask = e.target.value), "ea")} />
          </Field>
          {(Object.keys(SCRIPT_PARTS) as ScriptPart[]).map((k) => (
            <Field key={k} label={`Starting draft: ${SCRIPT_PARTS[k].toLowerCase()}`}>
              <textarea
                className={area}
                value={b.explain.draft[k]}
                maxLength={600}
                onChange={(e) => set((x) => void (x.explain.draft[k] = e.target.value), `d${k}`)}
              />
            </Field>
          ))}
          <Field label="The reviewed model script (shown after)">
            <textarea
              className={cx(area, "min-h-28")}
              value={b.explain.model}
              maxLength={2000}
              onChange={(e) => set((x) => void (x.explain.model = e.target.value), "em")}
            />
          </Field>
          <p className="text-sm font-semibold">What a good explanation covers</p>
          {b.explain.checklist.map((c, i) => (
            <div key={c.id} className="grid gap-2 rounded-xl bg-surface p-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                aria-label={`Point ${i + 1}`}
                className={input}
                value={c.label}
                maxLength={200}
                onChange={(e) => set((x) => void (x.explain.checklist[i].label = e.target.value), `c${i}l`)}
              />
              <input
                aria-label={`Words that show point ${i + 1}, separated by commas`}
                className={input}
                value={c.anyOf.join(", ")}
                placeholder="Words or phrases, separated by commas"
                onChange={(e) =>
                  set(
                    (x) =>
                      void (x.explain.checklist[i].anyOf = e.target.value
                        .split(",")
                        .map((w) => w.trimStart())
                        .filter((w, j, all) => w || j === all.length - 1)),
                    `c${i}w`,
                  )
                }
              />
              <button
                type="button"
                className={btn.quiet}
                aria-label={`Remove point ${i + 1}`}
                onClick={() => set((x) => void x.explain.checklist.splice(i, 1))}
              >
                <Icon name="trash" className="size-4" />
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              className={btn.secondary}
              onClick={() => set((x) => void x.explain.checklist.push({ id: rid("point"), label: "", anyOf: [] }))}
            >
              <Icon name="plus" className="size-4" /> Add a point
            </button>
          </div>
          <p className="text-sm font-semibold">Phrases that make it wrong</p>
          {b.explain.avoid.map((a, i) => (
            <div key={i} className="grid gap-2 rounded-xl bg-surface p-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                aria-label={`Phrase ${i + 1}`}
                className={input}
                value={a.phrase}
                maxLength={120}
                onChange={(e) => set((x) => void (x.explain.avoid[i].phrase = e.target.value), `v${i}p`)}
              />
              <input
                aria-label={`Why phrase ${i + 1} is wrong`}
                className={input}
                value={a.why}
                maxLength={300}
                onChange={(e) => set((x) => void (x.explain.avoid[i].why = e.target.value), `v${i}w`)}
              />
              <button type="button" className={btn.quiet} aria-label={`Remove phrase ${i + 1}`} onClick={() => set((x) => void x.explain.avoid.splice(i, 1))}>
                <Icon name="trash" className="size-4" />
              </button>
            </div>
          ))}
          <div>
            <button type="button" className={btn.secondary} onClick={() => set((x) => void x.explain.avoid.push({ phrase: "", why: "" }))}>
              <Icon name="plus" className="size-4" /> Add a phrase
            </button>
          </div>
        </div>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">One changed fact</summary>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5"
            checked={Boolean(b.twist)}
            onChange={(e) =>
              set(
                (x) => void (x.twist = e.target.checked ? { fact: "", lineId: x.lines[0]?.id ?? "", outcome: "needs_review", account: "none", why: "" } : null),
              )
            }
          />
          Offer a second try at one line with one fact changed
        </label>
        {b.twist && (
          <div className={inner}>
            <Field label="The changed fact">
              <textarea className={area} value={b.twist.fact} maxLength={400} onChange={(e) => set((x) => void (x.twist!.fact = e.target.value), "tf")} />
            </Field>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Line">
                <select className={input} value={b.twist.lineId} onChange={(e) => set((x) => void (x.twist!.lineId = e.target.value))}>
                  {b.lines.map((l, i) => (
                    <option key={l.id} value={l.id}>
                      {i + 1}. {l.description}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Now it is">
                <select className={input} value={b.twist.outcome} onChange={(e) => set((x) => void (x.twist!.outcome = e.target.value as LineOutcome))}>
                  {OUTCOME_ORDER.map((o) => (
                    <option key={o} value={o}>
                      {OUTCOMES[o].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Funded from">
                <select className={input} value={b.twist.account} onChange={(e) => set((x) => void (x.twist!.account = e.target.value as FundingAccount))}>
                  {(Object.keys(ACCOUNTS) as FundingAccount[]).map((a) => (
                    <option key={a} value={a}>
                      {ACCOUNTS[a]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Why it changes">
              <input className={input} value={b.twist.why} maxLength={400} onChange={(e) => set((x) => void (x.twist!.why = e.target.value), "tw")} />
            </Field>
          </div>
        )}
      </details>

      <details className={cx(group, "mt-3")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Ruleset and sign-off</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ruleset or source" className="sm:col-span-2">
            <input className={input} value={b.source.title} maxLength={200} onChange={(e) => set((x) => void (x.source.title = e.target.value), "st")} />
          </Field>
          <Field label="Its version">
            <input className={input} value={b.source.version} maxLength={80} onChange={(e) => set((x) => void (x.source.version = e.target.value), "sv")} />
          </Field>
          <Field label="Checked against it on">
            <input type="date" className={input} value={b.source.reviewedOn} onChange={(e) => set((x) => void (x.source.reviewedOn = e.target.value))} />
          </Field>
          <Field label="Content owner">
            <input className={input} value={b.approval.owner} maxLength={120} onChange={(e) => set((x) => void (x.approval.owner = e.target.value), "ao")} />
          </Field>
          <Field label="Finance (arithmetic and invoice practice)">
            <input
              className={input}
              value={b.approval.finance}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.finance = e.target.value), "af")}
            />
          </Field>
          <Field label="Care Operations (participant journey and scripts)">
            <input
              className={input}
              value={b.approval.operations}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.operations = e.target.value), "aop")}
            />
          </Field>
          <Field label="Quality or policy (eligibility and dates)">
            <input
              className={input}
              value={b.approval.quality}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.quality = e.target.value), "aq")}
            />
          </Field>
          <Field label="Signed off on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Record the people who actually reviewed it. Changing a line, price, rule or script after sign-off means it needs signing off again: clear and re-enter
          the date when it has been.
        </p>
      </details>
    </div>
  );
}
