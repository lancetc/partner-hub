import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { authorGuide, createGuide, publishGuide, readGuide } from "./magazine";
import { demoEditionOf, demoSignOffEnabled, setDemoSignOff } from "./demoSignOff";
import { hazardScanState, startHazardScan } from "./hazardScan";
import { PEARCE_BEDROOM } from "@/content/hazardScenes";
import { CASE_REFUSED_CHECK } from "@/content/caseThreadCases";
import { freshCaseThread } from "@/lib/caseThread";
import { REDPEN_CASES } from "@/content/redpenCases";

/* Demo sign-off (docs/demo-sign-off.md): a demo Hub's honest stand-in for reviewers' sign-offs. */

let db: Db;
let jordan: User, riley: User, dana: User;
const now = new Date("2026-11-24T00:00:00Z");

const page = (blocks: object[]) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "Demo",
      purpose: "",
      template: "blank",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Demo", blocks }],
    },
  ],
});
/** A course whose blocks wait on reviewers: an unreviewed Spot the Hazard scene and an unsigned case thread. */
const unsigned = () =>
  createGuide(
    db,
    jordan,
    {
      title: "Demo course",
      completion: "confirm",
      doc: page([
        { id: "hz", type: "hazardscan", ...structuredClone(PEARCE_BEDROOM) },
        { id: "case", type: "casethread", ...freshCaseThread(CASE_REFUSED_CHECK) },
      ]) as never,
    },
    now,
  );

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, dana] = ["jordan", "riley", "dana"].map((id) => userById(db, id)!);
});
afterEach(() => vi.unstubAllEnvs());

describe("demo sign-off", () => {
  it("is off unless the Hub is told it's a demo, and then only a superadmin can record one", () => {
    vi.stubEnv("HUB_DEMO_SIGNOFF", "");
    expect(demoSignOffEnabled()).toBe(false);
    const c = unsigned();
    expect(() => setDemoSignOff(db, jordan, c.id, true, now)).toThrow(/off on this Hub/);
    expect(authorGuide(db, jordan, c.id).demoSignOff).toEqual({ enabled: false, signed: null });
    vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
    expect(() => setDemoSignOff(db, dana, c.id, true, now)).toThrow(/Only a superadmin/);
    expect(setDemoSignOff(db, jordan, c.id, true, now)).toMatchObject({ by: "jordan", at: now.toISOString() });
    // Explicitly off wins over a development server.
    vi.stubEnv("HUB_DEMO_SIGNOFF", "0");
    vi.stubEnv("NODE_ENV", "development");
    expect(demoSignOffEnabled()).toBe(false);
  });

  it("publishes a course waiting on reviewers, marked as demo content for learners, and only while it's recorded", () => {
    vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
    const c = unsigned();
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/doesn’t cover this/);
    setDemoSignOff(db, jordan, c.id, true, now);
    const g = publishGuide(db, jordan, c.id, "Demo edition", now, { allowUnverified: true });
    const first = authorGuide(db, jordan, c.id).publishedRevisionId!;
    expect(g).toBeTruthy();
    expect(demoEditionOf(db, first)).toMatchObject({ by: "jordan" });
    expect(readGuide(db, riley, c.slug).demo).toBe(true);
    // Removed: the gates apply again, and what's already live stays marked as demo content.
    setDemoSignOff(db, jordan, c.id, false, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/doesn’t cover this/);
    expect(readGuide(db, riley, c.slug).demo).toBe(true);
    // Turned off on the Hub: no demo sign-off counts, even one still recorded.
    setDemoSignOff(db, jordan, c.id, true, now);
    vi.stubEnv("HUB_DEMO_SIGNOFF", "0");
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/doesn’t cover this/);
  });

  it("points a blocked publish at the demo sign-off, only on a demo Hub", () => {
    const problems = () => {
      try {
        publishGuide(db, jordan, unsigned().id, "", now, { allowUnverified: true });
      } catch (e) {
        return (e as { problems?: string[] }).problems ?? [];
      }
      return [];
    };
    vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
    expect(problems().at(-1)).toMatch(/Record a demo sign-off/);
    vi.stubEnv("HUB_DEMO_SIGNOFF", "0");
    expect(problems().join(" ")).not.toMatch(/demo/);
  });

  it("lets learners use a demo edition's unreviewed Spot the Hazard rooms", () => {
    vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
    const c = unsigned();
    setDemoSignOff(db, jordan, c.id, true, now);
    publishGuide(db, jordan, c.id, "", now, { allowUnverified: true });
    expect(hazardScanState(db, riley, c.id, "hz", {}, now)).toMatchObject({ available: true });
    expect(startHazardScan(db, riley, c.id, { blockId: "hz" }, now).status).toBe("active");
  });

  it("never skips the check for a real identifier in a Red Pen case", () => {
    vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
    const rp = structuredClone(REDPEN_CASES[0].data);
    rp.facts[0].text += " Call his son on 0412 345 678.";
    const c = createGuide(db, jordan, { title: "Red Pen", completion: "confirm", doc: page([{ id: "rp", type: "redpen", ...rp }]) as never }, now);
    setDemoSignOff(db, jordan, c.id, true, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/real identifier/);
  });
});
