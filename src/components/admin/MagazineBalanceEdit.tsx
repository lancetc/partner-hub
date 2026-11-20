"use client";

import { cx } from "@/lib/format";
import type { BalanceBlock } from "@/lib/magazine";
import {
  balanceApproved,
  DIMENSIONS,
  EFFECTS,
  freshBalance,
  GROUPS,
  needsWhs,
  PANS,
  RISK_KINDS,
  SAYING_KINDS,
  URGENCY,
  type BalanceAction,
  type Dimension,
  type Effect,
  type Group,
  type Pan,
  type RiskKind,
  type SayingKind,
  type Urgency,
} from "@/lib/balance";
import { BALANCE_CASES } from "@/content/balanceCases";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Balance Scale case (docs/balance-scale.md): the situation in the person's own words, the
  questions worth asking, the goal and risk cards, the plan cards and what each is worth, the criteria a
  balanced plan has to meet (and which must-do steps follow a new fact), what to say, and the debrief. A case
  can't be published until it's signed off: its rules about choice, falls, worker safety and funded workers
  are clinical and policy judgements.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string) => v.split("\n");

export function BalanceEdit({ block: b, update }: { block: BalanceBlock; update: Update }) {
  const set = (fn: (x: BalanceBlock) => void, tag?: string) => update<BalanceBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = balanceApproved(b);
  const whs = needsWhs(b);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="sliders" className="size-5" /> Dignity of Risk Balance Scale
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.approval.clinical} (Clinical), ${b.approval.quality} (Quality) and ${b.approval.operations} (Care Operations)${whs ? `, with ${b.approval.whs} (WHS),` : ""} on ${b.approval.approvedOn}.`
          : `Sign-off required. This case can’t be published until Clinical, Quality and Care Operations${whs ? " and WHS" : ""} sign-off and the source version are recorded below.`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from a case:</span>
        {BALANCE_CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={btn.secondary}
            title={c.teaches}
            onClick={() => {
              if (window.confirm(`Replace this block with the starter case “${c.name}”? What’s in the block now is lost, including any sign-off recorded.`))
                set((x) => void Object.assign(x, freshBalance(c.data)));
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Starter cases are fictional drafts written from the PRD. Reviewers check every fact, card and rule against current guidance before signing off.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="The person" hint="A made-up name. Never a real person.">
          <input className={input} value={b.person.name} maxLength={80} onChange={(e) => set((x) => void (x.person.name = e.target.value), "pn")} />
        </Field>
        <Field label="Age">
          <input
            type="number"
            className={input}
            value={b.person.age ?? ""}
            onChange={(e) => set((x) => void (x.person.age = e.target.value === "" ? null : Number(e.target.value)), "pa")}
          />
        </Field>
        <Field label="About them" className="sm:col-span-2">
          <input className={input} value={b.person.about} maxLength={600} onChange={(e) => set((x) => void (x.person.about = e.target.value), "pb")} />
        </Field>
        <Field label="Their own words" className="sm:col-span-2">
          <textarea className={area} value={b.quote} maxLength={400} onChange={(e) => set((x) => void (x.quote = e.target.value), "q")} />
        </Field>
        <Field label="The situation" className="sm:col-span-2">
          <textarea className={area} value={b.situation} maxLength={1200} onChange={(e) => set((x) => void (x.situation = e.target.value), "sit")} />
        </Field>
        <Field label="Current plan">
          <input className={input} value={b.currentPlan} maxLength={400} onChange={(e) => set((x) => void (x.currentPlan = e.target.value), "cp")} />
        </Field>
        <Field label="Who the learner is">
          <input className={input} value={b.learnerRole} maxLength={200} onChange={(e) => set((x) => void (x.learnerRole = e.target.value), "lr")} />
        </Field>
        <Field label="The risk signal">
          <input className={input} value={b.signal} maxLength={400} onChange={(e) => set((x) => void (x.signal = e.target.value), "sig")} />
        </Field>
        <Field label="Urgency">
          <select className={input} value={b.urgency} onChange={(e) => set((x) => void (x.urgency = e.target.value as Urgency))}>
            {(Object.keys(URGENCY) as Urgency[]).map((k) => (
              <option key={k} value={k}>
                {URGENCY[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Other facts, one per line" className="sm:col-span-2">
          <textarea className={area} value={b.facts.join("\n")} onChange={(e) => set((x) => void (x.facts = lines(e.target.value)), "facts")} />
        </Field>
      </div>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Questions worth asking ({b.questions.length})</summary>
        {b.questions.map((q, i) => (
          <div key={q.id} className={inner}>
            <Field label={`Question ${i + 1}`}>
              <input className={input} value={q.label} maxLength={200} onChange={(e) => set((x) => void (x.questions[i].label = e.target.value), `q${i}l`)} />
            </Field>
            <Field label="What it turns up">
              <textarea
                className={area}
                value={q.answer}
                maxLength={600}
                onChange={(e) => set((x) => void (x.questions[i].answer = e.target.value), `q${i}a`)}
              />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-5" checked={q.useful} onChange={(e) => set((x) => void (x.questions[i].useful = e.target.checked))} />
              Worth asking
            </label>
            <Field label="Why it does or doesn’t help (for the debrief)">
              <input className={input} value={q.why} maxLength={400} onChange={(e) => set((x) => void (x.questions[i].why = e.target.value), `q${i}w`)} />
            </Field>
            <Remove label="Remove this question" onClick={() => set((x) => void x.questions.splice(i, 1))} />
          </div>
        ))}
        <Add label="Add a question" onClick={() => set((x) => void x.questions.push({ id: rid("q"), label: "", answer: "", useful: true, why: "" }))} />
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The tension: goal and risk cards</summary>
        <p className="text-xs text-ink-muted">
          Exactly one goal card is the person’s own goal. Mark the risks the facts really point to, and which the learner must name.
        </p>
        {b.goals.map((g, i) => (
          <div key={g.id} className={inner}>
            <Field label={`Goal card ${i + 1}`}>
              <input className={input} value={g.label} maxLength={200} onChange={(e) => set((x) => void (x.goals[i].label = e.target.value), `g${i}l`)} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input
                type="radio"
                name={`${b.id}-right-goal`}
                className="size-5"
                checked={g.right}
                onChange={() => set((x) => void x.goals.forEach((y, j) => (y.right = j === i)))}
              />
              This is their goal
            </label>
            <Field label="Why">
              <input className={input} value={g.why} maxLength={400} onChange={(e) => set((x) => void (x.goals[i].why = e.target.value), `g${i}w`)} />
            </Field>
            <Remove label="Remove this goal card" onClick={() => set((x) => void x.goals.splice(i, 1))} />
          </div>
        ))}
        <Add label="Add a goal card" onClick={() => set((x) => void x.goals.push({ id: rid("goal"), label: "", right: false, why: "" }))} />
        {b.risks.map((r, i) => (
          <div key={r.id} className={inner}>
            <Field label={`Risk card ${i + 1}`}>
              <input className={input} value={r.label} maxLength={200} onChange={(e) => set((x) => void (x.risks[i].label = e.target.value), `r${i}l`)} />
            </Field>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Kind">
                <select className={input} value={r.kind} onChange={(e) => set((x) => void (x.risks[i].kind = e.target.value as RiskKind))}>
                  {(Object.keys(RISK_KINDS) as RiskKind[]).map((k) => (
                    <option key={k} value={k}>
                      {RISK_KINDS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={r.real}
                  onChange={(e) => set((x) => void Object.assign(x.risks[i], { real: e.target.checked, required: e.target.checked && x.risks[i].required }))}
                />
                The facts point to it
              </label>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-5"
                  disabled={!r.real}
                  checked={r.required}
                  onChange={(e) => set((x) => void (x.risks[i].required = e.target.checked))}
                />
                Must be named
              </label>
            </div>
            <Field label="Why">
              <input className={input} value={r.why} maxLength={400} onChange={(e) => set((x) => void (x.risks[i].why = e.target.value), `r${i}w`)} />
            </Field>
            <Remove label="Remove this risk card" onClick={() => set((x) => void x.risks.splice(i, 1))} />
          </div>
        ))}
        <Add
          label="Add a risk card"
          onClick={() => set((x) => void x.risks.push({ id: rid("risk"), label: "", kind: "participant", real: false, required: false, why: "" }))}
        />
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Plan cards ({b.actions.length})</summary>
        <p className="text-xs text-ink-muted">
          Include cards that are over-restrictive and unsafe, so learners can see why. A card the person is asked about only counts towards a criterion if they
          accept it.
        </p>
        {b.actions.map((a, i) => (
          <ActionEdit
            key={a.id}
            a={a}
            n={i + 1}
            put={(fn, tag) => set((x) => fn(x.actions[i]), tag && `a${i}${tag}`)}
            remove={() =>
              set((x) => {
                x.actions.splice(i, 1);
                for (const c of x.criteria) c.anyOf = c.anyOf.filter((id) => id !== a.id);
              })
            }
          />
        ))}
        <Add
          label="Add a card"
          onClick={() =>
            set(
              (x) =>
                void x.actions.push({
                  id: rid("card"),
                  label: "",
                  group: "listen",
                  dims: [],
                  effect: "supports",
                  rationale: "",
                  asks: false,
                  accepts: true,
                  response: "",
                  after: false,
                }),
            )
          }
        />
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">What a balanced plan needs ({b.criteria.length} criteria)</summary>
        <p className="text-xs text-ink-muted">
          Each criterion is met by any one of its cards. Put criteria on both sides. Mark the steps that must follow the new fact as must-do: nothing else
          stands in for them.
        </p>
        {b.criteria.map((c, i) => (
          <div key={c.id} className={inner}>
            <Field label={`Criterion ${i + 1}`}>
              <input className={input} value={c.label} maxLength={160} onChange={(e) => set((x) => void (x.criteria[i].label = e.target.value), `c${i}l`)} />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Side of the scale">
                <select className={input} value={c.pan} onChange={(e) => set((x) => void (x.criteria[i].pan = e.target.value as Pan))}>
                  {(Object.keys(PANS) as Pan[]).map((k) => (
                    <option key={k} value={k}>
                      {PANS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="What it shows">
                <select className={input} value={c.dim} onChange={(e) => set((x) => void (x.criteria[i].dim = e.target.value as Dimension))}>
                  {(Object.keys(DIMENSIONS) as Dimension[]).map((k) => (
                    <option key={k} value={k}>
                      {DIMENSIONS[k]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="What the learner is asked when it’s missing" hint="A question. Don’t name a card.">
              <input className={input} value={c.prompt} maxLength={300} onChange={(e) => set((x) => void (x.criteria[i].prompt = e.target.value), `c${i}p`)} />
            </Field>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-semibold">Met by any of</legend>
              {b.actions
                .filter((a) => a.effect === "supports" || a.effect === "contextual")
                .map((a) => (
                  <label key={a.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={c.anyOf.includes(a.id)}
                      onChange={(e) =>
                        set(
                          (x) => void (x.criteria[i].anyOf = e.target.checked ? [...x.criteria[i].anyOf, a.id] : x.criteria[i].anyOf.filter((y) => y !== a.id)),
                        )
                      }
                    />
                    {a.label || "untitled card"}
                    {a.after ? " (after the new fact)" : ""}
                  </label>
                ))}
            </fieldset>
            <div className="flex flex-wrap gap-4">
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-5" checked={c.after} onChange={(e) => set((x) => void (x.criteria[i].after = e.target.checked))} />
                Applies after the new fact
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-5" checked={c.critical} onChange={(e) => set((x) => void (x.criteria[i].critical = e.target.checked))} />
                Must-do before finishing
              </label>
            </div>
            <Remove label="Remove this criterion" onClick={() => set((x) => void x.criteria.splice(i, 1))} />
          </div>
        ))}
        <Add
          label="Add a criterion"
          onClick={() =>
            set((x) => void x.criteria.push({ id: rid("crit"), label: "", dim: "choice", pan: "person", anyOf: [], prompt: "", after: false, critical: false }))
          }
        />
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">What to say ({b.sayings.length} phrases)</summary>
        {b.sayings.map((x0, i) => (
          <div key={x0.id} className={inner}>
            <Field label={`Phrase ${i + 1}`}>
              <textarea className={area} value={x0.text} maxLength={700} onChange={(e) => set((x) => void (x.sayings[i].text = e.target.value), `s${i}t`)} />
            </Field>
            <Field label="What it is">
              <select className={input} value={x0.kind} onChange={(e) => set((x) => void (x.sayings[i].kind = e.target.value as SayingKind))}>
                {(Object.keys(SAYING_KINDS) as SayingKind[]).map((k) => (
                  <option key={k} value={k}>
                    {SAYING_KINDS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Feedback">
              <input
                className={input}
                value={x0.feedback}
                maxLength={400}
                onChange={(e) => set((x) => void (x.sayings[i].feedback = e.target.value), `s${i}f`)}
              />
            </Field>
            <Remove label="Remove this phrase" onClick={() => set((x) => void x.sayings.splice(i, 1))} />
          </div>
        ))}
        <Add label="Add a phrase" onClick={() => set((x) => void x.sayings.push({ id: rid("say"), text: "", kind: "good", feedback: "" }))} />
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The new fact</summary>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5"
            checked={Boolean(b.event)}
            onChange={(e) => set((x) => void (x.event = e.target.checked ? { title: "", facts: [] } : null))}
          />
          The plan is tested against a new fact
        </label>
        {b.event && (
          <div className={inner}>
            <Field label="When">
              <input className={input} value={b.event.title} maxLength={160} onChange={(e) => set((x) => void (x.event!.title = e.target.value), "et")} />
            </Field>
            <Field label="What happens, one fact per line">
              <textarea className={area} value={b.event.facts.join("\n")} onChange={(e) => set((x) => void (x.event!.facts = lines(e.target.value)), "ef")} />
            </Field>
            <p className="text-xs text-ink-muted">Mark the cards it brings as “offered after the new fact”, and add must-do criteria for it.</p>
          </div>
        )}
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The debrief</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Residual risk" className="sm:col-span-2">
            <textarea className={area} value={b.residual} maxLength={600} onChange={(e) => set((x) => void (x.residual = e.target.value), "res")} />
          </Field>
          <Field label="Review owner (a role)">
            <input className={input} value={b.reviewOwner} maxLength={160} onChange={(e) => set((x) => void (x.reviewOwner = e.target.value), "ro")} />
          </Field>
          <Field label="Review trigger">
            <input className={input} value={b.reviewTrigger} maxLength={300} onChange={(e) => set((x) => void (x.reviewTrigger = e.target.value), "rt")} />
          </Field>
          <Field label="Care-plan note (a fictional teaching example)" className="sm:col-span-2">
            <textarea className={cx(area, "min-h-32")} value={b.note} maxLength={2500} onChange={(e) => set((x) => void (x.note = e.target.value), "note")} />
          </Field>
        </div>
      </details>

      <details className={cx(group, "mt-3")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Source and sign-off</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Policy source" className="sm:col-span-2">
            <input className={input} value={b.source.title} maxLength={200} onChange={(e) => set((x) => void (x.source.title = e.target.value), "st")} />
          </Field>
          <Field label="Its version">
            <input className={input} value={b.source.version} maxLength={80} onChange={(e) => set((x) => void (x.source.version = e.target.value), "sv")} />
          </Field>
          <Field label="Internal policy id">
            <input className={input} value={b.source.policyId} maxLength={80} onChange={(e) => set((x) => void (x.source.policyId = e.target.value), "sp")} />
          </Field>
          <Field label="Effective from">
            <input type="date" className={input} value={b.source.effectiveOn} onChange={(e) => set((x) => void (x.source.effectiveOn = e.target.value))} />
          </Field>
          <Field label="Next review">
            <input type="date" className={input} value={b.source.reviewOn} onChange={(e) => set((x) => void (x.source.reviewOn = e.target.value))} />
          </Field>
          <Field label="Content owner">
            <input className={input} value={b.approval.owner} maxLength={120} onChange={(e) => set((x) => void (x.approval.owner = e.target.value), "ao")} />
          </Field>
          <Field label="Clinical (mobility, falls, consent)">
            <input
              className={input}
              value={b.approval.clinical}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.clinical = e.target.value), "ac")}
            />
          </Field>
          <Field label="Quality or policy (regulated wording)">
            <input
              className={input}
              value={b.approval.quality}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.quality = e.target.value), "aq")}
            />
          </Field>
          <Field label="Care Operations">
            <input
              className={input}
              value={b.approval.operations}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.operations = e.target.value), "aop")}
            />
          </Field>
          <Field label={whs ? "WHS (needed: workers are at risk in this case)" : "WHS (if workers are at risk)"}>
            <input className={input} value={b.approval.whs} maxLength={120} onChange={(e) => set((x) => void (x.approval.whs = e.target.value), "aw")} />
          </Field>
          <Field label="Signed off on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Record the people who actually reviewed it. Changing the case after sign-off means it needs signing off again: clear and re-enter the date when it has
          been.
        </p>
      </details>
    </div>
  );
}

function ActionEdit({ a, n, put, remove }: { a: BalanceAction; n: number; put: (fn: (x: BalanceAction) => void, tag?: string) => void; remove: () => void }) {
  return (
    <details className={inner}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        {a.label || `Card ${n}`} · {EFFECTS[a.effect]}
        {a.after ? " · after the new fact" : ""}
      </summary>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="The card" className="sm:col-span-2">
          <input className={input} value={a.label} maxLength={240} onChange={(e) => put((x) => void (x.label = e.target.value), "l")} />
        </Field>
        <Field label="Group">
          <select className={input} value={a.group} onChange={(e) => put((x) => void (x.group = e.target.value as Group))}>
            {(Object.keys(GROUPS) as Group[]).map((k) => (
              <option key={k} value={k}>
                {GROUPS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What it is in this case">
          <select className={input} value={a.effect} onChange={(e) => put((x) => void (x.effect = e.target.value as Effect))}>
            {(Object.keys(EFFECTS) as Effect[]).map((k) => (
              <option key={k} value={k}>
                {EFFECTS[k]}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="flex flex-wrap gap-x-4 sm:col-span-2">
          <legend className="text-sm font-semibold">What it shows</legend>
          {(Object.keys(DIMENSIONS) as Dimension[]).map((d) => (
            <label key={d} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={a.dims.includes(d)}
                onChange={(e) => put((x) => void (x.dims = e.target.checked ? [...x.dims, d] : x.dims.filter((y) => y !== d)))}
              />
              {DIMENSIONS[d]}
            </label>
          ))}
        </fieldset>
        <Field label="Why it helps or doesn’t (shown after)" className="sm:col-span-2">
          <textarea className={area} value={a.rationale} maxLength={600} onChange={(e) => put((x) => void (x.rationale = e.target.value), "r")} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={a.asks} onChange={(e) => put((x) => void (x.asks = e.target.checked))} />
          The person is asked about it
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={a.after} onChange={(e) => put((x) => void (x.after = e.target.checked))} />
          Offered after the new fact
        </label>
        {a.asks && (
          <>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-5" checked={a.accepts} onChange={(e) => put((x) => void (x.accepts = e.target.checked))} />
              They accept it
            </label>
            <Field label="What they say" className="sm:col-span-2">
              <input className={input} value={a.response} maxLength={400} onChange={(e) => put((x) => void (x.response = e.target.value), "resp")} />
            </Field>
          </>
        )}
      </div>
      <Remove label="Remove this card" onClick={remove} />
    </details>
  );
}

function Add({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={cx(btn.secondary, "mt-2")} onClick={onClick}>
      <Icon name="plus" className="size-4" /> {label}
    </button>
  );
}
function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div>
      <button type="button" className={btn.quiet} onClick={onClick}>
        <Icon name="trash" className="size-4" /> {label}
      </button>
    </div>
  );
}
