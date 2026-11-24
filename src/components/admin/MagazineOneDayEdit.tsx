"use client";

import { useState } from "react";
import { cx } from "@/lib/format";
import type { OneDayBlock } from "@/lib/magazine";
import { bestPath, caseProblems, dayApproved, knowledgePreview, LANE_ORDER, LANES, PATTERNS, replay, type DayEvent, type OneDayData } from "@/lib/oneDay";
import { ONE_DAY_CASES } from "@/content/oneDayCases";
import { btn, Field, input } from "./ui";
import type { Update } from "./MagazineEditParts";
import { Icon } from "../Icon";

/*
  The editor for a One Day, Five Perspectives map (docs/one-day-five-perspectives.md). The frame (title, threads,
  sign-off) has plain fields; each event, and the cast, facts and honest statuses, have an advanced JSON edit, because a
  day's knowledge graph is easier to inspect as text than as a hundred small inputs. The knowledge preview shows what
  Leila and everyone else know at each event on the strongest path, and the branch test lists every impossible reveal
  or contradiction. Nothing here is generated. Use Preview to play the day as a learner.
*/

const group = "flex flex-col gap-3 rounded-2xl bg-muted p-3";
const area = cx(input, "min-h-20 py-2");
const SIGNOFF: [keyof OneDayData["approval"], string][] = [
  ["owner", "Owner (Partner Enablement)"],
  ["story", "Character and story editor"],
  ["operations", "Operations (day plausibility and handoffs)"],
  ["quality", "Quality / clinical (risk and participant choice)"],
  ["billing", "Billing / Finance (the rate example)"],
  ["supplier", "Supplier onboarding (approval language)"],
  ["privacy", "Privacy (role disclosure)"],
];

