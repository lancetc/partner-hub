"use client";

import { cx } from "@/lib/format";
import type { BenchmarkBlock } from "@/lib/magazine";
import { AUDIENCES, benchmarkApproved, KINDS, MIN_COHORT_FLOOR, versionKey, type Audience, type ChoiceKind } from "@/lib/benchmark";
import { BENCHMARK_CASES } from "@/content/benchmarkCases";
import { posts } from "@/content/community";
import { btn, Field, input } from "./ui";
import { rid, type Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a peer benchmark poll (docs/peer-benchmark-poll.md): the fictional case, the choices and how
  each reads by the reviewed key, the reviewed perspective, the policy, the cohorts (by verified Hub role) and the
  disclosure threshold, the Community thread and its peer reasoning, and the sign-off. Changing the choices, the
  cohorts or the policy starts a fresh tally, and the version number says so to learners' attempts.
*/

const area = cx(input, "min-h-20 py-2");
const group = "rounded-2xl bg-muted p-3";
const inner = "mt-2 grid gap-2 rounded-xl bg-surface p-3";
const lines = (v: string[]) => v.join("\n");
const unlines = (v: string) => v.split("\n").map((x) => x.trimStart());
const threads = posts.filter((p) => p.comments.length > 0);

export function BenchmarkEdit({ block: b, update }: { block: BenchmarkBlock; update: Update }) {
  const set = (fn: (x: BenchmarkBlock) => void, tag?: string) => update<BenchmarkBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const signed = benchmarkApproved(b);
  const thread = posts.find((p) => p.id === b.community.postId);
  const used = new Set(b.cohorts.flatMap((c) => c.audiences));
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="people" className="size-5" /> Peer benchmark poll
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {signed
          ? `Signed off by ${b.approval.operations} (Care Operations), ${b.approval.clinical} (Clinical), ${b.approval.quality} (Quality) and ${b.approval.privacy} (Privacy) on ${b.approval.approvedOn}. Next review ${b.reviewDue}.`
          : "Sign-off required. This can’t be published until Care Operations, Clinical, Quality and Privacy sign-off, the policy version and a review date are recorded below."}
      </p>
      <p className="mt-2 rounded-2xl bg-muted p-3 text-sm">
        Votes are tallied under <span className="font-mono">{versionKey(b)}</span>. Changing the choices, the cohorts or the policy starts a fresh tally;
        earlier votes are kept apart, never blended.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Start from:</span>
        {BENCHMARK_CASES.map((x) => (
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
        <Field label="Case version" hint="Raise it when the case changes materially. Each version is tallied separately.">
          <input
            type="number"
            min={1}
            max={999}
            className={input}
            value={b.version}
            onChange={(e) => set((x) => void (x.version = Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1)))))}
          />
        </Field>
        <Field label="Introduction" className="sm:col-span-2">
          <textarea className={area} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
      </div>

      <details className={cx(group, "mt-3")} open>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The fictional case</summary>
        <p className="text-sm text-ink-muted">Made up. Never paste a real client’s details, a real incident or a real family conversation.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Heading">
            <input
              className={input}
              value={b.scenario.heading}
              maxLength={120}
              onChange={(e) => set((x) => void (x.scenario.heading = e.target.value), "sh")}
            />
          </Field>
          <Field label="The learner’s role in it">
            <input className={input} value={b.scenario.role} maxLength={160} onChange={(e) => set((x) => void (x.scenario.role = e.target.value), "sr")} />
          </Field>
          <Field label="What they know" hint="One per line.">
            <textarea className={area} value={lines(b.scenario.facts)} onChange={(e) => set((x) => void (x.scenario.facts = unlines(e.target.value)), "sf")} />
          </Field>
          <Field label="What they don’t know yet" hint="One per line.">
            <textarea
              className={area}
              value={lines(b.scenario.unknowns)}
              onChange={(e) => set((x) => void (x.scenario.unknowns = unlines(e.target.value)), "su")}
            />
          </Field>
          <Field label="The question" className="sm:col-span-2">
            <input
              className={input}
              value={b.scenario.question}
              maxLength={200}
              onChange={(e) => set((x) => void (x.scenario.question = e.target.value), "sq")}
            />
          </Field>
        </div>
      </details>

      <details className={cx(group, "mt-3")} open>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Choices and how each reads</summary>
        <p className="text-sm text-ink-muted">
          Learners see only the choice until they lock theirs. How it reads comes from the reviewers, never from how people vote.
        </p>
        {b.choices.map((c, i) => (
          <div key={c.id} className={inner}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{String.fromCharCode(65 + i)}</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  className={btn.quiet}
                  aria-label={`Move choice ${String.fromCharCode(65 + i)} up`}
                  disabled={i === 0}
                  onClick={() => set((x) => void x.choices.splice(i - 1, 0, ...x.choices.splice(i, 1)))}
                >
                  <Icon name="arrow-up" className="size-4" />
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  aria-label={`Remove choice ${String.fromCharCode(65 + i)}`}
                  onClick={() => window.confirm("Remove this choice? It starts a fresh tally.") && set((x) => void x.choices.splice(i, 1))}
                >
                  <Icon name="trash" className="size-4" />
                </button>
              </span>
            </div>
            <Field label="Choice">
              <textarea className={area} value={c.text} maxLength={300} onChange={(e) => set((x) => void (x.choices[i].text = e.target.value), `c${c.id}t`)} />
            </Field>
            <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
              <Field label="How it reads">
                <select className={input} value={c.kind} onChange={(e) => set((x) => void (x.choices[i].kind = e.target.value as ChoiceKind))}>
                  {(Object.keys(KINDS) as ChoiceKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KINDS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Feedback">
                <textarea
                  className={area}
                  value={c.feedback}
                  maxLength={500}
                  onChange={(e) => set((x) => void (x.choices[i].feedback = e.target.value), `c${c.id}f`)}
                />
              </Field>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          disabled={b.choices.length >= 6}
          onClick={() => set((x) => void x.choices.push({ id: rid("pc"), text: "", kind: "insufficient", feedback: "" }))}
        >
          <Icon name="plus" className="size-4" /> Add a choice
        </button>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={b.askConfidence} onChange={(e) => set((x) => void (x.askConfidence = e.target.checked))} />
            Ask how confident they are
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5" checked={b.askReason} onChange={(e) => set((x) => void (x.askReason = e.target.checked))} />
            Ask for a sentence of reasoning (private)
          </label>
        </div>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">The reviewed perspective and policy</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Heading">
            <input
              className={input}
              value={b.perspective.label}
              maxLength={80}
              onChange={(e) => set((x) => void (x.perspective.label = e.target.value), "pl")}
            />
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold">
            <input
              type="checkbox"
              className="size-5"
              checked={b.perspective.critical}
              onChange={(e) => set((x) => void (x.perspective.critical = e.target.checked))}
            />
            This case needs the approved escalation pathway (say so, whatever peers chose)
          </label>
          {(
            [
              ["reasoning", "The reasoning", 800],
              ["checkNext", "What I would check next", 600],
              ["thresholds", "Facts that change the urgency", 600],
              ["distinguish", "Where more than one step is defensible: the fact that tells them apart", 600],
              ["nextStep", "Next step", 600],
            ] as const
          ).map(([k, label, max]) => (
            <Field key={k} label={label}>
              <textarea
                className={area}
                value={b.perspective[k]}
                maxLength={max}
                onChange={(e) => set((x) => void (x.perspective[k] = e.target.value), `p${k}`)}
              />
            </Field>
          ))}
          <Field label="Policy ID">
            <input className={input} value={b.policy.id} maxLength={80} onChange={(e) => set((x) => void (x.policy.id = e.target.value), "pid")} />
          </Field>
          <Field label="Policy">
            <input className={input} value={b.policy.title} maxLength={200} onChange={(e) => set((x) => void (x.policy.title = e.target.value), "pt")} />
          </Field>
          <Field label="Its version">
            <input className={input} value={b.policy.version} maxLength={80} onChange={(e) => set((x) => void (x.policy.version = e.target.value), "pv")} />
          </Field>
          <Field label="Link" hint="https:// only.">
            <input type="url" className={input} value={b.policy.url} onChange={(e) => set((x) => void (x.policy.url = e.target.value), "pu")} />
          </Field>
        </div>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Cohorts and privacy</summary>
        <p className="text-sm text-ink-muted">
          Cohorts use each person’s verified Hub role when they lock, never one they pick. Each role can be in one cohort only. A group smaller than the
          threshold is hidden, and so is any total that would let it be worked out.
        </p>
        {b.cohorts.map((c, i) => (
          <div key={c.id} className={cx(inner, "sm:grid-cols-[1fr_auto_auto]")}>
            <Field label={`Cohort ${i + 1}`}>
              <input className={input} value={c.label} maxLength={60} onChange={(e) => set((x) => void (x.cohorts[i].label = e.target.value), `k${c.id}`)} />
            </Field>
            <fieldset className="flex flex-wrap items-end gap-3">
              <legend className="text-sm font-semibold">Verified roles</legend>
              {(Object.keys(AUDIENCES) as Audience[]).map((a) => (
                <label key={a} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={c.audiences.includes(a)}
                    disabled={!c.audiences.includes(a) && used.has(a)}
                    onChange={(e) =>
                      set(
                        (x) =>
                          void (x.cohorts[i].audiences = e.target.checked ? [...x.cohorts[i].audiences, a] : x.cohorts[i].audiences.filter((y) => y !== a)),
                      )
                    }
                  />
                  {AUDIENCES[a]}
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              className={cx(btn.quiet, "self-end")}
              aria-label={`Remove cohort ${i + 1}`}
              onClick={() => set((x) => void x.cohorts.splice(i, 1))}
            >
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={cx(btn.secondary, "mt-2")}
          disabled={b.cohorts.length >= 3}
          onClick={() => set((x) => void x.cohorts.push({ id: rid("pk"), label: "", audiences: [] }))}
        >
          <Icon name="plus" className="size-4" /> Add a cohort
        </button>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Smallest group shown" hint={`At least ${MIN_COHORT_FLOOR}. Privacy reviews this; 20 is the starting point.`}>
            <input
              type="number"
              min={MIN_COHORT_FLOOR}
              max={500}
              className={input}
              value={b.minCohort}
              onChange={(e) => set((x) => void (x.minCohort = Math.max(MIN_COHORT_FLOOR, Math.min(500, Math.round(Number(e.target.value) || 20)))))}
            />
          </Field>
          <Field label="Results update every (minutes)" hint="Batches, so one person’s answer can’t be picked out as it arrives.">
            <input
              type="number"
              min={5}
              max={1440}
              className={input}
              value={b.batchMinutes}
              onChange={(e) => set((x) => void (x.batchMinutes = Math.max(5, Math.min(1440, Math.round(Number(e.target.value) || 15)))))}
            />
          </Field>
        </div>
      </details>

      <details className={cx(group, "mt-3")}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Community discussion and peer reasoning</summary>
        <p className="text-sm text-ink-muted">
          The thread stays in the Community and follows its moderation: if it’s withdrawn there, nothing shows here. Likes order the reasoning; they never
          change the reviewed perspective.
        </p>
        <Field label="Case thread">
          <select className={input} value={b.community.postId} onChange={(e) => set((x) => void (x.community = { postId: e.target.value, rationales: [] }))}>
            <option value="">None</option>
            {threads.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
        {thread && (
          <ul className="mt-2 flex flex-col gap-2">
            {thread.comments.map((cm) => {
              const r = b.community.rationales.find((x) => x.commentId === cm.id);
              const k = b.community.rationales.findIndex((x) => x.commentId === cm.id);
              return (
                <li key={cm.id} className={inner}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5"
                      checked={Boolean(r)}
                      disabled={!r && b.community.rationales.length >= 2}
                      onChange={(e) =>
                        set(
                          (x) =>
                            void (x.community.rationales = e.target.checked
                              ? [...x.community.rationales, { commentId: cm.id, endorsedBy: "", endorsedOn: "" }]
                              : x.community.rationales.filter((y) => y.commentId !== cm.id)),
                        )
                      }
                    />
                    <span>
                      “{cm.body}” <span className="text-ink-muted">({cm.likes} likes)</span>
                    </span>
                  </label>
                  {r && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Reviewed and endorsed by" hint="Only when a reviewer has actually endorsed it.">
                        <input
                          className={input}
                          value={r.endorsedBy}
                          maxLength={120}
                          onChange={(e) => set((x) => void (x.community.rationales[k].endorsedBy = e.target.value), `e${cm.id}`)}
                        />
                      </Field>
                      <Field label="On">
                        <input
                          type="date"
                          className={input}
                          value={r.endorsedOn}
                          onChange={(e) => set((x) => void (x.community.rationales[k].endorsedOn = e.target.value))}
                        />
                      </Field>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </details>

      <details className={cx(group, "mt-3")} open={!signed}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Sign-off and review</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["owner", "Content owner"],
              ["operations", "Care Operations"],
              ["clinical", "Clinical (the next step and escalation facts)"],
              ["quality", "Quality or policy"],
              ["privacy", "Privacy (the threshold and Community presentation)"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} maxLength={120} onChange={(e) => set((y) => void (y.approval[k] = e.target.value), `a${k}`)} />
            </Field>
          ))}
          <Field label="Signed off on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((y) => void (y.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Next review" hint="After this day, the guidance and results pause for learners until it’s reviewed.">
            <input type="date" className={input} value={b.reviewDue} onChange={(e) => set((y) => void (y.reviewDue = e.target.value))} />
          </Field>
        </div>
      </details>
    </div>
  );
}
