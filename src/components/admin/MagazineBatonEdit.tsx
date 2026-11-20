"use client";

import { cx } from "@/lib/format";
import type { BatonBlock } from "@/lib/magazine";
import {
  batonApproved,
  batonWarnings,
  DIMS,
  PLACEMENTS,
  PRIVACY,
  ROLE_IDS,
  STATUSES,
  VERDICTS,
  type Dim,
  type FactStatus,
  type Option,
  type Placement,
  type Privacy,
  type RoleId,
  type Stage,
  type Verdict,
} from "@/lib/baton";
import { BATON_CASES } from "@/content/batonCases";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Pass the Baton relay (docs/pass-the-baton.md): the fictional person, the roles and their
  remits, the source items and fact cards (with status, privacy class and who can see them), and each stage. A
  handoff stage has its role card, a rule for every fact, the choices for recipient, urgency, channel, owner,
  receipt and other actions (each with how it reads and what the next role sees), the follow-up, an optional
  urgent concern, and the debrief. Then sign-off. Use the course preview to play every role.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string[]) => v.join("\n");
const unlines = (v: string) => v.split("\n").map((x) => x.trimStart());
type Set = (fn: (x: BatonBlock) => void, tag?: string) => void;
const blankOption = (prefix: string): Option => ({ id: rid(prefix), text: "", verdict: "good", dim: "ownership", feedback: "", line: "", missing: "" });

function Roles({ value, onChange, label }: { value: RoleId[]; onChange: (v: RoleId[]) => void; label: string }) {
  return (
    <fieldset className="flex flex-wrap gap-3">
      <legend className="text-sm font-semibold">{label}</legend>
      {ROLE_IDS.map((r) => (
        <label key={r} className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={value.includes(r)}
            onChange={() => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r])}
          />
          {r}
        </label>
      ))}
    </fieldset>
  );
}

