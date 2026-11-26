import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { meantFor, userById } from "./auth";
import { blankLesson } from "@/content/blankLesson";
import { stories } from "@/content/stories";
import { resources } from "@/content/resources";
import type { Lesson } from "@/content/lessons";
import { createLesson, publishLesson } from "./authoredLessons";
import { syncPublishedLessons } from "./lessonRegistry";
import { canOpenTopic, catalogueTopics } from "./catalogue";
import { assignLearningPath, browseLearningPaths, createLearningPath, learnerPath, pathTopicOrder, startedLearningPaths } from "./learningPaths";
import { openableIds } from "./search";
import { catalogue as discoveryCatalogue } from "./discovery";
import { enrolment } from "./enrolments";
import { createGuide, learnerGuides, publishGuide, readGuide } from "./magazine";
import { savePassage } from "./favourites";
import { assignLearning } from "./people";
import { pathOpenTo } from "@/lib/pathShelves";

/*
  Who sees what, by audience, across the learner's surfaces (the owner, Nov 2026: "Care Coordinators only see their content").
  Each demo profile: Sam (supplier, partner), Riley (care coordinator), Casey (Care Partner org admin), Avery (Trilogy
  staff, not an author) and Jordan (the administrator, an author: sees everything). Content is made here for each
  audience, so the checks don't depend on what's in the demo database.
*/

let db: Db;
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-26T01:00:00Z");
const PROFILES = ["sam", "riley", "casey", "avery", "jordan"] as const;

let partnerTopic: string, coordTopic: string, coreTopic: string;
let partnerPath: string, coordPath: string, everyonePath: string, staffPath: string;
let partnerGuide: { id: string; slug: string }, coordGuide: { id: string; slug: string }, everyoneGuide: { id: string; slug: string };

function topic(title: string, track: Lesson["track"]) {
  const { slug } = createLesson(db, u("jordan"), { ...blankLesson(), title, track } as Lesson, now);
  publishLesson(db, u("jordan"), slug, now);
  return slug;
}
const path = (name: string, audience: string, lessons: string[]) => createLearningPath(db, u("jordan"), { name, audience, lessons }, now).id;
function guide(title: string, audience: string[]) {
  const doc = {
    schema: 2,
    pages: [
      {
        id: "p1",
        title: "",
        purpose: "",
        template: "blank",
        kind: "content",
        required: true,
        sections: [{ id: "one", title: "One", blocks: [{ id: "t", type: "text", body: "One." }] }],
      },
    ],
  };
  const g = createGuide(db, u("jordan"), { title, completion: "confirm", audience, doc }, now);
  publishGuide(db, u("jordan"), g.id, "", now);
  return { id: g.id, slug: g.slug };
}

beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
  partnerTopic = topic("ZZ Audience supplier visit routine", "partner");
  coordTopic = topic("ZZ Audience coordinator budget review", "coordinator");
  coreTopic = topic("ZZ Audience everyone safeguarding basics", "core");
  partnerPath = path("ZZ Audience suppliers path", "Service partners and suppliers", [partnerTopic]);
  coordPath = path("ZZ Audience coordinators path", "Care Coordinators", [coordTopic]);
  everyonePath = path("ZZ Audience everyone path", "Everyone", [coreTopic]);
  staffPath = path("ZZ Audience staff path", "Trilogy Care staff", [coreTopic]);
  partnerGuide = guide("ZZ Audience supplier course", ["partner"]);
  coordGuide = guide("ZZ Audience coordinator course", ["coordinator"]);
  everyoneGuide = guide("ZZ Audience everyone course", []);
});

