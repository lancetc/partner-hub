"use client";

import { cx } from "@/lib/format";
import type { SignalBlock } from "@/lib/magazine";
import {
  ACTION_ROLES,
  ARTEFACTS,
  CLUE_KINDS,
  CONNECTIONS,
  freshSignal,
  PRIORITIES,
  type ActionRole,
  type ClueKind,
  type Connection,
  type Priority,
  type SignalPassage,
} from "@/lib/signal";
import { SIGNAL_CASES } from "@/content/signalCases";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Spot the Signal case (docs/spot-the-signal.md): the three artefacts line by line, which
  lines matter and why, the routes a learner can choose and what each is worth in this case, the reviewed
  classification, the reviewer's example handover, and the record of who approved it against which source.
  A case can't be published until that record is filled in: the answers are a regulatory judgement.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";

export function SignalEdit({ block: b, update }: { block: SignalBlock; update: Update }) {
  const set = (fn: (x: SignalBlock) => void, tag?: string) => update<SignalBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const approved = Boolean(b.approval.owner && b.approval.clinical && b.approval.quality && b.approval.approvedOn);
  const sourced = Boolean(b.source.title && b.source.version);
  const lines = (v: string) => v.split("\n");
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="eye" className="size-5" /> Spot the Signal
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          approved && sourced
            ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
            : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {approved && sourced
          ? `Approved by ${b.approval.clinical} (clinical) and ${b.approval.quality} (Quality) on ${b.approval.approvedOn}.`
          : "Clinical and Quality approval required. This case and its answers can’t be published until the approvals and the source version are recorded below."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from a case:</span>
        {SIGNAL_CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={btn.secondary}
            title={c.teaches}
            onClick={() => {
              if (window.confirm(`Replace this block with the starter case “${c.name}”? What’s in the block now is lost, including any approvals recorded.`))
                set((x) => void Object.assign(x, freshSignal(c.data)));
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Starter cases are fictional drafts written from the PRD. Reviewers check every script, answer and route against current guidance before approving.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="The fictional client" hint="A made-up name. Never a real client.">
          <input className={input} value={b.client} maxLength={80} onChange={(e) => set((x) => void (x.client = e.target.value), "client")} />
        </Field>
        <Field label="Who the learner is" className="sm:col-span-2">
          <input className={input} value={b.role} maxLength={160} onChange={(e) => set((x) => void (x.role = e.target.value), "role")} />
        </Field>
        <Field label="Opening line" className="sm:col-span-2">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
      </div>

      {b.artefacts.map((a, i) => (
        <details key={a.id} className={cx(group, "mt-3")}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">
            {ARTEFACTS[a.kind]}: {a.title || "untitled"} ({a.passages.filter((p) => p.signal === "material").length} lines that matter)
          </summary>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <input className={input} value={a.title} maxLength={120} onChange={(e) => set((x) => void (x.artefacts[i].title = e.target.value), `a${i}t`)} />
            </Field>
            <Field label="Source" hint="Who or what it came from.">
              <input className={input} value={a.source} maxLength={120} onChange={(e) => set((x) => void (x.artefacts[i].source = e.target.value), `a${i}s`)} />
            </Field>
            <Field label="When it happened">
              <input
                className={input}
                value={a.eventAt}
                maxLength={60}
                onChange={(e) => set((x) => void (x.artefacts[i].eventAt = e.target.value), `a${i}e`)}
              />
            </Field>
            <Field label="When it was recorded or received">
              <input
                className={input}
                value={a.receivedAt}
                maxLength={60}
                onChange={(e) => set((x) => void (x.artefacts[i].receivedAt = e.target.value), `a${i}r`)}
              />
            </Field>
            <Field label={a.kind === "invoice" ? "What the file says (agreement, approvals)" : "About the source"} className="sm:col-span-2">
              <textarea
                className={area}
                value={a.context}
                maxLength={800}
                onChange={(e) => set((x) => void (x.artefacts[i].context = e.target.value), `a${i}c`)}
              />
            </Field>
            {a.kind === "voicemail" && (
              <Field
                label="Recording (optional)"
                hint="An MP3 from the image library, as /api/uploads/…mp3. The lines below are its transcript, so it works without one."
                className="sm:col-span-2"
              >
                <input
                  className={input}
                  value={a.audio}
                  placeholder="/api/uploads/….mp3"
                  onChange={(e) => set((x) => void (x.artefacts[i].audio = e.target.value.trim()), `a${i}a`)}
                />
              </Field>
            )}
          </div>
          <p className="mt-3 text-sm font-semibold">
            {a.kind === "invoice" ? "Invoice lines" : a.kind === "voicemail" ? "Transcript, line by line" : "The note, line by line"}
          </p>
          {a.passages.map((p, j) => {
            const put = (patch: Partial<SignalPassage>, tag: string) => set((x) => void Object.assign(x.artefacts[i].passages[j], patch), `a${i}p${j}${tag}`);
            return (
              <div key={p.id} className="mt-2 grid gap-2 rounded-xl bg-surface p-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <textarea
                    aria-label={`Line ${j + 1}`}
                    className={cx(input, "min-h-11 py-2")}
                    value={p.text}
                    maxLength={500}
                    onChange={(e) => put({ text: e.target.value }, "t")}
                  />
                  <button
                    type="button"
                    className={btn.quiet}
                    aria-label={`Remove line ${j + 1}`}
                    onClick={() => set((x) => void x.artefacts[i].passages.splice(j, 1))}
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
                {a.kind === "invoice" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      aria-label={`Amount for line ${j + 1}`}
                      className={input}
                      value={p.amount}
                      maxLength={40}
                      placeholder="$390.00"
                      onChange={(e) => put({ amount: e.target.value }, "a")}
                    />
                    <input
                      aria-label={`Earlier invoices for line ${j + 1}`}
                      className={input}
                      value={p.previous}
                      maxLength={80}
                      placeholder="On the last two invoices"
                      onChange={(e) => put({ previous: e.target.value }, "p")}
                    />
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <select
                    aria-label={`Is line ${j + 1} a signal`}
                    className={input}
                    value={p.signal}
                    onChange={(e) => put({ signal: e.target.value as SignalPassage["signal"] }, "s")}
                  >
                    <option value="none">Not a clue</option>
                    <option value="material">A signal that matters</option>
                    <option value="distractor">Looks like one, with an ordinary explanation</option>
                  </select>
                  {p.signal === "material" && (
                    <select
                      aria-label={`Kind of evidence for line ${j + 1}`}
                      className={input}
                      value={p.kind}
                      onChange={(e) => put({ kind: e.target.value as ClueKind }, "k")}
                    >
                      {(Object.keys(CLUE_KINDS) as ClueKind[]).map((k) => (
                        <option key={k} value={k}>
                          {CLUE_KINDS[k].label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {p.signal !== "none" && (
                  <textarea
                    aria-label={`Why, for line ${j + 1}`}
                    className={cx(input, "min-h-11 py-2")}
                    value={p.why}
                    maxLength={500}
                    placeholder="Why, for the debrief"
                    onChange={(e) => put({ why: e.target.value }, "w")}
                  />
                )}
              </div>
            );
          })}
          <button
            type="button"
            className={cx(btn.secondary, "mt-2")}
            onClick={() =>
              set((x) => void x.artefacts[i].passages.push({ id: rid("line"), text: "", amount: "", previous: "", signal: "none", kind: "observed", why: "" }))
            }
          >
            <Icon name="plus" className="size-4" /> Add a line
          </button>
        </details>
      ))}

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">What the learner can do first ({b.actions.length} routes)</summary>
        <p className="text-xs text-ink-muted">
          Word each route the way Trilogy Care does. They’re simulated: choosing one contacts no one. Don’t put phone numbers here unless they’re the approved
          ones. A case can’t be finished while the learner’s choices include an “unprotected” route, or none that’s “needed”.
        </p>
        {b.actions.map((a, i) => (
          <div key={a.id} className="mt-2 grid gap-2 rounded-xl bg-surface p-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <input
                aria-label={`Route ${i + 1}`}
                className={input}
                value={a.label}
                maxLength={160}
                onChange={(e) => set((x) => void (x.actions[i].label = e.target.value), `r${i}l`)}
              />
              <button type="button" className={btn.quiet} aria-label={`Remove route ${i + 1}`} onClick={() => set((x) => void x.actions.splice(i, 1))}>
                <Icon name="trash" className="size-4" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                aria-label={`Guidance for route ${i + 1}`}
                className={input}
                value={a.guidance}
                maxLength={300}
                placeholder="A line under it (optional)"
                onChange={(e) => set((x) => void (x.actions[i].guidance = e.target.value), `r${i}g`)}
              />
              <select
                aria-label={`What route ${i + 1} is worth in this case`}
                className={input}
                value={a.role}
                onChange={(e) => set((x) => void (x.actions[i].role = e.target.value as ActionRole))}
              >
                {(Object.keys(ACTION_ROLES) as ActionRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ACTION_ROLES[r]}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              aria-label={`Feedback for route ${i + 1}`}
              className={cx(input, "min-h-11 py-2")}
              value={a.feedback}
              maxLength={600}
              placeholder="What the learner is told when they choose it"
              onChange={(e) => set((x) => void (x.actions[i].feedback = e.target.value), `r${i}f`)}
            />
            <input
              aria-label={`What happens next for route ${i + 1}`}
              className={input}
              value={a.consequence}
              maxLength={400}
              placeholder="For a choice that delays: what the made-up timeline shows next (optional)"
              onChange={(e) => set((x) => void (x.actions[i].consequence = e.target.value), `r${i}c`)}
            />
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => set((x) => void x.actions.push({ id: rid("act"), label: "", guidance: "", role: "helpful", feedback: "", consequence: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add a route
        </button>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The reviewed assessment and handover</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Connected with funded aged care?">
            <select className={input} value={b.key.connection} onChange={(e) => set((x) => void (x.key.connection = e.target.value as Connection))}>
              {(Object.keys(CONNECTIONS) as Connection[]).map((c) => (
                <option key={c} value={c}>
                  {CONNECTIONS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reportable type the case supports">
            <select className={input} value={b.key.typeId} onChange={(e) => set((x) => void (x.key.typeId = e.target.value))}>
              <option value="">None established on these facts</option>
              {b.key.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Types offered to the learner, one per line" className="sm:col-span-2">
            <textarea
              className={area}
              value={b.key.types.map((t) => t.label).join("\n")}
              onChange={(e) =>
                set((x) => {
                  const labels = lines(e.target.value).slice(0, 8);
                  // Keep each line's id as it's retyped, so the chosen type stays chosen.
                  x.key.types = labels.map((label, n) => ({ id: x.key.types[n]?.id ?? rid("type"), label }));
                  if (!x.key.types.some((t) => t.id === x.key.typeId)) x.key.typeId = "";
                }, "types")
              }
            />
          </Field>
          <Field label="Priority the authorised team records">
            <select className={input} value={b.key.priority} onChange={(e) => set((x) => void (x.key.priority = e.target.value as Priority))}>
              {(Object.keys(PRIORITIES) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITIES[p].label}
                </option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend className="text-sm font-semibold">Also defensible from a learner</legend>
            <div className="mt-1 flex flex-wrap gap-x-4">
              {(Object.keys(PRIORITIES) as Priority[])
                .filter((p) => p !== b.key.priority)
                .map((p) => (
                  <label key={p} className="inline-flex min-h-9 items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-action)]"
                      checked={b.key.alsoAccept.includes(p)}
                      onChange={(e) =>
                        set((x) => void (x.key.alsoAccept = e.target.checked ? [...x.key.alsoAccept, p] : x.key.alsoAccept.filter((y) => y !== p)))
                      }
                    />
                    {PRIORITIES[p].label}
                  </label>
                ))}
            </div>
          </fieldset>
          <Field
            label="Why, as the learner reads it in the debrief"
            hint="Say what was and wasn’t established, and that the learner’s job was to escalate."
            className="sm:col-span-2"
          >
            <textarea
              className={cx(area, "min-h-32")}
              value={b.key.why}
              maxLength={1500}
              onChange={(e) => set((x) => void (x.key.why = e.target.value), "why")}
            />
          </Field>
          <Field label="Where in the source" className="sm:col-span-2">
            <input className={input} value={b.key.anchor} maxLength={200} onChange={(e) => set((x) => void (x.key.anchor = e.target.value), "anchor")} />
          </Field>
          <Field label="Senior reviewer’s example handover" hint="Facts, exact words, what isn’t known. No conclusions about anyone." className="sm:col-span-2">
            <textarea
              className={cx(area, "min-h-40")}
              value={b.key.handover}
              maxLength={2500}
              onChange={(e) => set((x) => void (x.key.handover = e.target.value), "handover")}
            />
          </Field>
          <Field label="What still needed finding out, one per line" className="sm:col-span-2">
            <textarea
              className={area}
              value={b.key.needed.join("\n")}
              onChange={(e) => set((x) => void (x.key.needed = lines(e.target.value).slice(0, 8)), "needed")}
            />
          </Field>
          <Field
            label="When the provider became aware"
            hint="A reviewed fact of the case, not the earliest timestamp. Leave empty if it can’t be said confidently: no clock is shown."
          >
            <input type="datetime-local" className={input} value={b.awareAt} onChange={(e) => set((x) => void (x.awareAt = e.target.value.slice(0, 16)))} />
          </Field>
          <Field label="About that time (shown in the debrief)">
            <input className={input} value={b.awareNote} maxLength={400} onChange={(e) => set((x) => void (x.awareNote = e.target.value), "aware")} />
          </Field>
        </div>
      </details>

      <details className={cx(group, "mt-3")} open={!approved || !sourced}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Source and approvals</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Policy source the answers were checked against" className="sm:col-span-2">
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
          <Field label="Clinical reviewer">
            <input
              className={input}
              value={b.approval.clinical}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.clinical = e.target.value), "ac")}
            />
          </Field>
          <Field label="Quality or policy reviewer">
            <input
              className={input}
              value={b.approval.quality}
              maxLength={120}
              onChange={(e) => set((x) => void (x.approval.quality = e.target.value), "aq")}
            />
          </Field>
          <Field label="Approved on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Effective from">
            <input type="date" className={input} value={b.approval.effectiveOn} onChange={(e) => set((x) => void (x.approval.effectiveOn = e.target.value))} />
          </Field>
          <Field label="Next review">
            <input type="date" className={input} value={b.approval.reviewOn} onChange={(e) => set((x) => void (x.approval.reviewOn = e.target.value))} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Record the names of the people who actually reviewed it. Changing the case or its answers after approval means it needs approving again: clear and
          re-enter the date when they have.
        </p>
      </details>
    </div>
  );
}
