import "server-only";
import {
  ACTIVITY_KINDS,
  APPROVAL,
  CATALOGUE,
  CATALOGUE_VERSION,
  EXCLUDED,
  EXPORT_COLUMNS,
  catalogueEntry,
  filterRows,
  isTestSlug,
  validateCatalogue,
  type Approval,
  type CatalogueEntry,
  type CatalogueFilters,
  type CatalogueRow,
  type Check,
  type CheckKey,
  type Example,
} from "@/lib/activityCatalogue";
import { GuideDocError, audiencePhrase, browsingRole, readGuideDoc, type GuideDoc } from "@/lib/magazine";
import { lessons } from "@/content/lessons";
import { POCKET_TOOLS } from "@/content/pocketPlaybook";
import { audit, type Db } from "./db";
import { HttpError, canAuthor, requireAuthor, type User } from "./auth";
import { learnerGuides } from "./magazine";
import { demoSignOffEnabled } from "./demoSignOff";
import { toolState, pocketTools } from "./pocketTools";
import { liveStatus } from "./bridge";
import { plannerEligible } from "./caseloadPlanner";
import { playbooksForRelay } from "./playbooks";
import { workbook, type Sheet } from "./xlsx";

/*
  The Activity Catalogue at run time (lib/activityCatalogue, docs/activity-catalogue-audit.md). The catalogue says what
  each activity is; this checks it against what the Hub actually holds: which published courses use each block (and
  whether those editions were reviewed, published under a demo sign-off, or are test courses), whether the parser still
  accepts it, what events it has recorded, whether a standalone tool is live or withdrawn. From that it gives the Admin
  view, its export, the homepage showcase and the learner directory.

  Nothing here changes content. The homepage picks an editor sets are kept in the settings table; analytics for the
  showcase and directory go to activity_events with the activity's id and version, the surface and the course it
  pointed to. Never a learner's answers or a business's figures.
*/

