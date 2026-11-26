import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { archiveGuide, completeGuide, createGuide, finishPage, publishGuide, readGuide, saveGuideDraft } from "./magazine";
import { buildRoute, itemKey, parseKey, scoreItems, titleFromGoal, withoutOverlap, type IndexedItem } from "@/lib/discovery";
import {
  addStep,
  catalogue,
  createPath,
  deletePath,
  discoveryGaps,
  handleRequest,
  itemInPaths,
  myDiscovery,
  openStep,
  readPath,
  removeStep,
  reorderSteps,
  requestTopic,
  searchCatalogue,
  suggest,
  updatePath,
  updateStep,
} from "./discovery";

/* Discovery Paths: a learner's own route. Private, limited to what they may open, and never a completion. */

let db: Db;
let author: User, riley: User, sam: User, ash: User;
const now = new Date("2026-11-20T00:00:00Z");
const later = (mins: number) => new Date(now.getTime() + mins * 60_000);

const page = (id: string, title: string, body: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  purpose: "",
  template: "blank",
  kind: "content",
  required: true,
  allActivities: false,
  sections: [{ id: `s-${id}`, title: "S", blocks: [{ id: `t-${id}`, type: "text", body }] }],
  ...extra,
});
const invoicePages = () => [
  page("intro", "Why invoices matter", "Supplier invoices are checked against the agreed services before they are approved."),
  page("sample", "Read a sample invoice", "An annotated supplier invoice: the date, the service line and the agreed rate.", { standalone: true }),
  page("mismatch", "The rate does not match", "What to clarify when a supplier invoice rate differs from the agreement."),
];

function course(title: string, pages: unknown[], opts: { audience?: string[] } = {}) {
  const c = createGuide(
    db,
    author,
    { title, standfirst: `A course about ${title.toLowerCase()}.`, completion: "confirm", audience: opts.audience, doc: { schema: 2, pages } },
    now,
  );
  publishGuide(db, author, c.id, "", now, { allowUnverified: true });
  return c;
}
const TOPIC = itemKey("topic", "noticing-a-change");

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  riley = userById(db, "riley")!;
  sam = userById(db, "sam")!;
  ash = userById(db, "ash")!;
});

describe("the catalogue", () => {
  it("offers Topics, courses the person may read, and only pages marked standalone", () => {
    const c = course("Checking supplier invoices", invoicePages());
    const cat = catalogue(db, riley);
    expect(cat.byKey.get(TOPIC)?.href).toBe("/topics/noticing-a-change");
    expect(cat.byKey.get(itemKey("course", c.id))?.kind).toBe("course");
    const sample = cat.byKey.get(itemKey("page", c.id, "sample"))!;
    expect(sample.parent?.title).toBe("Checking supplier invoices");
    expect(sample.href).toBe(`/magazine/${c.slug}/sample`);
    expect(cat.byKey.has(itemKey("page", c.id, "intro"))).toBe(false);
    // Follow ups and challenge missions aren't things to save.
    expect(cat.items.some((i) => i.ref === "lf-recall")).toBe(false);
  });

  it("leaves out a course for another audience, a draft and an archived course", () => {
    const staff = course("Internal invoice handling", invoicePages(), { audience: ["staff"] });
    const draft = createGuide(db, author, { title: "Unpublished invoices", completion: "confirm", doc: { schema: 2, pages: invoicePages() } }, now);
    const old = course("Retired invoices", invoicePages());
    archiveGuide(db, author, old.id, now);
    const keys = new Set(catalogue(db, riley).items.map((i) => i.ref));
    expect(keys.has(staff.id)).toBe(false);
    expect(keys.has(draft.id)).toBe(false);
    expect(keys.has(old.id)).toBe(false);
    expect(catalogue(db, riley).restricted.has(staff.id)).toBe(true);
    // Search goes through the same catalogue: nothing about the staff course comes back.
    expect(searchCatalogue(db, riley, { q: "internal invoice handling" }).items.some((i) => i.ref === staff.id)).toBe(false);
    expect(searchCatalogue(db, riley, { q: "invoice", kind: "page" }).items).toEqual([]);
  });

  it("never sends the matching text to the page", () => {
    course("Checking supplier invoices", invoicePages());
    const found = searchCatalogue(db, riley, { q: "invoice" }).items;
    expect(found.length).toBeGreaterThan(0);
    for (const i of found) expect("text" in i).toBe(false);
  });
});

