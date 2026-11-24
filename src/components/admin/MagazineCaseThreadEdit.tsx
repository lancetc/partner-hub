"use client";

import { cx } from "@/lib/format";
import type { CaseThreadBlock } from "@/lib/magazine";
import { CASE_AUDIENCES, caseApproved, caseThreadHardProblems, freshCaseThread, THREAD_ID, type CaseAudience } from "@/lib/caseThread";
import { CASE_THREAD_CASES } from "@/content/caseThreadCases";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a "What Would You Do?" Community Case Thread (docs/case-threads.md): the fictional case and its
  deliberate unknowns, the immediate-safety cue, the first-take and reflection prompts and self-review questions,
  the pinned case note with its sources, the governing policy and version, three to five varied seed responses, the
  canonical thread id and its audience, and the sign-off. Nothing here is pre-filled with a reviewer.

  The thread is registered when the course is published. The first course to publish a thread id owns it; another
  course using the same id embeds that thread as it is. A new policy version withdraws endorsements, pauses the
  thread for review and marks saved scripts stale.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string[]) => v.join("\n");
const unlines = (v: string) => v.split("\n").map((x) => x.trimStart());

export function CaseThreadEdit({ block: b, update }: { block: CaseThreadBlock; update: Update }) {
  const set = (fn: (x: CaseThreadBlock) => void, tag?: string) => update<CaseThreadBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = caseApproved(b);
  // The review date is checked at publish (it needs today's date); everything else is shown as it's written.
  const problems = caseThreadHardProblems(b, "");
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="chat" className="size-5" /> What would you do? Community case thread
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Case note approved by ${b.approval.owner} (owner), ${b.approval.clinical} (Clinical), ${b.approval.quality} (Quality) and ${b.approval.community} (Community owner) on ${b.approval.approvedOn}.`
          : "Sign-off required. This can’t be published until the content owner, Clinical, Quality and the Community owner approve the case note, with the policy version and a review date."}
      </p>
      {problems.length > 0 && (
        <details className="mt-2 rounded-2xl border border-line p-3 text-sm">
          <summary className="min-h-9 cursor-pointer font-semibold">Before it can be published ({problems.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from:</span>
        {CASE_THREAD_CASES.map((x) => (
          <button
            key={x.id}
            type="button"
            className={btn.secondary}
            onClick={() => {
              if (window.confirm(`Replace this block with “${x.label}”? What’s in it now is lost, including any sign-off recorded.`))
                set((y) => void Object.assign(y, freshCaseThread(x.data)));
            }}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Case title">
          <input className={input} value={b.title} maxLength={160} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field
          label="Community thread id"
          hint="The one canonical thread. Use the same id to place this thread on another page; the first course to publish it owns it."
        >
          <input
            className={cx(input, "font-mono", b.threadId && !THREAD_ID.test(b.threadId) && "border-danger")}
            value={b.threadId}
            maxLength={64}
            onChange={(e) => set((x) => void (x.threadId = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-")), "tid")}
          />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-semibold">Who can see and join the thread</legend>
          <p className="text-xs text-ink-muted">Within the course’s own audience. None ticked: the course’s audience.</p>
          <div className="mt-1 flex flex-wrap gap-3">
            {(Object.keys(CASE_AUDIENCES) as CaseAudience[]).map((a) => (
              <label key={a} className="inline-flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={b.audience.includes(a)}
                  onChange={(e) => set((x) => void (x.audience = e.target.checked ? [...x.audience, a] : x.audience.filter((y) => y !== a)))}
                />
                {CASE_AUDIENCES[a]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <details className={cx(group, "mt-3")} open>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The fictional case</summary>
        <p className="text-sm text-ink-muted">Made up. Never paste a real client’s details, a real incident or a recognisable mix of circumstances.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="The learner’s role in it" className="sm:col-span-2">
            <input className={input} value={b.role} maxLength={300} onChange={(e) => set((x) => void (x.role = e.target.value), "role")} />
          </Field>
          <Field label="Learning aim" className="sm:col-span-2">
            <textarea className={area} value={b.aim} maxLength={400} onChange={(e) => set((x) => void (x.aim = e.target.value), "aim")} />
          </Field>
          <Field label="The scene" className="sm:col-span-2">
            <textarea
              className={cx(area, "min-h-32")}
              value={b.scene}
              maxLength={2500}
              onChange={(e) => set((x) => void (x.scene = e.target.value), "scene")}
            />
          </Field>
          <Field label="What the learner knows" hint="One per line.">
            <textarea className={area} value={lines(b.known)} onChange={(e) => set((x) => void (x.known = unlines(e.target.value)), "known")} />
          </Field>
          <Field label="What they don’t know yet" hint="One per line: the deliberate unknowns.">
            <textarea className={area} value={lines(b.unknowns)} onChange={(e) => set((x) => void (x.unknowns = unlines(e.target.value)), "unknowns")} />
          </Field>
          <Field label="Immediate-safety cue" hint="What makes it a live matter for the approved pathway." className="sm:col-span-2">
            <textarea className={area} value={b.safetyCue} maxLength={500} onChange={(e) => set((x) => void (x.safetyCue = e.target.value), "cue")} />
          </Field>
          <Field label="Fictional names in the case" hint="One per line. Writing about them isn’t mistaken for a real person.">
            <textarea className={area} value={lines(b.people)} onChange={(e) => set((x) => void (x.people = unlines(e.target.value)), "people")} />
          </Field>
          <div className="grid gap-2">
            <Field label="Related page title">
              <input className={input} value={b.related.title} maxLength={160} onChange={(e) => set((x) => void (x.related.title = e.target.value), "rt")} />
            </Field>
            <Field label="Related page link" hint="A page on the Hub, like /topics.">
              <input className={input} value={b.related.href} maxLength={300} onChange={(e) => set((x) => void (x.related.href = e.target.value), "rh")} />
            </Field>
          </div>
        </div>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">First take, self-review and reflection</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["say", "What would you say?"],
              ["do", "What would you do next?"],
              ["who", "Who needs to know?"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label} className="sm:col-span-2">
              <input className={input} value={b.prompts[k]} maxLength={300} onChange={(e) => set((x) => void (x.prompts[k] = e.target.value), `p${k}`)} />
            </Field>
          ))}
          <Field label="Suggested length from (words)" hint="Guidance, never a limit.">
            <input
              type="number"
              min={20}
              max={500}
              className={input}
              value={b.words.min}
              onChange={(e) => set((x) => void (x.words.min = Math.max(20, Math.min(500, Math.round(Number(e.target.value) || 100)))))}
            />
          </Field>
          <Field label="to (words)">
            <input
              type="number"
              min={40}
              max={1000}
              className={input}
              value={b.words.max}
              onChange={(e) => set((x) => void (x.words.max = Math.max(40, Math.min(1000, Math.round(Number(e.target.value) || 250)))))}
            />
          </Field>
          <Field label="Self-review questions" hint="One per line. Shown after the first take, before the replies." className="sm:col-span-2">
            <textarea className={area} value={lines(b.checklist)} onChange={(e) => set((x) => void (x.checklist = unlines(e.target.value)), "check")} />
          </Field>
          <Field label="Reflection prompt" className="sm:col-span-2">
            <input className={input} value={b.reflection} maxLength={300} onChange={(e) => set((x) => void (x.reflection = e.target.value), "refl")} />
          </Field>
        </div>
      </details>

      <details className={cx(group, "mt-3")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The pinned case note</summary>
        <p className="text-sm text-ink-muted">
          Quality and Clinical approved, source-linked and versioned. Learners see it only after their first take, apart from the peer responses.
        </p>
        <div className="mt-2 grid gap-3">
          <Field label="Title">
            <input className={input} value={b.caseNote.title} maxLength={160} onChange={(e) => set((x) => void (x.caseNote.title = e.target.value), "nt")} />
          </Field>
          <Field label="The discussion guide">
            <textarea
              className={cx(area, "min-h-32")}
              value={b.caseNote.summary}
              maxLength={3000}
              onChange={(e) => set((x) => void (x.caseNote.summary = e.target.value), "ns")}
            />
          </Field>
          <Field label="Key decision boundaries" hint="One per line.">
            <textarea
              className={area}
              value={lines(b.caseNote.boundaries)}
              onChange={(e) => set((x) => void (x.caseNote.boundaries = unlines(e.target.value)), "nb")}
            />
          </Field>
          <Field label="A way to say it" hint="The reviewed example script.">
            <textarea
              className={area}
              value={b.caseNote.teach}
              maxLength={1500}
              onChange={(e) => set((x) => void (x.caseNote.teach = e.target.value), "nteach")}
            />
          </Field>
          <p className="text-sm font-semibold">Sources</p>
          {b.caseNote.sources.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                className={input}
                aria-label={`Source ${i + 1} title`}
                value={s.title}
                maxLength={200}
                onChange={(e) => set((x) => void (x.caseNote.sources[i].title = e.target.value), `st${i}`)}
              />
              <input
                className={input}
                aria-label={`Source ${i + 1} link`}
                value={s.href}
                maxLength={400}
                onChange={(e) => set((x) => void (x.caseNote.sources[i].href = e.target.value), `sh${i}`)}
              />
              <button type="button" className={btn.quiet} onClick={() => set((x) => void x.caseNote.sources.splice(i, 1))}>
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className={cx(btn.quiet, "self-start")}
            onClick={() => set((x) => void x.caseNote.sources.push({ title: "", href: "" }))}
            disabled={b.caseNote.sources.length >= 8}
          >
            <Icon name="plus" className="size-4" /> Add a source
          </button>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Governing policy or agreement">
              <input className={input} value={b.policy.title} maxLength={200} onChange={(e) => set((x) => void (x.policy.title = e.target.value), "pt")} />
            </Field>
            <Field label="Its version" hint="Changing it withdraws endorsements and marks saved scripts stale.">
              <input className={input} value={b.policy.version} maxLength={40} onChange={(e) => set((x) => void (x.policy.version = e.target.value), "pv")} />
            </Field>
            <Field label="Policy owner">
              <input className={input} value={b.policy.owner} maxLength={120} onChange={(e) => set((x) => void (x.policy.owner = e.target.value), "po")} />
            </Field>
          </div>
        </div>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Seed responses ({b.seeds.length})</summary>
        <p className="text-sm text-ink-muted">
          Three to five varied responses written or verified by experienced coordinators: different good ways to speak with the person, the same safety
          boundary. They show as fictional seeds with a first name and the voice they’re written in, never as a real person.
        </p>
        {b.seeds.map((s, i) => (
          <div key={s.id} className={inner}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Seed {i + 1}</span>
              <button type="button" className={btn.quiet} onClick={() => set((x) => void x.seeds.splice(i, 1))}>
                <Icon name="trash" className="size-4" /> Remove
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Fictional first name">
                <input className={input} value={s.name} maxLength={60} onChange={(e) => set((x) => void (x.seeds[i].name = e.target.value), `sn${i}`)} />
              </Field>
              <Field label="The voice" hint="Like “Care partner, 7 years”.">
                <input className={input} value={s.role} maxLength={80} onChange={(e) => set((x) => void (x.seeds[i].role = e.target.value), `sr${i}`)} />
              </Field>
            </div>
            <Field label="Response">
              <textarea
                className={cx(area, "min-h-28")}
                value={s.body}
                maxLength={2000}
                onChange={(e) => set((x) => void (x.seeds[i].body = e.target.value), `sb${i}`)}
              />
            </Field>
            <Field label="Why coordinators found it useful">
              <input className={input} value={s.why} maxLength={300} onChange={(e) => set((x) => void (x.seeds[i].why = e.target.value), `sw${i}`)} />
            </Field>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.quiet, "mt-2")}
          disabled={b.seeds.length >= 6}
          onClick={() => set((x) => void x.seeds.push({ id: rid("seed"), name: "", role: "", body: "", why: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add a seed response
        </button>
      </details>

      <details className={cx(group, "mt-3")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Approval and review</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["owner", "Content owner"],
              ["clinical", "Clinical reviewer"],
              ["quality", "Quality reviewer"],
              ["community", "Community owner"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} maxLength={120} onChange={(e) => set((y) => void (y.approval[k] = e.target.value), `a${k}`)} />
            </Field>
          ))}
          <Field label="Approved on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((y) => void (y.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Next review" hint="After this day the course can’t be republished until the case note is reviewed.">
            <input type="date" className={input} value={b.reviewDue} onChange={(e) => set((y) => void (y.reviewDue = e.target.value))} />
          </Field>
        </div>
      </details>
    </div>
  );
}