const ready = new WeakSet<Db>();
function ensure(db: Db) {
  if (ready.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT NOT NULL, audience TEXT NOT NULL,
  event TEXT NOT NULL, activity TEXT NOT NULL, version INTEGER NOT NULL, surface TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', revision TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS activity_events_activity ON activity_events (activity, event);`);
  ready.add(db);
}

/** A count from a table that may not exist yet on this database (tables are made by the module that owns them). */
function count(db: Db, sql: string, ...args: (string | number)[]) {
  try {
    return (db.prepare(sql).get(...args) as { n: number } | undefined)?.n ?? 0;
  } catch {
    return 0;
  }
}

type GuideRow = { id: string; slug: string; title: string; status: string; audience: string; revision_id: string | null; draft: string };

const walk = (doc: GuideDoc, f: (type: string, id: string) => void) => {
  for (const p of doc.pages) for (const s of p.sections) for (const b of s.blocks) f(b.type, b.id);
};

/**
  What the Magazine holds, by block type: the published courses using each (with whether the edition was reviewed or a
  demo, and whether it's a test course), how many live drafts use it, and any published edition that no longer reads.
*/
function scanMagazine(db: Db) {
  const guides = db.prepare("SELECT id, slug, title, status, audience, revision_id, draft FROM magazine_guides WHERE status != 'archived'").all() as GuideRow[];
  const demo = new Set(
    (() => {
      try {
        return (db.prepare("SELECT revision_id FROM magazine_demo_editions").all() as { revision_id: string }[]).map((r) => r.revision_id);
      } catch {
        return [];
      }
    })(),
  );
  const published = new Map<string, Example[]>();
  const drafts = new Map<string, number>();
  const blockType = new Map<string, string>();
  const broken: { slug: string; title: string; problem: string }[] = [];
  const docs = new Map<string, { doc: GuideDoc; revision: string; minutes: number }>();
  for (const g of guides) {
    try {
      const d = readGuideDoc(JSON.parse(g.draft), { draft: true });
      const seen = new Set<string>();
      walk(d, (t, id) => {
        blockType.set(id, t);
        if (!seen.has(t)) drafts.set(t, (drafts.get(t) ?? 0) + 1);
        seen.add(t);
      });
    } catch {
      // A draft that doesn't read is the author's work in progress: the editor shows its problems.
    }
    if (g.status !== "published" || !g.revision_id) continue;
    const r = db.prepare("SELECT doc, minutes FROM magazine_revisions WHERE id = ?").get(g.revision_id) as { doc: string; minutes: number } | undefined;
    if (!r) {
      broken.push({ slug: g.slug, title: g.title, problem: "Its published edition is missing." });
      continue;
    }
    try {
      const doc = readGuideDoc(JSON.parse(r.doc), { draft: true });
      docs.set(g.id, { doc, revision: g.revision_id, minutes: r.minutes });
      const seen = new Set<string>();
      walk(doc, (t, id) => {
        blockType.set(id, t);
        if (seen.has(t)) return;
        seen.add(t);
        published.set(t, [
          ...(published.get(t) ?? []),
          {
            guideId: g.id,
            slug: g.slug,
            title: g.title,
            demo: demo.has(g.revision_id!),
            test: isTestSlug(g.slug),
            audience: JSON.parse(g.audience) as string[],
          },
        ]);
      });
    } catch (e) {
      broken.push({
        slug: g.slug,
        title: g.title,
        problem: e instanceof GuideDocError ? e.problems.slice(0, 3).join(" ") : "Its published edition can't be read.",
      });
    }
  }
  // Learner events against blocks, by the block's type.
  const observed = new Map<string, number>();
  for (const r of db.prepare("SELECT block_id, COUNT(*) AS n FROM magazine_events WHERE block_id IS NOT NULL GROUP BY block_id").all() as {
    block_id: string;
    n: number;
  }[]) {
    const t = blockType.get(r.block_id);
    if (t) observed.set(t, (observed.get(t) ?? 0) + r.n);
  }
  return { published, drafts, observed, broken, docs, guides };
}

/** Attempts kept by a block's own module, by block type: proof its tracking runs, beyond page events. */
const ATTEMPT_TABLES: Record<string, string> = {
  auditor: "auditor_attempts",
  balance: "balance_attempts",
  baton: "baton_attempts",
  benchmark: "benchmark_votes",
  budgetlab: "budgetlab_attempts",
  cashbridge: "cashbridge_attempts",
  coverage: "coverage_attempts",
  discharge: "discharge_attempts",
  hazardscan: "hazardscan_attempts",
  hiring: "hiring_lab_attempts",
  intake: "intake_attempts",
  journey: "journey_attempts",
  line: "line_attempts",
  mission: "mission_attempts",
  network: "network_attempts",
  mentor: "notes_attempts",
  onedaymap: "one_day_attempts",
  redpen: "redpen_attempts",
  referral: "referral_attempts",
  reliability: "reliability_attempts",
  sandbox: "sandbox_attempts",
  shadowcoach: "shadow_attempts",
  signal: "signal_attempts",
  trustcheck: "trust_attempts",
  workload: "workload_attempts",
  xray: "xray_attempts",
  phonecall: "family_call_attempts",
  referralstudio: "referral_practice",
  casethread: "ct_attempts",
  reset: "reset_progress",
  bridge: "bridge_progress",
  myths: "myth_events",
  reflection: "magazine_reflections",
};

/** Usage events of the standalone tools, by catalogue id. Counts only: these tables never hold a value or a result. */
const TOOL_EVENTS: Record<string, string> = {
  "tool.caseload-margin": "planner_events",
  "tool.network-builder": "network_tool_events",
  "tool.referral-studio": "referral_studio_events",
  "tool.trust-check": "trust_tool_events",
  "tool.first-100-days": "shadow_tool_events",
  "tool.job-aids": "aid_events",
  "magazine.ava-relay": "relay_events",
};

const PROBE = (type: string) => ({
  schema: 2,
  pages: [
    { id: "p", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s", title: "S", blocks: [{ id: "b", type }] }] },
  ],
});
/** Whether the Magazine's parser still knows a block type: an unknown one is refused outright, even in a draft. */
export function parserKnows(type: string) {
  try {
    readGuideDoc(PROBE(type), { draft: true });
    return true;
  } catch (e) {
    return !(e instanceof GuideDocError && e.problems.some((p) => /unknown kind of block/.test(p)));
  }
}

const check = (state: Check["state"], note: string): Check => ({ state, note });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Every catalogue entry with its checks, for the Admin view and the export. Authors only. */
export function activityInventory(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensure(db);
  const scan = scanMagazine(db);
  const problems = validateCatalogue();
  const today = now.toISOString().slice(0, 10);
  const demoAllowed = demoSignOffEnabled();
  const topicUse = new Map<string, number>();
  for (const l of lessons) for (const t of new Set(Object.values(l.nodes).map((n) => n.type))) topicUse.set(t, (topicUse.get(t) ?? 0) + 1);
  const pocketState = new Map(POCKET_TOOLS.map((t) => [`tool.${t.id}`, toolState(db, t, now).state]));
  const bridge = liveStatus(db, actor);
  const jobAids = count(db, "SELECT COUNT(DISTINCT snippet_id) AS n FROM playbook_releases");

  const rows: CatalogueRow[] = CATALOGUE.map((e) => {
    const c = e.contract;
    const attention: string[] = [...(problems.get(e.id) ?? [])];
    let checks: Record<CheckKey, Check>;
    let approval: Approval = "na";
    let examples: Example[] = [];
    let drafts = 0;
    let observed = 0;
    let sample: CatalogueRow["sample"] = null;
    let builder: string | null = null;
    if (e.builder === "magazine") {
      examples = scan.published.get(e.id) ?? [];
      drafts = scan.drafts.get(e.id) ?? 0;
      observed = (scan.observed.get(e.id) ?? 0) + (ATTEMPT_TABLES[e.id] ? count(db, `SELECT COUNT(*) AS n FROM ${ATTEMPT_TABLES[e.id]}`) : 0);
      const real = examples.filter((x) => !x.test);
      const reviewed = real.filter((x) => !x.demo);
      approval = reviewed.length ? "reviewed" : real.length ? "demo" : examples.length ? "test" : drafts ? "draft" : "none";
      const shown = reviewed[0] ?? real[0] ?? null;
      sample = shown ? { title: shown.title, href: `/magazine/${shown.slug}` } : null;
      builder = shown ? `/admin/magazine/${shown.guideId}` : examples[0] ? `/admin/magazine/${examples[0].guideId}` : null;
      const known = parserKnows(e.id);
      if (!known) attention.push("The Magazine parser no longer accepts this block type: published content using it would fail.");
      if (examples.some((x) => x.test))
        attention.push(
          `Published in a test course learners can open: ${examples
            .filter((x) => x.test)
            .map((x) => x.slug)
            .join(", ")}.`,
        );
      const declared = e.events.filter((x) => x !== "page.opened");
      const promotable = e.homepage && (reviewed.length > 0 || (demoAllowed && real.length > 0));
      checks = {
        exists: check("yes", `Rendered by src/${e.renderer}; schema in src/${e.schema}. Files checked by the catalogue test.`),
        registered: known ? check("yes", "In the block registry, the block labels and the Magazine parser.") : check("no", "The parser refuses it."),
        renderable: real.length
          ? check("yes", `${plural(real.length, "published course")} use it and read without error.`)
          : examples.length
            ? check("partial", "Only a test course uses it.")
            : check("unknown", drafts ? `Only in ${plural(drafts, "draft")}: no published instance to open.` : "No course uses it yet."),
        authorable: check("yes", `${e.authoring}, with its own settings; checked by the schema before saving.`),
        aiReady:
          e.ai.mode === "configurable"
            ? check("yes", "The Magazine builder can recommend it and write a draft configuration the schema checks.")
            : e.ai.mode === "recommend"
              ? check("partial", "Recommended only: specialist setup required from a reviewed case.")
              : check("no", e.ai.reason),
        tracked: !declared.length
          ? check("n/a", "Read-only: opening the page is all that's recorded.")
          : observed
            ? check("yes", `${plural(observed, "event or attempt")} recorded. Declared: ${declared.slice(0, 6).join(", ")}${declared.length > 6 ? "…" : ""}.`)
            : check("partial", `Declared (${declared.slice(0, 4).join(", ")}${declared.length > 4 ? "…" : ""}) but none recorded on this Hub yet.`),
        published:
          approval === "reviewed"
            ? check("yes", `${plural(reviewed.length, "published edition")} not recorded as a demo edition (passed the publish gates).`)
            : approval === "demo"
              ? check("partial", `${plural(real.length, "edition")} published under a demo sign-off only: no named reviewer has approved it.`)
              : check("no", APPROVAL[approval]),
        promotable: !e.homepage
          ? check("n/a", "Not something to feature on its own.")
          : promotable
            ? check(
                "yes",
                reviewed.length
                  ? "A published example that passed its publish gates (not a demo edition) can be featured."
                  : "A demo edition can be featured on this demo Hub (never on Trilogy Care's servers).",
              )
            : check("no", real.length ? "Its only examples are demo editions, and demo sign-off is off on this Hub." : "No published example to link to."),
      };
      if (approval === "demo" && e.homepage)
        attention.push("Published only under a demo sign-off: get the named reviewers' sign-off before it's featured on a production Hub.");
    } else if (e.builder === "topic") {
      const type = e.id.slice("topic.".length);
      drafts = 0;
      const used = topicUse.get(type) ?? 0;
      approval = used ? "live" : "none";
      checks = {
        exists: check("yes", `Rendered by src/${e.renderer}; the card type is in src/${e.schema}.`),
        registered: check("yes", "In the Topic card union; a new card type won't compile until it's catalogued."),
        renderable: used ? check("yes", `${plural(used, "Topic")} use it.`) : check("unknown", "No Topic uses it yet."),
        authorable: check("yes", "Topic editor."),
        aiReady:
          e.ai.mode === "configurable"
            ? check("partial", "Written by the Topic builder's fixed seven-stage pattern; it doesn't select from the catalogue.")
            : check("no", e.ai.reason),
        tracked: check("partial", "Topic progress and completion are recorded for the whole Topic, not per card."),
        published: used ? check("yes", "In published Topics.") : check("no", "Not used."),
        promotable: check("n/a", "Topic cards aren't featured on their own."),
      };
      builder = "/admin/lessons";
    } else {
      // Standalone tools and games.
      const pocket = pocketState.get(e.id);
      const withdrawn = pocket === "withdrawn" || (e.gate === "released" && !bridge.released);
      approval = withdrawn ? "withdrawn" : "live";
      observed = TOOL_EVENTS[e.id] ? count(db, `SELECT COUNT(*) AS n FROM ${TOOL_EVENTS[e.id]}`) : 0;
      if (e.id === "tool.job-aids" && !jobAids) attention.push("No Job Aid has an approved release yet.");
      const workTile = !withdrawn && pocket !== "draft" && (e.kind === "job_aid" || e.kind === "calculator") && Boolean(e.route);
      checks = {
        exists: check("yes", `Rendered by src/${e.renderer}${e.route ? ` at ${e.route}` : ""}. Files checked by the catalogue test.`),
        registered: check("yes", e.route ? "Its page is a route in src/app." : "Switched on per page in the Magazine editor."),
        renderable: withdrawn
          ? check("no", e.gate === "released" ? "Not released: a superadmin has to release it." : "Withdrawn by its owner.")
          : check("yes", e.gate === "planner" ? "Opens for business owners with planner access, and authors." : "Opens for its roles."),
        authorable: check(e.authoring.startsWith("Code") || e.authoring.startsWith("Content") ? "partial" : "yes", e.authoring),
        aiReady: check("no", e.ai.reason),
        tracked: TOOL_EVENTS[e.id]
          ? observed
            ? check("yes", `${plural(observed, "use event")} recorded (counts only).`)
            : check("partial", "Recorded when used; none yet on this Hub.")
          : check("unknown", "No usage events found for it."),
        published: withdrawn ? check("no", APPROVAL.withdrawn) : check("yes", pocket === "draft" ? "Open, as a pilot draft." : "Live."),
        promotable: workTile ? check("yes", "Can be the homepage's “Use it at work” tile for people who may open it.") : check("n/a", "Not featured."),
      };
      sample = e.route && !withdrawn ? { title: e.name, href: e.route } : null;
      builder = e.admin;
      if (pocket === "draft") attention.push("A pilot draft: its owner hasn't approved it.");
      if (pocket === "review_due") attention.push("Past its review date.");
    }
    const health: CatalogueRow["health"] =
      checks.registered.state === "no" || (problems.get(e.id)?.length ?? 0) > 0 ? "broken" : attention.length ? "attention" : "ok";
    const { contract: _c, ...rest } = e;
    void _c;
    return {
      ...rest,
      purpose: c?.purpose ?? e.description,
      goodFor: c?.goodFor ?? [],
      poorFit: c?.poorFit ?? "",
      inputs: c?.inputs ?? [],
      evidence: c ? `${c.evidence}: ${c.completion}` : "",
      checks,
      approval,
      health,
      attention,
      examples,
      drafts,
      observed,
      sample,
      actions: {
        preview: sample?.href ?? null,
        builder,
        usage: examples.length ? `#usage-${e.id}` : null,
      },
      lastVerified: today,
      validation: problems.get(e.id) ?? [],
    };
  });

  const is = (k: CheckKey, s: Check["state"] = "yes") => rows.filter((r) => r.checks[k].state === s).length;
  const totals = {
    found: rows.length + EXCLUDED.length,
    catalogued: rows.length,
    registered: is("registered"),
    authorable: is("authorable"),
    aiConfigurable: rows.filter((r) => r.builder === "magazine" && r.ai.mode === "configurable").length,
    aiRecommend: rows.filter((r) => r.ai.mode === "recommend").length,
    aiReady: is("aiReady"),
    tracked: is("tracked"),
    published: is("published"),
    promotable: is("promotable"),
    broken: rows.filter((r) => r.health === "broken").length,
    orphaned: rows.filter((r) => r.builder === "magazine" && r.approval === "none").length,
    attention: rows.filter((r) => r.health !== "ok").length,
    excluded: EXCLUDED.length,
    byKind: Object.fromEntries(Object.keys(ACTIVITY_KINDS).map((k) => [k, rows.filter((r) => r.kind === k).length])),
  };
  return {
    version: CATALOGUE_VERSION,
    generatedAt: now.toISOString(),
    demoSignOff: demoAllowed,
    totals,
    rows,
    excluded: EXCLUDED,
    broken: scan.broken,
    testCourses: scan.guides.filter((g) => g.status === "published" && isTestSlug(g.slug)).map((g) => ({ slug: g.slug, title: g.title, id: g.id })),
    report: selectionReport(db, now),
    showcase: showcasePicks(db),
  };
}
export type Inventory = ReturnType<typeof activityInventory>;

/** The catalogue as a workbook: the filtered rows with the same columns as the detail view, and a sheet that says what it is. */
export function exportInventory(db: Db, actor: User, filters: CatalogueFilters, now: Date) {
  const inv = activityInventory(db, actor, now);
  const rows = filterRows(inv.rows, filters);
  const readMe: Sheet = {
    name: "Read me",
    header: ["Item", "Detail"],
    widths: [30, 120],
    rows: [
      ["What this is", "The Activity Catalogue: every activity the Hub holds, its surfaces, its AI eligibility and its checked status."],
      ["Snapshot", `${inv.generatedAt} (read from the Hub at this moment). Catalogue version ${inv.version}.`],
      [
        "Filters",
        Object.entries(filters)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ") || "None: every entry",
      ],
      ["Rows", `${rows.length} of ${inv.rows.length}`],
      ["Demo sign-off on this Hub", inv.demoSignOff ? "On: demo editions can be featured here, never on Trilogy Care's servers" : "Off"],
      ["States", "yes: verified; partial: works with a limit; no: doesn't; unknown: no evidence either way; n/a: doesn't apply"],
    ],
  };
  const sheet: Sheet = { name: "Activities", header: EXPORT_COLUMNS.map(([h]) => h), rows: rows.map((r) => EXPORT_COLUMNS.map(([, f]) => f(r))) };
  const excluded: Sheet = {
    name: "Excluded",
    header: ["ID", "Name", "Where", "Why it's not catalogued"],
    rows: inv.excluded.map((x) => [x.id, x.name, x.where, x.reason]),
  };
  audit(db, { actor: actor.id, event: "activity_catalogue.exported", entity: "activity-catalogue", next: { rows: rows.length, filters }, at: now });
  return { buffer: workbook([readMe, sheet, excluded]), filename: `Activity catalogue ${now.toISOString().slice(0, 10)}.xlsx` };
}

// ---------------------------------------------------------------------------------------------
// Selection and showcase report
// ---------------------------------------------------------------------------------------------

/** What the AI recommended, what authors kept, and what the showcase led to, over the last 90 days. Counts with their denominators. */
function selectionReport(db: Db, now: Date) {
  ensure(db);
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const tally = new Map<string, Record<string, number>>();
  const bump = (id: string, k: string, n = 1) => {
    const t = tally.get(id) ?? {};
    t[k] = (t[k] ?? 0) + n;
    tally.set(id, t);
  };
  for (const r of db.prepare("SELECT event, next FROM audit WHERE event LIKE 'activity.%' AND at >= ?").all(since) as {
    event: string;
    next: string | null;
  }[]) {
    const next = r.next ? (JSON.parse(r.next) as { types?: string[] }) : {};
    for (const t of next.types ?? []) bump(t, r.event.slice("activity.".length));
  }
  for (const r of db.prepare("SELECT activity, event, COUNT(*) AS n FROM activity_events WHERE at >= ? GROUP BY activity, event").all(since) as {
    activity: string;
    event: string;
    n: number;
  }[])
    bump(r.activity, r.event, r.n);
  return {
    since,
    rows: [...tally.entries()].map(([id, t]) => ({ id, name: catalogueEntry(id)?.name ?? id, ...t })).sort((a, b) => a.name.localeCompare(b.name)) as ({
      id: string;
      name: string;
    } & Record<string, number>)[],
  };
}

// ---------------------------------------------------------------------------------------------
// The homepage showcase and the learner directory
// ---------------------------------------------------------------------------------------------

export type ShowcasePick = {
  id: string;
  /** Catalogue id of the activity it features. */
  activity: string;
  /** The published course it opens. */
  guide: string;
  /** A concrete question, in the learner's words. */
  question: string;
  cta: string;
  /** Inclusive dates (YYYY-MM-DD) it shows between, if set. */
  from?: string;
  to?: string;
  off?: boolean;
};

/**
  The editorial starting picks: each a real published course built around the activity. Who sees which is decided at
  render time by the course's audience, so the row changes by role. An editor can reorder, schedule or switch any of
  these off in Admin, which replaces this list with theirs.
*/
export const DEFAULT_SHOWCASE: ShowcasePick[] = [
  {
    id: "discharge",
    activity: "discharge",
    guide: "dot-comes-home-the-72-hour-discharge-pivot",
    question: "A discharge call comes in. What happens in the next 72 hours?",
    cta: "Try the simulator",
  },
  {
    id: "family-call",
    activity: "phonecall",
    guide: "fiona-calls-when-the-gardener-doesnt-come",
    question: "A family is upset about a missed service. What would you say?",
    cta: "Practise the conversation",
  },
  {
    id: "hire",
    activity: "hiring",
    guide: "mayas-next-coordinator-when-to-hire",
    question: "Can you fund the next coordinator hire?",
    cta: "Test the numbers",
  },
  {
    id: "quote",
    activity: "xray",
    guide: "can-this-be-funded-a-quote-and-an-invoice-line-by-line",
    question: "What is wrong with this quote?",
    cta: "Inspect the invoice",
  },
  {
    id: "hazard",
    activity: "hazardscan",
    guide: "look-before-you-help-spot-the-hazard",
    question: "What would you deal with first in this room?",
    cta: "Scan the room",
  },
  { id: "cash", activity: "cashbridge", guide: "can-we-fund-the-next-90-days", question: "Can your business fund the next 90 days?", cta: "Test the numbers" },
  {
    id: "trust",
    activity: "trustcheck",
    guide: "mrs-patels-week-8-is-this-a-concern-and-what-does-she-want",
    question: "Three small signals in Week 8. Is it a concern, and what does she want?",
    cta: "Work through the case",
  },
  {
    id: "referrer",
    activity: "referralstudio",
    guide: "before-you-meet-the-referrer-practise-the-conversation",
    question: "A GP practice manager has five minutes. What do you say?",
    cta: "Practise the conversation",
  },
];

const SHOWCASE_KEY = "activity_showcase";
export function showcasePicks(db: Db): ShowcasePick[] {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SHOWCASE_KEY) as { value: string } | undefined;
  if (!row) return DEFAULT_SHOWCASE;
  try {
    return cleanPicks(JSON.parse(row.value));
  } catch {
    return DEFAULT_SHOWCASE;
  }
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,160}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function cleanPicks(v: unknown): ShowcasePick[] {
  if (!Array.isArray(v)) throw new HttpError(400, "Send a list of picks.");
  if (v.length > 12) throw new HttpError(400, "Keep it to 12 picks or fewer.");
  return v.map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const text = (k: string, max: number) =>
      String(o[k] ?? "")
        .trim()
        .slice(0, max);
    const activity = text("activity", 60);
    const e = catalogueEntry(activity);
    if (!e || !e.homepage) throw new HttpError(400, `Pick ${i + 1}: “${activity}” isn't an activity that can be featured.`);
    const guide = text("guide", 160);
    if (!SLUG.test(guide)) throw new HttpError(400, `Pick ${i + 1} needs the course it opens.`);
    const question = text("question", 140);
    const cta = text("cta", 40);
    if (!question || !cta) throw new HttpError(400, `Pick ${i + 1} needs its question and its button text.`);
    const from = text("from", 10);
    const to = text("to", 10);
    return {
      id: text("id", 40).replace(/[^a-z0-9-]/g, "") || `pick-${i + 1}`,
      activity,
      guide,
      question,
      cta,
      ...(DAY.test(from) && { from }),
      ...(DAY.test(to) && { to }),
      ...(o.off === true && { off: true }),
    };
  });
}

