"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import type { ReferralStudioBlock } from "@/lib/magazine";
import {
  CLAIM_STATE_LABELS,
  claimState,
  parseScenario,
  reviewedVersions,
  scenarioProblems,
  STAGES,
  startStudio,
  studioCaseProblems,
  studioSignOffProblems,
  studioTurn,
  type Stage,
  type StudioData,
} from "@/lib/referralStudio";
import { LOCAL_REFERRAL_STUDIO_DATA, REFERRAL_CLAIMS } from "@/content/referralStudio";
import { Field, input } from "./ui";
import { JsonEdit } from "./MagazineIntakeEdit";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a Local Referral Studio block (docs/local-referral-studio.md). Plain fields for the frame, the
  selection rationale (why this block was chosen, from a verified problem, and the exact AI-proposed phrases to
  review), privacy and sign-off; a JSON edit per scenario, as the family call's editor does. The case check and the
  sign-off list run as you type, against the content claim register (publishing checks the live one, with any claim an
  owner has withdrawn). "Test a line" plays one reply through the scenario on the reviewed script, so an owner can see
  exactly what the referrer says and what's flagged. No AI drafting in this release: that's a disabled stub.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const okTone = "bg-[#e3f4ea] text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";
const warnTone = "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const SIGNOFF: [Exclude<keyof StudioData["approval"], "approvedOn" | "reviewBy" | "scenarioReviewed">, string][] = [
  ["owner", "Content owner (Partner Enablement)"],
  ["pathway", "Referral pathway owner (stage logic and handoffs)"],
  ["partnerships", "Partnerships and Marketing (claims, co-branding, external messaging)"],
  ["quality", "Quality and clinical governance (clinical, safety and discharge claims)"],
  ["privacy", "Privacy and security (transcripts, voice, contact data)"],
];
const RATIONALE: [Exclude<keyof StudioData["rationale"], "decision" | "aiPhrases">, string, string][] = [
  [
    "evidence",
    "Evidence of the problem",
    "Verified feedback, missed introductions, claim errors or handoff complaints. Never a partner’s or patient’s details.",
  ],
  ["behaviour", "Target behaviour", ""],
  ["whyRoleplay", "Why a roleplay", ""],
  ["processFix", "Process fix needed as well", "A shortage of capacity or a broken intake process isn’t solved by pitching more often."],
  ["reuse", "Existing content reused", ""],
  ["owner", "Owner", ""],
  ["measure", "Outcome measure", "Kept apart from practice: the referral pathway owner’s own measure."],
];

