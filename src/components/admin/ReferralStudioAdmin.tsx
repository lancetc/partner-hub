"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { CLAIM_STATUSES } from "@/lib/referralStudio";
import type { studioAdmin } from "@/server/referralStudio";
import { AdminShell, btn, ErrorNote } from "./ui";

/*
  The Local Referral Studio for authors and content owners (docs/local-referral-studio.md): the central claim register
  (owners record each claim's status here, audited), the kit template's approval, and the three measurement layers kept
  apart: practice, approved material use, and the referral pathway (not connected). Aggregates only, with their
  denominators; nothing under five people; no learner's words, no partner's drafts or notes, and no ranking.
*/

type Report = ReturnType<typeof studioAdmin>;
const box = "rounded-2xl border border-line bg-surface p-4";
const input = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3";
const th = "py-1.5 pr-3 text-left font-semibold";
const td = "py-1.5 pr-3 align-top";

export function ReferralStudioAdmin() {
  const { data, error, reload } = useApi<Report>("/api/admin/referral-studio");
  return (
    <AdminShell title="Local Referral Studio">
      <p className="max-w-3xl text-ink-muted">
        The claim register, the outreach template’s approval, and three measures that are never added together: practice, approved material use and the referral
        pathway. A practice score is a learning aid, a download isn’t a sent email, and neither is a referral.
      </p>
      <p className="mt-2">
        <a className={btn.secondary} href="/api/admin/referral-studio?export=1">
          Download the Excel export
        </a>
      </p>
      {error && <ErrorNote text={error} />}
      {!data ? <p className="mt-4 text-ink-muted">Loading…</p> : <Body r={data} reload={reload} />}
    </AdminShell>
  );
}