/** An editor chooses, orders, schedules and switches off the homepage picks. Authors only; audited. */
export function saveShowcase(db: Db, actor: User, picks: unknown, now: Date) {
  requireAuthor(actor);
  const before = showcasePicks(db);
  const next = picks === null ? null : cleanPicks(picks);
  if (next === null) db.prepare("DELETE FROM settings WHERE key = ?").run(SHOWCASE_KEY);
  else
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
      SHOWCASE_KEY,
      JSON.stringify(next),
    );
  audit(db, { actor: actor.id, event: "activity_catalogue.showcase_saved", entity: "homepage-showcase", previous: before, next: next ?? "defaults", at: now });
  return showcasePicks(db);
}

/** The published courses this person may read, with each one's block types and edition: what the showcase and directory build on. */
function readable(db: Db, user: User, now: Date) {
  const demo = demoSignOffEnabled();
  return learnerGuides(db, user, now)
    .filter((g) => !isTestSlug(g.slug))
    .flatMap((g) => {
      const row = db.prepare("SELECT revision_id FROM magazine_guides WHERE id = ?").get(g.id) as { revision_id: string | null } | undefined;
      if (!row?.revision_id) return [];
      const rev = db.prepare("SELECT doc FROM magazine_revisions WHERE id = ?").get(row.revision_id) as { doc: string } | undefined;
      if (!rev) return [];
      let types: string[];
      try {
        const doc = readGuideDoc(JSON.parse(rev.doc), { draft: true });
        const t = new Set<string>();
        walk(doc, (x) => t.add(x));
        types = [...t];
      } catch {
        return [];
      }
      const isDemo = count(db, "SELECT COUNT(*) AS n FROM magazine_demo_editions WHERE revision_id = ?", row.revision_id) > 0;
      // A demo edition is only promoted on a demo Hub: on Trilogy Care's servers a course needs its real sign-off first.
      return [{ ...g, revision: row.revision_id, types, demo: isDemo, promotable: !isDemo || demo }];
    });
}

