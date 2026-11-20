"use client";

import { cx } from "@/lib/format";
import type { AuditorBlock } from "@/lib/magazine";
import {
  ACTIONS,
  auditorApproved,
  auditorIdentifiers,
  CATEGORIES,
  CATEGORY_ORDER,
  DATE_KINDS,
  DECISION_ORDER,
  DECISIONS,
  freshAuditor,
  isDate,
  lineTotal,
  MODES,
  money,
  RULE_FAMILIES,
  SEVERITIES,
  staleRules,
  STATUSES,
  type AuditField,
  type AuditMode,
  type Category,
  type DateKind,
  type Decision,
  type DecisionKey,
  type EvidenceStatus,
  type NextAction,
  type RuleFamily,
  type Severity,
} from "@/lib/auditor";
import { AUDIT_CASES } from "@/content/auditCases";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Document Auditor (docs/document-auditor.md): the case and its dates, the fictional documents and
  trusted records, the missing-document checklist, the rules with their sources and dates, the answer key (each
  finding's target, comparisons, rule, status, severity and accepted readings), the decision credit, next actions,
  hint, changed fact and sign-off. The answer key is authored: nothing here is generated. Use Preview to test it.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const today = () => new Date().toISOString().slice(0, 10);
const blankField = (): AuditField => ({ id: rid("fld"), label: "", value: "", date: "", dateKind: "", line: null });

export function AuditorEdit({ block: b, update }: { block: AuditorBlock; update: Update }) {
  const set = (fn: (x: AuditorBlock) => void, tag?: string) => update<AuditorBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = auditorApproved(b);
  const stale = staleRules(b, today());
  const real = auditorIdentifiers(b);
  const reviewer = b.mode === "contractor_vetting" ? "Supply Chain or Compliance" : "Finance";
  const docFields = b.docs
    .filter((d) => d.kind === "document")
    .flatMap((d) => d.fields.map((f) => ({ id: f.id, label: `${d.title}: ${f.label || "(unnamed)"}` })));
  const recordFields = b.docs
    .filter((d) => d.kind === "record")
    .flatMap((d) => d.fields.map((f) => ({ id: f.id, label: `${d.title}: ${f.label || "(unnamed)"}` })));
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="shield" className="size-5" /> Document Auditor
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed && !stale.length && !real.length
            ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
            : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.mode === "contractor_vetting" ? b.approval.compliance : b.approval.finance} (${reviewer}), ${b.approval.operations} (Care Operations) and ${b.approval.quality} (Quality) on ${b.approval.approvedOn}.`
          : `Sign-off required. This case can’t be published until ${reviewer}, Care Operations and Quality sign-off and the ruleset version are recorded below.`}
        {stale.map((r) => (
          <span key={r.id} className="block">
            The rule “{r.title}” was due for review on {r.reviewBy}. Confirm it’s current before publishing.
          </span>
        ))}
        {real.length > 0 && <span className="block">It looks like the case contains {real.join(" and ")}. Use fictional details only.</span>}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from a case:</span>
        {AUDIT_CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={btn.secondary}
            onClick={() => {
              if (window.confirm(`Replace this block with the starter case “${c.label}”? What’s in the block now is lost, including any sign-off recorded.`))
                set((x) => void Object.assign(x, freshAuditor(c.data)));
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Mode">
          <select className={input} value={b.mode} onChange={(e) => set((x) => void (x.mode = e.target.value as AuditMode))}>
            {(Object.keys(MODES) as AuditMode[]).map((m) => (
              <option key={m} value={m}>
                {MODES[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Introduction" className="sm:col-span-2">
          <textarea className={area} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="The learner’s role">
          <input className={input} value={b.context.role} maxLength={160} onChange={(e) => set((x) => void (x.context.role = e.target.value), "role")} />
        </Field>
        <Field label="The supplier (fictional)">
          <input
            className={input}
            value={b.context.supplier}
            maxLength={300}
            onChange={(e) => set((x) => void (x.context.supplier = e.target.value), "supplier")}
          />
        </Field>
        <Field label="The participant (fictional)">
          <input
            className={input}
            value={b.context.participant}
            maxLength={300}
            onChange={(e) => set((x) => void (x.context.participant = e.target.value), "participant")}
          />
        </Field>
        <Field label="The decision to make">
          <input className={input} value={b.context.task} maxLength={400} onChange={(e) => set((x) => void (x.context.task = e.target.value), "task")} />
        </Field>
        <Field label="Simulated decision date">
          <input type="date" className={input} value={b.decisionDate} onChange={(e) => set((x) => void (x.decisionDate = e.target.value))} />
        </Field>
        <Field label={b.mode === "contractor_vetting" ? "Proposed engagement date" : "Service date checked"} hint="Dated documents are checked against this.">
          <input type="date" className={input} value={b.engagementDate} onChange={(e) => set((x) => void (x.engagementDate = e.target.value))} />
        </Field>
      </div>

      <h4 className="mt-5 font-semibold">Documents and trusted records</h4>
      <p className="text-sm text-ink-muted">
        Documents are what the learner inspects and marks. Records are trusted comparisons beside them. Every detail must be fictional.
      </p>
      {b.docs.map((d, di) => (
        <div key={d.id} className={cx(group, "mt-2")}>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]">
            <Field label="Kind">
              <select className={input} value={d.kind} onChange={(e) => set((x) => void (x.docs[di].kind = e.target.value as "document" | "record"))}>
                <option value="document">Document to inspect</option>
                <option value="record">Trusted record</option>
              </select>
            </Field>
            <Field label="Title">
              <input className={input} value={d.title} maxLength={160} onChange={(e) => set((x) => void (x.docs[di].title = e.target.value), `doc-${d.id}`)} />
            </Field>
            <Field label="Subtitle">
              <input
                className={input}
                value={d.subtitle}
                maxLength={240}
                onChange={(e) => set((x) => void (x.docs[di].subtitle = e.target.value), `docsub-${d.id}`)}
              />
            </Field>
            <button type="button" className={cx(btn.quiet, "self-end")} onClick={() => set((x) => void x.docs.splice(di, 1))}>
              <Icon name="trash" className="size-4" /> Remove
            </button>
          </div>
          {d.fields.map((f, fi) => (
            <div key={f.id} className={inner}>
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <Field label="Field label">
                  <input
                    className={input}
                    value={f.label}
                    maxLength={120}
                    onChange={(e) => set((x) => void (x.docs[di].fields[fi].label = e.target.value), `fl-${f.id}`)}
                  />
                </Field>
                <Field label="As shown on the document">
                  <input
                    className={input}
                    value={f.value}
                    maxLength={400}
                    onChange={(e) => set((x) => void (x.docs[di].fields[fi].value = e.target.value), `fv-${f.id}`)}
                  />
                </Field>
                <button type="button" className={cx(btn.quiet, "self-end")} onClick={() => set((x) => void x.docs[di].fields.splice(fi, 1))}>
                  <Icon name="trash" className="size-4" /> <span className="sr-only">Remove field</span>
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <Field label="Date (for checks)">
                  <input type="date" className={input} value={f.date} onChange={(e) => set((x) => void (x.docs[di].fields[fi].date = e.target.value))} />
                </Field>
                <Field label="What the date is">
                  <select className={input} value={f.dateKind} onChange={(e) => set((x) => void (x.docs[di].fields[fi].dateKind = e.target.value as DateKind))}>
                    {(Object.keys(DATE_KINDS) as DateKind[]).map((k) => (
                      <option key={k} value={k}>
                        {DATE_KINDS[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex min-h-11 items-center gap-2 self-end text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={Boolean(f.line)}
                    onChange={(e) =>
                      set((x) => void (x.docs[di].fields[fi].line = e.target.checked ? { qty: 1, unit: "hours", rateCents: 0, amountCents: 0 } : null))
                    }
                  />
                  Units and rate (for sums)
                </label>
              </div>
              {f.line && (
                <div className="grid gap-2 sm:grid-cols-5">
                  <Field label="Units">
                    <input
                      type="number"
                      step="0.25"
                      className={input}
                      value={f.line.qty}
                      onChange={(e) => set((x) => void (x.docs[di].fields[fi].line!.qty = Number(e.target.value)))}
                    />
                  </Field>
                  <Field label="Unit">
                    <input
                      className={input}
                      value={f.line.unit}
                      maxLength={20}
                      onChange={(e) => set((x) => void (x.docs[di].fields[fi].line!.unit = e.target.value))}
                    />
                  </Field>
                  <Field label="Rate (cents)">
                    <input
                      type="number"
                      className={input}
                      value={f.line.rateCents}
                      onChange={(e) => set((x) => void (x.docs[di].fields[fi].line!.rateCents = Math.round(Number(e.target.value))))}
                    />
                  </Field>
                  <Field label="Amount shown (cents)">
                    <input
                      type="number"
                      className={input}
                      value={f.line.amountCents}
                      onChange={(e) => set((x) => void (x.docs[di].fields[fi].line!.amountCents = Math.round(Number(e.target.value))))}
                    />
                  </Field>
                  <p className="self-end pb-2 text-sm">
                    {f.line.qty} × {money(f.line.rateCents)} = {money(lineTotal(f.line))}
                    {lineTotal(f.line) !== f.line.amountCents && <span className="block font-semibold">Doesn’t match the amount shown.</span>}
                  </p>
                </div>
              )}
              {f.date && !isDate(f.date) && <p className="text-sm font-semibold">That date isn’t valid.</p>}
            </div>
          ))}
          <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => set((x) => void x.docs[di].fields.push(blankField()))}>
            <Icon name="plus" className="size-4" /> Add a field
          </button>
        </div>
      ))}
      <button
        type="button"
        className={cx(btn.secondary, "mt-2")}
        onClick={() => set((x) => void x.docs.push({ id: rid("doc"), kind: "document", title: "", subtitle: "", fields: [blankField()] }))}
      >
        <Icon name="plus" className="size-4" /> Add a document or record
      </button>

      <h4 className="mt-5 font-semibold">Missing-document checklist</h4>
      <p className="text-sm text-ink-muted">
        Rows a learner can mark as missing. Include documents that aren’t needed here, so not marking them is part of the skill.
      </p>
      {b.missing.map((m, mi) => (
        <div key={m.id} className={cx(group, "mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]")}>
          <Field label="Document">
            <input className={input} value={m.label} maxLength={160} onChange={(e) => set((x) => void (x.missing[mi].label = e.target.value), `ml-${m.id}`)} />
          </Field>
          <Field label="Note shown to learners (optional)">
            <input className={input} value={m.note} maxLength={240} onChange={(e) => set((x) => void (x.missing[mi].note = e.target.value), `mn-${m.id}`)} />
          </Field>
          <button type="button" className={cx(btn.quiet, "self-end")} onClick={() => set((x) => void x.missing.splice(mi, 1))}>
            <Icon name="trash" className="size-4" /> <span className="sr-only">Remove row</span>
          </button>
        </div>
      ))}
      <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => set((x) => void x.missing.push({ id: rid("miss"), label: "", note: "" }))}>
        <Icon name="plus" className="size-4" /> Add a row
      </button>

      <h4 className="mt-5 font-semibold">Rules</h4>
      <p className="text-sm text-ink-muted">
        Keep supplier insurance, screening, service list, contribution category and invoice rules separate, each with its source, owner and dates.
      </p>
      {b.rules.map((r, ri) => (
        <div key={r.id} className={cx(group, "mt-2 grid gap-2 sm:grid-cols-2")}>
          <Field label="Title">
            <input className={input} value={r.title} maxLength={160} onChange={(e) => set((x) => void (x.rules[ri].title = e.target.value), `rt-${r.id}`)} />
          </Field>
          <Field label="Family">
            <select className={input} value={r.family} onChange={(e) => set((x) => void (x.rules[ri].family = e.target.value as RuleFamily))}>
              {(Object.keys(RULE_FAMILIES) as RuleFamily[]).map((k) => (
                <option key={k} value={k}>
                  {RULE_FAMILIES[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What it says" className="sm:col-span-2">
            <textarea className={area} value={r.text} maxLength={800} onChange={(e) => set((x) => void (x.rules[ri].text = e.target.value), `rx-${r.id}`)} />
          </Field>
          <Field label="Source">
            <input className={input} value={r.source} maxLength={240} onChange={(e) => set((x) => void (x.rules[ri].source = e.target.value), `rs-${r.id}`)} />
          </Field>
          <Field label="Source link (https)">
            <input className={input} value={r.url} maxLength={400} onChange={(e) => set((x) => void (x.rules[ri].url = e.target.value), `ru-${r.id}`)} />
          </Field>
          <Field label="Owner">
            <input className={input} value={r.owner} maxLength={120} onChange={(e) => set((x) => void (x.rules[ri].owner = e.target.value), `ro-${r.id}`)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Effective from">
              <input type="date" className={input} value={r.effectiveFrom} onChange={(e) => set((x) => void (x.rules[ri].effectiveFrom = e.target.value))} />
            </Field>
            <Field label="Review by">
              <input type="date" className={input} value={r.reviewBy} onChange={(e) => set((x) => void (x.rules[ri].reviewBy = e.target.value))} />
            </Field>
          </div>
          <button type="button" className={cx(btn.quiet, "justify-self-start")} onClick={() => set((x) => void x.rules.splice(ri, 1))}>
            <Icon name="trash" className="size-4" /> Remove rule
          </button>
        </div>
      ))}
      <button
        type="button"
        className={cx(btn.secondary, "mt-2")}
        onClick={() =>
          set(
            (x) =>
              void x.rules.push({
                id: rid("rule"),
                family: "verification",
                title: "",
                text: "",
                source: "",
                url: "",
                owner: "",
                effectiveFrom: "",
                reviewBy: "",
              }),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Add a rule
      </button>

      <h4 className="mt-5 font-semibold">Answer key</h4>
      <p className="text-sm text-ink-muted">
        Each finding points at a field or a missing-document row. “Verified” findings are harmless differences: flagging them counts as a false positive.
        Information-level findings are worth noticing but aren’t needed. Learners never see this until they’ve submitted.
      </p>
      {b.findings.map((e, ei) => (
        <div key={e.id} className={cx(group, "mt-2 grid gap-2 sm:grid-cols-2")}>
          <Field label="What it points at">
            <select
              className={input}
              value={e.fieldId ? `f:${e.fieldId}` : e.missingId ? `m:${e.missingId}` : ""}
              onChange={(ev) =>
                set((x) => {
                  const v = ev.target.value;
                  x.findings[ei].fieldId = v.startsWith("f:") ? v.slice(2) : "";
                  x.findings[ei].missingId = v.startsWith("m:") ? v.slice(2) : "";
                })
              }
            >
              <option value="">Choose…</option>
              <optgroup label="Document fields">
                {docFields.map((f) => (
                  <option key={f.id} value={`f:${f.id}`}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Missing documents">
                {b.missing.map((m) => (
                  <option key={m.id} value={`m:${m.id}`}>
                    Missing: {m.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
          <Field label="Rule">
            <select className={input} value={e.ruleId} onChange={(ev) => set((x) => void (x.findings[ei].ruleId = ev.target.value))}>
              <option value="">Choose…</option>
              {b.rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title || r.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select className={input} value={e.status} onChange={(ev) => set((x) => void (x.findings[ei].status = ev.target.value as EvidenceStatus))}>
              {(Object.keys(STATUSES) as EvidenceStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUSES[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Severity">
            <select className={input} value={e.severity} onChange={(ev) => set((x) => void (x.findings[ei].severity = ev.target.value as Severity))}>
              {(Object.keys(SEVERITIES) as Severity[]).map((k) => (
                <option key={k} value={k}>
                  {SEVERITIES[k]}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
            <legend className="text-sm font-semibold">Readings that count as right</legend>
            {CATEGORY_ORDER.map((c: Category) => (
              <label key={c} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={e.categories.includes(c)}
                  onChange={(ev) =>
                    set((x) => void (x.findings[ei].categories = ev.target.checked ? [...e.categories, c] : e.categories.filter((y) => y !== c)))
                  }
                />
                {CATEGORIES[c]}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1 sm:col-span-2">
            <legend className="text-sm font-semibold">Should be compared with</legend>
            {recordFields.map((f) => (
              <label key={f.id} className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={e.compareWith.includes(f.id)}
                  onChange={(ev) =>
                    set((x) => void (x.findings[ei].compareWith = ev.target.checked ? [...e.compareWith, f.id] : e.compareWith.filter((y) => y !== f.id)))
                  }
                />
                {f.label}
              </label>
            ))}
          </fieldset>
          <Field label="Explanation, for the debrief" className="sm:col-span-2">
            <textarea
              className={area}
              value={e.explain}
              maxLength={800}
              onChange={(ev) => set((x) => void (x.findings[ei].explain = ev.target.value), `ex-${e.id}`)}
            />
          </Field>
          <button type="button" className={cx(btn.quiet, "justify-self-start")} onClick={() => set((x) => void x.findings.splice(ei, 1))}>
            <Icon name="trash" className="size-4" /> Remove finding
          </button>
        </div>
      ))}
      <button
        type="button"
        className={cx(btn.secondary, "mt-2")}
        onClick={() =>
          set(
            (x) =>
              void x.findings.push({
                id: rid("find"),
                fieldId: "",
                missingId: "",
                compareWith: [],
                ruleId: "",
                status: "failed",
                severity: "block",
                categories: [],
                explain: "",
              }),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Add a finding
      </button>

      <h4 className="mt-5 font-semibold">Decisions</h4>
      <p className="text-sm text-ink-muted">At least one decision gets full credit. A sound Query in a genuinely unclear case should get full credit too.</p>
      {DECISION_ORDER.map((k: Decision) => (
        <div key={k} className={cx(group, "mt-2 grid gap-2 sm:grid-cols-[12rem_10rem_auto_1fr]")}>
          <p className="self-center font-semibold">{DECISIONS[k].label}</p>
          <Field label="Credit">
            <select
              className={input}
              value={b.decisions[k].credit}
              onChange={(e) =>
                set((x) => {
                  x.decisions[k].credit = e.target.value as DecisionKey["credit"];
                  if (x.decisions[k].credit !== "none") x.decisions[k].critical = false;
                })
              }
            >
              <option value="full">Full</option>
              <option value="partial">Partial</option>
              <option value="none">None</option>
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              className="size-5"
              disabled={b.decisions[k].credit !== "none"}
              checked={b.decisions[k].critical}
              onChange={(e) => set((x) => void (x.decisions[k].critical = e.target.checked))}
            />
            Critical
          </label>
          <Field label="Why (shown in the debrief)">
            <textarea
              className={area}
              value={b.decisions[k].why}
              maxLength={600}
              onChange={(e) => set((x) => void (x.decisions[k].why = e.target.value), `dw-${k}`)}
            />
          </Field>
        </div>
      ))}

      <h4 className="mt-5 font-semibold">Next actions offered</h4>
      {(Object.keys(ACTIONS) as NextAction[]).map((id) => {
        const a = b.actions.find((x) => x.id === id);
        return (
          <div key={id} className={cx(group, "mt-2 grid gap-2 sm:grid-cols-[1fr_auto_2fr]")}>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-5"
                checked={Boolean(a)}
                onChange={(e) =>
                  set((x) => void (x.actions = e.target.checked ? [...x.actions, { id, right: false, why: "" }] : x.actions.filter((y) => y.id !== id)))
                }
              />
              {ACTIONS[id]}
            </label>
            {a && (
              <>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={a.right}
                    onChange={(e) => set((x) => void (x.actions.find((y) => y.id === id)!.right = e.target.checked))}
                  />
                  Right here
                </label>
                <Field label="Why">
                  <input
                    className={input}
                    value={a.why}
                    maxLength={400}
                    onChange={(e) => set((x) => void (x.actions.find((y) => y.id === id)!.why = e.target.value), `aw-${id}`)}
                  />
                </Field>
              </>
            )}
          </div>
        );
      })}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Hint, on a second try" className="sm:col-span-2">
          <input className={input} value={b.hint} maxLength={400} onChange={(e) => set((x) => void (x.hint = e.target.value), "hint")} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2">
          <input
            type="checkbox"
            className="size-5"
            checked={Boolean(b.variant)}
            onChange={(e) => set((x) => void (x.variant = e.target.checked ? { fact: "", decision: "query", why: "" } : null))}
          />
          One changed fact, after the debrief
        </label>
        {b.variant && (
          <>
            <Field label="The changed fact" className="sm:col-span-2">
              <textarea className={area} value={b.variant.fact} maxLength={500} onChange={(e) => set((x) => void (x.variant!.fact = e.target.value), "vf")} />
            </Field>
            <Field label="The right decision then">
              <select className={input} value={b.variant.decision} onChange={(e) => set((x) => void (x.variant!.decision = e.target.value as Decision))}>
                {DECISION_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {DECISIONS[k].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Why">
              <textarea className={area} value={b.variant.why} maxLength={600} onChange={(e) => set((x) => void (x.variant!.why = e.target.value), "vw")} />
            </Field>
          </>
        )}
      </div>

      <h4 className="mt-5 font-semibold">Ruleset and sign-off</h4>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Field label="Ruleset">
          <input className={input} value={b.source.title} maxLength={200} onChange={(e) => set((x) => void (x.source.title = e.target.value), "st")} />
        </Field>
        <Field label="Ruleset version">
          <input className={input} value={b.source.version} maxLength={80} onChange={(e) => set((x) => void (x.source.version = e.target.value), "sv")} />
        </Field>
        <Field label="Ruleset reviewed on">
          <input type="date" className={input} value={b.source.reviewedOn} onChange={(e) => set((x) => void (x.source.reviewedOn = e.target.value))} />
        </Field>
        <Field label="Content owner">
          <input className={input} value={b.approval.owner} maxLength={120} onChange={(e) => set((x) => void (x.approval.owner = e.target.value), "ao")} />
        </Field>
        {b.mode === "contractor_vetting" ? (
          <Field label="Supply Chain or Compliance reviewer">
            <input
              className={input}
              value={b.approval.compliance}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.compliance = e.target.value), "ac")}
            />
          </Field>
        ) : (
          <Field label="Finance or Payments reviewer">
            <input
              className={input}
              value={b.approval.finance}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.finance = e.target.value), "af")}
            />
          </Field>
        )}
        <Field label="Care Operations reviewer">
          <input
            className={input}
            value={b.approval.operations}
            maxLength={120}
            onChange={(e) => set((x) => void (x.approval.operations = e.target.value), "aop")}
          />
        </Field>
        <Field label="Quality reviewer">
          <input className={input} value={b.approval.quality} maxLength={120} onChange={(e) => set((x) => void (x.approval.quality = e.target.value), "aq")} />
        </Field>
        <Field label="Signed off on">
          <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
        </Field>
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        Learner totals (decisions, missed findings, false positives) are available to authors at <code>/api/magazine/[course]/auditor?stats=1</code>. Names and
        words are never included.
      </p>
    </div>
  );
}
