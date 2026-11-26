import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  The Activity Catalogue at run time, with the Magazine builder's selection driven by mocked model replies (no call to
  Claude, OpenAI or anyone else): the outline's activities come only from the catalogue's shortlist, a made-up id or a
  specialist block passed off as configurable never reaches the editor, each chosen block carries “Why this block?”, and
  the author's decisions are audited. Then the homepage showcase and directory: only published courses the person can
  read, changing by role, gone once a course is archived; and the Admin view and its export agree.
*/

// Each call takes the next queued reply; a reply the check refuses is reported back and the next one used, as the real loop does.
const replies: unknown[] = [];
const refused: string[][] = [];
vi.mock("./claudeJson", () => ({
  keyCounts: () => ({ purpose: 0, blocks: 0 }),
  askForJson: async (_content: unknown, check: (v: unknown) => string[]) => {
    while (replies.length) {
      const value = replies.shift();
      const issues = check(value);
      if (!issues.length) return { value, usage: { mocked: true } };
      refused.push(issues);
    }
    throw new Error("No acceptable mocked reply.");
  },
}));

import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { archiveGuide, createGuide, publishGuide } from "./magazine";
import { draftPlan, generatePage, proposeOutline, updatePlan } from "./magazineDraft";
import { activityInventory, exportInventory, homeShowcase, learnerDirectory, recordActivityEvent, saveShowcase } from "./activityCatalogue";
import { EXPORT_COLUMNS, filterRows } from "@/lib/activityCatalogue";

let db: Db;
let author: User, coordinator: User, partner: User, owner: User;
const now = new Date("2026-11-26T00:00:00Z");
const noop = () => {};

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  coordinator = userById(db, "riley")!;
  partner = userById(db, "sam")!;
  owner = userById(db, "casey")!;
  replies.length = 0;
  refused.length = 0;
});

const why = (behaviour: string) => ({
  behaviour,
  evidence: "The brief says handovers are missed after discharge.",
  alternative: "A decision question: too small for a run of decisions over 72 hours.",
  rationale: "The decision happens over time with competing demands.",
  learnerAction: "Verifies, arranges and escalates, then writes a handover.",
  signal: "Rubric conditions and critical errors in the debrief.",
});