const FALLBACK_IMAGE: Record<string, string> = {
  simulator: "/images/hero-headphones-notes.webp",
  roleplay: "/images/hero-headphones-notes.webp",
  calculator: "/images/hero-headphones-notes.webp",
};

// The one featured course: shown large at the front of the homepage showcase, like Lives in Progress's spotlight.
// Chosen with a tick on the course (Magazine editor, Guide settings); one at a time, a site setting by the course id.
const FEATURED_KEY = "activity_showcase_featured";
export function featuredGuideId(db: Db): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(FEATURED_KEY) as { value: string } | undefined;
  return row?.value || null;
}

/** For the course's settings: whether it's the featured one, which one is if not, and whether it can be (published, not a test). */
export function featureStatus(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  const g = db.prepare("SELECT id, slug, title, revision_id FROM magazine_guides WHERE id = ?").get(guideId) as
    { id: string; slug: string; title: string; revision_id: string | null } | undefined;
  if (!g) throw new HttpError(404, "Guide not found.");
  const current = featuredGuideId(db);
  const other =
    current && current !== g.id ? (db.prepare("SELECT title FROM magazine_guides WHERE id = ?").get(current) as { title: string } | undefined) : undefined;
  const why = isTestSlug(g.slug) ? "A test course can’t be featured." : !g.revision_id ? "Publish it first: only a published course can be featured." : null;
  return { featured: current === g.id, other: other?.title ?? null, eligible: !why, why };
}