describe("matching a goal", () => {
  const item = (key: string, title: string, summary: string, text: string, more: Partial<IndexedItem> = {}): IndexedItem => {
    const k = parseKey(key)!;
    return {
      key,
      ...k,
      title,
      summary,
      minutes: 5,
      href: "/x",
      parent: null,
      version: "1",
      practice: null,
      owner: "",
      reviewed: null,
      state: "new",
      text,
      ...more,
    };
  };
  const items = [
    item("topic:invoices", "What a useful invoice shows", "The details to look for on a supplier invoice.", "date rate service"),
    item("topic:falls", "Preventing falls at home", "Spot hazards in the home.", "rugs stairs lighting"),
    item("course:c1", "Checking supplier invoices", "Work through real invoices.", "invoice rate supplier sample mismatch", { minutes: 30 }),
    item("page:c1:sample", "Read a sample invoice", "An annotated supplier invoice.", "invoice rate supplier", { minutes: 4 }),
  ];

  it("only offers what's about the goal, and nothing when nothing is", () => {
    const route = buildRoute(items, "I want to feel more confident checking supplier invoices");
    expect(route.steps.map((s) => s.key)).toEqual(["topic:invoices", "page:c1:sample"]);
    expect(route.title).toBe("Checking supplier invoices");
    expect(route.steps[0].reason).toMatch(/title matches “invoice”/);
    expect(buildRoute(items, "How do I manage medication rounds").steps).toEqual([]);
    expect(buildRoute(items, "I want to learn").steps).toEqual([]);
  });

  it("doesn't offer a course beside its own page, and offers the course when three of its pages fit", () => {
    const scored = scoreItems(items, "supplier invoice");
    expect(withoutOverlap(scored).map((s) => s.item.key)).not.toContain("course:c1");
    const more = [
      ...items,
      item("page:c1:a", "Invoice dates", "Supplier invoice dates.", ""),
      item("page:c1:b", "Invoice rates", "Supplier invoice rates.", ""),
    ];
    const kept = withoutOverlap(scoreItems(more, "supplier invoice")).map((s) => s.item.key);
    expect(kept).toContain("course:c1");
    expect(kept.some((k) => k.startsWith("page:"))).toBe(false);
  });

  it("fits the time they have, keeps the best match, and offers something else when asked again", () => {
    const short = buildRoute(items, "supplier invoice", { minutes: 10 });
    expect(short.steps.length).toBeGreaterThan(0);
    expect(short.minutes).toBeLessThanOrEqual(12.5);
    const again = buildRoute(items, "supplier invoice", { exclude: short.steps.map((s) => s.key) });
    expect(again.steps.every((s) => !short.steps.some((x) => x.key === s.key))).toBe(true);
  });

  it("names a path from the goal", () => {
    expect(titleFromGoal("I need to handle a complaint more confidently.")).toBe("Handle a complaint");
    expect(titleFromGoal("how do I read a care plan?")).toBe("Read a care plan");
  });
});

