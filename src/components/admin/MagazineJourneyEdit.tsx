"use client";

import { cx } from "@/lib/format";
import type { JourneyBlock } from "@/lib/magazine";
import {
  DIMENSIONS,
  journeyApproved,
  PERSONA_IDS,
  PERSONA_ROLES,
  ROLES,
  type Dim,
  type Milestone,
  type OptionRole,
  type PersonaCard,
  type Tension,
} from "@/lib/journey";
import { JOURNEY_CASES } from "@/content/journeyCases";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for The SaH Journey (docs/sah-journey.md): the people and what the family member may be told, each
  milestone with its four perspectives and context, the decision points (what's known, what to check, actions by
  area with the role each plays, what to say, the reviewed response), and the sign-off. Story times are fictional
  positions, never wait estimates.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string[]) => v.join("\n");
const unlines = (v: string) => v.split("\n").map((x) => x.trimStart());
const CARD_FIELDS: [keyof PersonaCard, string, number][] = [
  ["knows", "What they know", 400],
  ["matters", "What matters to them", 400],
  ["canDo", "What they can do now", 400],
  ["waiting", "What they’re waiting for", 400],
  ["quote", "In their words (optional)", 300],
  ["visibility", "Who can see this, and why", 300],
];
const emptyCard = (): PersonaCard => ({ knows: "", matters: "", canDo: "", waiting: "", quote: "", visibility: "" });