/** Ticks or unticks a course as the featured one. Ticking replaces whichever course was featured before. Audited. */
export function setFeatured(db: Db, actor: User, guideId: string, on: boolean, now: Date) {
  const status = featureStatus(db, actor, guideId);
  const before = featuredGuideId(db);
  if (on) {
    if (!status.eligible) throw new HttpError(400, status.why ?? "This course can’t be featured.");
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(FEATURED_KEY, guideId);
  } else if (before === guideId) db.prepare("DELETE FROM settings WHERE key = ?").run(FEATURED_KEY);
  audit(db, { actor: actor.id, event: "activity_catalogue.featured_set", entity: `guide:${guideId}`, previous: before, next: on ? guideId : null, at: now });
  return featureStatus(db, actor, guideId);
}

/** What the featured card's button says, from the kind of activity it holds. */
const FEATURE_CTA: Record<string, string> = { simulator: "Try the simulator", roleplay: "Practise the conversation", calculator: "Test the numbers" };

/** The homepage's featured activities for this person: the featured course (large), up to four live picks they can open, and one tool for work. */
export function homeShowcase(db: Db, user: User, now: Date) {
  const day = now.toISOString().slice(0, 10);
  const readableNow = readable(db, user, now);
  const guides = new Map(readableNow.map((g) => [g.slug, g]));
  const live = showcasePicks(db).filter((p) => !p.off && (!p.from || p.from <= day) && (!p.to || p.to >= day));
  // The featured course, when this person may read it (its audience, published, not a demo edition on a production Hub).
  const fid = featuredGuideId(db);
  const fg = fid ? readableNow.find((g) => g.id === fid && g.promotable) : undefined;
  const featured = fg
    ? (() => {
        const pick = live.find((p) => p.guide === fg.slug);
        // Its headline activity: the pick's, else the first it holds that the catalogue lets the homepage feature, simulators first.
        const holds = fg.types.map((t) => catalogueEntry(t)).filter((e): e is NonNullable<typeof e> => Boolean(e?.homepage));
        const e =
          (pick && catalogueEntry(pick.activity)) ?? holds.find((x) => x.kind === "simulator") ?? holds.find((x) => x.kind === "roleplay") ?? holds[0] ?? null;
        return {
          pick: `featured-${fg.id}`,
          activity: e?.id ?? "magazine",
          version: e?.version ?? 1,
          kind: e ? ACTIVITY_KINDS[e.kind] : "Course",
          question: pick?.question ?? (fg.standfirst || fg.title),
          cta: fg.state === "started" ? "Resume" : (pick?.cta ?? (e ? FEATURE_CTA[e.kind] : undefined) ?? "Start"),
          title: fg.title,
          standfirst: fg.standfirst,
          href: `/magazine/${fg.slug}`,
          slug: fg.slug,
          revision: fg.revision,
          image: fg.cover ?? (e ? FALLBACK_IMAGE[e.kind] : null) ?? null,
          minutes: fg.minutes,
          audience: fg.audience.length ? audiencePhrase(fg.audience) : "everyone",
          state: fg.state,
        };
      })()
    : null;
  const cards = live
    .filter((p) => p.guide !== fg?.slug)
    .flatMap((p) => {
      const e = catalogueEntry(p.activity);
      const g = guides.get(p.guide);
      // Withdrawn, unpublished, outside their audience, a demo edition on a production Hub, or no longer holding the activity: not shown.
      if (!e || !e.homepage || !g || !g.promotable || !g.types.includes(p.activity)) return [];
      return [
        {
          pick: p.id,
          activity: e.id,
          version: e.version,
          kind: ACTIVITY_KINDS[e.kind],
          question: p.question,
          cta: g.state === "started" ? "Resume" : p.cta,
          title: g.title,
          href: `/magazine/${g.slug}`,
          slug: g.slug,
          revision: g.revision,
          image: g.cover ?? FALLBACK_IMAGE[e.kind] ?? null,
          minutes: g.minutes,
          audience: g.audience.length ? audiencePhrase(g.audience) : "everyone",
          state: g.state,
        },
      ];
    })
    // One row: four cards, or the featured course (two cards wide) and two beside it.
    .slice(0, featured ? 2 : 4);
  return { featured, cards, work: workTile(db, user, now) };
}
export type ShowcaseCard = ReturnType<typeof homeShowcase>["cards"][number];
export type FeaturedCard = NonNullable<ReturnType<typeof homeShowcase>["featured"]>;