describe("a learner's own paths", () => {
  it("makes a path, adds steps once, reorders without drag, and keeps it private", () => {
    const c = course("Checking supplier invoices", invoicePages());
    const { path } = createPath(db, riley, { title: "Invoices" }, now);
    expect(path.state).toBe("draft");
    addStep(db, riley, path.id, { key: TOPIC }, now);
    addStep(db, riley, path.id, { key: itemKey("page", c.id, "sample") }, now);
    // Adding the same thing again (a double press, a resend) changes nothing.
    const twice = addStep(db, riley, path.id, { key: TOPIC }, now).path;
    expect(twice.steps.map((s) => s.kind)).toEqual(["topic", "page"]);
    expect(twice.steps[1].parentTitle).toBe("Checking supplier invoices");

    const [a, b] = twice.steps.map((s) => s.id);
    expect(reorderSteps(db, riley, path.id, [b, a], now).path.steps.map((s) => s.id)).toEqual([b, a]);
    // The same order again, and an id that isn't in the path, are both harmless.
    expect(reorderSteps(db, riley, path.id, [b, "nope", a], now).path.steps.map((s) => s.id)).toEqual([b, a]);
    expect(reorderSteps(db, riley, path.id, [a], now).path.steps.map((s) => s.id)).toEqual([a, b]);

    // No one else can read, change or even detect it.
    expect(() => readPath(db, sam, path.id, now)).toThrow(/isn’t here/);
    expect(() => addStep(db, sam, path.id, { key: TOPIC }, now)).toThrow(/isn’t here/);
    expect(() => deletePath(db, author, path.id, now)).toThrow(/isn’t here/);
    expect(myDiscovery(db, sam, now).paths).toEqual([]);
    expect(myDiscovery(db, riley, now).paths.map((p) => p.title)).toEqual(["Invoices"]);
  });

  it("refuses what the person can't open: another audience's course, a page that isn't standalone", () => {
    const staff = course("Internal invoice handling", invoicePages(), { audience: ["staff"] });
    const c = course("Checking supplier invoices", invoicePages());
    const { path } = createPath(db, riley, {}, now);
    expect(() => addStep(db, riley, path.id, { key: itemKey("course", staff.id) }, now)).toThrow(/can’t be added/);
    expect(() => addStep(db, riley, path.id, { key: itemKey("page", c.id, "mismatch") }, now)).toThrow(/can’t be added/);
    // Made from a list (a suggestion that was edited in the page): what they can't open is left out.
    const made = createPath(db, riley, { goal: "invoices", steps: [{ key: itemKey("course", staff.id) }, { key: TOPIC }] }, now).path;
    expect(made.steps.map((s) => s.key)).toEqual([TOPIC]);
    // From a page that isn't offered by itself, the whole course is what can be saved.
    const from = itemInPaths(db, riley, itemKey("page", c.id, "mismatch"));
    expect(from.wholeCourse).toBe(true);
    expect(from.item?.key).toBe(itemKey("course", c.id));
    expect(itemInPaths(db, riley, itemKey("course", staff.id)).item).toBeNull();
  });

  it("keeps Reviewed for now apart from the content's own record", () => {
    const c = course("Checking supplier invoices", invoicePages());
    const { path } = createPath(db, riley, {}, now);
    addStep(db, riley, path.id, { key: TOPIC }, now);
    const p = addStep(db, riley, path.id, { key: itemKey("course", c.id) }, now).path;
    const [topic, whole] = p.steps;
    expect(p.progress.label).toBe("You’ve explored 0 of 2 steps");

    const marked = updateStep(db, riley, path.id, topic.id, { reviewed: true, note: "Use before Thursday’s visit", revisit: true }, later(1)).path;
    expect(marked.steps[0]).toMatchObject({ explored: true, revisit: true, note: "Use before Thursday’s visit" });
    expect(marked.steps[0].item?.state).toBe("new");
    // Nothing official was written.
    expect(db.prepare("SELECT COUNT(*) AS n FROM lesson_completions WHERE user_id = 'riley'").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM magazine_completions WHERE user_id = 'riley'").get()).toEqual({ n: 0 });

    // The course's own completion shows through; the path only reports it.
    const g = readGuide(db, riley, c.slug);
    for (const pg of g.doc.pages) finishPage(db, riley, c.slug, g.revisionId, pg.id, later(2));
    completeGuide(db, riley, c.slug, g.revisionId, later(3));
    const done = readPath(db, riley, path.id, later(4)).path;
    expect(done.steps.find((s) => s.id === whole.id)?.item?.state).toBe("completed");
    expect(done.progress.done).toBe(true);
    expect(done.exploredAt).toBe(later(4).toISOString());
    // Taking the mark back is theirs to do, and the path is no longer all explored.
    expect(updateStep(db, riley, path.id, topic.id, { reviewed: false }, later(5)).path.progress.done).toBe(false);
    // Events say what happened, not what was written.
    const events = db.prepare("SELECT event, detail FROM discovery_events").all() as { event: string; detail: string }[];
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(["path.created", "step.added", "step.reviewed", "step.noted", "path.explored"]));
    expect(JSON.stringify(events)).not.toContain("Thursday");
  });

  it("opens a step where the content lives, starts the path, and flags a later change", () => {
    const c = course("Checking supplier invoices", invoicePages());
    const { path } = createPath(db, riley, {}, now);
    const p = addStep(db, riley, path.id, { key: itemKey("page", c.id, "sample") }, now).path;
    addStep(db, riley, path.id, { key: TOPIC }, now);
    const step = p.steps[0];
    expect(openStep(db, riley, path.id, step.id, later(1))).toEqual({ href: `/magazine/${c.slug}/sample` });
    const opened = readPath(db, riley, path.id, later(1)).path;
    expect(opened.state).toBe("active");
    expect(opened.steps[0].updated).toBe(false);
    expect(openStep(db, riley, path.id, opened.steps[1].id, later(1)).href).toBe(`/topics/noticing-a-change?discovery=${path.id}`);

    // Another page changes: this step isn't flagged. Its own page changes: it is, until they open it again.
    const edit = (pages: unknown[]) => {
      saveGuideDraft(db, author, c.id, { doc: { schema: 2, pages } }, later(2));
      publishGuide(db, author, c.id, "Edit", later(2), { allowUnverified: true, moveLearners: true });
    };
    const pages = invoicePages();
    pages[0] = page("intro", "Why invoices matter", "Reworded.");
    edit(pages);
    expect(readPath(db, riley, path.id, later(3)).path.steps[0].updated).toBe(false);
    pages[1] = page("sample", "Read a sample invoice", "A new annotated invoice.", { standalone: true });
    edit(pages);
    expect(readPath(db, riley, path.id, later(3)).path.steps[0].updated).toBe(true);
    openStep(db, riley, path.id, step.id, later(4));
    expect(readPath(db, riley, path.id, later(4)).path.steps[0].updated).toBe(false);
  });

  it("keeps a step whose content has gone, without a link, and never substitutes by itself", () => {
    const c = course("Checking supplier invoices", invoicePages());
    const gone = course("Supplier invoice disputes", invoicePages());
    const { path } = createPath(db, riley, {}, now);
    addStep(db, riley, path.id, { key: itemKey("page", c.id, "sample") }, now);
    addStep(db, riley, path.id, { key: itemKey("course", gone.id) }, now);

    // The page is no longer offered by itself: the course is suggested in its place.
    const pages = invoicePages();
    pages[1] = page("sample", "Read a sample invoice", "An annotated supplier invoice.");
    saveGuideDraft(db, author, c.id, { doc: { schema: 2, pages } }, later(1));
    publishGuide(db, author, c.id, "Edit", later(1), { allowUnverified: true });
    archiveGuide(db, author, gone.id, later(1));
    const after = readPath(db, riley, path.id, later(2)).path;
    expect(after.steps).toHaveLength(2);
    expect(after.steps[0]).toMatchObject({ item: null, title: "Read a sample invoice", gone: { why: "page", replacement: { key: itemKey("course", c.id) } } });
    expect(after.steps[1]).toMatchObject({ item: null, title: "Supplier invoice disputes", gone: { why: "retired" } });
    expect(() => openStep(db, riley, path.id, after.steps[0].id, later(2))).toThrow(/isn’t available/);
    // What's left can still be removed, and the path still reads.
    expect(removeStep(db, riley, path.id, after.steps[1].id, later(3)).path.steps).toHaveLength(1);
  });

  it("says only that access has gone when a course moves to another audience", () => {
    const c = course("Checking supplier invoices", invoicePages());
    const { path } = createPath(db, riley, {}, now);
    addStep(db, riley, path.id, { key: itemKey("course", c.id) }, now);
    db.prepare("UPDATE magazine_guides SET audience = ? WHERE id = ?").run('["staff"]', c.id);
    db.prepare("UPDATE magazine_revisions SET title = ?, standfirst = ? WHERE guide_id = ?").run("Renamed for staff", "Staff only detail.", c.id);
    const step = readPath(db, riley, path.id, later(1)).path.steps[0];
    expect(step.gone?.why).toBe("restricted");
    expect(step.item).toBeNull();
    // The title they saved, never the new one.
    expect(step.title).toBe("Checking supplier invoices");
    expect(JSON.stringify(step)).not.toContain("Staff only");
  });

  it("renames, pauses, archives and deletes without touching the learning itself", () => {
    const { path } = createPath(db, riley, { goal: "I want to understand invoices" }, now);
    expect(path.title).toBe("Understand invoices");
    addStep(db, riley, path.id, { key: TOPIC }, now);
    expect(updatePath(db, riley, path.id, { title: "My invoice route", state: "paused" }, later(1)).path).toMatchObject({
      title: "My invoice route",
      state: "paused",
    });
    expect(() => updatePath(db, riley, path.id, { title: " " }, later(1))).toThrow(/name/);
    expect(deletePath(db, riley, path.id, later(2))).toEqual({ deleted: true });
    expect(myDiscovery(db, riley, later(2)).paths).toEqual([]);
    expect(catalogue(db, riley).byKey.has(TOPIC)).toBe(true);
  });
});