/** Everything of ours each surface puts in front of this person, by kind. */
function seen(id: string) {
  const user = u(id);
  const ours = (slugs: string[]) => slugs.filter((s) => [partnerTopic, coordTopic, coreTopic].includes(s)).sort();
  const paths = (ids: string[]) => ids.filter((p) => [partnerPath, coordPath, everyonePath, staffPath].includes(p)).sort();
  const guides = (ids: string[]) => ids.filter((g) => [partnerGuide.id, coordGuide.id, everyoneGuide.id].includes(g)).sort();
  const opens = (f: () => unknown) => {
    try {
      f();
      return true;
    } catch {
      return false;
    }
  };
  const search = [...openableIds(db, user)];
  const disco = discoveryCatalogue(db, user).items;
  return {
    topicsList: ours(catalogueTopics(db, id).map((t) => t.slug)),
    topicsByLink: ours([partnerTopic, coordTopic, coreTopic].filter((s) => canOpenTopic(db, user, s))),
    topicsInSearch: ours(search.filter((d) => d.startsWith("lesson:")).map((d) => d.slice(7))),
    topicsInDiscovery: ours(disco.filter((i) => i.kind === "topic").map((i) => i.ref)),
    pathsList: paths(browseLearningPaths(db, user).map((p) => p.id)),
    pathsByLink: paths([partnerPath, coordPath, everyonePath, staffPath].filter((p) => opens(() => learnerPath(db, user, p)))),
    pathsInSearch: paths(search.filter((d) => d.startsWith("path:")).map((d) => d.slice(5))),
    pathsOnTopicsPage: paths(pathTopicOrder(db, user).map((p) => p.id)),
    coursesList: guides(learnerGuides(db, user, now).map((g) => g.id)),
    coursesByLink: guides([partnerGuide, coordGuide, everyoneGuide].filter((g) => opens(() => readGuide(db, user, g.slug))).map((g) => g.id)),
    coursesInDiscovery: guides(disco.filter((i) => i.kind === "course").map((i) => i.ref)),
    stories: search.filter((d) => d.startsWith("story:")).map((d) => d.slice(6)),
    resources: search.filter((d) => d.startsWith("resource:")).map((d) => d.slice(9)),
  };
}