/** One real tool for the job, kept apart from the fictional practice: the business calculator for owners, else a current Job Aid. */
function workTile(db: Db, user: User, now: Date) {
  if (plannerEligible(db, user))
    return {
      activity: "tool.caseload-margin",
      kind: "Calculator",
      title: "Caseload-to-Margin & Hiring Capacity",
      text: "Plan when to recruit and what growth could do to workload, margin and cash. Private to your business.",
      href: "/tools/caseload-margin",
      cta: "Open the calculator",
    };
  const aid = playbooksForRelay(db, user, now)[0];
  if (!aid) return null;
  return { activity: "tool.job-aids", kind: "Job Aid", title: aid.title, text: aid.purpose, href: `/tools/${aid.id}`, cta: "Open the Job Aid" };
}
export type WorkTile = NonNullable<ReturnType<typeof workTile>>;

/** What a standalone tool helps with, for the directory's "intent" filter (GUIDE_GOALS). */
const TOOL_GOALS: Record<string, string[]> = {
  "tool.job-aids": ["compliance", "quality"],
  "tool.caseload-margin": ["grow", "money"],
  "tool.network-builder": ["grow", "quality"],
  "tool.referral-studio": ["grow"],
  "tool.trust-check": ["clients", "quality"],
  "tool.first-100-days": ["grow", "start"],
  "tool.while-you-wait": ["money", "clients"],
  "tool.contribution-quick-calc": ["money"],
  "tool.incident-first-steps": ["quality", "compliance"],
  "tool.golden-scripts": ["clients"],
  "play.coordinators-day": ["start", "clients"],
  "play.explorer": ["start", "clients"],
  "play.conversations": ["clients"],
};

