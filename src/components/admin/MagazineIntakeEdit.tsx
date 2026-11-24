"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import type { IntakeBlock } from "@/lib/magazine";
import { caseProblems, labApproved, type IntakeLabData } from "@/lib/growthLab";
import { calculate, OVERALL, validateInputs } from "@/lib/growthReadiness";
import { GROWTH_CASES } from "@/content/growthCases";
import { btn, Field, input } from "./ui";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a growth readiness block ("Can we take on the next 10 clients?", docs/growth-readiness.md). The
  frame has plain fields; the story, the month's figures, the prediction checks, the changes to try, the actions and
  messages (with their feedback, rubric levels and flags) each have an advanced JSON edit, because the case is easier
  to inspect as text than as a hundred small inputs. The case check lists anything that would mislead a learner, and
  the model preview shows what the case gives as written. Nothing here is generated. Use Preview to play it.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const SIGNOFF: [keyof IntakeLabData["approval"], string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["operations", "Operations / Quality (story and service assumptions)"],
  ["partnerships", "Partnerships (business-role language)"],
  ["policy", "Policy owner (Support at Home claims)"],
  ["privacy", "Privacy"],
];

export function IntakeEdit({ block: b, update }: { block: IntakeBlock; update: Update }) {
  const set = (fn: (x: IntakeBlock) => void, tag?: string) => update<IntakeBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = labApproved(b);
  const valid = !validateInputs(b.inputs).length;
  const r = valid ? calculate(b.inputs) : null;
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="gauge" className="size-5" /> Growth readiness
      </p>
      <p
        role="status"
        className={cx(
          "rounded-2xl px-4 py-3 text-sm font-semibold",
          signed && !problems.length
            ? "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]"
            : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
        )}
      >
        {problems.length
          ? `The case check finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes.`
          : signed
            ? "The case check passes and the sign-off is recorded: this block can be published."
            : "A draft: the case check passes, but it can’t be published until every reviewer’s sign-off is recorded below."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a case">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = GROWTH_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this block with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {GROWTH_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Case version" hint="Change it when the story or figures change: attempts record the version they used.">
          <input className={input} value={b.storyVersion} onChange={(e) => set((x) => void (x.storyVersion = e.target.value), "version")} />
        </Field>
        <Field label="Title">
          <input className={input} value={b.title} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <input className={input} value={b.intro} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
      </div>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">The case, as written</h4>
        {r ? (
          <p className="text-sm">
            {OVERALL[r.state].label}: {r.proposed} proposed starts, {r.supported} with modelled capacity, {r.constrained} constrained, {r.confirm} needing
            confirmation; {r.enquiries} {r.enquiries === 1 ? "enquiry" : "enquiries"}. Tightest week: Week {r.tightest + 1} ({r.weeks[r.tightest]?.headroom}{" "}
            hours).
          </p>
        ) : (
          <p className="text-sm">The figures don’t validate yet, so there’s no result.</p>
        )}
        <JsonEdit
          label="Story (principal, situation, voices, dilemma)"
          value={b.story}
          onApply={(v) => set((x) => void (x.story = v as IntakeLabData["story"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="The month’s figures (bands, coordinators, starts, supply)"
          value={b.inputs}
          onApply={(v) => set((x) => void (x.inputs = v as IntakeLabData["inputs"]))}
          check={(v) => isObj(v) && Array.isArray((v as Record<string, unknown>).starts)}
        />
        <JsonEdit
          label="Prediction (prompt and checks; useful: true marks a check that matters)"
          value={b.prediction}
          onApply={(v) => set((x) => void (x.prediction = v as IntakeLabData["prediction"]))}
          check={(v) => isObj(v)}
        />
        <JsonEdit
          label="Changes to try"
          value={b.changes}
          onApply={(v) => set((x) => void (x.changes = v as IntakeLabData["changes"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Actions (with feedback, levels and flags)"
          value={b.decisions}
          onApply={(v) => set((x) => void (x.decisions = v as IntakeLabData["decisions"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Messages (with feedback, outcome, levels and flags)"
          value={b.messages}
          onApply={(v) => set((x) => void (x.messages = v as IntakeLabData["messages"]))}
          check={Array.isArray}
        />
        <JsonEdit
          label="Links (Hiring Runway and other tools)"
          value={b.links}
          onApply={(v) => set((x) => void (x.links = v as IntakeLabData["links"]))}
          check={Array.isArray}
        />
        <JsonEdit label="Sources" value={b.sources} onApply={(v) => set((x) => void (x.sources = v as IntakeLabData["sources"]))} check={Array.isArray} />
        <Field label="Debrief summary" hint="Shown once the learner’s decision is in.">
          <textarea className={cx(input, "min-h-24 py-2")} value={b.debrief} onChange={(e) => set((x) => void (x.debrief = e.target.value), "debrief")} />
        </Field>
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Case check</h4>
        {problems.length ? (
          <ul className="list-disc pl-5 text-sm">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">Passes: the figures validate, there’s something to find, and there’s at least one strong, unflagged action and message.</p>
        )}
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Sign-off</h4>
        <p className="text-sm text-ink-muted">Partner Enablement drafts; each reviewer below checks their part; then it can be published as a version.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SIGNOFF.map(([k, label]) => (
            <Field key={k} label={label}>
              <input className={input} value={b.approval[k]} onChange={(e) => set((x) => void (x.approval[k] = e.target.value), `ap-${k}`)} />
            </Field>
          ))}
          <Field label="Approved on">
            <input type="date" className={input} value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Review by" hint="After this date it can’t be published until it’s reviewed again.">
            <input type="date" className={input} value={b.approval.reviewBy} onChange={(e) => set((x) => void (x.approval.reviewBy = e.target.value))} />
          </Field>
        </div>
      </section>
    </div>
  );
}

const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** A JSON text edit, applied only when it parses and passes a basic shape check. The case check then checks the rest. */
export function JsonEdit({ label, value, onApply, check }: { label: string; value: unknown; onApply: (v: unknown) => void; check: (v: unknown) => boolean }) {
  const text = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold">{label}</summary>
      <textarea
        className={cx(input, "mt-1 min-h-48 py-2 font-mono text-xs")}
        spellCheck={false}
        value={draft ?? text}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        aria-label={label}
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btn.secondary}
          disabled={draft === null}
          onClick={() => {
            try {
              const v = JSON.parse(draft ?? text);
              if (!check(v)) return setError("That doesn’t have the right shape. Compare it with what was there.");
              onApply(v);
              setDraft(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "That isn’t valid JSON.");
            }
          }}
        >
          Apply
        </button>
        {draft !== null && (
          <button type="button" className={btn.quiet} onClick={() => (setDraft(null), setError(null))}>
            Discard changes
          </button>
        )}
        {error && (
          <span role="alert" className="text-sm text-[#a12d31]">
            {error}
          </span>
        )}
      </div>
    </details>
  );
}