describe("audience: what each demo profile sees", () => {
  it("a care coordinator (Riley) sees coordinator and general content only, on every surface and by link", () => {
    const r = seen("riley");
    const topics = [coordTopic, coreTopic].sort();
    expect(r.topicsList).toEqual(topics);
    expect(r.topicsByLink).toEqual(topics);
    expect(r.topicsInSearch).toEqual(topics);
    expect(r.topicsInDiscovery).toEqual(topics);
    const paths = [coordPath, everyonePath].sort();
    expect(r.pathsList).toEqual(paths);
    expect(r.pathsByLink).toEqual(paths);
    expect(r.pathsInSearch).toEqual(paths);
    expect(r.pathsOnTopicsPage).toEqual(paths);
    const courses = [coordGuide.id, everyoneGuide.id].sort();
    expect(r.coursesList).toEqual(courses);
    expect(r.coursesByLink).toEqual(courses);
    expect(r.coursesInDiscovery).toEqual(courses);
    // News and resources: only those tagged for coordinators.
    expect(r.stories).toEqual(stories.filter((s) => s.audience.includes("coordinator")).map((s) => s.slug));
    expect(r.resources).toEqual(resources.filter((x) => x.audience.includes("coordinator")).map((x) => x.id));
    expect(r.stories.length).toBeLessThan(stories.length);
    expect(r.resources.length).toBeLessThan(resources.length);
  });

  it("a supplier (Sam) and a Care Partner (Casey) see partner and general content only", () => {
    for (const id of ["sam", "casey"]) {
      const r = seen(id);
      const topics = [partnerTopic, coreTopic].sort();
      expect(r.topicsList).toEqual(topics);
      expect(r.topicsByLink).toEqual(topics);
      expect(r.topicsInSearch).toEqual(topics);
      expect(r.topicsInDiscovery).toEqual(topics);
      const paths = [partnerPath, everyonePath].sort();
      expect(r.pathsList).toEqual(paths);
      expect(r.pathsByLink).toEqual(paths);
      expect(r.pathsInSearch).toEqual(paths);
      const courses = [partnerGuide.id, everyoneGuide.id].sort();
      expect(r.coursesList).toEqual(courses);
      expect(r.coursesByLink).toEqual(courses);
      expect(r.stories).toEqual(stories.filter((s) => s.audience.includes("partner")).map((s) => s.slug));
      expect(r.resources).toEqual(resources.filter((x) => x.audience.includes("partner")).map((x) => x.id));
    }
  });

  it("Trilogy staff (Avery) see every topic, path, story and resource, but only staff or general courses", () => {
    const r = seen("avery");
    expect(r.topicsList).toEqual([partnerTopic, coordTopic, coreTopic].sort());
    expect(r.topicsByLink).toEqual([partnerTopic, coordTopic, coreTopic].sort());
    expect(r.pathsList).toEqual([partnerPath, coordPath, everyonePath, staffPath].sort());
    expect(r.pathsByLink).toEqual([partnerPath, coordPath, everyonePath, staffPath].sort());
    // Magazine courses can be tagged for staff, so a partner-only or coordinator-only course isn't theirs (magazine.canRead).
    expect(r.coursesList).toEqual([everyoneGuide.id]);
    expect(r.stories).toHaveLength(stories.length);
    expect(r.resources).toHaveLength(resources.length);
  });

  it("the administrator (Jordan, an author) sees everything", () => {
    const r = seen("jordan");
    expect(r.topicsList).toEqual([partnerTopic, coordTopic, coreTopic].sort());
    expect(r.topicsByLink).toEqual([partnerTopic, coordTopic, coreTopic].sort());
    expect(r.pathsList).toEqual([partnerPath, coordPath, everyonePath, staffPath].sort());
    expect(r.pathsByLink).toEqual([partnerPath, coordPath, everyonePath, staffPath].sort());
    expect(r.coursesList).toEqual([partnerGuide.id, coordGuide.id, everyoneGuide.id].sort());
    expect(r.stories).toHaveLength(stories.length);
    expect(r.resources).toHaveLength(resources.length);
  });

  it("never gives a coordinator partner-only content, or a partner coordinator-only content, on any surface", () => {
    const partnerOnly = new Set([partnerTopic, partnerPath, partnerGuide.id, ...stories.filter((s) => !s.audience.includes("coordinator")).map((s) => s.slug)]);
    const coordOnly = new Set([coordTopic, coordPath, coordGuide.id, ...stories.filter((s) => !s.audience.includes("partner")).map((s) => s.slug)]);
    for (const id of PROFILES) {
      const all = Object.values(seen(id)).flat();
      const user = u(id);
      if (user.role === "author" || user.audience === "staff") continue;
      const wrong = user.audience === "coordinator" ? partnerOnly : coordOnly;
      expect(all.filter((x) => wrong.has(x))).toEqual([]);
    }
  });

  it("other audiences' content is refused by its link and by every action, not just left out of lists", () => {
    const riley = u("riley");
    expect(() => enrolment(db, riley, { kind: "topic", id: partnerTopic, action: "enrol" }, now)).toThrow(/not found/);
    expect(() => enrolment(db, riley, { kind: "path", id: partnerPath, action: "enrol" }, now)).toThrow(/not found/);
    expect(() => savePassage(db, riley, { source: "topic", id: partnerTopic, blockId: "intro", quote: "x" }, now)).toThrow(/not found/);
    expect(() => readGuide(db, riley, partnerGuide.slug)).toThrow(/not found/);
    expect(() => learnerPath(db, u("sam"), coordPath)).toThrow(/not found/);
    // A started topic doesn't pull another audience's path into "Your learning" either.
    expect(startedLearningPaths(db, riley).map((p) => p.id)).not.toContain(partnerPath);
  });

  it("what an administrator gives someone stays theirs: an assigned topic or path opens whatever its audience", () => {
    assignLearning(db, u("jordan"), { kind: "topic", id: partnerTopic, userIds: ["riley"], dueDate: null }, now);
    assignLearningPath(db, u("jordan"), partnerPath, ["riley"], null, now);
    const r = seen("riley");
    expect(r.topicsList).toContain(partnerTopic);
    expect(r.topicsByLink).toContain(partnerTopic);
    expect(r.pathsList).toContain(partnerPath);
    expect(r.pathsByLink).toContain(partnerPath);
  });

  it("reads a path's audience wording the way authors write it", () => {
    expect(pathOpenTo("Care Coordinators", "coordinator")).toBe(true);
    expect(pathOpenTo("Care Coordinators", "partner")).toBe(false);
    expect(pathOpenTo("Service partners and suppliers", "coordinator")).toBe(false);
    expect(pathOpenTo("Independent contractors", "coordinator")).toBe(false);
    expect(pathOpenTo("External service providers", "coordinator")).toBe(false);
    expect(pathOpenTo("Care Partners and Assessment Partners", "partner")).toBe(true);
    expect(pathOpenTo("Care Coordinators and Care Partners", "coordinator")).toBe(true);
    expect(pathOpenTo("Trilogy Care staff", "coordinator")).toBe(false);
    // "Partnership Managers" are Trilogy's own people, not Care Partners.
    expect(pathOpenTo("Partnership Managers", "partner")).toBe(false);
    expect(pathOpenTo("Everyone", "coordinator")).toBe(true);
    expect(pathOpenTo("Everyone supporting older people at home", "partner")).toBe(true);
    expect(pathOpenTo("", "coordinator")).toBe(true);
    expect(pathOpenTo("Care Coordinators", "staff")).toBe(true);
  });

  it("news and resources follow the webinars' rule (auth.meantFor)", () => {
    expect(meantFor(u("riley"), ["partner"])).toBe(false);
    expect(meantFor(u("riley"), ["partner", "coordinator"])).toBe(true);
    expect(meantFor(u("sam"), ["coordinator"])).toBe(false);
    expect(meantFor(u("avery"), ["partner"])).toBe(true);
    expect(meantFor(u("jordan"), ["coordinator"])).toBe(true);
  });
});
