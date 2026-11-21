"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { causalClaims, COHORTS, INTERPRETATIONS, type Cohort, type Interpretation } from "@/lib/living";
import { CONFIDENCE, REVIEW_DECISIONS, RISK, THEME_STATUS, type ReviewDecision } from "@/lib/problemDesk";
import { BARRIERS } from "@/lib/blockRegistry";
import type { SummaryProposal } from "@/lib/livingAssist";
import type { SignalDetail } from "@/server/signalRoom";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "../ui";
import { Icon } from "../../Icon";
import { LineChart, monthLabel, type ChartMarker } from "../problems/ProblemCharts";
import { area, box, dateText, riskTone, Section, statusTone, Tile } from "../problems/problemUi";
import { Definition, frame, ReachBars, StackedMonths, VerdictBar, VerdictKey, type Slot } from "./SignalCharts";

/*
  One theme in the Signal Room (docs/living-cases.md). Signals, the response, what was released, what learners did
  and the work measure, each in its own section with its own definition. A person writes the interpretation; the
  page never works one out, and never says that one layer caused another.
*/

const FILTERS = ["from", "to", "source", "audience"] as const;

export function SignalTheme({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // The filters live in the address, so a link to this view carries them. Permission is checked again when it's opened.
  const query = new URLSearchParams(FILTERS.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : [])));
  const loaded = useApi<SignalDetail>(`/api/admin/signal-room?theme=${encodeURIComponent(id)}${query.size ? `&${query}` : ""}`);
  const setFilter = (key: (typeof FILTERS)[number], value: string) => {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  if (loaded.error)
    return (
      <AdminShell title="Signal Room" back={{ href: "/admin/signal-room", label: "Signal Room" }}>
        <ErrorNote text={loaded.error} />
      </AdminShell>
    );
  if (!loaded.data)
    return (
      <AdminShell title="Signal Room" back={{ href: "/admin/signal-room", label: "Signal Room" }}>
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  const d = loaded.data;
  const c = d.counts;
  const markers: ChartMarker[] = d.timeline
    .filter((t) => !t.planned)
    .map((t) => ({ bucket: t.on.slice(0, 7), label: `${t.kind}: ${t.label} (${dateText(t.on)})` }));
  const slots: Slot[] = [1, 2, 3, "neutral"];
  const workLine = d.buckets.map((b) => {
    const m = d.work.find((x) => x.bucket === b);
    return m ? m.rate : null;
  });

  return (
    <AdminShell title={d.theme.title} back={{ href: "/admin/signal-room", label: "Signal Room" }}>
      <div className="flex flex-wrap items-center gap-2">
        {d.theme.sample && <Badge tone="warn">Sample data</Badge>}
        <Badge tone={riskTone(d.theme.risk)}>{RISK[d.theme.risk]}</Badge>
        <Badge tone={statusTone(d.theme.status)}>{THEME_STATUS[d.theme.status]}</Badge>
        <span className="text-sm text-ink-muted">Owner: {d.owner || "not named"}</span>
        {d.response.reviewOn && <span className="text-sm text-ink-muted">Review due {dateText(d.response.reviewOn)}</span>}
      </div>
      {d.theme.sample && (
        <p className="mt-3 rounded-2xl border border-gold bg-gold/15 p-3 text-sm">
          <strong>Synthetic sample.</strong> Every case, party and work figure on this page is made up so the trail can be followed. None of it is a Trilogy
          Care result. Learning figures, where there are any, are read from this Hub’s own records.
        </p>
      )}
      <p className="mt-3 max-w-3xl text-ink-muted">{d.theme.description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/admin/problems/${d.theme.id}`} className={btn.secondary}>
          <Icon name="target" className="size-4" /> Open on the Problem desk
        </Link>
        <a href="/api/admin/problems/export" className={btn.secondary}>
          <Icon name="file" className="size-4" /> Export the register to Excel
        </a>
      </div>

      <form className={cx(box, "mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4")} onSubmit={(e) => e.preventDefault()}>
        <Field label="From">
          <input type="month" className={input} value={d.range.from} max={d.range.to} onChange={(e) => setFilter("from", e.target.value)} />
        </Field>
        <Field label="To">
          <input type="month" className={input} value={d.range.to} min={d.range.from} onChange={(e) => setFilter("to", e.target.value)} />
        </Field>
        <Field label="Signal channel" hint="Applies to the signals.">
          <select className={input} value={d.filters.source} onChange={(e) => setFilter("source", e.target.value)}>
            <option value="">Every channel</option>
            {d.options.sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Learners’ role" hint="Applies to the learning figures.">
          <select className={input} value={d.filters.audience} onChange={(e) => setFilter("audience", e.target.value)}>
            <option value="">Everyone</option>
            {d.options.audiences.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </form>

      <Section
        title="Signals"
        hint={`As at ${dateText(d.asAt)}. A case is one issue in its source system. A contact is one dated time someone raised it. They are counted apart.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Tile
            label="Unique cases"
            value={c.cases}
            detail={d.falseMatches ? `${d.falseMatches} false ${d.falseMatches === 1 ? "match" : "matches"} left out` : undefined}
          />
          <Tile label="Contacts" value={c.contactEvents} detail="First reports, updates and repeat contacts" />
          <Tile label="Updates to a case" value={c.updates} detail="New information on a case already counted" />
          <Tile label="Repeat contacts" value={c.repeatContacts} detail="The same party back about the same case" />
          <Tile
            label="Affected parties"
            value={c.parties || (c.cases ? null : 0)}
            detail={
              c.parties
                ? c.casesWithoutParty
                  ? `${c.casesWithoutParty} ${c.casesWithoutParty === 1 ? "case has" : "cases have"} no party recorded`
                  : "De-identified labels"
                : "No party recorded on these cases"
            }
          />
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {d.theme.denominator
            ? `Out of about ${d.theme.denominator.toLocaleString("en-AU")}: ${(d.theme.denominatorNote || "an eligible number supplied by the owner").replace(/\.$/, "")}.`
            : "No eligible number has been supplied, so no rate is shown."}{" "}
          For: {d.theme.roles || "roles not recorded"}
          {d.theme.segment && ` · ${d.theme.segment}`}.
        </p>
        {d.returned.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold">Cases someone came back about</h3>
            <p className="text-sm text-ink-muted">Each is one case. Every dated contact is listed so the count can be checked by eye.</p>
            <ul className="mt-2 flex flex-col gap-3">
              {d.returned.map((k) => (
                <li key={k.id} className={box}>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">
                      {k.source} {k.ref}
                    </span>
                    {k.party && <Badge>{k.party}</Badge>}
                    <span className="text-sm">
                      <strong>1</strong> case · <strong>{k.contacts}</strong> contacts
                      {k.repeats > 0 && (
                        <>
                          {" "}
                          · <strong>{k.repeats}</strong> repeat {k.repeats === 1 ? "contact" : "contacts"}
                        </>
                      )}
                      {k.updates > 0 && (
                        <>
                          {" "}
                          · <strong>{k.updates}</strong> {k.updates === 1 ? "update" : "updates"}
                        </>
                      )}
                    </span>
                    <span className="text-sm text-ink-muted">{k.open ? "Open" : "Closed"}</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">{k.summary}</p>
                  <ol className="mt-2 flex flex-col gap-1 border-l-2 border-line-strong pl-3 text-sm">
                    {k.events.map((e, i) => (
                      <li key={i}>
                        <span className="font-semibold">{dateText(e.on)}</span> · {e.kind}
                        {!e.contact && <span className="text-ink-muted"> (a change of state, not a contact)</span>}
                        {e.note && <span className="text-ink-muted">: {e.note}</span>}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <div>
            <LineChart
              title="Issue trend"
              note="New unique cases and all contacts, as separate lines. Numbered marks are dated changes, listed below."
              unit="a month"
              buckets={d.buckets}
              series={[
                { key: "cases", name: "New unique cases", slot: 1, values: d.trend.map((t) => t.newCases) },
                { key: "contacts", name: "All contacts", slot: 2, values: d.trend.map((t) => t.contacts) },
                { key: "repeats", name: "Repeat contacts", slot: 3, values: d.trend.map((t) => t.repeats) },
              ]}
              markers={markers}
              empty="No signals in these dates."
            />
            <div className="px-4">
              <Definition
                items={[
                  ["New unique cases", "Cases whose first report fell in the month. One per source record."],
                  ["All contacts", "First reports, updates and repeat contacts dated in the month. A case raised three times is one case and three contacts."],
                  ["Repeat contacts", "The same party back about a case already counted. A subset of all contacts."],
                  ["Not counted", "False matches, closures and reopenings."],
                  ["A rise", "May mean more trust in the feedback channels, not worse care. Read it with the source owner."],
                  ["Source", "De-identified summaries on the Problem desk. The complaint, incident and billing systems hold the records and resolve them."],
                ]}
                link={{ href: `/admin/problems/${d.theme.id}`, label: "The cases, on the Problem desk" }}
              />
            </div>
          </div>
          <StackedMonths
            title="Question types over time"
            note="Questions asked in the community, the Portal and webinars, by the verified theme they were grouped under."
            unit="questions"
            buckets={d.buckets}
            series={d.questions.series.map((s, i) => ({
              key: s.key,
              label: s.label,
              slot: s.role === "unknown" ? "neutral" : slots[Math.min(i, 2)],
              values: s.values,
            }))}
            notes={d.questions.taxonomy}
            empty="No questions from the community, the Portal or webinars in these dates."
          >
            <Definition
              items={[
                ["Counts", "Questions by the month they were first asked. Complaints, incidents and billing rework are not in this chart."],
                ["Unknown", "Questions nobody has grouped yet, or in a grouping nobody has checked. They are shown, not guessed."],
                [
                  "Groupings",
                  "A person’s grouping, checked by a person. When themes are merged or split, the dates are listed under the chart: a trend across one compares two different sets.",
                ],
              ]}
            />
          </StackedMonths>
        </div>
      </Section>

      <Section title="The response" hint="What was decided, by whom, and why. Recorded on the Problem desk.">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={box}>
            <p className="text-sm font-semibold text-ink-muted">Target behaviour</p>
            <p className="mt-1">{d.diagnosis.desired || "Not recorded yet."}</p>
            <p className="mt-3 text-sm font-semibold text-ink-muted">Barrier, and how sure anyone is</p>
            {d.diagnosis.barriers.length ? (
              <ul className="mt-1 flex flex-col gap-1">
                {d.diagnosis.barriers.map((b, i) => (
                  <li key={i}>
                    {b.text || BARRIERS[b.barrier].label} <Badge tone={b.confidence === "known" ? "good" : "warn"}>{CONFIDENCE[b.confidence]}</Badge>
                    {!BARRIERS[b.barrier].learnable && <span className="text-sm text-ink-muted"> Outside what learning can change.</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink-muted">Not diagnosed yet.</p>
            )}
          </div>
          <div className={box}>
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-muted">
              Decision
              <Badge tone={d.response.status === "approved" ? "good" : "warn"}>
                {d.response.status === "approved"
                  ? `Approved ${dateText(d.response.approvedAt ?? "")}`
                  : d.response.status === "draft"
                    ? "Draft: not approved"
                    : "None yet"}
              </Badge>
            </p>
            <p className="mt-1 font-semibold">{d.response.learning ? `Learning: ${d.response.learning}` : "No learning decision recorded"}</p>
            <p className="mt-1 text-ink-muted">{d.response.why}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {d.actions
                .filter((a) => !a.prior)
                .map((a) => (
                  <li key={a.id}>
                    <Badge tone="info">{a.kind}</Badge>
                  </li>
                ))}
            </ul>
          </div>
        </div>
        {d.checks.length > 0 && (
          <div className={cx(box, "mt-3")}>
            <p className="text-sm font-semibold text-ink-muted">Existing content that was checked first</p>
            <ul className="mt-1 flex flex-col gap-2">
              {d.checks.map((k) => (
                <li key={k.id}>
                  <span className="font-semibold">{k.title}</span>
                  <span className="text-ink-muted">
                    {" "}
                    Covers: {k.shared || "not said"} Missing: {k.missing || "not said"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.returns.map((ret) => (
          <div key={ret.id} className={cx(box, "mt-3")}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Return episode: {ret.title}</span>
              <Badge tone={ret.status === "approved" ? "good" : ret.status === "withdrawn" ? "bad" : "warn"}>
                {ret.status === "approved" ? "Approved" : ret.status === "withdrawn" ? "Withdrawn" : "Draft"}
              </Badge>
              {ret.course && (
                <Badge tone={ret.course.version ? "good" : "neutral"}>
                  {ret.course.version ? `Published, version ${ret.course.version}` : "Course not published"}
                </Badge>
              )}
            </p>
            <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Shared principle</dt>
                <dd className="text-ink-muted">{ret.principle || "Not written"}</dd>
              </div>
              <div>
                <dt className="font-semibold">What’s different this time</dt>
                <dd className="text-ink-muted">{ret.mistake || "Not written"}</dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-ink-muted">
              {ret.placements.length} {ret.placements.length === 1 ? "block has" : "blocks have"} a recorded reason.{" "}
              <Link href={`/admin/characters/returns/${ret.id}`} className="font-semibold text-accent underline underline-offset-2">
                Why this character, this episode and each block
              </Link>
            </p>
          </div>
        ))}
      </Section>

      <Section
        title="What has been done, in order"
        hint="Every material change with its date and owner: learning, guidance, Portal, coaching, communication and reviews. A change in any chart has to be read against all of them."
      >
        {d.timeline.length ? (
          <ol className="flex flex-col gap-2 border-l-2 border-line-strong pl-4">
            {d.timeline.map((t, i) => (
              <li key={i} className={cx(t.planned && "text-ink-muted")}>
                <span className="font-semibold tabular-nums">{dateText(t.on)}</span> <Badge tone={t.planned ? "neutral" : "info"}>{t.kind}</Badge>{" "}
                {t.href ? (
                  <Link href={t.href} className="font-medium underline underline-offset-2">
                    {t.label}
                  </Link>
                ) : (
                  <span className="font-medium">{t.label}</span>
                )}
                {t.owner && <span className="text-sm text-ink-muted"> · {t.owner}</span>}
                {t.detail && <span className="block text-sm text-ink-muted">{t.detail}</span>}
              </li>
            ))}
          </ol>
        ) : (
          <p className={box}>Nothing has a date yet.</p>
        )}
        {d.response.competing && (
          <p className="mt-3 text-sm">
            <strong>Other changes in the same period:</strong> <span className="text-ink-muted">{d.response.competing}</span>
          </p>
        )}
      </Section>

      <Section title="Reach" hint="Who could have opened the return, and who did. An invitation was offered; nothing was assigned.">
        {d.reach.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {d.reach.map((r) => (
              <div key={r.returnId} className={frame}>
                <p className="font-semibold">{r.guide.title}</p>
                {!r.guide.published && <p className="text-sm text-ink-muted">Not published yet, so nobody has been able to open it.</p>}
                <div className="mt-3">
                  <ReachBars
                    rows={r.rows.map((x) => ({
                      key: x.audience,
                      label: x.label,
                      eligible: x.eligible,
                      exposed: x.exposed,
                      detail: `${x.exposedOrgs} of ${x.eligibleOrgs} ${x.eligibleOrgs === 1 ? "organisation" : "organisations"}`,
                    }))}
                  />
                </div>
                {r.note && (
                  <p className="mt-3 text-sm">
                    <strong>Field Note:</strong>{" "}
                    {r.note.status === "live"
                      ? `${r.note.eligible} became eligible, ${r.note.delivered} received it in the Hub, ${r.note.opened} opened it, ${r.note.dismissed} dismissed it.`
                      : r.note.status === "withdrawn"
                        ? "Withdrawn."
                        : "Not released."}
                  </p>
                )}
                <Definition
                  items={[
                    [
                      "Could",
                      "People in the Hub now whose role the course is shared with. As at today: the Hub doesn’t keep dated role memberships, so it can’t say who was eligible on an earlier date.",
                    ],
                    ["Opened it", "People with any recorded activity in the course in these dates."],
                    ["Left out", "Learning authors, from both figures."],
                    [
                      "Eligible for the note",
                      "People who answered the earlier decision. The note falls due a set number of days later and reaches them the next time they use the Hub.",
                    ],
                  ]}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className={box}>No return episode is linked to this theme, so there is no reach to show.</p>
        )}
      </Section>

      <Section
        title="Learning evidence"
        hint="What learners chose in an unscored practice activity, by published version. It shows what people did in the activity. It is not an assessed result and it is not evidence that work changed."
        aside={<VerdictKey />}
      >
        <div id="learning" className="scroll-mt-24" />
        {d.learning.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {d.learning.map((l) => (
              <div key={`${l.returnId}-${l.which}`} className={frame}>
                <p className="font-semibold">{l.name}</p>
                <p className="text-sm text-ink-muted">
                  {l.guide.title} · {l.label}
                </p>
                {!l.versions.length && <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-ink-muted">Not published yet.</p>}
                {l.series.map((s, i) => (
                  <div key={s.rubric} className="mt-3">
                    {l.series.length > 1 && (
                      <p className="mb-1 text-sm font-semibold">
                        Question as it was {i === 0 ? "first" : `after change ${i}`}{" "}
                        <span className="font-normal text-ink-muted">(fingerprint {s.rubric})</span>
                      </p>
                    )}
                    <div className="flex flex-col gap-3">
                      {s.rows.map((v) => (
                        <div key={v.revisionId}>
                          <VerdictBar
                            label={`Version ${v.revision}, first answers`}
                            n={v.answered}
                            first={v.first}
                            thin={v.thin}
                            min={d.thin}
                            detail={`${v.starts} opened the page · ${v.retried} answered again`}
                          />
                          {!v.thin && v.retried > 0 && (
                            <div className="mt-2">
                              <VerdictBar label={`Version ${v.revision}, where they ended up`} n={v.answered} first={v.latest} thin={v.thin} min={d.thin} />
                            </div>
                          )}
                          {!v.thin && (
                            <details className="mt-1 text-sm">
                              <summary className="cursor-pointer font-medium text-ink-muted hover:text-ink">First answers, option by option</summary>
                              <ul className="mt-1 flex flex-col gap-1">
                                {v.choices.map((ch) => (
                                  <li key={ch.id} className="flex gap-2">
                                    <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{ch.first}</span>
                                    <span className="text-ink-muted">{ch.text}</span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {l.series.length > 1 && (
                  <p className="mt-2 text-sm text-ink-muted">
                    The question or its marking changed between versions, so they are shown apart and never as one trend.
                  </p>
                )}
                <Definition
                  items={[
                    ["First answers", "Each person’s first answer in that published version, in these dates. One person, one answer."],
                    ["Answered again", "People who answered more than once in that version."],
                    ["Evidence type", "Unscored practice with feedback. Not an assessment, and not a measure of work."],
                    ["Small numbers", `Under ${d.thin} people, the count is shown and the split is not.`],
                    ["Source", "This Hub’s own learning records. No name and nothing a learner typed is shown here."],
                  ]}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className={box}>No return episode is linked, so there is no decision to read. Topic and course completions are in their own reports.</p>
        )}
      </Section>

      <Section
        title="Later transfer"
        hint="First answers on the return’s decision, by whether the person had answered the first story’s decision before. The two groups arrived by different routes, so they are set side by side, not ranked."
      >
        {d.transfer.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {d.transfer.map((t) => (
              <div key={t.returnId} className={frame}>
                <p className="font-semibold">{t.title}</p>
                {!t.linked && <p className="text-sm text-ink-muted">No earlier activity is linked, so everyone counts as new to it.</p>}
                {!t.versions.length && <p className="mt-3 rounded-xl bg-muted p-3 text-sm text-ink-muted">Not published yet.</p>}
                {t.series.map((s, i) => (
                  <div key={s.rubric} className="mt-3 flex flex-col gap-3">
                    {t.series.length > 1 && <p className="text-sm font-semibold">Question as it was {i === 0 ? "first" : `after change ${i}`}</p>}
                    {s.rows.map((v) =>
                      (Object.keys(COHORTS) as Cohort[]).map((k) => (
                        <VerdictBar
                          key={`${v.revisionId}-${k}`}
                          label={`Version ${v.revision}: ${d.cohorts[k]}`}
                          n={v.cohorts[k].n}
                          first={v.cohorts[k].first}
                          thin={v.cohorts[k].thin}
                          min={d.thin}
                          detail={v.cohorts[k].medianDays !== null ? `median ${v.cohorts[k].medianDays} days after the first story` : undefined}
                        />
                      )),
                    )}
                  </div>
                ))}
                <p className="mt-3 text-sm text-ink-muted">
                  {t.answeredEarlier} {t.answeredEarlier === 1 ? "person has" : "people have"} answered the first decision
                  {t.answeredEarlier > 0 &&
                    (t.firstOnly
                      ? `; ${t.firstOnly} of them ${t.firstOnly === 1 ? "hasn’t" : "haven’t"} answered the return yet`
                      : "; all of them have answered the return too")}
                  .
                </p>
                <Definition
                  items={[
                    ["Came back", "Answered the first story’s decision, then this one. Days are from their first answer there to their first here."],
                    ["Without the first", "Answered this decision with no earlier answer on the first. They read the same page with a neutral recap."],
                    ["Why not ranked", "People who return chose to. A difference between the groups may be who they are, not what they learned."],
                    ["Versions", "A changed question starts a new series. Results are never combined across one."],
                  ]}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className={box}>No return episode is linked to this theme.</p>
        )}
      </Section>

      <Section
        title="Work measure"
        hint="A separate figure from the owner’s own report, typed in on the Problem desk. Kept apart from every learning figure on this page."
      >
        {d.work.length ? (
          <div>
            <LineChart
              title={d.response.measure.name || "Work measure"}
              note="Per 100. Hollow points rest on a small denominator. Numbered marks are dated changes, listed below."
              unit="per 100"
              buckets={d.buckets}
              series={[
                { key: "work", name: "Work measure", slot: 1, values: workLine, thin: d.buckets.map((b) => Boolean(d.work.find((x) => x.bucket === b)?.thin)) },
              ]}
              markers={markers}
            />
            <div className="px-4">
              <Definition
                items={[
                  ["Definition", d.response.measure.definition],
                  ["Owner", d.response.measure.owner],
                  ["Baseline", [d.response.baseline.window, d.response.baseline.note].filter(Boolean).join(": ")],
                  ["Data delay", d.response.lag],
                  ["Other changes", d.response.competing],
                  ["Figures", d.work.map((m) => `${monthLabel(m.bucket, true)}: ${m.numerator}${m.denominator ? ` of ${m.denominator}` : ""}`).join("; ")],
                  [
                    "Entered",
                    `By hand, most recently ${dateText(
                      d.work
                        .map((m) => m.asAt)
                        .sort()
                        .at(-1) ?? "",
                    )}. The Hub does not compute it.`,
                  ],
                ]}
                link={
                  d.response.measure.link
                    ? { href: d.response.measure.link, label: "The owner’s report" }
                    : { href: `/admin/problems/${d.theme.id}`, label: "The figures, on the Problem desk" }
                }
              />
            </div>
          </div>
        ) : (
          <div className={box}>
            <p className="font-serif text-xl font-semibold">No linked work measure yet</p>
            <p className="mt-1 text-ink-muted">
              {d.response.measure.name
                ? `The decision names “${d.response.measure.name}”, owned by ${d.response.measure.owner || "nobody yet"}, and no figures have been entered${d.response.baseline.note ? `. ${d.response.baseline.note}` : "."}`
                : "The response decision doesn’t name one. Without it there is no way to tell whether work changed, whatever the learning figures say."}
            </p>
            <Link href={`/admin/problems/${d.theme.id}`} className={cx(btn.secondary, "mt-3")}>
              Connect a measure on the Problem desk
            </Link>
          </div>
        )}
      </Section>

      <Review d={d} reload={loaded.reload} query={query} />
    </AdminShell>
  );
}

function Review({ d, reload, query }: { d: SignalDetail; reload: () => void; query: URLSearchParams }) {
  const [form, setForm] = useState({
    interpretation: "too_early" as Interpretation,
    decision: "keep" as ReviewDecision,
    evidence: "",
    competing: d.response.competing,
    uncertainties: "",
    nextAction: "",
    decidedOn: d.asAt,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SummaryProposal | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [reason, setReason] = useState("");
  const claims = causalClaims(`${form.evidence} ${form.nextAction}`);
  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/problems", { body });
      reload();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const latest = d.reviews[0];
  return (
    <Section
      title="Interpretation and review"
      hint="A person’s reading of everything above, with what else could explain it and what happens next. The charts don’t supply it, and an earlier review is never rewritten."
    >
      {latest ? (
        <div className={box}>
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{dateText(latest.decidedOn)}</span>
            {latest.interpretation && <Badge tone={latest.interpretation === "improved" ? "good" : "info"}>{INTERPRETATIONS[latest.interpretation]}</Badge>}
            <Badge tone="info">{REVIEW_DECISIONS[latest.decision]}</Badge>
          </p>
          <p className="mt-2">{latest.evidence}</p>
          {latest.competing && (
            <p className="mt-1 text-sm">
              <strong>What else could explain it:</strong> <span className="text-ink-muted">{latest.competing}</span>
            </p>
          )}
          {latest.uncertainties && (
            <p className="mt-1 text-sm">
              <strong>Uncertain:</strong> <span className="text-ink-muted">{latest.uncertainties}</span>
            </p>
          )}
          {latest.nextAction && (
            <p className="mt-1 text-sm">
              <strong>Next:</strong> <span className="text-ink-muted">{latest.nextAction}</span>
            </p>
          )}
        </div>
      ) : (
        <p className={box}>Not reviewed yet{d.response.reviewOn ? `. The review is due ${dateText(d.response.reviewOn)}.` : "."}</p>
      )}

      {latest && d.sinceReview > 0 && (
        <div className={cx(box, "mt-3 border-gold bg-gold/10")}>
          <p className="font-semibold">
            {d.sinceReview} new {d.sinceReview === 1 ? "contact" : "contacts"} since that review
          </p>
          <p className="text-sm text-ink-muted">
            Reopening puts the theme back to “Investigate” and the response decision back to draft. The review above stays as it was written.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Field label="What has come in" className="min-w-64 flex-1">
              <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <button
              type="button"
              className={btn.secondary}
              disabled={busy || reason.trim().length < 10}
              onClick={async () => (await post({ action: "reopen-decision", id: d.theme.id, reason })) && setReason("")}
            >
              Reopen the decision
            </button>
          </div>
        </div>
      )}

      {d.response.status !== "approved" ? (
        <p className="mt-3 text-sm text-ink-muted">
          A review is of an approved response decision.{" "}
          <Link href={`/admin/problems/${d.theme.id}`} className="font-semibold text-accent underline underline-offset-2">
            Approve the decision on the Problem desk
          </Link>{" "}
          first.
        </p>
      ) : (
        <form
          className={cx(box, "mt-3 grid gap-3 lg:grid-cols-2")}
          onSubmit={async (e) => {
            e.preventDefault();
            if (await post({ action: "review", id: d.theme.id, ...form })) setForm({ ...form, evidence: "", uncertainties: "", nextAction: "" });
          }}
        >
          <h3 className="font-semibold lg:col-span-2">Record a review</h3>
          <Field label="How you read the evidence">
            <select className={input} value={form.interpretation} onChange={(e) => setForm({ ...form, interpretation: e.target.value as Interpretation })}>
              {Object.entries(INTERPRETATIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Decision" hint="“Close with evidence” closes the theme. No further training is a valid outcome.">
            <select className={input} value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value as ReviewDecision })}>
              {Object.entries(REVIEW_DECISIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-sm font-semibold">What the evidence shows, and what it doesn’t</span>
            <textarea className={area} value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} required minLength={20} />
            <span className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btn.quiet}
                disabled={drafting}
                onClick={async () => {
                  setDrafting(true);
                  setError(null);
                  try {
                    setDraft(
                      await api<SummaryProposal>("/api/admin/signal-room", { body: { action: "summarise", id: d.theme.id, ...Object.fromEntries(query) } }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setDrafting(false);
                  }
                }}
              >
                <Icon name="spark" className="size-4" /> {drafting ? "Reading the figures…" : "Draft a description of the figures"}
              </button>
              <span className="text-xs text-ink-muted">A model is sent the aggregate figures on this page and nothing else. It describes; you interpret.</span>
            </span>
          </label>
          {draft && (
            <div className="rounded-2xl bg-tealtint p-4 lg:col-span-2">
              <p className="text-sm font-semibold">An AI draft, describing the figures. Not an interpretation.</p>
              {draft.text ? (
                <>
                  <p className="mt-1">{draft.text}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className={btn.secondary}
                      onClick={() => {
                        setForm({ ...form, evidence: [form.evidence, draft.text].filter(Boolean).join("\n\n") });
                        setDraft(null);
                      }}
                    >
                      Use as a starting point
                    </button>
                    <button type="button" className={btn.quiet} onClick={() => setDraft(null)}>
                      Discard
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1">The draft was turned away, so nothing is offered:</p>
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {draft.dropped.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                  <button type="button" className={cx(btn.quiet, "mt-1")} onClick={() => setDraft(null)}>
                    Close
                  </button>
                </>
              )}
            </div>
          )}
          {claims.length > 0 && (
            <p className="rounded-xl border border-gold bg-gold/15 p-3 text-sm lg:col-span-2">
              <strong>This reads as a claim about cause:</strong> “{claims[0]}” The figures show what moved and when. If you have other grounds for saying why,
              name them under what else could explain it.
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">What else could explain it</span>
            <textarea className={area} value={form.competing} onChange={(e) => setForm({ ...form, competing: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">What’s uncertain</span>
            <textarea className={area} value={form.uncertainties} onChange={(e) => setForm({ ...form, uncertainties: e.target.value })} />
          </label>
          <Field label="Next action">
            <input className={input} value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} />
          </Field>
          <Field label="Decided on">
            <input type="date" className={input} value={form.decidedOn} onChange={(e) => setForm({ ...form, decidedOn: e.target.value })} />
          </Field>
          {error && (
            <div className="lg:col-span-2">
              <ErrorNote text={error} />
            </div>
          )}
          <div className="lg:col-span-2">
            <button type="submit" className={btn.primary} disabled={busy}>
              Record the review
            </button>
          </div>
        </form>
      )}

      {d.reviews.length > 1 && (
        <div className="mt-4">
          <h3 className="font-semibold">Earlier reviews</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {d.reviews.slice(1).map((v) => (
              <li key={v.id} className={box}>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{dateText(v.decidedOn)}</span>
                  {v.interpretation && <Badge tone="info">{INTERPRETATIONS[v.interpretation]}</Badge>}
                  <Badge>{REVIEW_DECISIONS[v.decision]}</Badge>
                </p>
                <p className="mt-1 text-sm text-ink-muted">{v.evidence}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
