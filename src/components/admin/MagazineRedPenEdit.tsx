"use client";

import { cx } from "@/lib/format";
import type { RedPenBlock } from "@/lib/magazine";
import { DIMS, identifierWarnings, MODES, REASONS, redPenApproved, type Dim, type Mode, type Reason, type Segment } from "@/lib/redpen";
import { REDPEN_CASES } from "@/content/redpenCases";
import { posts } from "@/content/community";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Red Pen critique (docs/red-pen.md): the fictional case (brief, facts, unknowns, policy excerpt),
  the flawed document line by line with what each line should be (marked, kept or either), the checks on the
  rewrite, an optional escalation decision, the reviewed rewrite with its notes and alternatives, the Community
  thread, and sign-off. It warns about anything that looks like a real identifier.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string[]) => v.join("\n");
const unlines = (v: string) => v.split("\n").map((x) => x.trimStart());
const threads = posts.filter((p) => p.title.toLowerCase().includes("case"));

export function RedPenEdit({ block: b, update }: { block: RedPenBlock; update: Update }) {
  const set = (fn: (x: RedPenBlock) => void, tag?: string) => update<RedPenBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = redPenApproved(b);
  const ids = identifierWarnings([b.brief, ...b.facts.map((f) => f.text), ...b.document.map((s) => s.text), b.reviewed.text].join("\n"));
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="pen" className="size-5" /> Red Pen critique
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.approval.clinical} (Clinical), ${b.approval.quality} (Quality) and ${b.approval.privacy} (Privacy) on ${b.approval.approvedOn}. Next review ${b.reviewDue}.`
          : "Sign-off required. This can’t be published until Clinical, Quality and Privacy sign-off, the policy IDs and a review date are recorded below."}
      </p>
      {ids.length > 0 && (
        <p role="alert" className="mt-2 rounded-2xl bg-[#fde2e0] p-3 text-sm font-semibold text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]">
          This looks like it contains {ids.join(" and ")}. Use fictional, de-identified details only. It can’t be published like this.
        </p>
      )}
      <p className="mt-2 text-sm text-ink-muted">
        Synthetic cases only: never paste a real care plan, note or screenshot. Preview the course to try it as a learner.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from:</span>
        {REDPEN_CASES.map((x) => (
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
        <Field label="Mode">
          <select className={input} value={b.mode} onChange={(e) => set((x) => void (x.mode = e.target.value as Mode))}>
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <option key={m} value={m}>
                {MODES[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Introduction" className="sm:col-span-2">
          <input className={input} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
      </div>

      <details className={cx(group, "mt-3")} open>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The case</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="The learner’s role in it">
            <input className={input} value={b.role} maxLength={160} onChange={(e) => set((x) => void (x.role = e.target.value), "role")} />
          </Field>
          <Field label="Brief">
            <textarea className={area} value={b.brief} maxLength={1200} onChange={(e) => set((x) => void (x.brief = e.target.value), "brief")} />
          </Field>
          <Field label="What is unknown" hint="One per line. Be explicit where details aren’t supplied.">
            <textarea className={area} value={lines(b.unknowns)} onChange={(e) => set((x) => void (x.unknowns = unlines(e.target.value)), "unk")} />
          </Field>
          <Field label="Policy excerpt">
            <textarea className={area} value={b.policyExcerpt} maxLength={800} onChange={(e) => set((x) => void (x.policyExcerpt = e.target.value), "pol")} />
          </Field>
        </div>
        <p className="mt-3 text-sm font-semibold">Facts (every fact the reviewed rewrite uses must be here)</p>
        {b.facts.map((f, i) => (
          <div key={f.id} className="mt-1 flex gap-2">
            <input
              className={input}
              aria-label={`Fact ${i + 1}`}
              value={f.text}
              maxLength={300}
              onChange={(e) => set((x) => void (x.facts[i].text = e.target.value), `f${f.id}`)}
            />
            <button type="button" className={btn.quiet} aria-label={`Remove fact ${i + 1}`} onClick={() => set((x) => void x.facts.splice(i, 1))}>
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => set((x) => void x.facts.push({ id: rid("rp-f"), text: "" }))}>
          <Icon name="plus" className="size-4" /> Add a fact
        </button>
      </details>

      <details className={cx(group, "mt-3")} open>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The flawed document, line by line</summary>
        <p className="text-sm text-ink-muted">Include accurate lines that should be kept, so learners don’t treat every clinical term as a trick.</p>
        {b.document.map((s, i) => (
          <LineEdit key={s.id} s={s} i={i} set={set} />
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() =>
            set((x) => void x.document.push({ id: rid("rp-s"), text: "", expect: "issue", reasons: [], dim: "voice", feedback: "", suggestion: "" }))
          }
        >
          <Icon name="plus" className="size-4" /> Add a line
        </button>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Checks on the rewrite ({b.checks.length})</summary>
        <p className="text-sm text-ink-muted">
          Words the rewrite must avoid, or must include at least one of. Matching ignores case. Learners are told a check may misread wording, and to review it
          with a lead.
        </p>
        {b.checks.map((c, i) => (
          <div key={c.id} className={cx(inner, "sm:grid-cols-4")}>
            <Field label="Kind">
              <select className={input} value={c.kind} onChange={(e) => set((x) => void (x.checks[i].kind = e.target.value as "avoid" | "include"))}>
                <option value="avoid">Must avoid</option>
                <option value="include">Must include one of</option>
              </select>
            </Field>
            <Field label="Phrases" hint="One per line." className="sm:col-span-3">
              <textarea
                className={area}
                value={lines(c.phrases)}
                onChange={(e) => set((x) => void (x.checks[i].phrases = unlines(e.target.value)), `c${c.id}p`)}
              />
            </Field>
            <Field label="Dimension">
              <select className={input} value={c.dim} onChange={(e) => set((x) => void (x.checks[i].dim = e.target.value as Dim))}>
                {(Object.keys(DIMS) as Dim[]).map((d) => (
                  <option key={d} value={d}>
                    {DIMS[d]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="If it fails">
              <select
                className={input}
                value={c.severity}
                onChange={(e) => set((x) => void (x.checks[i].severity = e.target.value as "critical" | "revision"))}
              >
                <option value="revision">Needs revision</option>
                <option value="critical">Critical gap</option>
              </select>
            </Field>
            <Field label="Feedback" className="sm:col-span-2">
              <input
                className={input}
                value={c.feedback}
                maxLength={400}
                onChange={(e) => set((x) => void (x.checks[i].feedback = e.target.value), `c${c.id}f`)}
              />
            </Field>
            <button type="button" className={cx(btn.quiet, "justify-self-start")} onClick={() => set((x) => void x.checks.splice(i, 1))}>
              <Icon name="trash" className="size-4" /> Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          onClick={() => set((x) => void x.checks.push({ id: rid("rp-c"), kind: "avoid", phrases: [], dim: "fidelity", severity: "revision", feedback: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add a check
        </button>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Escalation decision</summary>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-5"
            checked={Boolean(b.escalation)}
            onChange={(e) => set((x) => void (x.escalation = e.target.checked ? { question: "", options: [] } : null))}
          />
          This case needs a separate escalation decision
        </label>
        {b.escalation && (
          <>
            <Field label="Question">
              <input
                className={input}
                value={b.escalation.question}
                maxLength={300}
                onChange={(e) => set((x) => void (x.escalation!.question = e.target.value), "eq")}
              />
            </Field>
            {b.escalation.options.map((o, i) => (
              <div key={o.id} className={cx(inner, "sm:grid-cols-3")}>
                <Field label="Option" className="sm:col-span-2">
                  <input
                    className={input}
                    value={o.text}
                    maxLength={300}
                    onChange={(e) => set((x) => void (x.escalation!.options[i].text = e.target.value), `e${o.id}t`)}
                  />
                </Field>
                <Field label="How it reads">
                  <select
                    className={input}
                    value={o.verdict}
                    onChange={(e) => set((x) => void (x.escalation!.options[i].verdict = e.target.value as "good" | "revision" | "critical"))}
                  >
                    <option value="good">The right step</option>
                    <option value="revision">Needs revision</option>
                    <option value="critical">Critical gap</option>
                  </select>
                </Field>
                <Field label="Feedback" className="sm:col-span-3">
                  <input
                    className={input}
                    value={o.feedback}
                    maxLength={400}
                    onChange={(e) => set((x) => void (x.escalation!.options[i].feedback = e.target.value), `e${o.id}f`)}
                  />
                </Field>
              </div>
            ))}
            <button
              type="button"
              className={cx(btn.secondary, "mt-2")}
              onClick={() => set((x) => void x.escalation!.options.push({ id: rid("rp-e"), text: "", verdict: "critical", feedback: "" }))}
            >
              <Icon name="plus" className="size-4" /> Add an option
            </button>
            <p className="mt-1 text-xs text-ink-muted">Don’t include phone numbers unless they come from a maintained policy.</p>
          </>
        )}
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The reviewed rewrite (shown after the first submission)</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rewrite" className="sm:col-span-2">
            <textarea
              className={cx(area, "min-h-32")}
              value={b.reviewed.text}
              maxLength={2000}
              onChange={(e) => set((x) => void (x.reviewed.text = e.target.value), "rt")}
            />
          </Field>
          <Field label="Reviewer (name, optional)">
            <input
              className={input}
              value={b.reviewed.reviewer}
              maxLength={80}
              onChange={(e) => set((x) => void (x.reviewed.reviewer = e.target.value), "rr")}
            />
          </Field>
          <Field label="Reviewer’s role">
            <input
              className={input}
              value={b.reviewed.reviewerRole}
              maxLength={80}
              onChange={(e) => set((x) => void (x.reviewed.reviewerRole = e.target.value), "rro")}
            />
          </Field>
          <Field label="Reviewed on">
            <input type="date" className={input} value={b.reviewed.reviewedOn} onChange={(e) => set((x) => void (x.reviewed.reviewedOn = e.target.value))} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5"
              checked={b.reviewed.endorsed}
              onChange={(e) => set((x) => void (x.reviewed.endorsed = e.target.checked))}
            />
            Policy endorsed (not just a peer perspective)
          </label>
          <Field label="Another defensible phrasing" hint="One per line." className="sm:col-span-2">
            <textarea
              className={area}
              value={lines(b.reviewed.alternatives)}
              onChange={(e) => set((x) => void (x.reviewed.alternatives = unlines(e.target.value)), "alt")}
            />
          </Field>
        </div>
        <p className="mt-3 text-sm font-semibold">Margin notes</p>
        {b.reviewed.notes.map((n, i) => (
          <div key={i} className={cx(inner, "sm:grid-cols-2")}>
            <Field label="Quote">
              <input
                className={input}
                value={n.quote}
                maxLength={200}
                onChange={(e) => set((x) => void (x.reviewed.notes[i].quote = e.target.value), `nq${i}`)}
              />
            </Field>
            <Field label="Why">
              <input
                className={input}
                value={n.note}
                maxLength={400}
                onChange={(e) => set((x) => void (x.reviewed.notes[i].note = e.target.value), `nn${i}`)}
              />
            </Field>
          </div>
        ))}
        <button type="button" className={cx(btn.secondary, "mt-2")} onClick={() => set((x) => void x.reviewed.notes.push({ quote: "", note: "" }))}>
          <Icon name="plus" className="size-4" /> Add a note
        </button>
      </details>

      <details className={cx(group, "mt-4")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Passing, discussion and sign-off</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="“Needs revision” areas still allowed to pass" hint="A critical gap never passes.">
            <input
              type="number"
              min={0}
              max={6}
              className={input}
              value={b.maxRevisions}
              onChange={(e) => set((x) => void (x.maxRevisions = Math.max(0, Math.min(6, Math.round(Number(e.target.value) || 0)))))}
            />
          </Field>
          <Field label="Community thread for the case">
            <select className={input} value={b.communityPostId} onChange={(e) => set((x) => void (x.communityPostId = e.target.value))}>
              <option value="">None</option>
              {threads.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
          {(
            [
              ["owner", "Content owner"],
              ["clinical", "Clinical"],
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
          <Field label="Next review" hint="After this day the endorsement is retired and learners see it’s being reviewed.">
            <input type="date" className={input} value={b.reviewDue} onChange={(e) => set((y) => void (y.reviewDue = e.target.value))} />
          </Field>
          <Field label="Policy IDs" hint="One per line.">
            <textarea className={area} value={lines(b.policyIds)} onChange={(e) => set((y) => void (y.policyIds = unlines(e.target.value)), "pids")} />
          </Field>
          <Field label="Standards">
            <input className={input} value={b.standards} maxLength={200} onChange={(e) => set((y) => void (y.standards = e.target.value), "std")} />
          </Field>
        </div>
      </details>
    </div>
  );
}

function LineEdit({ s, i, set }: { s: Segment; i: number; set: (fn: (x: RedPenBlock) => void, tag?: string) => void }) {
  const at = (fn: (x: Segment) => void, tag?: string) => set((y) => void fn(y.document[i]), tag && `l${s.id}${tag}`);
  return (
    <div className={cx(inner, "sm:grid-cols-3")}>
      <Field label={`Line ${i + 1}`} className="sm:col-span-2">
        <input className={input} value={s.text} maxLength={400} onChange={(e) => at((x) => void (x.text = e.target.value), "t")} />
      </Field>
      <Field label="It should be">
        <select className={input} value={s.expect} onChange={(e) => at((x) => void (x.expect = e.target.value as Segment["expect"]))}>
          <option value="issue">Marked (a problem)</option>
          <option value="retain">Kept (accurate)</option>
          <option value="neutral">Either</option>
        </select>
      </Field>
      {s.expect === "issue" && (
        <fieldset className="flex flex-wrap gap-2 sm:col-span-3">
          <legend className="text-sm font-semibold">Reasons that fit</legend>
          {(Object.keys(REASONS) as Reason[]).map((r) => (
            <label key={r} className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={s.reasons.includes(r)}
                onChange={() => at((x) => void (x.reasons = x.reasons.includes(r) ? x.reasons.filter((y) => y !== r) : [...x.reasons, r]))}
              />
              {REASONS[r]}
            </label>
          ))}
        </fieldset>
      )}
      <Field label="Dimension">
        <select className={input} value={s.dim} onChange={(e) => at((x) => void (x.dim = e.target.value as Dim))}>
          {(Object.keys(DIMS) as Dim[]).map((d) => (
            <option key={d} value={d}>
              {DIMS[d]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Feedback" className="sm:col-span-2">
        <input className={input} value={s.feedback} maxLength={500} onChange={(e) => at((x) => void (x.feedback = e.target.value), "f")} />
      </Field>
      <Field label="Suggested replacement" className="sm:col-span-2">
        <input className={input} value={s.suggestion} maxLength={400} onChange={(e) => at((x) => void (x.suggestion = e.target.value), "s")} />
      </Field>
      <button type="button" className={cx(btn.quiet, "justify-self-start self-end")} onClick={() => set((y) => void y.document.splice(i, 1))}>
        <Icon name="trash" className="size-4" /> Remove line
      </button>
    </div>
  );
}