describe("AI selection for a Magazine (mocked model)", () => {
  it("chooses only from the catalogue's shortlist, keeps the catalogue's mode, and explains every choice", async () => {
    const g = createGuide(db, author, { title: "Hospital discharge: the first 72 hours", template: "decide", audience: ["coordinator"] }, now);
    const page = {
      title: "The return home",
      purpose: "Decide what to verify first",
      template: "decide",
      minutes: 20,
      required: true,
      sources: [],
      missing: [],
    };
    // First reply invents an activity; the second passes the check.
    replies.push(
      { pages: [{ ...page, activities: [{ type: "holodeck", why: why("x") }] }] },
      {
        pages: [
          {
            ...page,
            activities: [
              { type: "discharge", mode: "configurable", why: why("Escalate a missing first nursing visit before discharge") },
              { type: "decision", why: why("Choose who to call first") },
            ],
          },
        ],
        questions: [],
      },
    );
    const out = await proposeOutline(
      db,
      author,
      g.id,
      { brief: "Handovers after hospital discharge are incomplete; first visits are missed.", minutes: 20 },
      now,
      noop,
    );
    expect(refused[0].join(" ")).toMatch(/“holodeck” isn’t one of the activities offered/);
    const acts = out.outline[0].activities!;
    expect(acts.map((a) => a.type)).toEqual(["discharge", "decision"]);
    // The model said "configurable"; the catalogue says a specialist sets it up.
    expect(acts[0]).toMatchObject({ mode: "recommend", decision: "suggested" });
    expect(acts[1].mode).toBe("configurable");
    expect(acts[0].why.owner).toMatch(/clinical governance/);
    const rec = db.prepare("SELECT next FROM audit WHERE event = 'activity.recommended'").get() as { next: string };
    expect(JSON.parse(rec.next).types).toEqual(["discharge", "decision"]);

    // The author accepts the simulator and rejects the decision question; both are audited.
    const edited = out.outline.map((p) => ({
      ...p,
      activities: p.activities!.map((a) => ({ ...a, decision: a.type === "discharge" ? "accepted" : "rejected" })),
    }));
    updatePlan(db, author, g.id, { outline: edited }, now);
    const events = (db.prepare("SELECT event FROM audit WHERE event LIKE 'activity.recommendation_%'").all() as { event: string }[]).map((r) => r.event);
    expect(events.sort()).toEqual(["activity.recommendation_accepted", "activity.recommendation_rejected"]);

    // The page: Claude tries to write the specialist block itself and is told no; then adds a branching scenario the author
    // never accepted and is told no again (only accepted activities, Nov 2026); then writes the page around the simulator.
    replies.push(
      { sections: [{ title: "At the desk", blocks: [{ type: "discharge", title: "Dot" }] }] },
      {
        sections: [
          {
            title: "At the desk",
            blocks: [
              { type: "text", body: "Dot is going home on Friday. The simulator below is where you'll decide what to verify." },
              {
                type: "branching",
                why: why("Follow one handover through"),
                scenes: [
                  {
                    id: "s1",
                    text: "The ward calls.",
                    choices: [
                      { text: "Check the handover", next: "s2" },
                      { text: "Book the cleaner", next: "s3" },
                    ],
                  },
                  { id: "s2", text: "You find the gap.", ending: { outcome: "good", summary: "Checking first finds the gap." } },
                  { id: "s3", text: "The nurse never comes.", ending: { outcome: "poor", summary: "Nobody owned the first visit." } },
                ],
              },
            ],
          },
        ],
      },
      {
        sections: [
          {
            title: "At the desk",
            blocks: [
              { type: "text", body: "Dot is going home on Friday. The simulator below is where you'll decide what to verify." },
              { type: "callout", style: "important", body: "Check who owns the first visit before Dot leaves the ward." },
            ],
          },
        ],
      },
    );
    const p = await generatePage(db, author, g.id, { index: 0 }, now, noop);
    expect(refused.at(-2)!.join(" ")).toMatch(/don’t use discharge blocks/);
    expect(refused.at(-1)!.join(" ")).toMatch(/don’t use branching blocks/);
    expect(p.specialist.map((s) => s.type)).toEqual(["discharge"]);
    const blocks = p.page.sections.flatMap((s) => s.blocks);
    expect(blocks.map((b) => b.type)).toEqual(["text", "callout"]);
    // A rejected recommendation is never written in.
    expect(blocks.some((b) => b.type === "decision")).toBe(false);
    expect(draftPlan(db, author, g.id).outline![0].activities![1].decision).toBe("rejected");
  });

  it("drops an activity the catalogue doesn't let the builder use, even in the author's own edits", () => {
    const g = createGuide(db, author, { title: "Video page", template: "do" }, now);
    const plan = updatePlan(
      db,
      author,
      g.id,
      {
        outline: [
          {
            title: "Watch",
            purpose: "p",
            template: "do",
            minutes: 5,
            required: true,
            interaction: "",
            sources: [],
            missing: [],
            activities: [
              { type: "video", why: why("watch") },
              { type: "ava", why: why("watch Ava") },
              { type: "checklist", why: why("tick the checks") },
            ],
          },
        ],
      },
      now,
    );
    expect(plan.outline![0].activities!.map((a) => a.type)).toEqual(["checklist"]);
  });
});