export function JourneyEdit({ block: b, update }: { block: JourneyBlock; update: Update }) {
  const set = (fn: (x: JourneyBlock) => void, tag?: string) => update<JourneyBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = journeyApproved(b);
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="timeline" className="size-5" /> The SaH Journey
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.approval.operations} (Care Operations), ${b.approval.clinical} (Clinical), ${b.approval.quality} (Quality), ${b.approval.privacy} (Privacy) and ${b.approval.communications} (Communications) on ${b.approval.approvedOn}.`
          : "Sign-off required. This can’t be published until Care Operations, Clinical, Quality, Privacy and Communications sign-off and the source version are recorded below."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from:</span>
        {JOURNEY_CASES.map((x) => (
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
        <Field label="Time note" hint="Shown beside every story time. Story times are never wait estimates.">
          <input className={input} value={b.timeNote} maxLength={120} onChange={(e) => set((x) => void (x.timeNote = e.target.value), "tn")} />
        </Field>
        <Field label="Introduction" className="sm:col-span-2">
          <textarea className={area} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        {PERSONA_IDS.map((p) => (
          <div key={p} className={cx(inner, "mt-0")}>
            <Field label={`${PERSONA_ROLES[p]}: name`} hint="Made up.">
              <input
                className={input}
                value={b.personas[p].name}
                maxLength={60}
                onChange={(e) => set((x) => void (x.personas[p].name = e.target.value), `pn${p}`)}
              />
            </Field>
            <Field label="About them">
              <textarea
                className={area}
                value={b.personas[p].about}
                maxLength={400}
                onChange={(e) => set((x) => void (x.personas[p].about = e.target.value), `pa${p}`)}
              />
            </Field>
          </div>
        ))}
        <Field label="What the family member may be told" hint="By the person’s consent or authority. Privacy reviews this." className="sm:col-span-2">
          <textarea className={area} value={b.consent} maxLength={400} onChange={(e) => set((x) => void (x.consent = e.target.value), "consent")} />
        </Field>
      </div>

      <h4 className="mt-5 font-semibold">Milestones</h4>
      <p className="text-sm text-ink-muted">
        Keep approval, the Notice of Decision, the Priority System, funding allocation and starting services as separate steps.
      </p>
      {b.milestones.map((m, i) => (
        <MilestoneEdit key={m.id} b={b} m={m} i={i} set={set} />
      ))}
      <button
        type="button"
        className={cx(btn.secondary, "mt-2")}
        disabled={b.milestones.length >= 10}
        onClick={() =>
          set(
            (y) =>
              void y.milestones.push({
                id: rid("jr"),
                label: "",
                time: "",
                status: "",
                meaning: "",
                confirmed: [],
                unknown: [],
                misconception: "",
                responsible: "",
                source: { title: "", url: "" },
                core: true,
                cards: Object.fromEntries(PERSONA_IDS.map((p) => [p, emptyCard()])) as Milestone["cards"],
              }),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Add a milestone
      </button>

      <h4 className="mt-5 font-semibold">Decision points</h4>
      <p className="text-sm text-ink-muted">
        Learners see the options and responses, never their roles, feedback or the reviewed response until they’ve tried. Each area needs an option that’s
        needed; each decision point needs a path to debrief and a good response.
      </p>
      {b.tensions.map((t, i) => (
        <TensionEdit key={t.id} b={b} t={t} i={i} set={set} />
      ))}
      <button
        type="button"
        className={cx(btn.secondary, "mt-2")}
        disabled={b.tensions.length >= 4}
        onClick={() =>
          set(
            (y) =>
              void y.tensions.push({
                id: rid("jr-t"),
                milestoneId: y.milestones[0]?.id ?? "",
                title: "",
                known: [],
                check: [],
                areas: [],
                sayings: [],
                reviewed: "",
              }),
          )
        }
      >
        <Icon name="plus" className="size-4" /> Add a decision point
      </button>

      <details className={cx(group, "mt-4")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Source and sign-off</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source" className="sm:col-span-2">
            <input className={input} value={b.source.title} maxLength={200} onChange={(e) => set((y) => void (y.source.title = e.target.value), "st")} />
          </Field>
          <Field label="Its version">
            <input className={input} value={b.source.version} maxLength={80} onChange={(e) => set((y) => void (y.source.version = e.target.value), "sv")} />
          </Field>
          <Field label="Checked on">
            <input type="date" className={input} value={b.source.verifiedOn} onChange={(e) => set((y) => void (y.source.verifiedOn = e.target.value))} />
          </Field>
          {(
            [
              ["owner", "Content owner"],
              ["operations", "Care Operations"],
              ["clinical", "Clinical (the fall branch)"],
              ["quality", "Quality or policy"],
              ["privacy", "Privacy (family and provider access)"],
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

type Set = (fn: (x: JourneyBlock) => void, tag?: string) => void;

function Move({ i, n, label, onMove, onRemove }: { i: number; n: number; label: string; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <span className="flex gap-1">
      <button type="button" className={btn.quiet} aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => onMove(i - 1)}>
        <Icon name="arrow-up" className="size-4" />
      </button>
      <button type="button" className={btn.quiet} aria-label={`Move ${label} down`} disabled={i === n - 1} onClick={() => onMove(i + 1)}>
        <Icon name="arrow-down" className="size-4" />
      </button>
      <button type="button" className={btn.quiet} aria-label={`Remove ${label}`} onClick={() => window.confirm(`Remove ${label}?`) && onRemove()}>
        <Icon name="trash" className="size-4" />
      </button>
    </span>
  );
}
const move = <T,>(list: T[], from: number, to: number) => {
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x);
};

function MilestoneEdit({ b, m, i, set }: { b: JourneyBlock; m: Milestone; i: number; set: Set }) {
  const at = (fn: (x: Milestone) => void, tag?: string) => set((y) => void fn(y.milestones[i]), tag && `m${m.id}${tag}`);
  const name = `milestone ${i + 1}`;
  return (
    <details className={cx(group, "mt-2")}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 py-2 font-semibold">
        <span>
          {m.time || "?"} · {m.label || `Milestone ${i + 1}`}
          {b.tensions.some((t) => t.milestoneId === m.id) && <span className="ml-2 text-sm font-normal text-ink-muted">(decision point)</span>}
        </span>
        <Move
          i={i}
          n={b.milestones.length}
          label={name}
          onMove={(to) => set((y) => move(y.milestones, i, to))}
          onRemove={() =>
            set((y) => {
              y.milestones.splice(i, 1);
              for (const t of y.tensions) if (t.milestoneId === m.id) t.milestoneId = "";
            })
          }
        />
      </summary>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Label">
          <input className={input} value={m.label} maxLength={100} onChange={(e) => at((x) => void (x.label = e.target.value), "l")} />
        </Field>
        <Field label="Story time" hint="Such as “Month 3”. Fictional.">
          <input className={input} value={m.time} maxLength={40} onChange={(e) => at((x) => void (x.time = e.target.value), "t")} />
        </Field>
        <Field label="Status">
          <input className={input} value={m.status} maxLength={80} onChange={(e) => at((x) => void (x.status = e.target.value), "s")} />
        </Field>
        <Field label="What it means" className="sm:col-span-3">
          <textarea className={area} value={m.meaning} maxLength={400} onChange={(e) => at((x) => void (x.meaning = e.target.value), "m")} />
        </Field>
        <Field label="Confirmed" hint="One per line." className="sm:col-span-3 lg:col-span-1">
          <textarea className={area} value={lines(m.confirmed)} onChange={(e) => at((x) => void (x.confirmed = unlines(e.target.value)), "c")} />
        </Field>
        <Field label="Not known yet" hint="One per line." className="sm:col-span-3 lg:col-span-1">
          <textarea className={area} value={lines(m.unknown)} onChange={(e) => at((x) => void (x.unknown = unlines(e.target.value)), "u")} />
        </Field>
        <Field label="A misconception to prevent" className="sm:col-span-3 lg:col-span-1">
          <textarea className={area} value={m.misconception} maxLength={300} onChange={(e) => at((x) => void (x.misconception = e.target.value), "mc")} />
        </Field>
        <Field label="Who’s responsible" className="sm:col-span-3">
          <input className={input} value={m.responsible} maxLength={300} onChange={(e) => at((x) => void (x.responsible = e.target.value), "r")} />
        </Field>
        <Field label="Source">
          <input className={input} value={m.source.title} maxLength={200} onChange={(e) => at((x) => void (x.source.title = e.target.value), "st")} />
        </Field>
        <Field label="Source link" hint="https:// only." className="sm:col-span-2">
          <input type="url" className={input} value={m.source.url} onChange={(e) => at((x) => void (x.source.url = e.target.value), "su")} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold sm:col-span-3">
          <input type="checkbox" className="size-5" checked={m.core} onChange={(e) => at((x) => void (x.core = e.target.checked))} />
          Learners open all four views here before finishing
        </label>
      </div>
      {PERSONA_IDS.map((p) => (
        <fieldset key={p} className={inner}>
          <legend className="font-semibold">
            {b.personas[p].name || PERSONA_ROLES[p]} <span className="font-normal text-ink-muted">({PERSONA_ROLES[p]})</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CARD_FIELDS.map(([k, label, max]) => (
              <Field key={k} label={label}>
                <textarea
                  className={area}
                  value={m.cards[p][k]}
                  maxLength={max}
                  onChange={(e) => at((x) => void (x.cards[p][k] = e.target.value), `${p}${k}`)}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
    </details>
  );
}

function TensionEdit({ b, t, i, set }: { b: JourneyBlock; t: Tension; i: number; set: Set }) {
  const at = (fn: (x: Tension) => void, tag?: string) => set((y) => void fn(y.tensions[i]), tag && `t${t.id}${tag}`);
  return (
    <details className={cx(group, "mt-2")}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 py-2 font-semibold">
        <span>{t.title || `Decision point ${i + 1}`}</span>
        <Move
          i={i}
          n={b.tensions.length}
          label={`decision point ${i + 1}`}
          onMove={(to) => set((y) => move(y.tensions, i, to))}
          onRemove={() => set((y) => void y.tensions.splice(i, 1))}
        />
      </summary>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={t.title} maxLength={120} onChange={(e) => at((x) => void (x.title = e.target.value), "ti")} />
        </Field>
        <Field label="Happens at">
          <select className={input} value={t.milestoneId} onChange={(e) => at((x) => void (x.milestoneId = e.target.value))}>
            <option value="">Choose a milestone</option>
            {b.milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.time} · {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What’s known" hint="One per line. Shown first.">
          <textarea className={area} value={lines(t.known)} onChange={(e) => at((x) => void (x.known = unlines(e.target.value)), "k")} />
        </Field>
        <Field label="What to check" hint="One per line. Shown next.">
          <textarea className={area} value={lines(t.check)} onChange={(e) => at((x) => void (x.check = unlines(e.target.value)), "c")} />
        </Field>
      </div>

      {t.areas.map((a, j) => (
        <fieldset key={a.id} className={inner}>
          <legend className="flex w-full items-center justify-between gap-2 font-semibold">
            Area {j + 1}
            <button
              type="button"
              className={btn.quiet}
              aria-label={`Remove area ${j + 1}`}
              onClick={() => window.confirm(`Remove area ${j + 1} and its options?`) && at((x) => void x.areas.splice(j, 1))}
            >
              <Icon name="trash" className="size-4" />
            </button>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Label">
              <input className={input} value={a.label} maxLength={80} onChange={(e) => at((x) => void (x.areas[j].label = e.target.value), `a${j}l`)} />
            </Field>
            <Field label="What’s missing if nothing needed is chosen">
              <input className={input} value={a.gap} maxLength={300} onChange={(e) => at((x) => void (x.areas[j].gap = e.target.value), `a${j}g`)} />
            </Field>
          </div>
          {a.options.map((o, k) => (
            <div key={o.id} className="grid gap-2 rounded-xl bg-muted p-2 sm:grid-cols-4">
              <Field label={`Option ${k + 1}`} className="sm:col-span-2">
                <input
                  className={input}
                  value={o.text}
                  maxLength={240}
                  onChange={(e) => at((x) => void (x.areas[j].options[k].text = e.target.value), `o${o.id}t`)}
                />
              </Field>
              <Field label="Who would do it">
                <input
                  className={input}
                  value={o.owner}
                  maxLength={80}
                  onChange={(e) => at((x) => void (x.areas[j].options[k].owner = e.target.value), `o${o.id}o`)}
                />
              </Field>
              <Field label="Its role">
                <select className={input} value={o.role} onChange={(e) => at((x) => void (x.areas[j].options[k].role = e.target.value as OptionRole))}>
                  {(Object.keys(ROLES) as OptionRole[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLES[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Part of the story it affects">
                <select className={input} value={o.dim} onChange={(e) => at((x) => void (x.areas[j].options[k].dim = e.target.value as Dim))}>
                  {(Object.keys(DIMENSIONS) as Dim[]).map((d) => (
                    <option key={d} value={d}>
                      {DIMENSIONS[d]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Feedback" className="sm:col-span-2">
                <textarea
                  className={area}
                  value={o.feedback}
                  maxLength={500}
                  onChange={(e) => at((x) => void (x.areas[j].options[k].feedback = e.target.value), `o${o.id}f`)}
                />
              </Field>
              <Field label="What happens in the story">
                <textarea
                  className={area}
                  value={o.consequence}
                  maxLength={300}
                  onChange={(e) => at((x) => void (x.areas[j].options[k].consequence = e.target.value), `o${o.id}c`)}
                />
              </Field>
              <div className="flex items-end">
                <button
                  type="button"
                  className={btn.quiet}
                  aria-label={`Remove option ${k + 1}`}
                  onClick={() => at((x) => void x.areas[j].options.splice(k, 1))}
                >
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className={btn.secondary}
            disabled={a.options.length >= 6}
            onClick={() =>
              at((x) => void x.areas[j].options.push({ id: rid("jr-o"), text: "", owner: "", role: "helpful", dim: "status", feedback: "", consequence: "" }))
            }
          >
            <Icon name="plus" className="size-4" /> Add an option
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className={cx(btn.secondary, "mt-2")}
        disabled={t.areas.length >= 5}
        onClick={() => at((x) => void x.areas.push({ id: rid("jr-a"), label: "", options: [], gap: "" }))}
      >
        <Icon name="plus" className="size-4" /> Add an area
      </button>

      <fieldset className={inner}>
        <legend className="font-semibold">What the learner could say</legend>
        {t.sayings.map((s, k) => (
          <div key={s.id} className="grid gap-2 rounded-xl bg-muted p-2 sm:grid-cols-4">
            <Field label={`Response ${k + 1}`} className="sm:col-span-3">
              <textarea className={area} value={s.text} maxLength={600} onChange={(e) => at((x) => void (x.sayings[k].text = e.target.value), `s${s.id}t`)} />
            </Field>
            <Field label="To">
              <input className={input} value={s.to} maxLength={60} onChange={(e) => at((x) => void (x.sayings[k].to = e.target.value), `s${s.id}o`)} />
            </Field>
            <Field label="Feedback" className="sm:col-span-3">
              <textarea
                className={area}
                value={s.feedback}
                maxLength={400}
                onChange={(e) => at((x) => void (x.sayings[k].feedback = e.target.value), `s${s.id}f`)}
              />
            </Field>
            <div className="flex flex-col justify-end gap-1">
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-5" checked={s.good} onChange={(e) => at((x) => void (x.sayings[k].good = e.target.checked))} />A good
                response
              </label>
              <button type="button" className={btn.quiet} aria-label={`Remove response ${k + 1}`} onClick={() => at((x) => void x.sayings.splice(k, 1))}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={btn.secondary}
          disabled={t.sayings.length >= 5}
          onClick={() => at((x) => void x.sayings.push({ id: rid("jr-s"), text: "", to: "", good: false, feedback: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add a response
        </button>
      </fieldset>
      <Field label="The reviewed response (shown once a plan stands)" className="mt-2">
        <textarea className={cx(area, "min-h-32")} value={t.reviewed} maxLength={1500} onChange={(e) => at((x) => void (x.reviewed = e.target.value), "rv")} />
      </Field>
    </details>
  );
}