describe("suggestions and requests", () => {
  it("suggests only what the person can open, and records the key words, not the goal", async () => {
    const hoistPages = () => [
      page("intro", "Why hoist checks matter", "A hoist is checked before every transfer."),
      page("sling", "Check a hoist sling", "Look at the sling's stitching, loops and label before a transfer.", { standalone: true }),
    ];
    const staff = course("Hoist safety for staff", hoistPages(), { audience: ["staff"] });
    const c = course("Hoist safety", hoistPages());
    const s = await suggest(db, riley, { goal: "I want to feel more confident doing hoist safety checks", minutes: 40 }, now, { ai: false });
    expect(s.engine).toBe("rules");
    expect(s.steps.length).toBeGreaterThan(0);
    // One of its pages fits, so the page is the step and its course is named beside it.
    expect(s.steps.map((x) => [x.item.title, x.item.parent?.title])).toEqual([["Check a hoist sling", "Hoist safety"]]);
    expect(s.steps.some((x) => x.item.ref === c.id)).toBe(true);
    expect(s.steps.some((x) => x.item.ref === staff.id)).toBe(false);
    expect(s.steps[0].reason).toBeTruthy();
    const rec = db.prepare("SELECT goal_words, outcome FROM discovery_recommendations WHERE id = ?").get(s.id) as { goal_words: string; outcome: string };
    expect(rec).toEqual({ goal_words: "hoist safety check", outcome: "offered" });

    // Started as offered, or changed first: the log says which.
    const made = createPath(db, riley, { goal: s.goal, title: s.title, steps: s.steps, recommendationId: s.id, start: true }, later(1)).path;
    expect(made.state).toBe("active");
    expect(made.steps.map((x) => x.key)).toEqual(s.steps.map((x) => x.key));
    expect(made.steps[0].reason).toBe(s.steps[0].reason);
    expect((db.prepare("SELECT outcome FROM discovery_recommendations WHERE id = ?").get(s.id) as { outcome: string }).outcome).toBe("accepted");
  });

  it("is honest when nothing fits, and takes a request instead", async () => {
    const s = await suggest(db, riley, { goal: "Operating the hydrotherapy hoist" }, now, { ai: false });
    expect(s.steps).toEqual([]);
    expect((db.prepare("SELECT outcome FROM discovery_recommendations WHERE id = ?").get(s.id) as { outcome: string }).outcome).toBe("empty");
    const sent = requestTopic(db, riley, { goal: "Operating the hydrotherapy hoist", context: "For a client at Rosewood" }, later(1));
    expect(sent.requests).toHaveLength(1);
    // Asking again keeps the one request.
    expect(requestTopic(db, riley, { goal: "operating the hydrotherapy hoist" }, later(2)).requests).toHaveLength(1);
    await expect(suggest(db, riley, { goal: "" }, now, { ai: false })).rejects.toThrow(/confident/);
  });

  it("shows content owners gaps in aggregate, and requests without names", async () => {
    await suggest(db, riley, { goal: "Operating the hydrotherapy hoist" }, now, { ai: false });
    await suggest(db, sam, { goal: "My client Mrs Papadopoulos and her dialysis" }, now, { ai: false });
    expect(() => discoveryGaps(db, riley, now)).toThrow(/authors/);
    let gaps = discoveryGaps(db, author, now);
    // One person each: counted, not shown.
    expect(gaps.noResult).toEqual([]);
    expect(gaps.hidden).toBe(2);
    expect(JSON.stringify(gaps)).not.toMatch(/papadopoulos|dialysis/i);
    await suggest(db, ash, { goal: "hydrotherapy hoist operating" }, later(1), { ai: false });
    gaps = discoveryGaps(db, author, later(1));
    expect(gaps.noResult).toMatchObject([{ words: "hoist hydrotherapy operating", people: 2, times: 2 }]);
    expect(gaps.totals.empty).toBe(3);

    requestTopic(db, riley, { goal: "Operating the hydrotherapy hoist for Mrs Lee" }, later(2));
    const [req] = discoveryGaps(db, author, later(2)).requests;
    expect(req).toMatchObject({ state: "new", audience: "coordinator" });
    expect(JSON.stringify(req)).not.toContain("riley");
    // The owner takes the client's name out, and can't mark it published without the link.
    expect(() => handleRequest(db, author, req.id, { state: "published" }, later(3))).toThrow(/link/);
    expect(() => handleRequest(db, author, req.id, { state: "published", link: "https://example.com" }, later(3))).toThrow(/on the Hub/);
    expect(() => handleRequest(db, riley, req.id, { state: "planned" }, later(3))).toThrow(/authors/);
    handleRequest(
      db,
      author,
      req.id,
      { goal: "Operating the hydrotherapy hoist", state: "published", link: "/topics/noticing-a-change", note: "Covered in the new Topic." },
      later(3),
    );
    expect(myDiscovery(db, riley, later(4)).requests[0]).toMatchObject({
      goal: "Operating the hydrotherapy hoist",
      state: "published",
      link: "/topics/noticing-a-change",
    });
    // The audit keeps that it was reworded, not the words.
    expect(JSON.stringify(db.prepare("SELECT * FROM audit WHERE event = 'discovery.request'").all())).not.toContain("Lee");
  });

  it("counts what's saved most, across people, without saying who", () => {
    // Noticing a change is a coordinator topic: a coordinator and a Trilogy staff member can both save it.
    for (const u of [riley, userById(db, "avery")!]) addStep(db, u, createPath(db, u, {}, now).path.id, { key: TOPIC, from: "content" }, now);
    const gaps = discoveryGaps(db, author, now);
    expect(gaps.saved[0]).toMatchObject({ key: TOPIC, people: 2 });
    expect(gaps.totals).toMatchObject({ paths: 2, people: 2, savedElsewhere: 2 });
  });
});