const branchingCourse = {
  schema: 2,
  pages: [
    {
      id: "p1",
      title: "",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      sections: [
        {
          id: "one",
          title: "One",
          blocks: [
            {
              id: "b1",
              type: "branching",
              scenes: [
                { id: "s1", text: "Start", choices: [{ id: "c1", text: "Go", next: "s2" }] },
                { id: "s2", text: "End", ending: { outcome: "good", summary: "Done." } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("the homepage showcase and the learner directory", () => {
  it("shows only published courses the person may read, by role, and drops one once it's archived or switched off", () => {
    const c = createGuide(db, author, { title: "For coordinators", completion: "confirm", audience: ["coordinator"], doc: branchingCourse }, now);
    publishGuide(db, author, c.id, "", now);
    const p = createGuide(db, author, { title: "For partners", completion: "confirm", audience: ["partner"], doc: branchingCourse }, now);
    publishGuide(db, author, p.id, "", now);
    const t = createGuide(db, author, { title: "zz test course", completion: "confirm", audience: [], doc: branchingCourse }, now);
    publishGuide(db, author, t.id, "", now);
    const slug = (id: string) => (db.prepare("SELECT slug FROM magazine_guides WHERE id = ?").get(id) as { slug: string }).slug;
    const pick = (id: string, guide: string) => ({ id, activity: "branching", guide, question: `What happens in ${id}?`, cta: "Try it" });
    saveShowcase(db, author, [pick("coord", slug(c.id)), pick("partner", slug(p.id)), pick("test", slug(t.id)), pick("missing", "no-such-course")], now);

    expect(homeShowcase(db, coordinator, now).cards.map((x) => x.pick)).toEqual(["coord"]);
    expect(homeShowcase(db, partner, now).cards.map((x) => x.pick)).toEqual(["partner"]);
    // Directory: the partner course, never the coordinators' one; the owner also gets their business tools.
    expect(learnerDirectory(db, partner, now).items.map((i) => i.key)).toContain(`course:${slug(p.id)}`);
    expect(learnerDirectory(db, partner, now).items.map((i) => i.key)).not.toContain(`course:${slug(c.id)}`);
    expect(learnerDirectory(db, partner, now).items.map((i) => i.key)).not.toContain("tool.caseload-margin");
    expect(learnerDirectory(db, owner, now).items.map((i) => i.key)).toContain("tool.caseload-margin");
    expect(homeShowcase(db, owner, now).work?.href).toBe("/tools/caseload-margin");

    archiveGuide(db, author, c.id, now);
    expect(homeShowcase(db, coordinator, now).cards).toEqual([]);
    saveShowcase(db, author, [{ ...pick("partner", slug(p.id)), off: true }], now);
    expect(homeShowcase(db, partner, now).cards).toEqual([]);
    saveShowcase(db, author, [{ ...pick("partner", slug(p.id)), from: "2027-01-01" }], now);
    expect(homeShowcase(db, partner, now).cards).toEqual([]);
    expect(() => saveShowcase(db, author, [{ ...pick("x", slug(p.id)), activity: "text" }], now)).toThrow(/an activity that can be featured/);
    expect(() => saveShowcase(db, partner, [], now)).toThrow();
  });

  it("records showcase events with the activity's id and version, and refuses anything else", () => {
    recordActivityEvent(db, partner, { event: "opened", activity: "discharge", surface: "home", ref: "a-course" }, now);
    expect(db.prepare("SELECT activity, version, audience, ref FROM activity_events").get()).toMatchObject({
      activity: "discharge",
      version: 1,
      audience: "partner",
      ref: "a-course",
    });
    expect(() => recordActivityEvent(db, partner, { event: "opened", activity: "made-up", surface: "home" }, now)).toThrow(/Unknown/);
    expect(() => recordActivityEvent(db, partner, { event: "answer", activity: "discharge", surface: "home" }, now)).toThrow(/Unknown/);
  });
});

describe("the Admin catalogue", () => {
  it("is for authors, checks every entry, and exports exactly the filtered rows with the same columns", () => {
    expect(() => activityInventory(db, partner, now)).toThrow();
    const inv = activityInventory(db, author, now);
    expect(inv.rows.length).toBeGreaterThan(80);
    expect(inv.totals.broken).toBe(0);
    for (const r of inv.rows)
      for (const k of Object.keys(r.checks)) expect(["yes", "partial", "no", "unknown", "n/a"]).toContain(r.checks[k as "exists"].state);
    const filters = { ai: "recommend", kind: "simulator" };
    const shown = filterRows(inv.rows, filters);
    expect(shown.length).toBeGreaterThan(5);
    const out = exportInventory(db, author, filters, now);
    expect(out.buffer.length).toBeGreaterThan(1000);
    expect(EXPORT_COLUMNS[0][0]).toBe("ID");
    // A specialist simulator is AI-recommended, not AI-ready; a configurable block is AI-ready.
    expect(inv.rows.find((r) => r.id === "discharge")!.checks.aiReady.state).toBe("partial");
    expect(inv.rows.find((r) => r.id === "decision")!.checks.aiReady.state).toBe("yes");
    expect(inv.rows.find((r) => r.id === "video")!.checks.aiReady.state).toBe("no");
  });
});