export function ReferralStudioEdit({ block: b, update }: { block: ReferralStudioBlock; update: Update }) {
  const set = (fn: (x: ReferralStudioBlock) => void, tag?: string) => update<ReferralStudioBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  // Review dates are checked when it publishes, on the server’s clock: no clock is read while drawing the editor.
  const today = "";
  const problems = studioCaseProblems(b, REFERRAL_CLAIMS);
  const hard = studioSignOffProblems(b, REFERRAL_CLAIMS, today);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Fictional referrers only: unnamed roles, never a real clinician, practice or hospital. Practice runs on the Tough Family Call’s engine; every claim
        comes from the central register. Learners never receive intents, replies, the rubric or fixtures before they talk.
      </p>
      <div className={group}>
        <Field label="Title">
          <input className={input} value={b.title} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction">
          <textarea className={cx(input, "min-h-20 py-2")} value={b.intro} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="Ava’s briefing (host only: she never plays the referrer)">
          <textarea className={cx(input, "min-h-16 py-2")} value={b.ava.brief} onChange={(e) => set((x) => void (x.ava.brief = e.target.value), "ava")} />
        </Field>
        <Field
          label="The referrer’s lines"
          hint="The reviewed script by default. The bounded AI referrer paraphrases within the scenario and falls back to the script; keep it off until its evaluation set is approved."
        >
          <select className={input} value={b.caller} onChange={(e) => set((x) => void (x.caller = e.target.value === "bounded-ai" ? "bounded-ai" : "script"))}>
            <option value="script">The reviewed script</option>
            <option value="bounded-ai">A bounded AI referrer, with the script as fallback</option>
          </select>
        </Field>
      </div>

      <div className={group}>
        <p className="font-semibold">Why this block was selected</p>
        {RATIONALE.map(([k, label, hint]) => (
          <Field key={k} label={label} hint={hint || undefined}>
            <textarea
              className={cx(input, "min-h-14 py-2")}
              value={b.rationale[k]}
              onChange={(e) => set((x) => void (x.rationale[k] = e.target.value), `r-${k}`)}
            />
          </Field>
        ))}
        <Field
          label="Exact AI-proposed phrases to review, one per line"
          hint="Anything a model suggested. A reviewer checks each one; none is approved by being here."
        >
          <textarea
            className={cx(input, "min-h-14 py-2")}
            value={b.rationale.aiPhrases.join("\n")}
            onChange={(e) =>
              set(
                (x) =>
                  void (x.rationale.aiPhrases = e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean)),
                "ai",
              )
            }
          />
        </Field>
        <Field label="Author’s decision">
          <select
            className={input}
            value={b.rationale.decision}
            onChange={(e) => set((x) => void (x.rationale.decision = e.target.value as StudioData["rationale"]["decision"]))}
          >
            <option value="">Not decided</option>
            <option value="accepted">Accepted</option>
            <option value="edited">Edited and accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
        <button type="button" className={btn} disabled title="AI drafting isn’t available in this release.">
          <Icon name="spark" className="size-4" /> Suggest a persona or objection (not available yet)
        </button>
      </div>

      <div className={group}>
        <p className="font-semibold">Scenarios</p>
        {b.scenarios.map((sc, i) => {
          const own = scenarioProblems(sc, REFERRAL_CLAIMS);
          return (
            <div key={sc.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
              <p className="font-semibold">
                {sc.persona.label}: {sc.title}{" "}
                <span className="text-sm font-normal text-ink-muted">
                  ({sc.id}@{sc.version})
                </span>
              </p>
              <p className="text-sm text-ink-muted">Stages offered: {sc.variants.map((v) => STAGES[v.stage]).join(", ")}</p>
              <p className={cx("mt-1 rounded-lg px-2 py-1 text-sm", own.length ? warnTone : okTone)}>
                {own.length ? `${own.length} thing${own.length === 1 ? "" : "s"} to fix` : "The scenario check passes, fixtures included."}
              </p>
              <div className="mt-2 space-y-1">
                <p className="text-sm font-semibold">Critical flags (a reviewer approves each threshold)</p>
                {Object.entries(sc.family.risks)
                  .filter(([, r]) => r.critical)
                  .map(([id, r]) => (
                    <div key={id} className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem]">
                      <span className="text-sm">{sc.roleplay.risks.find((x) => x.id === id)?.text ?? id}</span>
                      <input
                        className={input}
                        placeholder="Approved by"
                        aria-label={`${id}: approved by`}
                        value={r.approvedBy}
                        onChange={(e) => set((x) => void (x.scenarios[i].family.risks[id].approvedBy = e.target.value), `${sc.id}-${id}-by`)}
                      />
                      <input
                        className={input}
                        type="date"
                        aria-label={`${id}: approved on`}
                        value={r.approvedOn}
                        onChange={(e) => set((x) => void (x.scenarios[i].family.risks[id].approvedOn = e.target.value))}
                      />
                    </div>
                  ))}
              </div>
              <div className="mt-2">
                <JsonEdit
                  label="Edit the scenario (JSON)"
                  value={sc}
                  check={(v) => Boolean(v) && typeof v === "object" && !Array.isArray(v)}
                  onApply={(v) => set((x) => void (x.scenarios[i] = parseScenario(v, i)))}
                />
              </div>
              <TryLine b={b} index={i} />
            </div>
          );
        })}
        <button
          type="button"
          className={btn}
          onClick={() =>
            set((x) => {
              x.scenarios = structuredClone(LOCAL_REFERRAL_STUDIO_DATA.scenarios);
            })
          }
        >
          <Icon name="refresh" className="size-4" /> Start again from the pilot scenarios
        </button>
      </div>

      <div className={group}>
        <p className="font-semibold">Claims this block depends on</p>
        <p className="text-sm text-ink-muted">
          From the central register. Owners record their status in Admin → Local Referral Studio; a withdrawn claim blocks publishing.
        </p>
        <ul className="space-y-1 text-sm">
          {REFERRAL_CLAIMS.map((c) => (
            <li key={c.id}>
              <span className="font-semibold">{c.topic}</span> ({c.id}@{c.version}): {CLAIM_STATE_LABELS[claimState(c, today)]}. Owner: {c.owner}.
            </li>
          ))}
        </ul>
      </div>

      <div className={group}>
        <p className="font-semibold">Privacy</p>
        <Field label="Keep the words for (days)">
          <input
            className={input}
            type="number"
            min={1}
            max={365}
            value={b.privacy.retentionDays}
            onChange={(e) => set((x) => void (x.privacy.retentionDays = Math.max(1, Math.min(365, Math.round(Number(e.target.value)) || 30))))}
          />
        </Field>
        <Field label="The approved notice">
          <textarea
            className={cx(input, "min-h-20 py-2")}
            value={b.privacy.notice}
            onChange={(e) => set((x) => void (x.privacy.notice = e.target.value), "notice")}
          />
        </Field>
      </div>

      <div className={group}>
        <p className="font-semibold">Sign-off</p>
        {SIGNOFF.map(([k, label]) => (
          <Field key={k} label={label}>
            <input className={input} value={b.approval[k]} onChange={(e) => set((x) => void (x.approval[k] = e.target.value), `a-${k}`)} />
          </Field>
        ))}
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Approved on">
            <input className={input} type="date" value={b.approval.approvedOn} onChange={(e) => set((x) => void (x.approval.approvedOn = e.target.value))} />
          </Field>
          <Field label="Review by">
            <input className={input} type="date" value={b.approval.reviewBy} onChange={(e) => set((x) => void (x.approval.reviewBy = e.target.value))} />
          </Field>
        </div>
        <button type="button" className={btn} onClick={() => set((x) => void (x.approval.scenarioReviewed = reviewedVersions(x)))}>
          Record that the reviewers looked at {reviewedVersions(b) || "these scenarios"}
        </button>
        {b.approval.scenarioReviewed && b.approval.scenarioReviewed !== reviewedVersions(b) && (
          <p className={cx("rounded-lg px-2 py-1 text-sm", warnTone)}>
            The reviewers looked at {b.approval.scenarioReviewed}; the scenarios have changed since.
          </p>
        )}
      </div>

      <div className={cx("rounded-2xl p-3", problems.length || hard.length ? warnTone : okTone)}>
        <p className="font-semibold">{problems.length || hard.length ? "Before it can be published" : "Ready to publish"}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
          {[...problems, ...hard].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Plays one reply through a scenario on the reviewed script: what the referrer says, and what's flagged. Nothing is stored. */
function TryLine({ b, index }: { b: ReferralStudioBlock; index: number }) {
  const sc = b.scenarios[index];
  const [stage, setStage] = useState<Stage>(sc.variants[0]?.stage ?? "unknown");
  const [text, setText] = useState("");
  const [out, setOut] = useState<{ reply: string; flags: string[] } | null>(null);
  const run = () => {
    const st = startStudio(sc, stage, REFERRAL_CLAIMS, { cues: false });
    const r = studioTurn(sc, REFERRAL_CLAIMS, st, { text, mode: "text" });
    const risks = r.out.eval.risks.map((t) => `${sc.roleplay.risks.find((x) => x.id === t.id)?.text ?? t.id}${t.hedged ? " (hedged: to review)" : ""}`);
    const claims = r.state.claims.map((c) => `Unapproved claim: ${REFERRAL_CLAIMS.find((x) => x.id === c.claim)?.topic ?? c.claim}`);
    const moves = r.out.eval.moves.map((t) => `Shows: ${sc.roleplay.moves.find((x) => x.id === t.id)?.text ?? t.id}`);
    setOut({ reply: r.out.authored, flags: [...claims, ...risks, ...moves] });
  };
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-semibold">Test a line</summary>
      <div className="mt-2 flex flex-col gap-2">
        <select className={input} value={stage} onChange={(e) => setStage(e.target.value as Stage)} aria-label="Stage">
          {sc.variants.map((v) => (
            <option key={v.stage} value={v.stage}>
              {STAGES[v.stage]}
            </option>
          ))}
        </select>
        <textarea
          className={cx(input, "min-h-16 py-2")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Try an unsafe line: “We offer same-day care.”"
          aria-label="A line to test"
        />
        <button type="button" className={btn} disabled={text.trim().length < 2} onClick={run}>
          Play it
        </button>
        {out && (
          <div className="rounded-xl bg-surface p-3 text-sm ring-1 ring-line">
            <p>
              <span className="font-semibold">{sc.persona.label}:</span> {out.reply}
            </p>
            <ul className="mt-1 list-disc pl-5">{out.flags.length ? out.flags.map((f) => <li key={f}>{f}</li>) : <li>Nothing flagged or shown.</li>}</ul>
          </div>
        )}
      </div>
    </details>
  );
}