function Body({ r, reload }: { r: Report; reload: () => void }) {
  return (
    <div className="mt-4 flex flex-col gap-6">
      <section className={box} aria-labelledby="reg-h">
        <h2 id="reg-h" className="font-serif text-xl font-semibold">
          Claim register
        </h2>
        <p className="text-sm text-ink-muted">
          A claim with no current approved version can’t go into an approved export. Withdrawing one marks every saved asset that used it for review.
        </p>
        <ul className="mt-3 flex flex-col gap-3">
          {r.register.map((c) => (
            <ClaimRow key={c.id} c={c} reload={reload} />
          ))}
        </ul>
      </section>

      <section className={box} aria-labelledby="tpl-h">
        <h2 id="tpl-h" className="font-serif text-xl font-semibold">
          Outreach template {r.template.id} {r.template.version}
        </h2>
        <p className={cx("mt-1 rounded-lg px-2 py-1 text-sm", r.template.approved ? "bg-[#e3f4ea] text-[#0f5b3a]" : "bg-[#fff1cc] text-[#4a3400]")}>
          {r.template.approved ? "Approved: kits can be exported as approved." : "Draft: every kit is marked “Draft — review required”."}
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {[...r.template.blocked, ...r.template.reasons].map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm">Depends on: {r.template.dependsOn.join(", ")}</p>
        <TemplateForm t={r.template} reload={reload} />
      </section>

      <section className={box} aria-labelledby="prac-h">
        <h2 id="prac-h" className="font-serif text-xl font-semibold">
          Layer 1: practice
        </h2>
        {(["tool", "magazine"] as const).map((k) => (
          <div key={k} className="mt-3 overflow-x-auto">
            <h3 className="font-semibold">{k === "tool" ? "Work Tool" : "Magazine blocks"}</h3>
            {!r.practice[k].length ? (
              <p className="text-sm text-ink-muted">No practice yet.</p>
            ) : (
              <table className="mt-1 w-full min-w-[32rem] text-sm">
                <thead>
                  <tr>
                    <th className={th}>Scenario</th>
                    <th className={th}>Attempts</th>
                    <th className={th}>People</th>
                    <th className={th}>Critical flag on first attempt</th>
                    <th className={th}>Dimensions (first attempt, mean of 3)</th>
                  </tr>
                </thead>
                <tbody>
                  {r.practice[k].map((p) => (
                    <tr key={p.scenario} className="border-t border-line">
                      <td className={td}>{p.scenario}</td>
                      <td className={td}>{p.started}</td>
                      <td className={td}>{p.people}</td>
                      <td className={td}>{p.criticalFirst ? `${p.criticalFirst.numerator} of ${p.criticalFirst.denominator}` : "Fewer than 5 people"}</td>
                      <td className={td}>{p.dims ? p.dims.map((d) => `${d.label} ${d.first ?? "–"}`).join("; ") : "Fewer than 5 people"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        <h3 className="mt-4 font-semibold">Objections practised, by referrer and month</h3>
        {!r.practice.heatmap.length ? (
          <p className="text-sm text-ink-muted">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-1 w-full min-w-[28rem] text-sm">
              <thead>
                <tr>
                  <th className={th}>Month</th>
                  <th className={th}>Referrer</th>
                  <th className={th}>Theme</th>
                  <th className={th}>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {r.practice.heatmap.map((c) => (
                  <tr key={`${c.month}-${c.persona}-${c.theme}`} className="border-t border-line">
                    <td className={td}>{c.month}</td>
                    <td className={td}>{c.persona}</td>
                    <td className={td}>{c.theme}</td>
                    <td className={td}>{c.small ? "Fewer than 5 people" : c.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={box} aria-labelledby="mat-h">
        <h2 id="mat-h" className="font-serif text-xl font-semibold">
          Layer 2: approved material use
        </h2>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          {[
            ["Assets generated", r.material.generated],
            ["Approved when generated", `${r.material.approvedAtGeneration} of ${r.material.generated}`],
            ["Printed or saved as PDF", `${r.material.downloaded} of ${r.material.generated}`],
            ["An email draft copied", `${r.material.copied} of ${r.material.generated}`],
            ["Pitch cards saved", r.material.cardsSaved],
            ["Relationship notes", r.material.activityNotes],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl bg-muted p-3">
              <dt className="text-ink-muted">{k}</dt>
              <dd className="text-lg font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-sm text-ink-muted">
          Use, not sending: the Hub never sends outreach, and a download isn’t evidence anyone received or endorsed it.
        </p>
      </section>

      <section className={box} aria-labelledby="path-h">
        <h2 id="path-h" className="font-serif text-xl font-semibold">
          Layer 3: referral pathway
        </h2>
        <p className="mt-1">{r.pathway.note}</p>
        <p className="mt-1 text-sm text-ink-muted">Kept distinct: {r.pathway.statuses.join(", ")}.</p>
      </section>

      <section className={box} aria-labelledby="blocks-h">
        <h2 id="blocks-h" className="font-serif text-xl font-semibold">
          Published blocks and why they were selected
        </h2>
        {!r.blocks.length ? (
          <p className="text-sm text-ink-muted">None published yet. Drafts are in the Magazine editor.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {r.blocks.map((b) => (
              <li key={`${b.guideId}:${b.blockId}`} className="rounded-xl bg-muted p-3 text-sm">
                <p className="font-semibold">
                  {b.guide}: {b.title}
                </p>
                <p>Scenarios: {b.scenarios}</p>
                <p>Evidence: {b.rationale.evidence || "Not recorded"}</p>
                <p>
                  Decision: {b.rationale.decision || "Not decided"}. Measure: {b.rationale.measure || "Not set"}
                </p>
                <p>
                  Reviewers: {b.reviewers.join("; ") || "Not signed off"}. Review by {b.reviewBy || "not set"}.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ClaimRow({ c, reload }: { c: Report["register"][number]; reload: () => void }) {
  const [f, setF] = useState({ status: c.status, approvedBy: c.approvedBy, approvedOn: c.approvedOn, effectiveFrom: c.effectiveFrom, reviewBy: c.reviewBy });
  const [msg, setMsg] = useState("");
  const save = async () => {
    setMsg("");
    try {
      await api("/api/admin/referral-studio", { body: { action: "claim", claimId: c.id, ...f } });
      setMsg("Saved and audited.");
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "That didn’t save.");
    }
  };
  return (
    <li className="rounded-xl bg-muted p-3">
      <p className="font-semibold">
        {c.topic}{" "}
        <span className="text-sm font-normal text-ink-muted">
          ({c.id}@{c.version} · {c.stateLabel})
        </span>
      </p>
      <p className="mt-1 text-sm">{c.wording}</p>
      {c.qualifiers && <p className="text-sm text-ink-muted">{c.qualifiers}</p>}
      {c.note && <p className="text-sm">Use: {c.note}</p>}
      <p className="mt-1 text-sm">
        <span className="font-semibold">Never:</span> {c.doNot}
      </p>
      <p className="text-sm">
        Owner: {c.owner}. Source:{" "}
        {c.evidence.url ? (
          <a className="underline" href={c.evidence.url}>
            {c.evidence.title}
          </a>
        ) : (
          c.evidence.title
        )}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-5">
        <select
          className={input}
          aria-label={`${c.topic}: status`}
          value={f.status}
          onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })}
        >
          {CLAIM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          className={input}
          aria-label={`${c.topic}: approved by`}
          placeholder="Approved by"
          value={f.approvedBy}
          onChange={(e) => setF({ ...f, approvedBy: e.target.value })}
        />
        <input
          className={input}
          type="date"
          aria-label={`${c.topic}: approved on`}
          value={f.approvedOn}
          onChange={(e) => setF({ ...f, approvedOn: e.target.value })}
        />
        <input
          className={input}
          type="date"
          aria-label={`${c.topic}: effective from`}
          value={f.effectiveFrom}
          onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })}
        />
        <input
          className={input}
          type="date"
          aria-label={`${c.topic}: review by`}
          value={f.reviewBy}
          onChange={(e) => setF({ ...f, reviewBy: e.target.value })}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={btn.secondary} onClick={() => void save()}>
          Record this status
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </li>
  );
}

function TemplateForm({ t, reload }: { t: Report["template"]; reload: () => void }) {
  const [f, setF] = useState({ status: t.status as string, ...t.approval });
  const [msg, setMsg] = useState("");
  const keys = [
    ["brand", "Brand and marketing"],
    ["partnerships", "Partnerships"],
    ["pathway", "Referral pathway owner"],
    ["quality", "Quality and clinical governance"],
    ["privacy", "Privacy"],
  ] as const;
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer font-semibold">Record the template’s approval</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select className={input} aria-label="Template status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          {["draft", "approved", "withdrawn"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {keys.map(([k, label]) => (
          <input key={k} className={input} aria-label={label} placeholder={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        ))}
        <input className={input} type="date" aria-label="Approved on" value={f.approvedOn} onChange={(e) => setF({ ...f, approvedOn: e.target.value })} />
        <input className={input} type="date" aria-label="Review by" value={f.reviewBy} onChange={(e) => setF({ ...f, reviewBy: e.target.value })} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btn.secondary}
          onClick={() =>
            void api("/api/admin/referral-studio", { body: { action: "template", ...f } }).then(
              () => (setMsg("Saved and audited."), reload()),
              (e: Error) => setMsg(e.message),
            )
          }
        >
          Record
        </button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </details>
  );
}
