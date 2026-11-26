import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { blankLesson } from "@/content/blankLesson";
import type { Card, Lesson } from "@/content/lessons";
import { createLesson } from "./authoredLessons";
import { publishApproved } from "./topicApproval";
import { ensureCharacters, saveCharacter } from "./characters";
import { actOnPeople, aiDrafted, auditPeople, charactersAfterTopic, PORTRAIT_COST_USD, topicPeople } from "./peopleInContent";

/*
  People in your content: the audit only reads and marks who's in the library; a Topic's new people join the library
  when it's published, with a portrait queued only when the content says man or woman. Never calls OpenAI: portraits
  go to a fake queue.
*/

let db: Db;
let jordan: User;
const now = new Date("2026-11-25T00:00:00Z");
const key = process.env.OPENAI_API_KEY;

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  db = openDb(":memory:");
  jordan = userById(db, "jordan")!;
  ensureCharacters(db, now);
});
afterEach(() => {
  if (key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = key;
});

/** A Topic whose story cards say these things. */
function topic(title: string, bodies: string[], extra: Partial<Card> = {}): Lesson {
  const base = blankLesson();
  const nodes: Record<string, Card> = { ...base.nodes };
  bodies.forEach((body, i) => {
    nodes[`story${i}`] = {
      id: `story${i}`,
      type: "image",
      beat: 0,
      label: "Story",
      heading: "The story",
      body,
      visual: { kind: "none" },
      next: "check",
      ...extra,
    } as Card;
  });
  return { ...base, title, nodes };
}
const fakeQueue = () => vi.fn((_db: Db, _actor: User, ids: string[]) => ({ queued: ids }));
const count = () => (db.prepare("SELECT COUNT(*) AS n FROM characters").get() as { n: number }).n;

describe("the audit", () => {
  it("marks who's in the library with a portrait, without one, and not at all, and changes nothing", () => {
    saveCharacter(db, jordan, { id: "mrs-patel", portrait: "/images/mrs-patel.webp" }, now);
    saveCharacter(db, jordan, { name: "Bruce Harding", aliases: ["Bruce"], role: "coordinator", look: "man in his forties" }, now);
    createLesson(
      db,
      jordan,
      topic("Bruce’s week", [
        "Bruce Harding is a Care Partner in Trilogy’s Bowen Hills office.",
        "Mrs Kowalski asks Bruce about her invoice, and Mrs Patel waves from the door.",
        "Bruce types the address into Microsoft Teams.",
      ]),
      now,
    );
    const before = count();
    const a = auditPeople(db);
    expect(count()).toBe(before);
    const who = (n: string) => a.people.find((p) => p.name === n);
    expect(who("Mrs Patel")?.state).toBe("ready");
    expect(who("Bruce Harding")).toMatchObject({ state: "no-portrait", library: { id: "bruce-harding" } });
    expect(who("Bruce Harding")?.where.map((w) => w.slug)).toContain("bruces-week");
    expect(who("Mrs Kowalski")).toMatchObject({ state: "missing", gender: "woman", role: "participant" });
    expect(who("Mrs Kowalski")?.quote).toMatch(/Mrs Kowalski asks Bruce/);
    // Bruce counts once, as the library's Bruce Harding; places and products aren't people.
    expect(a.people.filter((p) => /Bruce/.test(p.name))).toHaveLength(1);
    for (const n of ["Bowen Hills", "Bowen", "Microsoft", "Teams", "Trilogy"]) expect(who(n)).toBeUndefined();
    expect(a.counts.missing).toBe(a.people.filter((p) => p.state === "missing").length);
    expect(a.cost.total).toBeCloseTo(a.cost.portraits * PORTRAIT_COST_USD, 5);
  });

  it("reads deleted Topics as gone, and remembers a dismissed name", () => {
    createLesson(db, jordan, topic("Zelda’s day", ["Zelda opens her front door.", "Zelda waves."]), now);
    expect(auditPeople(db).people.find((p) => p.name === "Zelda")?.state).toBe("missing");
    const k = auditPeople(db).people.find((p) => p.name === "Zelda")!.key;
    actOnPeople(db, jordan, { action: "dismiss", keys: [k] }, now);
    expect(auditPeople(db).people.find((p) => p.name === "Zelda")?.state).toBe("dismissed");
    actOnPeople(db, jordan, { action: "restore", keys: [k] }, now);
    expect(auditPeople(db).people.find((p) => p.name === "Zelda")?.state).toBe("missing");
    db.prepare("UPDATE authored_lessons SET deleted_at = ? WHERE slug = 'zeldas-day'").run(now.toISOString());
    expect(auditPeople(db).people.find((p) => p.name === "Zelda")).toBeUndefined();
  });
});

describe("adding people from the page", () => {
  it("adds for free, and makes a portrait only once the cost is confirmed and the look says man or woman", () => {
    process.env.OPENAI_API_KEY = "test-key";
    createLesson(db, jordan, topic("Two visits", ["Mrs Kowalski opens the door.", "Wendell rings the bell.", "Wendell waits."]), now);
    const people = auditPeople(db).people;
    const kowalski = people.find((p) => p.name === "Mrs Kowalski")!;
    const wendell = people.find((p) => p.name === "Wendell")!;
    const queue = fakeQueue();
    expect(actOnPeople(db, jordan, { action: "add", keys: [wendell.key] }, now, queue)).toMatchObject({ added: ["Wendell"], queued: 0 });
    expect(queue).not.toHaveBeenCalled();
    expect(() => actOnPeople(db, jordan, { action: "portrait", keys: [kowalski.key] }, now, queue)).toThrow(/Confirm the cost/);
    expect(actOnPeople(db, jordan, { action: "portrait", keys: [kowalski.key], confirm: true }, now, queue)).toMatchObject({
      added: ["Mrs Kowalski"],
      queued: 1,
    });
    expect(queue).toHaveBeenCalledWith(db, jordan, ["mrs-kowalski"]);
    // Wendell's content doesn't say man or woman: no portrait until an author says.
    const w = auditPeople(db).people.find((p) => p.name === "Wendell")!;
    expect(actOnPeople(db, jordan, { action: "portrait", keys: [w.key], confirm: true }, now, queue)).toMatchObject({
      queued: 0,
      needsDescription: ["Wendell"],
    });
    expect(
      actOnPeople(
        db,
        jordan,
        { action: "portrait", keys: [w.key], confirm: true, edits: { [w.key]: { look: "man in his seventies, a retired farmer" } } },
        now,
        queue,
      ),
    ).toMatchObject({ queued: 1 });
  });

  it("joins a first name to the character it belongs to", () => {
    saveCharacter(db, jordan, { name: "Hana Mitchell", role: "worker", look: "woman in her thirties" }, now);
    createLesson(db, jordan, topic("Hana’s round", ["Hana parks the car.", "Hana knocks twice."]), now);
    const hana = auditPeople(db).people.find((p) => p.name === "Hana")!;
    expect(hana.maybe).toMatchObject({ name: "Hana Mitchell" });
    actOnPeople(db, jordan, { action: "same-as", keys: [hana.key], id: hana.maybe!.id }, now);
    expect(
      auditPeople(db)
        .people.find((p) => p.name === "Hana Mitchell")
        ?.where.map((w) => w.slug),
    ).toContain("hanas-round");
  });
});

describe("a Topic’s people join the library when it’s published", () => {
  it("adds new people, queues a portrait for a man or a woman, and lists the rest as needing a description", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const queue = fakeQueue();
    const lesson = topic("Bruce’s week", [
      "Bruce Harding is a Care Partner in Trilogy’s Bowen Hills office.",
      "Bruce opens his laptop. Bruce types the address.",
      "Wendell rings the bell. Wendell waits at the gate.",
      "Mrs Patel waves from the door.",
    ]);
    const out = charactersAfterTopic(db, jordan, lesson, now, queue);
    expect(out.added.sort()).toEqual(["Bruce Harding", "Wendell"]);
    expect(out.queued).toContain("Bruce Harding");
    expect(out.queued).not.toContain("Wendell");
    expect(out.needsDescription).toContain("Wendell");
    const bruce = db.prepare("SELECT * FROM characters WHERE id = 'bruce-harding'").get() as { aliases: string; role: string; look: string; origin: string };
    expect(bruce).toMatchObject({ role: "coordinator", origin: "publish" });
    expect(JSON.parse(bruce.aliases)).toEqual(["Bruce"]);
    expect(bruce.look).toMatch(/^man, a care coordinator\. Care Partner in Trilogy’s Bowen Hills office/);
    const wendell = db.prepare("SELECT look FROM characters WHERE id = 'wendell'").get() as { look: string };
    expect(wendell.look).toMatch(/^person/);
    // Wendell's id never reaches the paid queue.
    expect(queue.mock.calls.flatMap((c) => c[2])).not.toContain("wendell");
    // Mrs Patel was already in the library (a seeded character): not added again.
    expect(out.added).not.toContain("Mrs Patel");
  });

  it("queues nothing when the content doesn't say man or woman, or when OpenAI isn't connected", () => {
    const queue = fakeQueue();
    process.env.OPENAI_API_KEY = "test-key";
    charactersAfterTopic(db, jordan, topic("Gate", ["Wendell rings the bell.", "Wendell waits."]), now, queue);
    expect(queue).not.toHaveBeenCalled();
    delete process.env.OPENAI_API_KEY;
    const out = charactersAfterTopic(db, jordan, topic("Laptop", ["Bruce opens his laptop.", "Bruce types."]), now, queue);
    expect(out.added).toEqual(["Bruce"]);
    expect(queue).not.toHaveBeenCalled();
  });

  it("runs on publish and shows in the editor's notice, without holding the publish up", () => {
    const { slug } = createLesson(db, jordan, topic("Rocco’s fall", ["Rocco grabs his walking stick on the step.", "Rocco rings the office."]), now);
    expect(topicPeople(db, jordan, { ...blankLesson(), ...topic("x", ["Rocco grabs his walking stick on the step.", "Rocco rings."]) })).toEqual([
      { name: "Rocco", state: "will-make" },
    ]);
    const r = publishApproved(db, jordan, slug, now);
    expect(r.version).toBe("1.0");
    expect(r.people.added).toEqual(["Rocco"]);
    // OpenAI isn't connected in tests, so nothing is queued; Rocco waits in the library for a portrait.
    expect(r.people.queued).toEqual([]);
    expect(db.prepare("SELECT status, origin FROM characters WHERE id = 'rocco'").get()).toMatchObject({ status: "none", origin: "publish" });
  });

  it("knows a Topic Claude drafted by its build stages", () => {
    expect(aiDrafted(topic("Plain", ["Text."]))).toBe(false);
    expect(aiDrafted(topic("Drafted", ["Text."], { stage: "hook" }))).toBe(true);
  });
});
