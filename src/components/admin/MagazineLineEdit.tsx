"use client";

import { cx } from "@/lib/format";
import type { LineBlock } from "@/lib/magazine";
import { freshLine, LANE_ORDER, LANES, lineApproved, type Lane, type LineCase } from "@/lib/line";
import { LINE_CASES } from "@/content/lineCases";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for "Where Is the Line?" (docs/line-drawer.md): the deck's introduction and order, and for each card
  the request, facts, lane, governing reason and distractors, next actions, feedback, the optional second-pass
  fact, the sources, and its own approval and review date. A card is served only once it's approved and within its
  review date, and the course can't be published until every card and the deck are signed off.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string) => v.split("\n");
const STATUS = { draft: "Draft", approved: "Approved", needs_review: "Needs review" } as const;

export function LineEdit({ block: b, update }: { block: LineBlock; update: Update }) {
  const set = (fn: (x: LineBlock) => void, tag?: string) => update<LineBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const approvedCards = b.cases.filter((c) => c.status === "approved").length;
  const signed = lineApproved(b) && approvedCards === b.cases.length;
  const words = b.intro.trim() ? b.intro.trim().split(/\s+/).length : 0;
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="sorting" className="size-5" /> Where Is the Line?
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `All ${b.cases.length} cards approved. Deck signed off by ${b.approval.clinical} (Clinical) and ${b.approval.quality} (Quality) on ${b.approval.approvedOn}.`
          : `${approvedCards} of ${b.cases.length} cards approved. Each card needs its Clinical or Quality approver and review date, and the deck needs its sign-off, before it can be published.`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from:</span>
        {LINE_CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={btn.secondary}
            title={c.teaches}
            onClick={() => {
              if (window.confirm(`Replace this deck with “${c.name}”? What’s in it now is lost, including any approvals recorded.`))
                set((x) => void Object.assign(x, freshLine(c.data)));
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        The starter cards are draft teaching keys from the PRD. Clinical and Quality sign off each answer before it’s approved.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Who the learner is">
          <input className={input} value={b.learnerRole} maxLength={160} onChange={(e) => set((x) => void (x.learnerRole = e.target.value), "role")} />
        </Field>
        <Field label={`Introduction (${words} of 80 words)`} className="sm:col-span-2">
          <textarea className={area} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-5" checked={b.shuffle} onChange={(e) => set((x) => void (x.shuffle = e.target.checked))} />
          Shuffle the cards for each learner
        </label>
      </div>

      {b.cases.map((c, i) => (
        <CaseEdit
          key={c.id}
          c={c}
          n={i + 1}
          last={i === b.cases.length - 1}
          put={(fn, tag) => set((x) => fn(x.cases[i]), tag && `c${i}${tag}`)}
          move={(by) =>
            set((x) => {
              const j = i + by;
              if (j < 0 || j >= x.cases.length) return;
              [x.cases[i], x.cases[j]] = [x.cases[j], x.cases[i]];
            })
          }
          remove={() => set((x) => void x.cases.splice(i, 1))}
        />
      ))}
      <button
        type="button"
        className={cx(btn.secondary, "mt-3")}
        onClick={() =>
          set((x) => {
            const r = [rid("reason"), rid("reason"), rid("reason")];
            const a = [rid("action"), rid("action")];
            x.cases.push({
              id: rid("case"),
              request: "",
              facts: [],
              know: "",
              funding: "",
              lane: "check",
              reasons: r.map((id) => ({ id, text: "" })),
              primary: r[0],
              accepted: [r[0]],
              actions: a.map((id) => ({ id, text: "" })),
              acceptedActions: [a[0]],
              choice: "",
              next: "",
              why: "",
              secondary: [],
              critical: null,
              twist: null,
              source: { refs: [], sop: "", approver: "", effectiveOn: "", reviewOn: "", escalation: "" },
              status: "draft",
            });
          })
        }
      >
        <Icon name="plus" className="size-4" /> Add a card
      </button>

      <details className={cx(group, "mt-3")} open={!lineApproved(b)}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The deck’s sign-off</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Policy set" className="sm:col-span-2">
            <input className={input} value={b.source.title} maxLength={200} onChange={(e) => set((x) => void (x.source.title = e.target.value), "st")} />
          </Field>
          <Field label="Its version">
            <input className={input} value={b.source.version} maxLength={80} onChange={(e) => set((x) => void (x.source.version = e.target.value), "sv")} />
          </Field>
          <Field label="Content owner">
            <input className={input} value={b.approval.owner} maxLength={120} onChange={(e) => set((x) => void (x.approval.owner = e.target.value), "ao")} />
          </Field>
          <Field label="Care Partner reviewer">
            <input className={input} value={b.approval.sme} maxLength={120} onChange={(e) => set((x) => void (x.approval.sme = e.target.value), "as")} />
          </Field>
          <Field label="Clinical (risk and consent cards)">
            <input
              className={input}
              value={b.approval.clinical}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.clinical = e.target.value), "ac")}
            />
          </Field>
          <Field label="Quality or policy (funding and worker rules)">
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
      </details>
    </div>
  );
}

