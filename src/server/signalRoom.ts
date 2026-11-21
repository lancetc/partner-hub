import "server-only";
import { COHORTS, INTERPRETATIONS, THIN, type Cohort } from "@/lib/living";
import {
  ACTION_KINDS,
  CONTACT_KINDS,
  countCases,
  EVENT_KINDS,
  LEARNING_DECISIONS,
  months,
  ratePer100,
  REVIEW_DECISIONS,
  SMALL_SAMPLE,
  SOURCES,
  trend,
  type Case,
  type EventKind,
  type SourceKind,
} from "@/lib/problemDesk";
import type { Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { returnsForTheme } from "./living";
import { audienceReach, decisionEvidence, monthWindow, transferEvidence } from "./livingEvidence";
import { ensureSignalSamples, themeDetail } from "./problemDesk";

/*
  The Signal Room (docs/living-cases.md): one theme followed through time, from the signals that raised it, through
  the response that was decided and what was released, to what learners did and a work measure kept apart from all
  of it. A reading view over the Problem desk: recording and changing things happens there.

  Four layers are never mixed: reach (who could and did see something), practice (what they chose in an unscored
  activity), assessment (none here unless a course says so), and work (a figure an owner supplies from their own
  report). Nothing here says one caused another. A measure nobody has supplied is said to be missing, not drawn.
*/

/** The channels that are questions people asked, not complaints or rework. */
const QUESTION_SOURCES: SourceKind[] = ["community", "portal", "webinar"];
const AUDIENCE_LABEL: Record<string, string> = { partner: "Care Partners", coordinator: "Care Coordinators", staff: "Trilogy Care staff" };

const month = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : "");
const pickSource = (v: unknown) => (typeof v === "string" && v in SOURCES ? (v as SourceKind) : "");
const pickAudience = (v: unknown) => (typeof v === "string" && v in AUDIENCE_LABEL ? v : "");

type ThemeLite = { id: string; title: string; verified_at: string | null; merged_into: string | null; sample: number };
function allCases(db: Db): (Case & { themeId: string | null })[] {
  const rows = db.prepare("SELECT id, theme_id, source, source_ref, false_match, party FROM pd_cases").all() as {
    id: string;
    theme_id: string | null;
    source: SourceKind;
    source_ref: string;
    false_match: number;
    party: string | null;
  }[];
  const ev = db.prepare("SELECT id, kind, on_date, note FROM pd_case_events WHERE case_id = ? ORDER BY on_date, recorded_at, rowid");
  return rows.map((r) => ({
    id: r.id,
    themeId: r.theme_id,
    source: r.source,
    sourceRef: r.source_ref,
    summary: "",
    link: "",
    falseMatch: Boolean(r.false_match),
    party: r.party ?? "",
    events: (ev.all(r.id) as { id: string; kind: EventKind; on_date: string; note: string }[]).map((e) => ({
      id: e.id,
      kind: e.kind,
      on: e.on_date,
      note: e.note,
    })),
  }));
}

/** Verified themes, each with its counts kept apart: unique cases, contacts, repeat contacts and affected parties. */
export function signalList(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureSignalSamples(db, now);
  const asAt = now.toISOString().slice(0, 10);
  const themes = db
    .prepare("SELECT id, title, verified_at, merged_into, sample FROM pd_themes WHERE merged_into IS NULL ORDER BY updated_at DESC")
    .all() as ThemeLite[];
  const cases = allCases(db);
  const rows = themes.map((t) => {
    const d = themeDetail(db, actor, t.id, {}, now);
    const counts = countCases(
      cases.filter((c) => c.themeId === t.id),
      asAt,
    );
    const latest = d.reviews[0];
    return {
      id: t.id,
      title: t.title,
      verified: Boolean(t.verified_at),
      sample: Boolean(t.sample),
      status: d.theme.status,
      risk: d.theme.risk,
      owner: d.response.data.owner || d.theme.owner,
      counts,
      decision: d.response.status,
      learning: d.response.data.learning,
      reviewOn: d.response.data.reviewOn,
      overdue: Boolean(d.response.data.reviewOn) && d.response.data.reviewOn < asAt && (!latest || latest.decidedOn < d.response.data.reviewOn),
      latest: latest ? { decision: latest.decision, on: latest.decidedOn, interpretation: latest.interpretation } : null,
      measure: d.response.data.measure.name,
      hasWork: d.metrics.some((m) => m.metric === "work"),
      returns: returnsForTheme(db, t.id).length,
    };
  });
  return { asAt, verified: rows.filter((r) => r.verified), unverified: rows.filter((r) => !r.verified).length };
}
export type SignalList = ReturnType<typeof signalList>;