export function OneDayEdit({ block: b, update }: { block: OneDayBlock; update: Update }) {
  const set = (fn: (x: OneDayBlock) => void, tag?: string) => update<OneDayBlock>(b.id, fn, tag && `${b.id}:${tag}`);
  const problems = caseProblems(b);
  const signed = dayApproved(b);
  const ordered = [...b.events].sort((x, y) => x.time.localeCompare(y.time));
  /** Moving an event earlier or later swaps its time with its neighbour's: the day runs in time order. */
  const move = (id: string, by: -1 | 1) =>
    set((x) => {
      const o = [...x.events].sort((p, q) => p.time.localeCompare(q.time));
      const i = o.findIndex((e) => e.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= o.length) return;
      const [a, c] = [x.events.find((e) => e.id === o[i].id)!, x.events.find((e) => e.id === o[j].id)!];
      [a.time, c.time] = [c.time, a.time];
    });
  return (
    <div className="w-full rounded-3xl border border-line-strong bg-surface p-5 shadow-sm sm:p-7">
      <p className="mb-2 flex items-center gap-2 font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">
        <Icon name="timeline" className="size-5" /> One Day, Five Perspectives
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
          ? `The branch test finds ${problems.length} ${problems.length === 1 ? "problem" : "problems"} (below). It can’t be published until it passes.`
          : signed
            ? "The branch test passes and the sign-off is recorded: this map can be published."
            : "A draft: the branch test passes, but it can’t be published until every reviewer’s sign-off is recorded below."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Start from a case">
          <select
            className={input}
            value=""
            onChange={(e) => {
              const c = ONE_DAY_CASES.find((x) => x.id === e.target.value);
              if (c && window.confirm(`Replace this map with “${c.label}”? What’s written here now is replaced.`))
                set((x) => void Object.assign(x, structuredClone(c.data)));
            }}
          >
            <option value="">Choose…</option>
            {ONE_DAY_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input className={input} value={b.title} maxLength={120} onChange={(e) => set((x) => void (x.title = e.target.value), "title")} />
        </Field>
        <Field label="Introduction" className="sm:col-span-2">
          <textarea className={area} value={b.intro} maxLength={600} onChange={(e) => set((x) => void (x.intro = e.target.value), "intro")} />
        </Field>
        <Field label="The day" hint="Shown under the title, e.g. Monday, 8:30 am to 5:00 pm.">
          <input className={input} value={b.day} maxLength={120} onChange={(e) => set((x) => void (x.day = e.target.value), "day")} />
        </Field>
        <Field label="Scenario version" hint="Change it whenever an event or rule changes, so earlier attempts stay interpretable.">
          <input className={input} value={b.version} maxLength={40} onChange={(e) => set((x) => void (x.version = e.target.value), "version")} />
        </Field>
        <Field label="The coordinator" hint="The person whose decisions the learner makes.">
          <select className={input} value={b.coordinator} onChange={(e) => set((x) => void (x.coordinator = e.target.value))}>
            {b.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Client threads</h4>
        {b.threads.map((t, i) => (
          <div key={t.id} className="grid gap-2 sm:grid-cols-[10rem_1fr_8rem]">
            <Field label={`Name (${t.id})`}>
              <input className={input} value={t.name} onChange={(e) => set((x) => void (x.threads[i].name = e.target.value), `th-${t.id}`)} />
            </Field>
            <Field label="Goal">
              <input className={input} value={t.goal} onChange={(e) => set((x) => void (x.threads[i].goal = e.target.value), `tg-${t.id}`)} />
            </Field>
            <Field label="Pattern">
              <select
                className={input}
                value={t.pattern}
                onChange={(e) => set((x) => void (x.threads[i].pattern = e.target.value as (typeof PATTERNS)[number]))}
              >
                {PATTERNS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
        ))}
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Cast, facts and honest statuses (advanced)</h4>
        <p className="text-sm text-ink-muted">
          Each person has a lane ({LANE_ORDER.map((l) => LANES[l]).join(", ")}). Each fact says who knows it when the day starts (holders), what kind of claim
          it is, and whether it’s private. Truths say which end-of-day statuses are honest for each thread, given where its state ended up.
        </p>
        <JsonEdit
          label="Cast"
          value={b.actors}
          onApply={(v) => set((x) => void (x.actors = v as OneDayData["actors"]))}
          check={(v) => Array.isArray(v) && v.every((a) => a && typeof a.id === "string" && typeof a.name === "string")}
        />
        <JsonEdit
          label="Facts"
          value={b.facts}
          onApply={(v) => set((x) => void (x.facts = v as OneDayData["facts"]))}
          check={(v) => Array.isArray(v) && v.every((f) => f && typeof f.id === "string" && Array.isArray(f.holders))}
        />
        <JsonEdit
          label="State at the start of the day"
          value={b.start}
          onApply={(v) => set((x) => void (x.start = v as OneDayData["start"]))}
          check={(v) => !!v && typeof v === "object" && !Array.isArray(v)}
        />
        <JsonEdit
          label="Honest end-of-day statuses"
          value={b.truths}
          onApply={(v) => set((x) => void (x.truths = v as OneDayData["truths"]))}
          check={(v) => Array.isArray(v)}
        />
        <JsonEdit
          label="Practise next (links)"
          value={b.links}
          onApply={(v) => set((x) => void (x.links = v as OneDayData["links"]))}
          check={(v) => Array.isArray(v)}
        />
      </section>

      <section className={cx(group, "mt-4")}>
        <h4 className="font-semibold">Events, in time order</h4>
        <ol className="flex flex-col gap-2">
          {ordered.map((e, i) => (
            <li key={e.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
              <div className="grid gap-2 sm:grid-cols-[6rem_1fr_11rem]">
                <Field label="Time">
                  <input
                    className={input}
                    value={e.time}
                    maxLength={5}
                    onChange={(ev) => set((x) => void (x.events.find((y) => y.id === e.id)!.time = ev.target.value), `et-${e.id}`)}
                  />
                </Field>
                <Field label={`Title (${e.id})`}>
                  <input
                    className={input}
                    value={e.title}
                    onChange={(ev) => set((x) => void (x.events.find((y) => y.id === e.id)!.title = ev.target.value), `en-${e.id}`)}
                  />
                </Field>
                <Field label="Lane">
                  <select
                    className={input}
                    value={e.lane}
                    onChange={(ev) => set((x) => void (x.events.find((y) => y.id === e.id)!.lane = ev.target.value as DayEvent["lane"]))}
                  >
                    {LANE_ORDER.map((l) => (
                      <option key={l} value={l}>
                        {LANES[l]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {e.thread ? `Thread: ${b.threads.find((t) => t.id === e.thread)?.name ?? e.thread}. ` : ""}
                {e.lenses.length} perspective{e.lenses.length === 1 ? "" : "s"}.{" "}
                {e.decision ? `${e.decision.options.length} options.` : e.closing ? "Close of day." : "No decision."}
                {e.when ? ` Only in the day when ${e.when.key} is ${e.when.is.join(" or ")}.` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className={btn.quiet} disabled={i === 0} onClick={() => move(e.id, -1)}>
                  <Icon name="arrow-up" className="size-4" /> Earlier
                </button>
                <button type="button" className={btn.quiet} disabled={i === ordered.length - 1} onClick={() => move(e.id, 1)}>
                  <Icon name="arrow-down" className="size-4" /> Later
                </button>
                <button
                  type="button"
                  className={btn.quiet}
                  onClick={() => window.confirm(`Remove “${e.title}” from the day?`) && set((x) => void (x.events = x.events.filter((y) => y.id !== e.id)))}
                >
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              </div>
              <JsonEdit
                label="Advanced: the whole event"
                value={e}
                onApply={(v) => set((x) => void (x.events = x.events.map((y) => (y.id === e.id ? (v as DayEvent) : y))))}
                check={(v) => !!v && typeof v === "object" && typeof (v as DayEvent).id === "string" && Array.isArray((v as DayEvent).lenses)}
              />
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={cx(btn.secondary, "self-start")}
          onClick={() =>
            set((x) => {
              const id = `e-${Math.random().toString(36).slice(2, 7)}`;
              x.events.push({
                id,
                time: "12:00",
                title: "A new event",
                lane: "coordinator",
                kind: "scheduled",
                artefact: { kind: "note", from: "", body: "" },
                lenses: [],
                decision: {
                  prompt: "What does the coordinator do?",
                  options: [
                    { id: "a", text: "", feedback: "", effect: {} },
                    { id: "b", text: "", feedback: "", effect: {} },
                  ],
                },
              });
            })
          }
        >
          <Icon name="plus" className="size-5" /> Add an event
        </button>
      </section>

      <BranchTest b={b} problems={problems} />
      <KnowledgePreview b={b} problems={problems} />

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

/** A JSON text edit, applied only when it parses and passes a basic shape check. The branch test then checks the rest. */
function JsonEdit({ label, value, onApply, check }: { label: string; value: unknown; onApply: (v: unknown) => void; check: (v: unknown) => boolean }) {
  const text = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <details className="mt-2">
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

function BranchTest({ b, problems }: { b: OneDayBlock; problems: string[] }) {
  const best = problems.length ? null : bestPath(b);
  const s = best ? replay(b, best) : null;
  return (
    <section className={cx(group, "mt-4")} aria-label="Branch test">
      <h4 className="font-semibold">Branch test</h4>
      {problems.length ? (
        <ul className="list-disc pl-5 text-sm">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <>
          <p className="text-sm">
            Passes: every reveal is possible, every lens fact belongs to the person playing it, every needed fact can be told, and the strongest path reaches
            the end of the day without a critical flag.
          </p>
          {s && (
            <ol className="list-decimal pl-5 text-sm">
              {s.arrived.map(({ event: e, option }) => (
                <li key={e.id}>
                  <strong>{e.time}</strong> {e.title}
                  {option ? `: ${option.text}` : e.closing ? ": honest statuses given" : ""}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function KnowledgePreview({ b, problems }: { b: OneDayBlock; problems: string[] }) {
  if (problems.length) return null;
  const rows = knowledgePreview(b);
  return (
    <details className={cx(group, "mt-4")}>
      <summary className="cursor-pointer font-semibold">Knowledge preview: what the coordinator knows at each event, and what’s hidden from her</summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <thead>
            <tr className="border-b border-line-strong align-bottom">
              <th className="py-1 pr-2">Event</th>
              <th className="py-1 pr-2">Known to the coordinator</th>
              <th className="py-1">Hidden on this thread (who knows)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.event} className="border-b border-line align-top">
                <th className="py-1.5 pr-2">
                  {r.time} {r.title}
                </th>
                <td className="py-1.5 pr-2">
                  <ul className="list-disc pl-4">
                    {r.leila.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </td>
                <td className="py-1.5">
                  <ul className="list-disc pl-4">
                    {r.hidden.map((h) => (
                      <li key={h.text}>
                        {h.text} <span className="text-ink-muted">({h.who})</span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
