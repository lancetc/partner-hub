"use client";

import { useParams } from "next/navigation";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { XRayBlock } from "@/lib/magazine";
import { useHydrated } from "@/lib/store";
import { money } from "@/lib/xray";
import {
  ASK_ORDER,
  ASK_WHO,
  AXIS_STATE_ORDER,
  AXIS_STATES,
  codeLabel,
  DECISION_ORDER,
  DECISIONS,
  DOC_ROLE_ORDER,
  DOC_ROLES,
  EVIDENCE_KINDS,
  FAXES,
  FAXIS_ORDER,
  FUNDING_CODES,
  fundingHardProblems,
  fundingProblems,
  lineVerdict,
  OUTPUT_ORDER,
  OUTPUT_PARTS,
  OVERALL,
  OVERALL_ORDER,
  PRICE_CONTEXT_ORDER,
  PRICE_CONTEXTS,
  RATIONALE_DECISIONS,
  REVIEW_DECISIONS,
  ROUTE_ORDER,
  ROUTES,
  SOURCE_KINDS,
  type AxisState,
  type DocRole,
  type EvidenceKind,
  type FDecision,
  type FundingData,
  type FundingLine,
  type Overall,
  type PriceContext,
  type Route,
  type SourceKind,
} from "@/lib/xrayFunding";
import { btn, Field, input } from "./ui";
import { rid } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor's quote and invoice review section (docs/invoice-xray.md, "Quote and invoice review"): the document's role
  and mode, the evidence and sources (public programme sources apart from Trilogy Care's own), each line's checks with
  the decision they lead to, who to ask and what they'd say, the reviewed model response, the rationale and the extra
  reviewers; then the case check that holds publishing, and the misconception totals once people have tried it. Every
  field is written by hand: nothing here is generated.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const okTone = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warnTone = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const toggle = <T extends string>(list: T[], id: T, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));
const cents = (v: string) => Math.round(Number(v || 0) * 100);

type SetBlock = (fn: (x: XRayBlock) => void, tag?: string) => void;
type Stats = {
  blocks: {
    blockId: string;
    review: {
      counted: number;
      people: number;
      finished: number;
      completed: number;
      retries: number;
      suppressed: boolean;
      critical: number | null;
      codes: Record<string, number> | null;
      byLineType: Record<string, number> | null;
      byRoute: Record<string, number> | null;
      byRuleVersion: Record<string, number> | null;
      neededMore: { openLinesKeptOpen: number; openLines: number; pendingRight: number } | null;
      explain: Record<string, number> | null;
      sourceIssues: Record<string, number>;
      versions: string[];
    } | null;
  }[];
};

/** A blank review section for a classic case, with a row for each of its lines. */
export function blankFunding(b: XRayBlock): FundingData {
  return {
    version: "",
    ruleSet: "",
    mode: "formative",
    documentRole: "",
    goal: "",
    request: "",
    evidence: [],
    sources: [],
    lines: b.lines.map((l): FundingLine => ({
      lineId: l.id,
      itemType: "",
      priceContext: "unknown",
      decision: "",
      alsoAccepted: [],
      route: "",
      routeAlso: [],
      axes: {},
      askWho: [],
      sourceIds: [],
      evidenceIds: [],
      wrong: [],
      consequence: "",
      components: [],
      invoice: null,
    })),
    asks: [],
    overall: "",
    overallAlso: [],
    model: { acknowledge_goal: "", confirmed: "", checking: "", source: "", next: "", price: "" },
    modelSourceId: "",
    alternative: "",
    complaints: "",
    twistDecision: "",
    aiCoach: false,
    jobAid: { snippetId: "can-this-be-funded", why: "" },
    rationale: { theme: "", themeId: "", behaviour: "", barrier: "", whyBlock: "", otherResponse: "", measure: "", owner: "", decision: "", review: "" },
    reviewers: { policy: "", clinical: "" },
  };
}