/** One theme, as evidence over time. Filters: months, the source channel of its signals, and the learners' role. */
export function signalDetail(db: Db, actor: User, themeId: unknown, input: { from?: unknown; to?: unknown; source?: unknown; audience?: unknown }, now: Date) {
  requireAuthor(actor);
  ensureSignalSamples(db, now);
  const d = themeDetail(db, actor, themeId, { from: month(input.from) || undefined, to: month(input.to) || undefined }, now);
  if (!d.theme.verified)
    throw new HttpError(404, "That theme hasn’t been checked yet. The Signal Room shows verified themes: check the grouping on the Problem desk first.");
  const source = pickSource(input.source);
  const audience = pickAudience(input.audience);
  const { from, to } = d.range;
  const window = monthWindow(from, to, audience || undefined);
  const buckets = months(from, to);
  const cases = d.cases.filter((c) => !source || c.source === source);
  const counts = countCases(cases, d.asAt);
  const r = d.response.data;

  // Cases someone came back about: each is one case, shown with every dated contact so the count can be checked by eye.
  const returned = cases
    .filter((c) => !c.falseMatch && c.events.filter((e) => CONTACT_KINDS.includes(e.kind)).length > 1)
    .map((c) => {
      const contacts = c.events.filter((e) => CONTACT_KINDS.includes(e.kind));
      return {
        id: c.id,
        source: SOURCES[c.source],
        ref: c.sourceRef,
        party: c.party ?? "",
        summary: c.summary,
        contacts: contacts.length,
        updates: contacts.filter((e) => e.kind === "update" || e.kind === "change").length,
        repeats: contacts.filter((e) => e.kind === "repeat").length,
        open: c.open,
        events: c.events.map((e) => ({ on: e.on, kind: EVENT_KINDS[e.kind], contact: CONTACT_KINDS.includes(e.kind), note: e.note })),
      };
    })
    .sort((a, b) => b.contacts - a.contacts);

  // Question types over time: questions from the community, the Portal and webinars, by verified theme. A question
  // nobody has grouped is "Unknown"; one in a grouping nobody has checked is said to be unchecked. Never guessed.
  const themes = new Map((db.prepare("SELECT id, title, verified_at, merged_into, sample FROM pd_themes").all() as ThemeLite[]).map((t) => [t.id, t]));
  const questions = allCases(db).filter((c) => !c.falseMatch && QUESTION_SOURCES.includes(c.source) && (!source || c.source === source));
  type Group = { key: string; label: string; role: "this" | "theme" | "other" | "unknown"; values: number[]; total: number };
  const blank = (key: string, label: string, role: Group["role"]): Group => ({ key, label, role, values: buckets.map(() => 0), total: 0 });
  const tally = new Map<string, Group>();
  for (const c of questions) {
    const first = c.events.find((e) => e.kind === "initial");
    const at = first ? buckets.indexOf(first.on.slice(0, 7)) : -1;
    if (at < 0) continue;
    const t = c.themeId ? themes.get(c.themeId) : undefined;
    // Not grouped, or in a grouping nobody has checked: both are "we don't know what this is about yet".
    const row =
      t?.verified_at && !t.merged_into
        ? (tally.get(t.id) ?? blank(t.id, t.title, t.id === d.theme.id ? "this" : "theme"))
        : (tally.get("unknown") ?? blank("unknown", "Unknown: not grouped, or grouping not checked", "unknown"));
    row.values[at] += 1;
    row.total += 1;
    tally.set(row.key, row);
  }
  const mine = tally.get(d.theme.id) ?? blank(d.theme.id, d.theme.title, "this");
  const others = [...tally.values()].filter((x) => x.role === "theme").sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const rest = others.slice(1);
  // Four groups at most, so each keeps its own colour: this theme, the next largest, every other verified theme, and unknown.
  const questionSeries: Group[] = [
    mine,
    ...others.slice(0, 1),
    ...(rest.length
      ? [
          {
            ...blank("other", `${rest.length} other verified ${rest.length === 1 ? "theme" : "themes"}`, "other"),
            values: buckets.map((_, i) => rest.reduce((n, x) => n + x.values[i], 0)),
            total: rest.reduce((n, x) => n + x.total, 0),
          },
        ]
      : []),
    ...(tally.get("unknown") ? [tally.get("unknown")!] : []),
  ];
  // When the groupings themselves changed, a trend across that date compares two different sets of themes.
  const taxonomy = (
    db
      .prepare(
        "SELECT h.at, h.action, h.detail, t.title FROM pd_history h JOIN pd_themes t ON t.id = h.theme_id WHERE h.action IN ('merged-into', 'split') AND h.at >= ? AND h.at < ? ORDER BY h.at",
      )
      .all(window.fromAt, window.toAt) as { at: string; action: string; detail: string; title: string }[]
  ).map((h) => ({ on: h.at.slice(0, 10), text: `${h.action === "split" ? "Split" : "Merged"}: “${h.title}” ${h.detail}`.slice(0, 200) }));

  const returns = returnsForTheme(db, d.theme.id);
  const learning = returns.flatMap((ret) => {
    const l = ret.link;
    return [
      { which: "first" as const, label: "The first decision", guide: l.from_guide, page: l.from_page, block: l.from_block },
      { which: "return" as const, label: "The return decision", guide: l.to_guide, page: l.to_page, block: l.to_block },
    ].flatMap((x) => {
      const ev = x.guide && x.block ? decisionEvidence(db, x.guide, x.page, x.block, window) : null;
      return ev ? [{ returnId: ret.id, which: x.which, name: x.label, ...ev }] : [];
    });
  });
  const transfer = returns.flatMap((ret) => {
    const l = ret.link;
    if (!l.to_guide || !l.to_block) return [];
    return [
      {
        returnId: ret.id,
        title: ret.title,
        linked: Boolean(l.from_guide && l.from_block),
        ...transferEvidence(db, { fromGuide: l.from_guide, fromBlock: l.from_block, toGuide: l.to_guide, toPage: l.to_page, toBlock: l.to_block }, window),
      },
    ];
  });
  const reach = returns.flatMap((ret) => {
    const a = ret.course ? audienceReach(db, ret.course.id, window) : null;
    return a ? [{ returnId: ret.id, ...a, rows: a.rows.map((x) => ({ ...x, label: AUDIENCE_LABEL[x.audience] ?? x.audience })), note: ret.note }] : [];
  });

  const work = d.metrics
    .filter((m) => m.metric === "work" && m.bucket >= from && m.bucket <= to)
    .map((m) => ({ ...m, thin: m.denominator !== null && m.denominator < SMALL_SAMPLE }));

  // Everything that was done or released, in date order: what a change in any chart has to be read against.
  type Step = { on: string; kind: string; label: string; owner: string; detail: string; href: string | null; planned: boolean };
  const timeline: Step[] = [];
  for (const a of d.actions) {
    const on = a.on || a.due;
    if (!on) continue;
    timeline.push({
      on,
      kind: ACTION_KINDS[a.kind],
      label: a.title,
      owner: a.owner,
      detail: [a.prior ? "Tried before this decision" : "", !a.on ? "Planned" : "", a.interpretation].filter(Boolean).join(". "),
      href: a.assetLink,
      planned: !a.on,
    });
  }
  for (const ret of returns) {
    if (ret.course?.publishedAt)
      timeline.push({
        on: ret.course.publishedAt.slice(0, 10),
        kind: "Learning release",
        label: `${ret.course.title}, version ${ret.course.version}`,
        owner: ret.owner,
        detail: "Published to learners.",
        href: `/admin/magazine/${ret.course.id}`,
        planned: false,
      });
    if (ret.approvedAt)
      timeline.push({
        on: ret.approvedAt.slice(0, 10),
        kind: "Return approved",
        label: ret.title,
        owner: ret.owner,
        detail: "",
        href: `/admin/characters/returns/${ret.id}`,
        planned: false,
      });
    if (ret.note?.releasedAt)
      timeline.push({
        on: ret.note.releasedAt.slice(0, 10),
        kind: "Field Note released",
        label: ret.title,
        owner: ret.owner,
        detail: "An optional invitation, in the Hub only.",
        href: `/admin/characters/returns/${ret.id}`,
        planned: false,
      });
  }
  for (const v of d.reviews)
    timeline.push({
      on: v.decidedOn,
      kind: "Review",
      label: `${REVIEW_DECISIONS[v.decision]}${v.interpretation ? `: ${INTERPRETATIONS[v.interpretation]}` : ""}`,
      owner: "",
      detail: v.evidence,
      href: null,
      planned: false,
    });
  timeline.sort((a, b) => a.on.localeCompare(b.on));

  const lastReview = d.reviews[0];
  const since = lastReview
    ? cases.flatMap((c) => (c.falseMatch ? [] : c.events.filter((e) => CONTACT_KINDS.includes(e.kind) && e.on > lastReview.decidedOn))).length
    : 0;

  return {
    asAt: d.asAt,
    range: d.range,
    filters: { source, audience },
    options: {
      sources: [...new Set(d.cases.map((c) => c.source))].map((s) => ({ key: s, label: SOURCES[s] })),
      audiences: Object.entries(AUDIENCE_LABEL).map(([key, label]) => ({ key, label })),
    },
    theme: d.theme,
    owner: r.owner || d.theme.owner,
    counts,
    falseMatches: cases.filter((c) => c.falseMatch).length,
    returned,
    trend: trend(cases, from, to),
    buckets,
    questions: { series: questionSeries, taxonomy, sources: QUESTION_SOURCES.map((s) => SOURCES[s]) },
    diagnosis: {
      desired: d.diagnosis.desired || r.desired,
      statement: d.statement,
      barriers: d.diagnosis.barriers.map((b) => ({ barrier: b.barrier, text: b.text, confidence: b.confidence })),
      verified: d.diagnosis.verified,
    },
    response: {
      status: d.response.status,
      approvedAt: d.response.approvedAt,
      learning: r.learning ? LEARNING_DECISIONS[r.learning] : "",
      why: r.why,
      audience: r.audience,
      audienceSize: r.audienceSize,
      reviewOn: r.reviewOn,
      competing: r.competing,
      lag: r.lag,
      baseline: r.baseline,
      measure: r.measure,
    },
    checks: d.checks,
    actions: d.actions.map((a) => ({
      id: a.id,
      prior: a.prior,
      kind: ACTION_KINDS[a.kind],
      title: a.title,
      owner: a.owner,
      audience: a.audience,
      on: a.on,
      due: a.due,
      status: a.status,
      result: a.result,
      interpretation: a.interpretation,
      snapshot: a.snapshot,
      snapshotAt: a.snapshotAt,
      asset: a.assetRef ? `${a.assetKind}: ${a.assetRef}${a.assetVersion ? ` (${a.assetVersion})` : ""}` : "",
      assetLink: a.assetLink,
      reportLink: a.reportLink,
      workLink: a.workLink,
    })),
    returns,
    learning,
    transfer,
    reach,
    work,
    timeline,
    reviews: d.reviews,
    sinceReview: since,
    thin: THIN,
    smallSample: SMALL_SAMPLE,
    cohorts: COHORTS,
  };
}
export type SignalDetail = ReturnType<typeof signalDetail>;

