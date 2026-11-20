"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { StoryReport } from "@/server/storyReport";
import { box, dateText, Section, Tile } from "../problems/problemUi";
import { AdminShell, Badge, ErrorNote, Field, input } from "../ui";

/*
  The story report (docs/story-plans.md, step 6). Reach and engagement by character, episode and moment; the
  learning evidence from the decisions those moments sit with; the work measure the plan answers to; and a short
  list of things for an editor to look at. The three kinds of figure are kept in their own sections, because one
  is not evidence for another. Counts of people only.
*/

const th = "py-1.5 pr-3 font-medium";
const num = "py-1.5 pr-3 text-right tabular-nums";

function Thin({ on, n }: { on: boolean; n: number }) {
  return on ? (
    <span title={`Fewer than ${n} learners: too few to read anything from`} className="ml-1 text-xs text-ink-muted">
      (few)
    </span>
  ) : null;
}

export function StoryReportView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = new URLSearchParams({ view: "report", ...(from && { from }), ...(to && { to }) });
  const { data: r, error } = useApi<StoryReport>(`/api/admin/story?${q}`);
  const back = { href: "/admin/characters", label: "Characters and stories" };
  if (error)
    return (
      <AdminShell title="Story report" back={back}>
        <ErrorNote text={error} />
      </AdminShell>
    );
  if (!r)
    return (
      <AdminShell title="Story report" back={back}>
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const dx = r.diagnostics;
  const nothing =
    !dx.recommended.length &&
    !dx.unanswered.length &&
    !dx.brokenLinks.length &&
    !dx.lostPlaces.length &&
    !dx.behind.length &&
    !dx.openWarnings.length &&
    !dx.unpractised.length;
  const seen = r.characters.filter((c) => c.exposed || c.placed || c.appearances);

  return (
    <AdminShell title="Story report" back={back}>
      <p className="max-w-3xl text-ink-muted">
        Who met the Hub’s recurring people, and what they did with a check-in or a transmission. Beside it, and kept apart: what learners did in the decisions
        those moments sit with, and the work measure each plan answers to. Liking a character is engagement. It isn’t evidence that anyone can make the
        decision, or that a work measure moved.
      </p>
      <div className={cx(box, "mt-4 grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end")}>
        <Field label="From">
          <input type="date" className={input} value={from || r.range.from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={input} value={to || r.range.to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <p className="text-sm text-ink-muted" role="status">
          {dateText(r.range.from)} to {dateText(r.range.to)}. A figure marked “few” rests on fewer than {r.thinSample} learners.
        </p>
      </div>

      <Section
        title="Reach and engagement"
        hint="Learners reached are people who were shown a moment, started a transmission or opened a check-in in these dates. None of this is a learning result."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label="Learners reached" value={r.totals.exposed} detail="By any story moment" />
          <Tile label="Moments placed" value={r.totals.placements} detail="In Topics and Magazine courses, now" />
          <Tile label="Story events" value={r.totals.events} detail="Shown, opened, played, skipped" />
        </div>
        <div className={cx(box, "mt-3 overflow-x-auto")}>
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Reach and engagement by character</caption>
            <thead className="text-ink-muted">
              <tr>
                <th scope="col" className={th}>
                  Character
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Learners reached
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Check-ins opened
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Questions chosen
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  History opened
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Links followed
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Audio played
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Placed now
                </th>
              </tr>
            </thead>
            <tbody>
              {seen.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 font-medium">
                    <Link href={`/admin/characters/${c.id}`} className="underline underline-offset-2">
                      {c.name}
                    </Link>
                    {!c.approved && <span className="ml-1 text-xs font-normal text-ink-muted">(no approved profile)</span>}
                  </th>
                  <td className={num}>
                    {c.exposed}
                    <Thin on={c.thin} n={r.thinSample} />
                  </td>
                  <td className={num}>
                    {c.checkInOpens}
                    {c.checkInPeople > 0 && <span className="text-ink-muted"> by {c.checkInPeople}</span>}
                  </td>
                  <td className={num}>{c.questions}</td>
                  <td className={num}>{c.historyOpens}</td>
                  <td className={num}>{c.linksFollowed}</td>
                  <td className={num}>{c.audioPlays}</td>
                  <td className={num}>{c.placed}</td>
                </tr>
              ))}
              {!seen.length && (
                <tr>
                  <td colSpan={8} className="py-2 text-ink-muted">
                    No character has a placed moment or an appearance yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className={cx(box, "mt-3 overflow-x-auto")}>
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="pb-2 text-left font-semibold">By approved episode</caption>
            <thead className="text-ink-muted">
              <tr>
                <th scope="col" className={th}>
                  Episode
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Moments
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Learners reached
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Check-ins opened
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  History opened
                </th>
              </tr>
            </thead>
            <tbody>
              {r.episodes.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-3 font-medium">
                    {e.title}
                    {e.whenLabel && <span className="font-normal text-ink-muted"> · {e.whenLabel}</span>}
                  </th>
                  <td className={num}>{e.moments}</td>
                  <td className={num}>
                    {e.exposed}
                    <Thin on={e.thin} n={r.thinSample} />
                  </td>
                  <td className={num}>{e.checkInOpens}</td>
                  <td className={num}>{e.historyOpens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={cx(box, "mt-3 overflow-x-auto")}>
          <table className="w-full min-w-[48rem] text-left text-sm">
            <caption className="pb-2 text-left font-semibold">By moment and approved version</caption>
            <thead className="text-ink-muted">
              <tr>
                <th scope="col" className={th}>
                  Moment
                </th>
                <th scope="col" className={th}>
                  Version
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Learners reached
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Check-ins opened
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Questions chosen
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Started
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Played to the end
                </th>
                <th scope="col" className={cx(th, "text-right")}>
                  Skipped
                </th>
              </tr>
            </thead>
            <tbody>
              {r.moments.map((m) => (
                <tr key={`${m.id}:${m.revision}`} className="border-t border-line align-top">
                  <th scope="row" className="py-1.5 pr-3 font-medium">
                    <Link href={`/admin/characters/moments/${m.id}`} className="underline underline-offset-2">
                      {m.title}
                    </Link>
                    <span className="block text-xs font-normal text-ink-muted">
                      {m.kind} · {m.speaker}
                      {m.episode && ` · ${m.episode}`}
                    </span>
                    {m.places.map((p) => (
                      <span key={p} className="block text-xs font-normal text-ink-muted">
                        {p}
                      </span>
                    ))}
                  </th>
                  <td className="py-1.5 pr-3">
                    {m.revision} {m.current ? <Badge tone="good">Current</Badge> : <Badge tone="warn">Earlier</Badge>}
                  </td>
                  <td className={num}>
                    {m.exposed}
                    <Thin on={m.thin} n={r.thinSample} />
                  </td>
                  <td className={num}>{m.checkInOpens}</td>
                  <td className={num}>{m.questions}</td>
                  <td className={num}>{m.started}</td>
                  <td className={num}>{m.ended}</td>
                  <td className={num}>{m.skipped}</td>
                </tr>
              ))}
              {!r.moments.length && (
                <tr>
                  <td colSpan={8} className="py-2 text-ink-muted">
                    No moment has been placed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Learning evidence"
        hint="The decisions on the Magazine pages those moments sit on, as the course scored them. Every learner who answered, whether or not they opened a check-in. Watching or skipping a moment is never an attempt."
      >
        {!r.learning.decisions.length ? (
          <p className={cx(box, "text-sm text-ink-muted")}>No placed moment sits on a published Magazine page with a decision question.</p>
        ) : (
          <div className={cx(box, "overflow-x-auto")}>
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">First answers to decisions on pages with a story moment</caption>
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className={th}>
                    Decision
                  </th>
                  <th scope="col" className={cx(th, "text-right")}>
                    Learners who answered
                  </th>
                  <th scope="col" className={cx(th, "text-right")}>
                    First answer: best
                  </th>
                  <th scope="col" className={cx(th, "text-right")}>
                    Acceptable
                  </th>
                  <th scope="col" className={cx(th, "text-right")}>
                    Risky
                  </th>
                  <th scope="col" className={cx(th, "text-right")}>
                    Tried again
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.learning.decisions.map((d, i) => (
                  <tr key={i} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-3 font-medium">
                      {d.prompt}
                      <span className="block text-xs font-normal text-ink-muted">
                        {d.course} · {d.page}
                      </span>
                    </th>
                    <td className={num}>
                      {d.answered}
                      <Thin on={d.thin} n={r.thinSample} />
                    </td>
                    <td className={num}>{d.first.best}</td>
                    <td className={num}>{d.first.acceptable}</td>
                    <td className={num}>{d.first.risky}</td>
                    <td className={num}>{d.retried}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r.learning.topicPlacements > 0 && (
          <p className="mt-2 text-sm text-ink-muted">
            {r.learning.topicPlacements} {r.learning.topicPlacements === 1 ? "moment is" : "moments are"} placed in Topics. A Topic’s own answers and
            completions are in Completions.
          </p>
        )}
      </Section>

      <Section
        title="Work results"
        hint="Each plan that began on the Problem desk, with that theme’s own measure. The figures and their trend live on the theme, with their denominators."
      >
        {!r.work.length ? (
          <p className={cx(box, "text-sm text-ink-muted")}>
            No story plan was started from a Problem desk theme, so there is no work measure to show beside it.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {r.work.map((w) => (
              <li key={w.planId} className={cx(box, "flex flex-col gap-1 text-sm")}>
                <p>
                  <Link href={`/admin/characters/plans/${w.planId}`} className="font-semibold underline underline-offset-2">
                    {w.plan}
                  </Link>
                  <span className="text-ink-muted"> answers to </span>
                  <Link href={`/admin/problems/${w.themeId}`} className="font-semibold underline underline-offset-2">
                    {w.theme}
                  </Link>
                  {w.course && <span className="text-ink-muted"> · course: {w.course.title}</span>}
                </p>
                {w.desired && (
                  <p>
                    <span className="text-ink-muted">Intended behaviour: </span>
                    {w.desired}
                  </p>
                )}
                <p>
                  <span className="text-ink-muted">Work measure: </span>
                  {w.measure || "Not chosen yet"}
                  {w.definition && <span className="text-ink-muted"> · {w.definition}</span>}
                </p>
                <p className="text-ink-muted">
                  {[w.owner && `Owner: ${w.owner}`, w.lag && `Expected lag: ${w.lag}`, w.reviewOn && `Review on ${dateText(w.reviewOn)}`]
                    .filter(Boolean)
                    .join(" · ") || "No owner, lag or review date recorded yet."}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Things to look at" hint="For revising a sequence or retiring a check-in. Not a score.">
        {nothing ? (
          <p className={cx(box, "text-sm text-ink-muted")}>Nothing stands out.</p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {dx.brokenLinks.length > 0 && (
              <li className={box}>
                <p className="font-semibold">Story links learners can’t open</p>
                <ul className="mt-1 list-disc pl-5">
                  {dx.brokenLinks.map((b, i) => (
                    <li key={i}>
                      {b.character}: {b.label} ({b.format}). It’s left out of their history until it’s published again or the appearance is removed.
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {dx.lostPlaces.length > 0 && (
              <li className={box}>
                <p className="font-semibold">Moments placed somewhere that has gone</p>
                <ul className="mt-1 list-disc pl-5">
                  {dx.lostPlaces.map((b, i) => (
                    <li key={i}>
                      {b.moment}: {b.where}
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {dx.behind.length > 0 && (
              <li className={box}>
                <p className="font-semibold">Placements still showing an earlier version</p>
                <ul className="mt-1 list-disc pl-5">
                  {dx.behind.map((b, i) => (
                    <li key={i}>
                      {b.moment}, version {b.revision}: {b.where}. Update it from the moment’s page when the new wording should go out.
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {dx.openWarnings.length > 0 && (
              <li className={box}>
                <p className="font-semibold">Plans with unanswered continuity warnings and a course under way</p>
                <ul className="mt-1 list-disc pl-5">
                  {dx.openWarnings.map((p) => (
                    <li key={p.id}>
                      <Link href={`/admin/characters/plans/${p.id}`} className="underline underline-offset-2">
                        {p.title}
                      </Link>
                      : {p.warnings} open, course “{p.course}”.
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {dx.unpractised.length > 0 && (
              <li className={box}>
                <p className="font-semibold">Plans that promise a decision and give no practice at it</p>
                <ul className="mt-1 list-disc pl-5">
                  {dx.unpractised.map((p) => (
                    <li key={p.id}>
                      <Link href={`/admin/characters/plans/${p.id}`} className="underline underline-offset-2">
                        {p.title}
                      </Link>
                      : its choice beat is explanation only.
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {dx.recommended.length > 0 && (
              <li className={box}>
                <p className="font-semibold">Characters the rules keep suggesting and authors rarely choose</p>
                <ul className="mt-1 list-disc pl-5">
                  {dx.recommended.map((c) => (
                    <li key={c.name}>
                      {c.name}: suggested first for {c.recommended} plans, chosen for {c.chosen}. The profile may promise more than authors find in it.
                    </li>
                  ))}
                </ul>
              </li>
            )}
            {dx.unanswered.length > 0 && (
              <li className={box}>
                <p className="font-semibold">Check-ins most people open and then choose nothing</p>
                <ul className="mt-1 list-disc pl-5">
                  {dx.unanswered.map((c) => (
                    <li key={c.title}>
                      {c.title} ({c.speaker}): {c.silent} of {c.opened} learners who opened it chose no question. The update or its questions may not be
                      landing.
                    </li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        )}
      </Section>
    </AdminShell>
  );
}