function CaseEdit({
  c,
  n,
  last,
  put,
  move,
  remove,
}: {
  c: LineCase;
  n: number;
  last: boolean;
  put: (fn: (x: LineCase) => void, tag?: string) => void;
  move: (by: -1 | 1) => void;
  remove: () => void;
}) {
  return (
    <details className={cx(group, "mt-3")}>
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">
        {n}. {c.request ? `“${c.request.slice(0, 70)}${c.request.length > 70 ? "…" : ""}”` : "New card"} · {LANES[c.lane].label} · {STATUS[c.status]}
      </summary>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="The request, in their words" className="sm:col-span-2">
          <textarea className={area} value={c.request} maxLength={400} onChange={(e) => put((x) => void (x.request = e.target.value), "rq")} />
        </Field>
        <Field label="Facts that decide it, one per line" className="sm:col-span-2">
          <textarea className={area} value={c.facts.join("\n")} onChange={(e) => put((x) => void (x.facts = lines(e.target.value)), "fa")} />
        </Field>
        <Field label="What do you know? (optional)">
          <textarea className={area} value={c.know} maxLength={800} onChange={(e) => put((x) => void (x.know = e.target.value), "kn")} />
        </Field>
        <Field label="Funding context (optional)">
          <textarea className={area} value={c.funding} maxLength={300} onChange={(e) => put((x) => void (x.funding = e.target.value), "fu")} />
        </Field>
        <Field label="The reviewed lane">
          <select className={input} value={c.lane} onChange={(e) => put((x) => void (x.lane = e.target.value as Lane))}>
            {LANE_ORDER.map((l) => (
              <option key={l} value={l}>
                {LANES[l].label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className={inner}>
        <p className="text-sm font-semibold">Reasons: one governing reason, and two or three plausible distractors</p>
        <p className="text-xs text-ink-muted">
          If more than one reason is just as right for this version, tick it as also accepted, or add a fact that decides it.
        </p>
        {c.reasons.map((r, j) => (
          <div key={r.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
            <input
              aria-label={`Reason ${j + 1}`}
              className={input}
              value={r.text}
              maxLength={240}
              onChange={(e) => put((x) => void (x.reasons[j].text = e.target.value), `r${j}`)}
            />
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${c.id}-primary`}
                className="size-5"
                checked={c.primary === r.id}
                onChange={() => put((x) => void Object.assign(x, { primary: r.id, accepted: [...new Set([r.id, ...x.accepted])] }))}
              />
              Governing
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                disabled={c.primary === r.id}
                checked={c.accepted.includes(r.id)}
                onChange={(e) => put((x) => void (x.accepted = e.target.checked ? [...x.accepted, r.id] : x.accepted.filter((y) => y !== r.id)))}
              />
              Also accepted
            </label>
            <button
              type="button"
              className={btn.quiet}
              aria-label={`Remove reason ${j + 1}`}
              disabled={c.primary === r.id}
              onClick={() =>
                put((x) => void Object.assign(x, { reasons: x.reasons.filter((y) => y.id !== r.id), accepted: x.accepted.filter((y) => y !== r.id) }))
              }
            >
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        {c.reasons.length < 4 && (
          <div>
            <button type="button" className={btn.secondary} onClick={() => put((x) => void x.reasons.push({ id: rid("reason"), text: "" }))}>
              <Icon name="plus" className="size-4" /> Add a reason
            </button>
          </div>
        )}
      </div>

      <div className={inner}>
        <p className="text-sm font-semibold">Next actions</p>
        <p className="text-xs text-ink-muted">
          Tick the ones that are right. For “cannot authorise as requested”, the right one explains and offers an alternative: “no” alone never gets full
          credit.
        </p>
        {c.actions.map((r, j) => (
          <div key={r.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
            <input
              aria-label={`Action ${j + 1}`}
              className={input}
              value={r.text}
              maxLength={300}
              onChange={(e) => put((x) => void (x.actions[j].text = e.target.value), `a${j}`)}
            />
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={c.acceptedActions.includes(r.id)}
                onChange={(e) =>
                  put((x) => void (x.acceptedActions = e.target.checked ? [...x.acceptedActions, r.id] : x.acceptedActions.filter((y) => y !== r.id)))
                }
              />
              Right
            </label>
            <button
              type="button"
              className={btn.quiet}
              aria-label={`Remove action ${j + 1}`}
              onClick={() =>
                put(
                  (x) =>
                    void Object.assign(x, { actions: x.actions.filter((y) => y.id !== r.id), acceptedActions: x.acceptedActions.filter((y) => y !== r.id) }),
                )
              }
            >
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        {c.actions.length < 5 && (
          <div>
            <button type="button" className={btn.secondary} onClick={() => put((x) => void x.actions.push({ id: rid("action"), text: "" }))}>
              <Icon name="plus" className="size-4" /> Add an action
            </button>
          </div>
        )}
      </div>

      <div className={inner}>
        <Field label="One sentence about the person’s choice">
          <input className={input} value={c.choice} maxLength={400} onChange={(e) => put((x) => void (x.choice = e.target.value), "ch")} />
        </Field>
        <Field label="The next step">
          <input className={input} value={c.next} maxLength={400} onChange={(e) => put((x) => void (x.next = e.target.value), "nx")} />
        </Field>
        <Field label="See why: the policy and the nuance">
          <textarea className={cx(area, "min-h-24")} value={c.why} maxLength={1200} onChange={(e) => put((x) => void (x.why = e.target.value), "wh")} />
        </Field>
        <Field label="Other considerations for the debrief, one per line">
          <textarea className={area} value={c.secondary.join("\n")} onChange={(e) => put((x) => void (x.secondary = lines(e.target.value)), "se")} />
        </Field>
      </div>

      <div className={inner}>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5"
            checked={Boolean(c.critical)}
            onChange={(e) => put((x) => void (x.critical = e.target.checked ? { lanes: [], actions: [], text: "" } : null))}
          />
          Some answers here need a debrief (ignoring a safety duty, overruling a refusal, an unchecked worker)
        </label>
        {c.critical && (
          <>
            <fieldset className="flex flex-wrap gap-x-4">
              <legend className="text-sm font-semibold">Lanes that need a debrief</legend>
              {LANE_ORDER.map((l) => (
                <label key={l} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={c.critical!.lanes.includes(l)}
                    onChange={(e) =>
                      put((x) => void (x.critical!.lanes = e.target.checked ? [...x.critical!.lanes, l] : x.critical!.lanes.filter((y) => y !== l)))
                    }
                  />
                  {LANES[l].label}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-col">
              <legend className="text-sm font-semibold">Actions that need a debrief</legend>
              {c.actions.map((a) => (
                <label key={a.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={c.critical!.actions.includes(a.id)}
                    onChange={(e) =>
                      put((x) => void (x.critical!.actions = e.target.checked ? [...x.critical!.actions, a.id] : x.critical!.actions.filter((y) => y !== a.id)))
                    }
                  />
                  {a.text || "untitled action"}
                </label>
              ))}
            </fieldset>
            <Field label="Why it needs a debrief">
              <input className={input} value={c.critical.text} maxLength={400} onChange={(e) => put((x) => void (x.critical!.text = e.target.value), "ct")} />
            </Field>
          </>
        )}
      </div>

      <div className={inner}>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5"
            checked={Boolean(c.twist)}
            onChange={(e) => put((x) => void (x.twist = e.target.checked ? { fact: "", lane: x.lane, why: "" } : null))}
          />
          Second pass: one new fact
        </label>
        {c.twist && (
          <>
            <Field label="The new fact">
              <textarea className={area} value={c.twist.fact} maxLength={400} onChange={(e) => put((x) => void (x.twist!.fact = e.target.value), "tf")} />
            </Field>
            <Field label="The lane after it">
              <select className={input} value={c.twist.lane} onChange={(e) => put((x) => void (x.twist!.lane = e.target.value as Lane))}>
                {LANE_ORDER.map((l) => (
                  <option key={l} value={l}>
                    {LANES[l].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Why">
              <textarea className={area} value={c.twist.why} maxLength={600} onChange={(e) => put((x) => void (x.twist!.why = e.target.value), "tw")} />
            </Field>
          </>
        )}
      </div>

      <div className={inner}>
        <p className="text-sm font-semibold">Sources and approval</p>
        <Field label="Approved sources, one per line" hint="At least one for every policy claim.">
          <textarea className={area} value={c.source.refs.join("\n")} onChange={(e) => put((x) => void (x.source.refs = lines(e.target.value)), "sr")} />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Internal SOP reference">
            <input className={input} value={c.source.sop} maxLength={120} onChange={(e) => put((x) => void (x.source.sop = e.target.value), "so")} />
          </Field>
          <Field label="Escalation contact (a role)">
            <input
              className={input}
              value={c.source.escalation}
              maxLength={200}
              onChange={(e) => put((x) => void (x.source.escalation = e.target.value), "es")}
            />
          </Field>
          <Field label="Clinical or Quality approver">
            <input className={input} value={c.source.approver} maxLength={120} onChange={(e) => put((x) => void (x.source.approver = e.target.value), "ap")} />
          </Field>
          <Field label="Status">
            <select className={input} value={c.status} onChange={(e) => put((x) => void (x.status = e.target.value as LineCase["status"]))}>
              {(Object.keys(STATUS) as LineCase["status"][]).map((k) => (
                <option key={k} value={k}>
                  {STATUS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Policy effective from">
            <input type="date" className={input} value={c.source.effectiveOn} onChange={(e) => put((x) => void (x.source.effectiveOn = e.target.value))} />
          </Field>
          <Field label="Review by" hint="After this it isn’t served until it’s reviewed again.">
            <input type="date" className={input} value={c.source.reviewOn} onChange={(e) => put((x) => void (x.source.reviewOn = e.target.value))} />
          </Field>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={btn.secondary} disabled={n === 1} onClick={() => move(-1)}>
          Move earlier
        </button>
        <button type="button" className={btn.secondary} disabled={last} onClick={() => move(1)}>
          Move later
        </button>
        <button type="button" className={btn.quiet} onClick={remove}>
          <Icon name="trash" className="size-4" /> Remove this card
        </button>
      </div>
    </details>
  );
}
