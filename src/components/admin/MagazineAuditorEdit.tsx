"use client";

import { useParams } from "next/navigation";
import { cx } from "@/lib/format";
import { useApi } from "@/lib/api";
import { useHydrated } from "@/lib/store";
import type { AuditorBlock } from "@/lib/magazine";
import {
  ACTIONS,
  auditorApproved,
  auditorIdentifiers,
  CATEGORY_ORDER,
  categoryLabel,
  DATE_KINDS,
  DECISION_ORDER,
  decisionText,
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
  type NextAction,
  type RuleFamily,
  type Severity,
} from "@/lib/auditor";
import {
  AGREEMENT,
  AXES,
  AXIS_ORDER,
  codeLabel,
  FIELD_STATE_ORDER,
  FIELD_STATES,
  FIELD_TAGS,
  MAX_OVERHEAD_PERCENT,
  priceView,
  RATIONALE_DECISIONS,
  REVIEW_DECISIONS,
  SOURCE_TYPES,
  sourceTypeOf,
  stateOf,
  statusFromState,
  vettingOutcome,
  vettingProblems,
  type AgreementState,
  type Axis,
  type FieldState,
  type FieldTag,
  type SourceType,
  type VettingData,
} from "@/lib/auditorVetting";
import { AUDIT_CASES } from "@/content/auditCases";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { btn, Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Document Auditor or Contractor Vetting Card (docs/document-auditor.md): the case and its dates, the
  fictional documents and trusted records, the missing-document checklist, the rules with their sources, source types
  and dates, the answer key (each finding's target, comparisons, rule, field state, check, severity, accepted readings
  and misconception codes), the four outcomes' credit, next actions, hint, changed fact and sign-off.

  A vetting card adds the participant's request, the workers, the checks behind the outcome, the price, the evidence
  requests, the model explanation, the corrected pack and renewal, the Job Aid and the selection rationale. The case
  check runs as you type: the outcome follows from the checks, a known blocker can't reach Ready, a median is never a
  cap, supplier and participant prices stay apart, the screening alternative is respected, and insurance rests on
  Trilogy Care policy. The answer key is authored: nothing here is generated, and the AI section is a disabled stub.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const okTone = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warnTone = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const blankField = (): AuditField => ({ id: rid("fld"), label: "", value: "", date: "", dateKind: "", line: null });
const isArr = (v: unknown) => Array.isArray(v);
const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isObjOrNull = (v: unknown) => v === null || isObj(v);
const blankVetting = (): VettingData => ({
  packVersion: "pack-1",
  mode: "formative",
  participant: { name: "", goal: "", preferredWorker: "", desiredStart: "", approvedService: "", arrangement: "" },
  workers: [],
  axes: {},
  price: {
    lines: [],
    selfManaged: true,
    overheadPercent: null,
    participantPriceCents: null,
    participantUnit: "",
    agreement: "none",
    contribution: "",
    benchmark: null,
  },
  requests: [],
  explanation: { model: "" },
  consequences: { unsafe: "", unnecessary: "" },
  corrected: null,
  renewal: null,
  jobAid: { snippetId: "choosing-and-checking-your-contractor", why: "" },
  rationale: { theme: "", themeId: "", behaviour: "", barrier: "", whyBlock: "", otherResponse: "", measure: "", owner: "", decision: "", review: "" },
});
const RATIONALE: [Exclude<keyof VettingData["rationale"], "decision" | "review">, string, string][] = [
  ["theme", "Problem evidence", "Link to the verified theme, never raw contractor documents."],
  ["themeId", "Problem desk theme id (optional)", ""],
  ["behaviour", "Intended behaviour", ""],
  ["barrier", "Hypothesised barrier (validate with coordinators and supplier onboarding)", ""],
  ["whyBlock", "Why an interactive pack", ""],
  ["otherResponse", "Other response needed", "A form, verification capacity or rate explanation may need fixing too."],
  ["measure", "Work measure (owned separately)", "Baseline, denominator and review date. A quiz score isn’t evidence suppliers are compliant."],
  ["owner", "Case owner", ""],
];

type Stats = {
  blocks: {
    blockId: string;
    attempts: number;
    people: number;
    finished: number;
    completed: number;
    retries: number;
    counted: number;
    suppressed: boolean;
    critical: number | null;
    decisions: Record<string, number> | null;
    missed: Record<string, number> | null;
    falsePositives: Record<string, number> | null;
    codes: Record<string, number> | null;
    sourceIssues: Record<string, number>;
  }[];
};

export function AuditorEdit({ block: b, update }: { block: AuditorBlock; update: Update }) {
  const set = (fn: (x: AuditorBlock) => void, tag?: string) => update<AuditorBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  // Review dates are checked once the page is in the browser, so the server and the browser draw the same thing first.
  const hydrated = useHydrated();
  const today = hydrated ? new Date().toISOString().slice(0, 10) : "2000-01-01";
  const { id: guideId } = useParams<{ id: string }>();
  const stats = useApi<Stats>(guideId ? `/api/magazine/${guideId}/auditor?stats=1` : null);
  const mine = stats.data?.blocks.find((x) => x.blockId === b.id);
  const signed = auditorApproved(b) && (!b.vetting || Boolean(b.approval.finance));
  const stale = staleRules(b, today);
  const real = auditorIdentifiers(b);
  const caseProblems = vettingProblems(b);
  const reviewer = b.mode === "contractor_vetting" ? "Supply Chain or Compliance" : "Finance";
  const docFields = b.docs
    .filter((d) => d.kind === "document")
    .flatMap((d) => d.fields.map((f) => ({ id: f.id, label: `${d.title}: ${f.label || "(unnamed)"}` })));
  const recordFields = b.docs
    .filter((d) => d.kind === "record")
    .flatMap((d) => d.fields.map((f) => ({ id: f.id, label: `${d.title}: ${f.label || "(unnamed)"}` })));
  const findingLabel = (id: string) => {
    const e = b.findings.find((x) => x.id === id);
    const f = e && (docFields.find((x) => x.id === e.fieldId)?.label ?? b.missing.find((m) => m.id === e.missingId)?.label);
    return f ? `${f} (${id})` : id;
  };
  const counts = (o: Record<string, number> | null, label: (k: string) => string = (k) => k) =>
    o && Object.keys(o).length
      ? Object.entries(o)
          .sort((p, q) => q[1] - p[1])
          .map(([k, n]) => `${label(k)}: ${n}`)
          .join("; ")
      : "None";
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="shield" className="size-5" /> {b.vetting ? "Contractor Vetting Card" : "Document Auditor"}
      </p>
      <p
        role="status"
        className={cx("rounded-2xl px-4 py-3 text-sm font-semibold", signed && !stale.length && !real.length && !caseProblems.length ? okTone : warnTone)}
      >
        {caseProblems.length
          ? `The case check finds ${caseProblems.length} ${caseProblems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes, even with a demo sign-off.`
          : signed
            ? `Signed off by ${b.mode === "contractor_vetting" ? b.approval.compliance : b.approval.finance} (${reviewer}), ${b.approval.operations} (Care Operations) and ${b.approval.quality} (Quality) on ${b.approval.approvedOn}.`
            : `Sign-off required. This case can’t be published until ${reviewer}, ${b.vetting ? "Finance (pricing), " : ""}Care Operations and Quality sign-off and the ruleset version are recorded below.`}
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
                set((x) => {
                  delete x.vetting;
                  Object.assign(x, freshAuditor(c.data));
                });
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
        Documents are what the learner inspects and marks. Records are trusted comparisons beside them. Every detail must be fictional. Every field is also in
        the learner’s accessible table.
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
                {b.vetting && d.kind === "document" && (
                  <Field label="What it shows (for the case check)">
                    <select
                      className={input}
                      value={f.tag ?? ""}
                      onChange={(e) =>
                        set((x) => {
                          const v = e.target.value as FieldTag;
                          if (v) x.docs[di].fields[fi].tag = v;
                          else delete x.docs[di].fields[fi].tag;
                        })
                      }
                    >
                      {(Object.keys(FIELD_TAGS) as FieldTag[]).map((k) => (
                        <option key={k} value={k}>
                          {FIELD_TAGS[k]}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
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
        Keep each rule separate, with its source, owner and dates, and say what it rests on: a public rule, Trilogy Care policy, a supplier contract or a price
        benchmark. Insurance limits are Trilogy Care policy, never statute; a benchmark is context, never a cap.
      </p>
      {b.rules.map((r, ri) => (
        <div key={r.id} className={cx(group, "mt-2 grid gap-2 sm:grid-cols-2")}>
          <Field label="Title">
            <input className={input} value={r.title} maxLength={160} onChange={(e) => set((x) => void (x.rules[ri].title = e.target.value), `rt-${r.id}`)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Family">
              <select className={input} value={r.family} onChange={(e) => set((x) => void (x.rules[ri].family = e.target.value as RuleFamily))}>
                {(Object.keys(RULE_FAMILIES) as RuleFamily[]).map((k) => (
                  <option key={k} value={k}>
                    {RULE_FAMILIES[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rests on">
              <select className={input} value={sourceTypeOf(r)} onChange={(e) => set((x) => void (x.rules[ri].sourceType = e.target.value as SourceType))}>
                {(Object.keys(SOURCE_TYPES) as SourceType[]).map((k) => (
                  <option key={k} value={k}>
                    {SOURCE_TYPES[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
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
        Each finding points at a field or a missing-document row and has a field state. Verified, not applicable and “a different rule applies” are harmless:
        flagging them as a problem counts as a false positive. Information-level findings are worth noticing but aren’t needed. Learners never see this until
        they’ve submitted.
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
          <Field label="Field state" hint={`Scored as: ${STATUSES[e.status]}`}>
            <select
              className={input}
              value={stateOf(e)}
              onChange={(ev) =>
                set((x) => {
                  const s = ev.target.value as FieldState;
                  x.findings[ei].state = s;
                  x.findings[ei].status = statusFromState(s, Boolean(x.findings[ei].missingId));
                })
              }
            >
              {FIELD_STATE_ORDER.map((k) => (
                <option key={k} value={k}>
                  {FIELD_STATES[k]}
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
          {b.vetting && (
            <Field label="The check it belongs to">
              <select
                className={input}
                value={e.axis ?? ""}
                onChange={(ev) =>
                  set((x) => {
                    const v = ev.target.value as Axis | "";
                    if (v) x.findings[ei].axis = v;
                    else delete x.findings[ei].axis;
                  })
                }
              >
                <option value="">None</option>
                {AXIS_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {AXES[k]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <fieldset className="flex flex-wrap gap-3 sm:col-span-2">
            <legend className="text-sm font-semibold">Readings that count as right</legend>
            {CATEGORY_ORDER.map((c: Category) => (
              <label key={c} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={e.categories.includes(c)}
                  onChange={(ev) =>
                    set((x) => void (x.findings[ei].categories = ev.target.checked ? [...e.categories, c] : e.categories.filter((y) => y !== c)))
                  }
                />
                {categoryLabel(c, Boolean(b.vetting))}
              </label>
            ))}
          </fieldset>
          {b.vetting && (
            <Field
              label="Misconception codes (reading → code)"
              className="sm:col-span-2"
              hint={`For example {"material_gap": "median_as_cap"}. Known codes: ${Object.keys(CODES_HINT).join(", ")}.`}
            >
              <input
                className={input}
                defaultValue={JSON.stringify(e.codes ?? {})}
                onBlur={(ev) => {
                  try {
                    const v = JSON.parse(ev.target.value || "{}");
                    if (isObj(v)) set((x) => void (x.findings[ei].codes = v));
                  } catch {
                    /* Left as typed: the field shows what was there on the next render. */
                  }
                }}
              />
            </Field>
          )}
          <fieldset className="flex flex-col gap-1 sm:col-span-2">
            <legend className="text-sm font-semibold">Should be compared with</legend>
            {recordFields.map((f) => (
              <label key={f.id} className="flex min-h-11 items-center gap-2 text-sm">
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
                state: "material_gap",
              }),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Add a finding
      </button>

      <h4 className="mt-5 font-semibold">Outcomes</h4>
      <p className="text-sm text-ink-muted">
        At least one outcome gets full credit. A sound request for evidence in a genuinely unclear case should get full credit too. An outcome that isn’t
        offered isn’t shown to learners (an older case had no Escalate).
      </p>
      {DECISION_ORDER.map((k: Decision) => (
        <div key={k} className={cx(group, "mt-2 grid gap-2 sm:grid-cols-[12rem_10rem_auto_1fr]")}>
          <div className="self-center">
            <p className="font-semibold">{decisionText(b.mode, k).label}</p>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={b.decisions[k].offered !== false}
                onChange={(e) =>
                  set((x) => {
                    if (e.target.checked) delete x.decisions[k].offered;
                    else x.decisions[k] = { ...x.decisions[k], offered: false, credit: "none", critical: false };
                  })
                }
              />
              Offered to learners
            </label>
          </div>
          <Field label="Credit">
            <select
              className={input}
              value={b.decisions[k].credit}
              disabled={b.decisions[k].offered === false}
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
              disabled={b.decisions[k].credit !== "none" || b.decisions[k].offered === false}
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
        {!b.vetting && (
          <>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2">
              <input
                type="checkbox"
                className="size-5"
                checked={Boolean(b.variant)}
                onChange={(e) => set((x) => void (x.variant = e.target.checked ? { fact: "", decision: "request_evidence", why: "" } : null))}
              />
              One changed fact, after the debrief
            </label>
            {b.variant && (
              <>
                <Field label="The changed fact" className="sm:col-span-2">
                  <textarea
                    className={area}
                    value={b.variant.fact}
                    maxLength={500}
                    onChange={(e) => set((x) => void (x.variant!.fact = e.target.value), "vf")}
                  />
                </Field>
                <Field label="The right outcome then">
                  <select className={input} value={b.variant.decision} onChange={(e) => set((x) => void (x.variant!.decision = e.target.value as Decision))}>
                    {DECISION_ORDER.map((k) => (
                      <option key={k} value={k}>
                        {decisionText(b.mode, k).label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Why">
                  <textarea className={area} value={b.variant.why} maxLength={600} onChange={(e) => set((x) => void (x.variant!.why = e.target.value), "vw")} />
                </Field>
              </>
            )}
          </>
        )}
      </div>

      {b.mode === "contractor_vetting" && <VettingSection b={b} set={set} problems={caseProblems} />}

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
        {b.mode === "contractor_vetting" && (
          <Field label="Supply Chain or Compliance reviewer">
            <input
              className={input}
              value={b.approval.compliance}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.compliance = e.target.value), "ac")}
            />
          </Field>
        )}
        {(b.mode !== "contractor_vetting" || b.vetting) && (
          <Field label={b.vetting ? "Procurement or Finance pricing reviewer" : "Finance or Payments reviewer"}>
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

      <section className={cx(group, "mt-4")} aria-label="Learner totals">
        <h4 className="font-semibold">Learner totals for this block</h4>
        {!guideId || stats.error ? (
          <p className="text-sm text-ink-muted">Totals show here once the course is saved and people have tried it.</p>
        ) : !mine ? (
          <p className="text-sm text-ink-muted">No attempts yet.</p>
        ) : (
          <div className="text-sm">
            <p>
              {mine.people} {mine.people === 1 ? "person" : "people"} started, {mine.finished} submitted, {mine.completed} completed (debrief viewed),{" "}
              {mine.retries} {mine.retries === 1 ? "retry" : "retries"}.
            </p>
            {mine.suppressed ? (
              <p className="text-ink-muted">Fewer than five people: counts only, so nobody’s choices can be singled out.</p>
            ) : (
              <ul className="mt-1 list-disc pl-5">
                <li>Outcomes chosen: {counts(mine.decisions, (k) => decisionText(b.mode, k as Decision).label)}</li>
                <li>Critical errors (people): {mine.critical ?? 0}</li>
                <li>Misconceptions: {counts(mine.codes, codeLabel)}</li>
                <li>Missed: {counts(mine.missed, findingLabel)}</li>
                <li>False positives: {counts(mine.falsePositives, findingLabel)}</li>
              </ul>
            )}
            <p className="mt-1">
              Sources learners questioned: {counts(mine.sourceIssues, (id) => b.rules.find((r) => r.id === id)?.title ?? id)}. Names and words are never
              included.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

const CODES_HINT: Record<string, true> = {
  screening_both_required: true,
  clearance_accepted_unverified: true,
  abn_as_clearance: true,
  name_mismatch_as_fraud: true,
  median_as_cap: true,
  supplier_fee_as_participant_fee: true,
  scope_silently_accepted: true,
  agreement_skipped: true,
  unneeded_document: true,
};

/** The vetting card's own fields, the live case check and branch preview, and the disabled AI stub. */
function VettingSection({ b, set, problems }: { b: AuditorBlock; set: (fn: (x: AuditorBlock) => void, tag?: string) => void; problems: string[] }) {
  const v = b.vetting;
  if (!v)
    return (
      <section className={cx(group, "mt-5")}>
        <h4 className="font-semibold">Contractor Vetting Card</h4>
        <p className="text-sm text-ink-muted">
          Add the participant’s request, the worker checked apart from the business, the price panel, evidence requests, a message to the participant, a
          corrected pack and a renewal. Or start from “Dot’s gardener” above.
        </p>
        <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => set((x) => void (x.vetting = blankVetting()))}>
          <Icon name="plus" className="size-4" /> Make this a Contractor Vetting Card
        </button>
      </section>
    );
  const sv = (fn: (x: VettingData) => void, tag?: string) => set((x) => x.vetting && fn(x.vetting), tag);
  const json = (label: string, key: keyof VettingData, check: (x: unknown) => boolean) => (
    <JsonEdit label={label} value={v[key]} check={check} onApply={(val) => sv((x) => void Object.assign(x, { [key]: val }))} />
  );
  const base = vettingOutcome(v.axes);
  const branch: { label: string; version: string; o: ReturnType<typeof vettingOutcome>; expected: Decision | null }[] = [
    { label: "The first pack", version: v.packVersion, o: base, expected: null },
    ...(v.corrected
      ? [{ label: "The corrected pack", version: v.corrected.version, o: vettingOutcome({ ...v.axes, ...v.corrected.axes }), expected: v.corrected.decision }]
      : []),
    ...(v.renewal
      ? [{ label: "The renewal", version: v.renewal.version, o: vettingOutcome({ ...v.axes, ...v.renewal.axes }), expected: v.renewal.decision }]
      : []),
  ];
  const pv = priceView(v.price);
  return (
    <section className={cx(group, "mt-5 flex flex-col gap-3")} aria-label="Contractor Vetting Card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Contractor Vetting Card</h4>
        <button
          type="button"
          className={btn.quiet}
          onClick={() => window.confirm("Remove the vetting card’s fields from this block?") && set((x) => void delete x.vetting)}
        >
          <Icon name="trash" className="size-4" /> Remove the vetting card
        </button>
      </div>
      <div role="status" className={cx("rounded-2xl px-4 py-3 text-sm", problems.length ? warnTone : okTone)}>
        <p className="font-semibold">
          {problems.length ? "The case check doesn’t pass yet:" : "The case check passes."} The checks lead to “{decisionText(b.mode, base.outcome).label}”
          {base.escalateToo ? ", with a price or owner question escalated alongside" : ""}.
        </p>
        {problems.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold">Branch preview</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {branch.map((x) => (
            <li key={x.label} className="rounded-xl bg-surface p-2 ring-1 ring-line">
              <span className="font-semibold">{x.label}</span> ({x.version || "no version"}): {decisionText(b.mode, x.o.outcome).label}
              {x.expected && x.expected !== x.o.outcome ? ` · the key says “${decisionText(b.mode, x.expected).label}”` : ""}
              {x.o.open.length ? ` · open: ${x.o.open.map((a) => AXES[a.axis]).join(", ")}` : " · nothing open"}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-sm">
          Price: supplier cost {money(pv.supplierCostCents)}; overhead at most {pv.overheadMaxCents === null ? "n/a" : money(pv.overheadMaxCents)} (
          {MAX_OVERHEAD_PERCENT}%); participant price {pv.participantPriceCents === null ? "not set" : money(pv.participantPriceCents)};{" "}
          {AGREEMENT[v.price.agreement]}. {pv.benchmarkText}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pack version" hint="Change it whenever the pack, checks or key change: every attempt keeps the version it used.">
          <input className={input} value={v.packVersion} onChange={(e) => sv((x) => void (x.packVersion = e.target.value), "pack")} />
        </Field>
        <Field label="Mode" hint="Formative by default. Assessed needs an approved rubric; a stale rule holds new assessed attempts.">
          <select className={input} value={v.mode} onChange={(e) => sv((x) => void (x.mode = e.target.value === "assessed" ? "assessed" : "formative"))}>
            <option value="formative">Formative practice</option>
            <option value="assessed">Assessed (an approved programme only)</option>
          </select>
        </Field>
        {(
          [
            ["name", "Participant (a library character)", "Use a name already in the character library, so publishing doesn’t queue a new portrait."],
            ["goal", "Their goal", ""],
            ["preferredWorker", "Their preferred worker", ""],
            ["desiredStart", "Desired start", ""],
            ["approvedService", "Approved service", ""],
            ["arrangement", "Self-management arrangement", ""],
          ] as const
        ).map(([k, label, hint]) => (
          <Field key={k} label={label} hint={hint || undefined}>
            <input className={input} value={v.participant[k]} onChange={(e) => sv((x) => void (x.participant[k] = e.target.value), `vp-${k}`)} />
          </Field>
        ))}
        <Field label="Participant price (cents, blank if not set)">
          <input
            className={input}
            inputMode="numeric"
            value={v.price.participantPriceCents ?? ""}
            onChange={(e) =>
              sv((x) => void (x.price.participantPriceCents = e.target.value.trim() === "" ? null : Math.round(Number(e.target.value) || 0)), "ppc")
            }
          />
        </Field>
        <Field label="Provider overhead (% of supplier cost, blank if none yet)">
          <input
            className={input}
            inputMode="decimal"
            value={v.price.overheadPercent ?? ""}
            onChange={(e) => sv((x) => void (x.price.overheadPercent = e.target.value.trim() === "" ? null : Number(e.target.value) || 0), "ovh")}
          />
        </Field>
        <Field label="The participant’s agreement">
          <select className={input} value={v.price.agreement} onChange={(e) => sv((x) => void (x.price.agreement = e.target.value as AgreementState))}>
            {(Object.keys(AGREEMENT) as AgreementState[]).map((k) => (
              <option key={k} value={k}>
                {AGREEMENT[k]}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm">
          <input type="checkbox" className="size-5" checked={v.price.selfManaged} onChange={(e) => sv((x) => void (x.price.selfManaged = e.target.checked))} />A
          self-managed third-party arrangement (the 10% overhead cap applies)
        </label>
        <Field label="Job Aid after the debrief" hint="Shown with Save to Favourites. Learners don’t see it until its first release is approved.">
          <select className={input} value={v.jobAid.snippetId} onChange={(e) => sv((x) => void (x.jobAid.snippetId = e.target.value))}>
            <option value="">None</option>
            {SEED_SNIPPETS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.data.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Why the Job Aid belongs here">
          <input className={input} value={v.jobAid.why} onChange={(e) => sv((x) => void (x.jobAid.why = e.target.value), "jaw")} />
        </Field>
        <Field
          label="Model explanation to the participant"
          className="sm:col-span-2"
          hint="What’s checked, what’s outstanding, whether they can start, who owns the next step, and how their choice is respected."
        >
          <textarea className={area} value={v.explanation.model} onChange={(e) => sv((x) => void (x.explanation.model = e.target.value), "model")} />
        </Field>
        <Field label="If it went ahead now (unsafe progression)">
          <textarea className={area} value={v.consequences.unsafe} onChange={(e) => sv((x) => void (x.consequences.unsafe = e.target.value), "cu")} />
        </Field>
        <Field label="If it were refused (unnecessary rejection)">
          <textarea className={area} value={v.consequences.unnecessary} onChange={(e) => sv((x) => void (x.consequences.unnecessary = e.target.value), "cn")} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Advanced (JSON, checked above as you apply it)</p>
        {json("Workers: a fictional label, their role and the document fields that identify them", "workers", isArr)}
        {json("The checks behind the outcome (state, note, owner, barrier)", "axes", isObj)}
        {json("The price: supplier lines, benchmark and contribution context", "price", isObj)}
        {json("Evidence requests (needed or not, why, misconception code)", "requests", isArr)}
        {json("The corrected pack", "corrected", isObjOrNull)}
        {json("The renewal", "renewal", isObjOrNull)}
      </div>
      <div>
        <p className="text-sm font-semibold">Why this block (selection rationale)</p>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {RATIONALE.map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint || undefined}>
              <textarea
                className={cx(input, "min-h-16 py-2")}
                value={v.rationale[k]}
                onChange={(e) => sv((x) => void (x.rationale[k] = e.target.value), `ra-${k}`)}
              />
            </Field>
          ))}
          <Field label="Author’s decision on the rationale">
            <select
              className={input}
              value={v.rationale.decision}
              onChange={(e) => sv((x) => void (x.rationale.decision = e.target.value as VettingData["rationale"]["decision"]))}
            >
              {(Object.keys(RATIONALE_DECISIONS) as VettingData["rationale"]["decision"][]).map((k) => (
                <option key={k} value={k}>
                  {RATIONALE_DECISIONS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Register decision">
            <select
              className={input}
              value={v.rationale.review}
              onChange={(e) => sv((x) => void (x.rationale.review = e.target.value as VettingData["rationale"]["review"]))}
            >
              {(Object.keys(REVIEW_DECISIONS) as VettingData["rationale"]["review"][]).map((k) => (
                <option key={k} value={k}>
                  {REVIEW_DECISIONS[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <div>
        <h5 className="font-semibold">AI drafting (not available in this release)</h5>
        <p className="text-sm text-ink-muted">
          Later, AI may draft fictional pack text, distractors, plain-language feedback or a participant explanation from approved sources and the case facts
          above, for an author to review. It will never set a classification, pronounce a contractor compliant, invent a price cap or replace a policy owner.
          The deterministic checks above govern every outcome, and the card works without it.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold opacity-60">
            Draft pack text
          </button>
          <button type="button" disabled className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold opacity-60">
            Draft the participant explanation
          </button>
        </div>
      </div>
    </section>
  );
}