const share = (n: number, of: number) => (of ? `${n} of ${of}` : "none");
/**
  The figures on the page, as plain lines: what a drafted summary is allowed to describe, and the only numbers it
  may use. No case summary, no party, and nothing a learner chose beyond the counts.
*/
export function signalFigures(d: SignalDetail): string {
  const lines: string[] = [
    `Theme: ${d.theme.title}`,
    `Dates: ${d.range.from} to ${d.range.to}`,
    `Signals: ${d.counts.cases} unique cases, ${d.counts.contactEvents} contacts, of which ${d.counts.updates} updates to a case and ${d.counts.repeatContacts} repeat contacts. ${d.counts.parties} affected parties recorded.`,
    ...d.trend.filter((t) => t.newCases || t.followUps).map((t) => `${t.bucket}: ${t.newCases} new cases, ${t.followUps} further contacts`),
  ];
  for (const s of d.timeline.filter((t) => !t.planned)) lines.push(`${s.on}: ${s.kind}: ${s.label}`);
  for (const l of d.learning)
    for (const v of l.versions)
      lines.push(
        `${l.name} (${l.guide.title}, version ${v.revision}): ${v.answered} people answered${
          v.thin
            ? `, fewer than ${d.thin} so no split is read`
            : `; first answers: ${share(v.first.best, v.answered)} best, ${share(v.first.acceptable, v.answered)} works with care, ${share(v.first.risky, v.answered)} not the best; ${v.retried} answered again`
        }. Unscored practice.`,
      );
  for (const t of d.transfer)
    for (const v of t.versions)
      for (const k of Object.keys(COHORTS) as Cohort[]) {
        const c = v.cohorts[k];
        lines.push(
          `Return decision, version ${v.revision}, ${COHORTS[k].toLowerCase()}: ${c.n} people${c.thin ? `, fewer than ${d.thin}` : `; ${share(c.first.best, c.n)} chose the best answer first`}${
            c.medianDays !== null ? `; median ${c.medianDays} days after the first story` : ""
          }.`,
        );
      }
  if (d.work.length) {
    lines.push(`Work measure (${d.response.measure.name}; owner ${d.response.measure.owner || "not named"}; a separate report, typed in):`);
    for (const m of d.work) {
      const rate = ratePer100(m);
      lines.push(`${m.bucket}: ${m.numerator}${m.denominator ? ` of ${m.denominator}${rate !== null ? ` (${rate} per 100)` : ""}` : " (no denominator)"}`);
    }
  } else lines.push("Work measure: no linked work measure yet.");
  if (d.response.lag) lines.push(`Known delay in the work data: ${d.response.lag}`);
  if (d.response.competing) lines.push(`Other changes in the same period: ${d.response.competing}`);
  return lines.join("\n");
}