/**
  Every interactive activity this person can open: the published courses built around a practice activity (not test
  courses, and on a production Hub not demo editions), and the standalone tools and games their role and access allow.
  A withdrawn tool or an unpublished course simply isn't here.
*/
export function learnerDirectory(db: Db, user: User, now: Date) {
  const courses = readable(db, user, now)
    .filter((g) => g.promotable)
    .flatMap((g) => {
      const acts = g.types.map((t) => catalogueEntry(t)).filter((e): e is CatalogueEntry => Boolean(e && e.contract && e.contract.evidence !== "accessed"));
      // The course's lead activity: a simulator, roleplay or calculator first, else its first practice block.
      const lead = acts.find((e) => e.homepage) ?? acts.find((e) => e.contract?.evidence === "practised") ?? null;
      if (!lead) return [];
      const tags = g.tags;
      return [
        {
          key: `course:${g.slug}`,
          activity: lead.id,
          name: lead.name,
          kind: lead.kind,
          title: g.title,
          text: g.standfirst,
          href: `/magazine/${g.slug}`,
          minutes: g.minutes as number | null,
          image: g.cover,
          roles: tags.roles as string[],
          goals: tags.goals as string[],
          state: g.state as string,
          also: acts.filter((e) => e.id !== lead.id && e.homepage).map((e) => e.name),
          practice: "Fictional practice",
        },
      ];
    });
  const planner = plannerEligible(db, user);
  const bridge = liveStatus(db, user);
  const pocket = new Map(pocketTools(db, user, now).map((t) => [`tool.${t.id}`, t]));
  const aids = playbooksForRelay(db, user, now).length;
  const tools = CATALOGUE.filter((e) => e.builder === null && e.route).flatMap((e) => {
    if (e.gate === "planner" && !planner) return [];
    if (e.gate === "released" && !(bridge.allowed && bridge.released)) return [];
    if (e.id.startsWith("tool.") && POCKET_TOOLS.some((t) => `tool.${t.id}` === e.id)) {
      const t = pocket.get(e.id);
      if (!t || t.state === "withdrawn") return [];
    }
    if (e.id === "tool.job-aids" && !aids) return [];
    return [
      {
        key: e.id,
        activity: e.id,
        name: e.name,
        kind: e.kind,
        title: e.name,
        text: e.description,
        href: e.route!,
        minutes: e.minutes,
        image: null as string | null,
        roles: e.designedFor.length ? (e.designedFor as string[]) : ["partner", "coordinator", "owner", "staff"],
        goals: TOOL_GOALS[e.id] ?? [],
        state: "new",
        also: [] as string[],
        practice: e.kind === "game" ? "Game" : "Use it at work",
      },
    ];
  });
  return { items: [...courses, ...tools], role: browsingRole({ audience: user.audience, role: user.role, canAuthor: canAuthor(user) }) ?? "" };
}
export type DirectoryItem = ReturnType<typeof learnerDirectory>["items"][number];

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

const EVENTS = new Set(["shown_on_homepage", "opened", "saved_for_work"]);
const SURFACE = new Set(["home", "directory", "work-tile"]);

/**
  A showcase or directory event: which activity, its version, where, and the course it pointed to. Never anything the
  learner typed or chose inside the activity: those stay with the activity's own records.
*/
export function recordActivityEvent(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensure(db);
  const event = String(input.event ?? "");
  const surface = String(input.surface ?? "");
  const e = catalogueEntry(String(input.activity ?? ""));
  if (!EVENTS.has(event) || !SURFACE.has(surface) || !e) throw new HttpError(400, "Unknown activity event.");
  const ref = typeof input.ref === "string" && SLUG.test(input.ref) ? input.ref : "";
  const revision = typeof input.revision === "string" && /^[\w-]{1,80}$/.test(input.revision) ? input.revision : "";
  db.prepare("INSERT INTO activity_events (at, user_id, audience, event, activity, version, surface, ref, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    user.id,
    user.audience,
    event,
    e.id,
    e.version,
    surface,
    ref,
    revision,
  );
  return { ok: true };
}