export function BatonEdit({ block: b, update }: { block: BatonBlock; update: Update }) {
  const set: Set = (fn, tag) => update<BatonBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = batonApproved(b);
  const warnings = batonWarnings(b);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="route" className="size-5" /> Pass the Baton relay
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.approval.clinical} (Clinical), ${b.approval.operations} (Care Operations), ${b.approval.finance} (Finance), ${b.approval.quality} (Quality) and ${b.approval.privacy} (Privacy) on ${b.approval.approvedOn}. Next review ${b.reviewDue}.`
          : "Sign-off required. This can’t be published until Clinical, Care Operations, Finance, Quality and Privacy sign-off, the policy or SOP IDs and a review date are recorded below."}
      </p>
      {warnings.length > 0 && (
        <ul className="mt-2 list-disc rounded-2xl bg-muted p-3 pl-8 text-sm">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-ink-muted">
        Use the course preview to play every role. Use fictional people and records only: never paste a real discharge summary.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from:</span>
        {BATON_CASES.map((x) => (
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
        <Field label="The participant (fictional)">
          <input className={input} value={b.person.name} maxLength={60} onChange={(e) => set((x) => void (x.person.name = e.target.value), "pn")} />
        </Field>
        <Field label="About them">
          <input className={input} value={b.person.about} maxLength={400} onChange={(e) => set((x) => void (x.person.about = e.target.value), "pa")} />
        </Field>
        <Field label="Assigned role" hint="Empty lets each learner choose.">
          <select className={input} value={b.assignedRole} onChange={(e) => set((x) => void (x.assignedRole = e.target.value as RoleId | ""))}>
            <option value="">Learner chooses</option>
            {ROLE_IDS.map((r) => (
              <option key={r} value={r}>
                {b.roles[r].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Roles to play to finish">
          <input
            type="number"
            min={1}
            max={4}
            className={input}
            value={b.rolesToComplete}
            onChange={(e) => set((x) => void (x.rolesToComplete = Math.max(1, Math.min(4, Math.round(Number(e.target.value) || 1)))))}
          />
        </Field>
      </div>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Roles</summary>
        <p className="text-sm text-ink-muted">Scenario roles, not a statement of Trilogy Care’s delegation. Care Operations approves them.</p>
        {ROLE_IDS.map((r) => (
          <div key={r} className={cx(inner, "sm:grid-cols-[14rem_1fr]")}>
            <Field label={`Role (${r})`}>
              <input
                className={input}
                value={b.roles[r].label}
                maxLength={60}
                onChange={(e) => set((x) => void (x.roles[r].label = e.target.value), `rl${r}`)}
              />
            </Field>
            <Field label="Remit">
              <input
                className={input}
                value={b.roles[r].remit}
                maxLength={300}
                onChange={(e) => set((x) => void (x.roles[r].remit = e.target.value), `rr${r}`)}
              />
            </Field>
          </div>
        ))}
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Source items ({b.sources.length})</summary>
        {b.sources.map((s, i) => (
          <div key={s.id} className={cx(inner, "sm:grid-cols-2")}>
            <Field label="Title">
              <input className={input} value={s.title} maxLength={120} onChange={(e) => set((x) => void (x.sources[i].title = e.target.value), `st${s.id}`)} />
            </Field>
            <Field label="Kind">
              <input className={input} value={s.kind} maxLength={120} onChange={(e) => set((x) => void (x.sources[i].kind = e.target.value), `sk${s.id}`)} />
            </Field>
            <Field label="Time">
              <input className={input} value={s.time} maxLength={40} onChange={(e) => set((x) => void (x.sources[i].time = e.target.value), `sti${s.id}`)} />
            </Field>
            <Field label="Status">
              <select className={input} value={s.status} onChange={(e) => set((x) => void (x.sources[i].status = e.target.value as FactStatus))}>
                {(Object.keys(STATUSES) as FactStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {STATUSES[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="What it says" className="sm:col-span-2">
              <textarea className={area} value={s.body} maxLength={800} onChange={(e) => set((x) => void (x.sources[i].body = e.target.value), `sb${s.id}`)} />
            </Field>
            <Roles label="Who can see it" value={s.visibleTo} onChange={(vs) => set((x) => void (x.sources[i].visibleTo = vs))} />
            <button type="button" className={cx(btn.quiet, "justify-self-start")} onClick={() => set((x) => void x.sources.splice(i, 1))}>
              <Icon name="trash" className="size-4" /> Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => set((x) => void x.sources.push({ id: rid("bt-src"), title: "", kind: "", time: "", status: "confirmed", body: "", visibleTo: [] }))}
        >
          <Icon name="plus" className="size-4" /> Add a source item
        </button>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Fact cards ({b.facts.length})</summary>
        {b.facts.map((f, i) => (
          <div key={f.id} className={cx(inner, "sm:grid-cols-2")}>
            <Field label="Fact" className="sm:col-span-2">
              <input className={input} value={f.text} maxLength={240} onChange={(e) => set((x) => void (x.facts[i].text = e.target.value), `ft${f.id}`)} />
            </Field>
            <Field label="Source">
              <select className={input} value={f.sourceId} onChange={(e) => set((x) => void (x.facts[i].sourceId = e.target.value))}>
                <option value="">None</option>
                {b.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className={input} value={f.status} onChange={(e) => set((x) => void (x.facts[i].status = e.target.value as FactStatus))}>
                {(Object.keys(STATUSES) as FactStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {STATUSES[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Privacy class">
              <select className={input} value={f.privacy} onChange={(e) => set((x) => void (x.facts[i].privacy = e.target.value as Privacy))}>
                {(Object.keys(PRIVACY) as Privacy[]).map((k) => (
                  <option key={k} value={k}>
                    {PRIVACY[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Roles label="Who can see it" value={f.visibleTo} onChange={(vs) => set((x) => void (x.facts[i].visibleTo = vs))} />
            <button type="button" className={cx(btn.quiet, "justify-self-start")} onClick={() => set((x) => void x.facts.splice(i, 1))}>
              <Icon name="trash" className="size-4" /> Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => set((x) => void x.facts.push({ id: rid("bt-f"), text: "", sourceId: "", status: "confirmed", privacy: "care-team", visibleTo: [] }))}
        >
          <Icon name="plus" className="size-4" /> Add a fact card
        </button>
      </details>

      <h4 className="mt-5 font-semibold">Stages</h4>
      {b.stages.map((s, i) => (
        <StageEdit key={s.id} b={b} s={s} i={i} set={set} />
      ))}
      <button
        type="button"
        className={cx(btn.secondary, "mt-2")}
        disabled={b.stages.length >= 8}
        onClick={() =>
          set(
            (x) =>
              void x.stages.push({
                id: rid("bt-s"),
                label: "",
                time: "",
                kind: "event",
                narrative: "",
                role: "",
                incoming: "",
                decision: "",
                unknowns: [],
                factIds: [],
                factRules: [],
                recipients: [],
                urgency: [],
                channels: [],
                owners: [],
                acks: [],
                actions: [],
                responds: true,
                followUps: [],
                redFlag: null,
                participant: { good: "", poor: "" },
                goodPath: "",
                scripted: "",
              }),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Add a stage
      </button>

      <details className={cx(group, "mt-4")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Sign-off and review</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["owner", "Content owner"],
              ["clinical", "Clinical"],
              ["operations", "Care Operations"],
              ["finance", "Finance (budget and invoice stages)"],
              ["quality", "Quality"],
              ["privacy", "Privacy"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} maxLength={120} onChange={(e) => set((y) => void (y.approval[k] = e.target.value), `a${k}`)} />
            </Field>
          ))}
          <Field label="Signed off on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((y) => void (y.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Next review" hint="Retire or re-approve it when a policy, role or escalation pathway changes.">
            <input type="date" className={input} value={b.reviewDue} onChange={(e) => set((y) => void (y.reviewDue = e.target.value))} />
          </Field>
          <Field label="Policy or SOP IDs" hint="One per line." className="sm:col-span-2">
            <textarea className={area} value={lines(b.policyIds)} onChange={(e) => set((y) => void (y.policyIds = unlines(e.target.value)), "pol")} />
          </Field>
        </div>
      </details>
    </div>
  );
}

const GROUPS = [
  ["recipients", "Recipients", "bt-r"],
  ["urgency", "Urgency", "bt-u"],
  ["channels", "Channels", "bt-c"],
  ["owners", "Owner of the next step", "bt-o"],
  ["acks", "Confirming receipt", "bt-a"],
  ["actions", "Other actions (several can be chosen; “On track” ones are expected)", "bt-x"],
  ["followUps", "Follow-ups, when it isn’t acknowledged", "bt-fu"],
] as const;

function StageEdit({ b, s, i, set }: { b: BatonBlock; s: Stage; i: number; set: Set }) {
  const at = (fn: (x: Stage) => void, tag?: string) => set((y) => void fn(y.stages[i]), tag && `s${s.id}${tag}`);
  const role = s.role as RoleId;
  const visible = b.facts.filter((f) => role && f.visibleTo.includes(role));
  return (
    <details className={cx(group, "mt-2")}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 py-2 font-semibold">
        <span>
          {s.time || "?"} · {s.label || `Stage ${i + 1}`}{" "}
          <span className="font-normal text-ink-muted">({s.kind === "handoff" ? b.roles[role]?.label : "event"})</span>
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            className={btn.quiet}
            aria-label="Move up"
            disabled={i === 0}
            onClick={() => set((y) => void y.stages.splice(i - 1, 0, ...y.stages.splice(i, 1)))}
          >
            <Icon name="arrow-up" className="size-4" />
          </button>
          <button
            type="button"
            className={btn.quiet}
            aria-label="Remove stage"
            onClick={() => window.confirm("Remove this stage?") && set((y) => void y.stages.splice(i, 1))}
          >
            <Icon name="trash" className="size-4" />
          </button>
        </span>
      </summary>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Label">
          <input className={input} value={s.label} maxLength={100} onChange={(e) => at((x) => void (x.label = e.target.value), "l")} />
        </Field>
        <Field label="Time">
          <input className={input} value={s.time} maxLength={40} onChange={(e) => at((x) => void (x.time = e.target.value), "t")} />
        </Field>
        <Field label="Kind">
          <select
            className={input}
            value={s.kind === "handoff" ? role : ""}
            onChange={(e) =>
              at((x) => {
                x.kind = e.target.value ? "handoff" : "event";
                x.role = (e.target.value as RoleId) || "";
              })
            }
          >
            <option value="">An event in the story</option>
            {ROLE_IDS.map((r) => (
              <option key={r} value={r}>
                Handoff by the {b.roles[r].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={s.kind === "handoff" ? "The situation" : "What happens"} className="sm:col-span-3">
          <textarea className={area} value={s.narrative} maxLength={600} onChange={(e) => at((x) => void (x.narrative = e.target.value), "n")} />
        </Field>
      </div>
      {s.kind === "handoff" && (
        <>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field label="What arrived from the previous role">
              <textarea className={area} value={s.incoming} maxLength={600} onChange={(e) => at((x) => void (x.incoming = e.target.value), "in")} />
            </Field>
            <Field label="The decision">
              <textarea className={area} value={s.decision} maxLength={300} onChange={(e) => at((x) => void (x.decision = e.target.value), "d")} />
            </Field>
            <Field label="What they don’t know yet" hint="One per line.">
              <textarea className={area} value={lines(s.unknowns)} onChange={(e) => at((x) => void (x.unknowns = unlines(e.target.value)), "u")} />
            </Field>
            <Field label="What this role handed on, in the story" hint="Shown when someone plays a later role.">
              <textarea className={area} value={s.scripted} maxLength={600} onChange={(e) => at((x) => void (x.scripted = e.target.value), "sc")} />
            </Field>
          </div>

          <div className={inner}>
            <p className="font-semibold">Facts to sort, and the rule for each</p>
            {visible.length === 0 && <p className="text-sm text-ink-muted">No fact cards are visible to this role yet.</p>}
            {visible.map((f) => {
              const k = s.factRules.findIndex((r) => r.factId === f.id);
              const r = s.factRules[k];
              const on = s.factIds.includes(f.id);
              return (
                <div key={f.id} className="rounded-xl bg-muted p-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={on}
                      onChange={() =>
                        at((x) => {
                          if (on) {
                            x.factIds = x.factIds.filter((y) => y !== f.id);
                            x.factRules = x.factRules.filter((y) => y.factId !== f.id);
                          } else {
                            x.factIds.push(f.id);
                            x.factRules.push({ factId: f.id, accept: ["send", "verify", "keep"], critical: false, dim: "fidelity", feedback: "", line: "" });
                          }
                        })
                      }
                    />
                    {f.text} <span className="font-normal text-ink-muted">({STATUSES[f.status]})</span>
                  </label>
                  {on && r && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <fieldset className="flex flex-wrap gap-3">
                        <legend className="text-sm font-semibold">Safe placements</legend>
                        {(Object.keys(PLACEMENTS) as Placement[]).map((p) => (
                          <label key={p} className="flex min-h-11 items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="size-5"
                              checked={r.accept.includes(p)}
                              onChange={() =>
                                at((x) => void (x.factRules[k].accept = r.accept.includes(p) ? r.accept.filter((y) => y !== p) : [...r.accept, p]))
                              }
                            />
                            {PLACEMENTS[p]}
                          </label>
                        ))}
                        <label className="flex min-h-11 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-5"
                            checked={r.critical}
                            onChange={(e) => at((x) => void (x.factRules[k].critical = e.target.checked))}
                          />
                          Misplacing it is a critical gap
                        </label>
                      </fieldset>
                      <Field label="Dimension">
                        <select className={input} value={r.dim} onChange={(e) => at((x) => void (x.factRules[k].dim = e.target.value as Dim))}>
                          {(Object.keys(DIMS) as Dim[]).map((d) => (
                            <option key={d} value={d}>
                              {DIMS[d]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Feedback when misplaced">
                        <input
                          className={input}
                          value={r.feedback}
                          maxLength={400}
                          onChange={(e) => at((x) => void (x.factRules[k].feedback = e.target.value), `fr${f.id}f`)}
                        />
                      </Field>
                      <Field label="What the next role sees then">
                        <input
                          className={input}
                          value={r.line}
                          maxLength={300}
                          onChange={(e) => at((x) => void (x.factRules[k].line = e.target.value), `fr${f.id}l`)}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {GROUPS.map(([key, label, prefix]) => (
            <Options
              key={key}
              label={label}
              options={s[key]}
              prefix={prefix}
              onChange={(fn) => at((x) => fn(x[key]))}
              tag={(t) => `s${s.id}${key}${t}`}
              set={set}
            />
          ))}
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={s.responds} onChange={(e) => at((x) => void (x.responds = e.target.checked))} />
            In the story, the recipient acknowledges when asked (untick to make every learner follow up)
          </label>

          <div className={inner}>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-5"
                checked={Boolean(s.redFlag)}
                onChange={(e) => at((x) => void (x.redFlag = e.target.checked ? { text: "", options: [] } : null))}
              />
              An urgent concern interrupts this stage
            </label>
            {s.redFlag && (
              <>
                <Field label="The urgent concern">
                  <textarea
                    className={area}
                    value={s.redFlag.text}
                    maxLength={400}
                    onChange={(e) => at((x) => void (x.redFlag!.text = e.target.value), "rf")}
                  />
                </Field>
                <Options
                  label="Routes"
                  options={s.redFlag.options}
                  prefix="bt-rf"
                  onChange={(fn) => at((x) => fn(x.redFlag!.options))}
                  tag={(t) => `s${s.id}rf${t}`}
                  set={set}
                />
              </>
            )}
          </div>

          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field label={`How ${b.person.name || "the person"} experiences a good handoff`}>
              <textarea
                className={area}
                value={s.participant.good}
                maxLength={300}
                onChange={(e) => at((x) => void (x.participant.good = e.target.value), "pg")}
              />
            </Field>
            <Field label="…and a gap">
              <textarea
                className={area}
                value={s.participant.poor}
                maxLength={300}
                onChange={(e) => at((x) => void (x.participant.poor = e.target.value), "pp")}
              />
            </Field>
            <Field label="One good way (shown in the debrief)" className="sm:col-span-2">
              <textarea className={area} value={s.goodPath} maxLength={600} onChange={(e) => at((x) => void (x.goodPath = e.target.value), "gp")} />
            </Field>
          </div>
        </>
      )}
    </details>
  );
}

function Options({
  label,
  options,
  prefix,
  onChange,
}: {
  label: string;
  options: Option[];
  prefix: string;
  onChange: (fn: (list: Option[]) => void) => void;
  tag: (t: string) => string;
  set: Set;
}) {
  return (
    <details className={cx(inner, "block")}>
      <summary className="cursor-pointer font-semibold">
        {label} ({options.length})
      </summary>
      {options.map((o, k) => (
        <div key={o.id} className="mt-2 grid gap-2 rounded-xl bg-muted p-2 sm:grid-cols-3">
          <Field label="Choice" className="sm:col-span-2">
            <input className={input} value={o.text} maxLength={240} onChange={(e) => onChange((l) => void (l[k].text = e.target.value))} />
          </Field>
          <Field label="How it reads">
            <select className={input} value={o.verdict} onChange={(e) => onChange((l) => void (l[k].verdict = e.target.value as Verdict))}>
              {(Object.keys(VERDICTS) as Verdict[]).map((v) => (
                <option key={v} value={v}>
                  {VERDICTS[v]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dimension">
            <select className={input} value={o.dim} onChange={(e) => onChange((l) => void (l[k].dim = e.target.value as Dim))}>
              {(Object.keys(DIMS) as Dim[]).map((d) => (
                <option key={d} value={d}>
                  {DIMS[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Feedback" className="sm:col-span-2">
            <input className={input} value={o.feedback} maxLength={400} onChange={(e) => onChange((l) => void (l[k].feedback = e.target.value))} />
          </Field>
          <Field label="What the next role sees" className="sm:col-span-2">
            <input className={input} value={o.line} maxLength={300} onChange={(e) => onChange((l) => void (l[k].line = e.target.value))} />
          </Field>
          <Field label="The gap if it isn’t chosen (expected actions)">
            <input className={input} value={o.missing} maxLength={300} onChange={(e) => onChange((l) => void (l[k].missing = e.target.value))} />
          </Field>
          <button type="button" className={cx(btn.quiet, "justify-self-start")} onClick={() => onChange((l) => void l.splice(k, 1))}>
            <Icon name="trash" className="size-4" /> Remove
          </button>
        </div>
      ))}
      <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => onChange((l) => void l.push(blankOption(prefix)))}>
        <Icon name="plus" className="size-4" /> Add a choice
      </button>
    </details>
  );
}