export function XRayFundingEdit({ block: b, set }: { block: XRayBlock; set: SetBlock }) {
  const f = b.funding!;
  // Review dates are checked once the page is in the browser, so the server and the browser draw the same thing first.
  const hydrated = useHydrated();
  const today = hydrated ? new Date().toISOString().slice(0, 10) : "2000-01-01";
  const { id: guideId } = useParams<{ id: string }>();
  const stats = useApi<Stats>(guideId ? `/api/magazine/${guideId}/xray?stats=1` : null);
  const mine = stats.data?.blocks.find((x) => x.blockId === b.id)?.review ?? null;
  const problems = fundingProblems(b);
  const hard = fundingHardProblems(b, today);
  const fx = (fn: (x: FundingData) => void, tag?: string) => set((x) => fn(x.funding!), tag && `f-${tag}`);
  const counts = (o: Record<string, number> | null, label: (k: string) => string = (k) => k) =>
    o && Object.keys(o).length
      ? Object.entries(o)
          .sort((p, q) => q[1] - p[1])
          .map(([k, n]) => `${label(k)}: ${n}`)
          .join("; ")
      : "None";
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div role="status" className={cx("rounded-2xl px-4 py-3 text-sm", problems.length || hard.length ? warnTone : okTone)}>
        <p className="font-semibold">
          {problems.length
            ? `The case check finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"}. It can’t be published until they’re fixed, even with a demo sign-off.`
            : hard.length
              ? "The case holds together. It still needs its sign-off and reviewed sources before it can be published."
              : "The case holds together, its sources are reviewed and it’s signed off."}
        </p>
        <ul className="mt-1 list-disc pl-5">
          {[...problems, ...hard].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>

      <details className={group} open>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Quote and invoice review: the document and the request</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="What the document is (its role)"
            hint="The same words mean different things on each: “admin fee” on a supplier invoice isn’t a participant fee."
          >
            <select className={input} value={f.documentRole} onChange={(e) => fx((x) => void (x.documentRole = e.target.value as DocRole))}>
              <option value="">Choose a role</option>
              {DOC_ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {DOC_ROLES[r].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mode" hint="Assessed needs a versioned rubric and an owner’s decision; formative is practice.">
            <select className={input} value={f.mode} onChange={(e) => fx((x) => void (x.mode = e.target.value as FundingData["mode"]))}>
              <option value="formative">Formative practice</option>
              <option value="assessed">Assessed</option>
            </select>
          </Field>
          <Field label="Scenario version" hint="Its own, so an attempt never inherits an older answer.">
            <input className={input} value={f.version} maxLength={60} onChange={(e) => fx((x) => void (x.version = e.target.value), "ver")} />
          </Field>
          <Field label="Rule set">
            <input className={input} value={f.ruleSet} maxLength={80} onChange={(e) => fx((x) => void (x.ruleSet = e.target.value), "rs")} />
          </Field>
          <Field label="The participant’s goal, in their words" className="sm:col-span-2">
            <input className={input} value={f.goal} maxLength={400} onChange={(e) => fx((x) => void (x.goal = e.target.value), "goal")} />
          </Field>
          <Field label="The request (a family or supplier message)" className="sm:col-span-2">
            <textarea className={area} value={f.request} maxLength={600} onChange={(e) => fx((x) => void (x.request = e.target.value), "req")} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" className="size-5" checked={f.aiCoach} onChange={(e) => fx((x) => void (x.aiCoach = e.target.checked))} />
            Offer AI coaching on the learner’s wording (a paid model call; bound to the approved facts, and the reviewed feedback stands without it)
          </label>
        </div>
      </details>

      <details className={group}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Evidence ({f.evidence.length})</summary>
        <p className="text-xs text-ink-muted">Include the participant’s goal. Plan excerpts, approvals, agreements and delivery records are fictional.</p>
        {f.evidence.map((e, i) => (
          <div key={e.id} className={inner}>
            <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
              <select
                aria-label={`Evidence ${i + 1}: kind`}
                className={input}
                value={e.kind}
                onChange={(ev) => fx((x) => void (x.evidence[i].kind = ev.target.value as EvidenceKind))}
              >
                {(Object.keys(EVIDENCE_KINDS) as EvidenceKind[]).map((k) => (
                  <option key={k} value={k}>
                    {EVIDENCE_KINDS[k]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Evidence ${i + 1}: title`}
                className={input}
                value={e.title}
                maxLength={160}
                onChange={(ev) => fx((x) => void (x.evidence[i].title = ev.target.value), `ev${i}t`)}
              />
              <button type="button" className={btn.quiet} aria-label={`Remove evidence ${i + 1}`} onClick={() => fx((x) => void x.evidence.splice(i, 1))}>
                <Icon name="trash" className="size-4" />
              </button>
            </div>
            <textarea
              aria-label={`Evidence ${i + 1}: text`}
              className={area}
              value={e.text}
              maxLength={1200}
              onChange={(ev) => fx((x) => void (x.evidence[i].text = ev.target.value), `ev${i}x`)}
            />
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => fx((x) => void x.evidence.push({ id: rid("ev"), kind: "plan", title: "", text: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add evidence
        </button>
      </details>

      <details className={group}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Sources ({f.sources.length})</summary>
        <p className="text-xs text-ink-muted">
          Public programme sources and Trilogy Care’s own process and price sources are kept apart. Each needs its version, effective date and accountable
          reviewer. An AT–HM rule rests on the AT–HM list or scheme, never the service list.
        </p>
        {f.sources.map((s, i) => {
          const put = (fn: (x: FundingData["sources"][number]) => void, tag?: string) => fx((x) => fn(x.sources[i]), tag && `s${i}${tag}`);
          return (
            <details key={s.id} className={inner}>
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                {s.title || "untitled"} · {SOURCE_KINDS[s.kind].label} {s.reviewed ? "· reviewed" : "· not reviewed"}
              </summary>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Kind">
                  <select className={input} value={s.kind} onChange={(e) => put((x) => void (x.kind = e.target.value as SourceKind))}>
                    {(Object.keys(SOURCE_KINDS) as SourceKind[]).map((k) => (
                      <option key={k} value={k}>
                        {SOURCE_KINDS[k].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Title">
                  <input className={input} value={s.title} maxLength={200} onChange={(e) => put((x) => void (x.title = e.target.value), "t")} />
                </Field>
                <Field label="Section or item">
                  <input className={input} value={s.ref} maxLength={200} onChange={(e) => put((x) => void (x.ref = e.target.value), "r")} />
                </Field>
                <Field label="Link (https)">
                  <input className={input} value={s.url} maxLength={400} onChange={(e) => put((x) => void (x.url = e.target.value), "u")} />
                </Field>
                <Field label="The passage, as it applies" className="sm:col-span-2">
                  <textarea className={area} value={s.passage} maxLength={1200} onChange={(e) => put((x) => void (x.passage = e.target.value), "p")} />
                </Field>
                <Field label="Version">
                  <input className={input} value={s.version} maxLength={80} onChange={(e) => put((x) => void (x.version = e.target.value), "v")} />
                </Field>
                <Field label="Effective date">
                  <input type="date" className={input} value={s.effectiveDate} onChange={(e) => put((x) => void (x.effectiveDate = e.target.value))} />
                </Field>
                <Field label="Review by">
                  <input type="date" className={input} value={s.reviewBy} onChange={(e) => put((x) => void (x.reviewBy = e.target.value))} />
                </Field>
                <Field label="Accountable reviewer">
                  <input className={input} value={s.reviewer} maxLength={160} onChange={(e) => put((x) => void (x.reviewer = e.target.value), "rv")} />
                </Field>
                <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" className="size-5" checked={s.reviewed} onChange={(e) => put((x) => void (x.reviewed = e.target.checked))} />
                  The reviewer confirmed it’s current
                </label>
                <div>
                  <button type="button" className={btn.quiet} onClick={() => fx((x) => void x.sources.splice(i, 1))}>
                    <Icon name="trash" className="size-4" /> Remove this source
                  </button>
                </div>
              </div>
            </details>
          );
        })}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() =>
            fx(
              (x) =>
                void x.sources.push({
                  id: rid("src"),
                  kind: "service_list",
                  title: "",
                  ref: "",
                  passage: "",
                  url: "",
                  version: "",
                  effectiveDate: "",
                  reviewBy: "",
                  reviewer: "",
                  reviewed: false,
                }),
            )
          }
        >
          <Icon name="plus" className="size-4" /> Add a source
        </button>
      </details>

      <details className={group}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Each line’s checks and decision</summary>
        <p className="text-xs text-ink-muted">
          Set each check’s state; the decision follows from them. A line on a list but missing its advice, approval or price can’t be ready.
        </p>
        {b.lines.map((l, li) => {
          const i = f.lines.findIndex((x) => x.lineId === l.id);
          if (i < 0)
            return (
              <div key={l.id} className={inner}>
                <p className="text-sm">
                  {li + 1}. {l.description}: no review row yet.
                </p>
                <div>
                  <button type="button" className={btn.secondary} onClick={() => fx((x) => void x.lines.push({ ...blankFunding(b).lines[li], lineId: l.id }))}>
                    <Icon name="plus" className="size-4" /> Add its review row
                  </button>
                </div>
              </div>
            );
          const fl = f.lines[i];
          const put = (fn: (x: FundingLine) => void, tag?: string) => fx((x) => fn(x.lines[i]), tag && `l${i}${tag}`);
          const v = lineVerdict(fl.axes, b.phase);
          return (
            <details key={l.id} className={inner}>
              <summary className="min-h-11 cursor-pointer py-2 font-semibold">
                {li + 1}. {l.description}, {money(l.amountCents)} · {fl.decision ? DECISIONS[fl.decision].label : "no decision"}
                {fl.decision && v.decision !== fl.decision ? " · the checks say otherwise" : ""}
              </summary>
              <p className="text-sm">
                <span className="font-semibold">The checks lead to: </span>
                {DECISIONS[v.decision].label}
                {v.confidence === "needs_review" ? " (needs owner review)" : ""}.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Reviewed decision">
                  <select className={input} value={fl.decision} onChange={(e) => put((x) => void (x.decision = e.target.value as FDecision))}>
                    <option value="">Choose</option>
                    {DECISION_ORDER.map((d) => (
                      <option key={d} value={d}>
                        {DECISIONS[d].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="What it is (service or item type)">
                  <input className={input} value={fl.itemType} maxLength={160} onChange={(e) => put((x) => void (x.itemType = e.target.value), "it")} />
                </Field>
                <Field label="Funding route">
                  <select className={input} value={fl.route} onChange={(e) => put((x) => void (x.route = e.target.value as Route))}>
                    <option value="">Choose</option>
                    {ROUTE_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {ROUTES[r]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Price context">
                  <select className={input} value={fl.priceContext} onChange={(e) => put((x) => void (x.priceContext = e.target.value as PriceContext))}>
                    {PRICE_CONTEXT_ORDER.map((p) => (
                      <option key={p} value={p}>
                        {PRICE_CONTEXTS[p].label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <fieldset className="flex flex-wrap gap-x-4">
                <legend className="text-sm font-semibold">Also accepted, with full credit</legend>
                {DECISION_ORDER.filter((d) => d !== fl.decision).map((d) => (
                  <label key={d} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={fl.alsoAccepted.includes(d)}
                      onChange={(e) => put((x) => void (x.alsoAccepted = toggle(x.alsoAccepted, d, e.target.checked)))}
                    />
                    {DECISIONS[d].label}
                  </label>
                ))}
              </fieldset>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <caption className="text-left font-semibold">The checks behind the decision</caption>
                  <thead>
                    <tr>
                      <th scope="col">Check</th>
                      <th scope="col">State</th>
                      <th scope="col">Note (the case fact)</th>
                      <th scope="col">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FAXIS_ORDER.map((k) => {
                      const a = fl.axes[k];
                      return (
                        <tr key={k}>
                          <th scope="row" className="pr-2 font-semibold">
                            {FAXES[k]}
                          </th>
                          <td className="pr-2">
                            <select
                              aria-label={`${FAXES[k]}: state`}
                              className={input}
                              value={a?.state ?? ""}
                              onChange={(e) =>
                                put((x) => {
                                  if (!e.target.value) delete x.axes[k];
                                  else x.axes[k] = { note: "", owner: "", ...x.axes[k], state: e.target.value as AxisState };
                                })
                              }
                            >
                              <option value="">Not set</option>
                              {AXIS_STATE_ORDER.map((st) => (
                                <option key={st} value={st}>
                                  {AXIS_STATES[st]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="pr-2">
                            <input
                              aria-label={`${FAXES[k]}: note`}
                              className={input}
                              disabled={!a}
                              value={a?.note ?? ""}
                              maxLength={400}
                              onChange={(e) => put((x) => void (x.axes[k]!.note = e.target.value), `a${k}n`)}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`${FAXES[k]}: owner`}
                              className={input}
                              disabled={!a}
                              value={a?.owner ?? ""}
                              maxLength={160}
                              onChange={(e) => put((x) => void (x.axes[k]!.owner = e.target.value), `a${k}o`)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <fieldset className="flex flex-wrap gap-x-4">
                <legend className="text-sm font-semibold">Who to ask for what’s missing</legend>
                {ASK_ORDER.map((w) => (
                  <label key={w} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={fl.askWho.includes(w)}
                      onChange={(e) => put((x) => void (x.askWho = toggle(x.askWho, w, e.target.checked)))}
                    />
                    {ASK_WHO[w]}
                  </label>
                ))}
              </fieldset>
              <fieldset className="flex flex-col">
                <legend className="text-sm font-semibold">The sources it rests on</legend>
                {f.sources.map((s) => (
                  <label key={s.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={fl.sourceIds.includes(s.id)}
                      onChange={(e) => put((x) => void (x.sourceIds = toggle(x.sourceIds, s.id, e.target.checked)))}
                    />
                    {s.title || "untitled"} ({SOURCE_KINDS[s.kind].label})
                  </label>
                ))}
              </fieldset>
              <fieldset className="flex flex-col">
                <legend className="text-sm font-semibold">The evidence that bears on it</legend>
                {f.evidence.map((e) => (
                  <label key={e.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={fl.evidenceIds.includes(e.id)}
                      onChange={(ev) => put((x) => void (x.evidenceIds = toggle(x.evidenceIds, e.id, ev.target.checked)))}
                    />
                    {e.title || "untitled"}
                  </label>
                ))}
              </fieldset>
              <Field label="The consequence of getting it wrong">
                <textarea className={area} value={fl.consequence} maxLength={600} onChange={(e) => put((x) => void (x.consequence = e.target.value), "cq")} />
              </Field>
              <p className="text-sm font-semibold">Wrong decisions, their misconception and why</p>
              {fl.wrong.map((w, wi) => (
                <div key={wi} className="grid gap-2 sm:grid-cols-[12rem_14rem_1fr_auto]">
                  <select
                    aria-label={`Wrong decision ${wi + 1}`}
                    className={input}
                    value={w.decision}
                    onChange={(e) => put((x) => void (x.wrong[wi].decision = e.target.value as FDecision))}
                  >
                    {DECISION_ORDER.map((d) => (
                      <option key={d} value={d}>
                        {DECISIONS[d].label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Wrong decision ${wi + 1}: misconception`}
                    className={input}
                    value={w.code}
                    onChange={(e) => put((x) => void (x.wrong[wi].code = e.target.value))}
                  >
                    <option value="">Choose</option>
                    {Object.keys(FUNDING_CODES).map((c) => (
                      <option key={c} value={c}>
                        {codeLabel(c)}
                        {FUNDING_CODES[c].critical ? " (critical)" : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Wrong decision ${wi + 1}: why`}
                    className={input}
                    value={w.why}
                    maxLength={500}
                    onChange={(e) => put((x) => void (x.wrong[wi].why = e.target.value), `w${wi}`)}
                  />
                  <button
                    type="button"
                    className={btn.quiet}
                    aria-label={`Remove wrong decision ${wi + 1}`}
                    onClick={() => put((x) => void x.wrong.splice(wi, 1))}
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
              ))}
              <div>
                <button type="button" className={btn.secondary} onClick={() => put((x) => void x.wrong.push({ decision: "ready", code: "", why: "" }))}>
                  <Icon name="plus" className="size-4" /> Add a wrong decision
                </button>
              </div>
              <p className="text-sm font-semibold">What an X-ray of the line shows (a bundle’s parts)</p>
              {fl.components.map((c, ci) => (
                <div key={ci} className="grid gap-2 sm:grid-cols-[1fr_8rem_10rem_auto]">
                  <input
                    aria-label={`Part ${ci + 1}`}
                    className={input}
                    value={c.label}
                    maxLength={160}
                    onChange={(e) => put((x) => void (x.components[ci].label = e.target.value), `c${ci}l`)}
                  />
                  <input
                    aria-label={`Part ${ci + 1}: amount in dollars`}
                    type="number"
                    step="0.01"
                    className={input}
                    value={c.amountCents / 100}
                    onChange={(e) => put((x) => void (x.components[ci].amountCents = cents(e.target.value)), `c${ci}a`)}
                  />
                  <select
                    aria-label={`Part ${ci + 1}: clinical or cosmetic`}
                    className={input}
                    value={c.clinical === null ? "" : String(c.clinical)}
                    onChange={(e) => put((x) => void (x.components[ci].clinical = e.target.value === "" ? null : e.target.value === "true"))}
                  >
                    <option value="">Neither</option>
                    <option value="true">Clinical</option>
                    <option value="false">Cosmetic</option>
                  </select>
                  <button type="button" className={btn.quiet} aria-label={`Remove part ${ci + 1}`} onClick={() => put((x) => void x.components.splice(ci, 1))}>
                    <Icon name="trash" className="size-4" />
                  </button>
                  <input
                    aria-label={`Part ${ci + 1}: note`}
                    className={cx(input, "sm:col-span-4")}
                    value={c.note}
                    maxLength={400}
                    onChange={(e) => put((x) => void (x.components[ci].note = e.target.value), `c${ci}n`)}
                  />
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className={btn.secondary}
                  onClick={() => put((x) => void x.components.push({ label: "", amountCents: 0, clinical: null, note: "" }))}
                >
                  <Icon name="plus" className="size-4" /> Add a part
                </button>
              </div>
              {b.phase !== "quote" && (
                <>
                  <p className="text-sm font-semibold">Invoice: what was agreed and what’s invoiced</p>
                  {fl.invoice ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(["agreed", "invoiced"] as const).map((k) => {
                        const q = fl.invoice![k];
                        return (
                          <div key={k} className="grid gap-1 sm:col-span-3 sm:grid-cols-3">
                            <Field label={k === "agreed" ? "Agreed units" : "Invoiced units"}>
                              <input
                                type="number"
                                step="0.25"
                                className={input}
                                value={q?.qty ?? ""}
                                onChange={(e) =>
                                  put((x) => void (x.invoice![k] = { unit: "", rateCents: 0, ...x.invoice![k], qty: Number(e.target.value || 0) }), `i${k}q`)
                                }
                              />
                            </Field>
                            <Field label="Unit">
                              <input
                                className={input}
                                value={q?.unit ?? ""}
                                maxLength={30}
                                onChange={(e) => put((x) => void (x.invoice![k] = { qty: 0, rateCents: 0, ...x.invoice![k], unit: e.target.value }), `i${k}u`)}
                              />
                            </Field>
                            <Field label="Rate, $">
                              <input
                                type="number"
                                step="0.01"
                                className={input}
                                value={q ? q.rateCents / 100 : ""}
                                onChange={(e) =>
                                  put((x) => void (x.invoice![k] = { qty: 0, unit: "", ...x.invoice![k], rateCents: cents(e.target.value) }), `i${k}r`)
                                }
                              />
                            </Field>
                          </div>
                        );
                      })}
                      <Field label="Service date">
                        <input
                          type="date"
                          className={input}
                          value={fl.invoice.serviceDate}
                          onChange={(e) => put((x) => void (x.invoice!.serviceDate = e.target.value))}
                        />
                      </Field>
                      <Field label="Delivery evidence" className="sm:col-span-2">
                        <input
                          className={input}
                          value={fl.invoice.evidence}
                          maxLength={400}
                          onChange={(e) => put((x) => void (x.invoice!.evidence = e.target.value), "ie")}
                        />
                      </Field>
                      <div>
                        <button type="button" className={btn.quiet} onClick={() => put((x) => void (x.invoice!.agreed = null))}>
                          Nothing was agreed for this line
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        className={btn.secondary}
                        onClick={() =>
                          put(
                            (x) =>
                              void (x.invoice = {
                                agreed: { qty: 1, unit: "", rateCents: 0 },
                                invoiced: { qty: 1, unit: "", rateCents: l.amountCents },
                                serviceDate: "",
                                evidence: "",
                              }),
                          )
                        }
                      >
                        <Icon name="plus" className="size-4" /> Add the invoice comparison
                      </button>
                    </div>
                  )}
                </>
              )}
            </details>
          );
        })}
      </details>

      <details className={group}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Who the learner can ask, and what they’d say ({f.asks.length})</summary>
        <p className="text-xs text-ink-muted">An answer narrows what’s known; it never decides for the learner.</p>
        {f.asks.map((a, i) => (
          <div key={a.id} className={inner}>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <select
                aria-label={`Answer ${i + 1}: who`}
                className={input}
                value={a.who}
                onChange={(e) => fx((x) => void (x.asks[i].who = e.target.value as typeof a.who))}
              >
                {ASK_ORDER.map((w) => (
                  <option key={w} value={w}>
                    {ASK_WHO[w]}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Answer ${i + 1}: line`}
                className={input}
                value={a.lineId}
                onChange={(e) => fx((x) => void (x.asks[i].lineId = e.target.value))}
              >
                <option value="">Any line</option>
                {b.lines.map((l, li) => (
                  <option key={l.id} value={l.id}>
                    {li + 1}. {l.description}
                  </option>
                ))}
              </select>
              <button type="button" className={btn.quiet} aria-label={`Remove answer ${i + 1}`} onClick={() => fx((x) => void x.asks.splice(i, 1))}>
                <Icon name="trash" className="size-4" />
              </button>
            </div>
            <textarea
              aria-label={`Answer ${i + 1}: what they say`}
              className={area}
              value={a.reply}
              maxLength={800}
              onChange={(e) => fx((x) => void (x.asks[i].reply = e.target.value), `a${i}`)}
            />
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => fx((x) => void x.asks.push({ id: rid("ask"), who: "supplier", lineId: "", reply: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add an answer
        </button>
      </details>

      <details className={group}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Overall result, model response and complaints route</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reviewed overall result" hint="Pending clarification is a legitimate result, scored as good when a decisive fact is missing.">
            <select className={input} value={f.overall} onChange={(e) => fx((x) => void (x.overall = e.target.value as Overall))}>
              <option value="">Choose</option>
              {OVERALL_ORDER.map((o) => (
                <option key={o} value={o}>
                  {OVERALL[o].label}
                </option>
              ))}
            </select>
          </Field>
          {b.twist && (
            <Field label="After the changed fact, the line is">
              <select className={input} value={f.twistDecision} onChange={(e) => fx((x) => void (x.twistDecision = e.target.value as FDecision))}>
                <option value="">Choose</option>
                {DECISION_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {DECISIONS[d].label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {OUTPUT_ORDER.map((k) => (
            <Field key={k} label={`Model response: ${OUTPUT_PARTS[k].toLowerCase()}`} className="sm:col-span-2">
              <textarea className={area} value={f.model[k]} maxLength={800} onChange={(e) => fx((x) => void (x.model[k] = e.target.value), `m${k}`)} />
            </Field>
          ))}
          <Field label="The source the model response cites" hint="It must be one the explained line rests on.">
            <select className={input} value={f.modelSourceId} onChange={(e) => fx((x) => void (x.modelSourceId = e.target.value))}>
              <option value="">Choose</option>
              {f.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Alternative respectful wording" className="sm:col-span-2">
            <textarea className={area} value={f.alternative} maxLength={1200} onChange={(e) => fx((x) => void (x.alternative = e.target.value), "alt")} />
          </Field>
          <Field label="The complaints route and wording (Quality supplies it)" className="sm:col-span-2">
            <textarea className={area} value={f.complaints} maxLength={800} onChange={(e) => fx((x) => void (x.complaints = e.target.value), "cmp")} />
          </Field>
        </div>
      </details>

      <details className={group}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Why this block, the Job Aid and the extra reviewers</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["theme", "Problem evidence (a verified theme)"],
              ["themeId", "Theme or response ID"],
              ["behaviour", "Target behaviour"],
              ["barrier", "Likely barrier (a hypothesis to verify)"],
              ["whyBlock", "Why this block"],
              ["otherResponse", "Other response needed (a template, Job Aid or process fix)"],
              ["measure", "Work measure, owned separately (baseline and denominator)"],
              ["owner", "Case owner"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={f.rationale[k]} maxLength={600} onChange={(e) => fx((x) => void (x.rationale[k] = e.target.value), `r${k}`)} />
            </Field>
          ))}
          <Field label="Rationale decision">
            <select
              className={input}
              value={f.rationale.decision}
              onChange={(e) => fx((x) => void (x.rationale.decision = e.target.value as FundingData["rationale"]["decision"]))}
            >
              {Object.entries(RATIONALE_DECISIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Review decision">
            <select
              className={input}
              value={f.rationale.review}
              onChange={(e) => fx((x) => void (x.rationale.review = e.target.value as FundingData["rationale"]["review"]))}
            >
              {Object.entries(REVIEW_DECISIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Job Aid (Work Tools id)">
            <input className={input} value={f.jobAid.snippetId} maxLength={80} onChange={(e) => fx((x) => void (x.jobAid.snippetId = e.target.value), "ja")} />
          </Field>
          <Field label="Why the Job Aid belongs here">
            <input className={input} value={f.jobAid.why} maxLength={300} onChange={(e) => fx((x) => void (x.jobAid.why = e.target.value), "jw")} />
          </Field>
          <Field label="Support at Home policy owner (sign-off)">
            <input className={input} value={f.reviewers.policy} maxLength={120} onChange={(e) => fx((x) => void (x.reviewers.policy = e.target.value), "rp")} />
          </Field>
          <Field label="AT–HM or clinical reviewer (equipment and treatment claims)">
            <input
              className={input}
              value={f.reviewers.clinical}
              maxLength={120}
              onChange={(e) => fx((x) => void (x.reviewers.clinical = e.target.value), "rc")}
            />
          </Field>
        </div>
      </details>

      <details className={group}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Misconceptions so far</summary>
        {!mine ? (
          <p className="text-sm">No one has finished this case in this course yet.</p>
        ) : (
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold">People (denominator)</dt>
            <dd>
              {mine.counted} finished of {mine.people} started; {mine.completed} saw the debrief; {mine.retries} retries
            </dd>
            {mine.suppressed ? (
              <>
                <dt className="font-semibold">Breakdowns</dt>
                <dd>Shown from five people, so no one can be picked out.</dd>
              </>
            ) : (
              <>
                <dt className="font-semibold">Critical on the first try</dt>
                <dd>
                  {mine.critical} of {mine.counted}
                </dd>
                <dt className="font-semibold">Misconceptions</dt>
                <dd>{counts(mine.codes, codeLabel)}</dd>
                <dt className="font-semibold">Missed, by line type</dt>
                <dd>{counts(mine.byLineType)}</dd>
                <dt className="font-semibold">Wrong route, by route</dt>
                <dd>{counts(mine.byRoute)}</dd>
                <dt className="font-semibold">By rule version</dt>
                <dd>{counts(mine.byRuleVersion)}</dd>
                <dt className="font-semibold">Needed more information</dt>
                <dd>
                  {mine.neededMore
                    ? `Open lines kept open ${mine.neededMore.openLinesKeptOpen} of ${mine.neededMore.openLines}; pending clarification when warranted ${mine.neededMore.pendingRight} of ${mine.counted}`
                    : "None"}
                </dd>
                <dt className="font-semibold">Explanations</dt>
                <dd>{counts(mine.explain)}</dd>
              </>
            )}
            <dt className="font-semibold">Sources flagged</dt>
            <dd>{counts(mine.sourceIssues, (k) => f.sources.find((s) => s.id === k)?.title ?? k)}</dd>
            <dt className="font-semibold">Versions</dt>
            <dd>{mine.versions.join("; ") || "None"}</dd>
          </dl>
        )}
        <p className="mt-2 text-xs text-ink-muted">
          Practice results, not proof of fewer complaints or invoice holds: compare those with the separately owned work measure.
        </p>
      </details>
    </div>
  );
}
