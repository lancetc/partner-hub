import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { setDemoSignOff } from "./demoSignOff";
import { allBlocks } from "@/lib/magazine";
import type { NetworkData } from "@/lib/networkBench";
import { NORTH_BRISBANE_BENCH } from "@/content/networkCases";
import { DATA_SOURCES, DEMO_SCORECARDS } from "@/content/networkDemo";
import { moveNetwork, networkRegister, networkState, networkStats, retryNetwork, startNetwork, submitNetwork, viewedNetwork } from "./networkBench";
import { applyBoard, cleanBoard, demoView, getBoard, logToolEvent, saveBoard, toolHome } from "./networkTool";

/*
  Build Your Local Bench and the Contractor Network Builder Work Tool on the server (docs/network-builder.md): it can't
  publish unsigned; readers never get the case; moves and submits are idempotent and their events carry no typed
  words; a copied draft is never "sent"; totals are suppressed under five people; the Work Tool is for the business
  planner only, reads demo data only, keeps boards inside the business, refuses skipped or provider-owned stages, and
  saves idempotently (criteria 1, 6, 11, 12 and 14).
*/

let db: Db;
let jordan: User, riley: User, sam: User, casey: User, ash: User;
const now = new Date("2026-11-24T00:00:00Z");
const TODAY = "2026-11-24";

function approved(d: NetworkData = NORTH_BRISBANE_BENCH): NetworkData {
  const c = structuredClone(d);
  c.approval = {
    owner: "O",
    operations: "Op",
    onboarding: "On",
    quality: "Q",
    partnerships: "Pa",
    finance: "F",
    privacy: "Pr",
    learning: "L",
    approvedOn: TODAY,
    reviewBy: "2027-05-01",
    scenarioReviewed: c.scenarioVersion,
  };
  for (const p of c.profiles) p.reviewedOn = TODAY;
  c.outreach.approvalState = "approved";
  return c;
}
const doc = (data: NetworkData) => ({
  schema: 2 as const,
  pages: [
    {
      id: "p1",
      title: "ZZ Test bench",
      purpose: "",
      template: "decide",
      kind: "content",
      required: true,
      allActivities: false,
      sections: [{ id: "s1", title: "Bench", blocks: [{ id: "nb", type: "network", ...data }] }],
    },
  ],
});
function course(data = approved()) {
  const c = createGuide(db, jordan, { title: "ZZ Test bench", completion: "confirm", doc: doc(data) as never }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const B = { blockId: "nb" };
const RIGHT = { measure: "slots", planned: 18, booked: 6, unfilled: 12, ready: 0, counted: [] };
const BRIEF = {
  profile: "pc-sole-trader",
  fields: {
    area: "Paperbark Rise",
    window: "early morning, 7–9 am",
    business: "A small local Care Partner business.",
    need: "Personal care early in the morning.",
  },
};
const move = (u: User, g: string, m: object) => moveNetwork(db, u, g, { ...B, move: m }, now);
function playThrough(u: User, g: string) {
  move(u, g, { do: "open", card: "w-c" });
  move(u, g, { do: "diagnose", diagnosis: RIGHT });
  move(u, g, { do: "answer", step: "protect", option: "honest-interim" });
  move(u, g, { do: "answer", step: "chosen", option: "assess" });
  move(u, g, { do: "answer", step: "screen", option: "lead" });
  move(u, g, { do: "outreach", outreach: BRIEF });
  move(u, g, { do: "copy" });
  move(u, g, { do: "reveal" });
  move(u, g, { do: "answer", step: "revisit", option: "phased" });
  return move(u, g, { do: "answer", step: "review", option: "pathway" });
}
const events = (guideId: string) =>
  db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event NOT LIKE 'page%' ORDER BY id").all(guideId) as {
    event: string;
    detail: string;
  }[];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam, casey, ash] = ["jordan", "riley", "sam", "casey", "ash"].map((id) => userById(db, id)!);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("HUB_DEMO_SIGNOFF", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("publishing", () => {
  it("can’t publish the demo as it ships, even with “Publish anyway”; a signed-off block can", () => {
    const c = createGuide(db, jordan, { title: "ZZ Test unsigned", completion: "confirm", doc: doc(NORTH_BRISBANE_BENCH) as never }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/Build Your Local Bench needs its reviewers’ sign-off/);
    const stale = createGuide(db, jordan, { title: "ZZ Test stale", completion: "confirm", doc: doc({ ...approved(), scenarioVersion: "v2" }) as never }, now);
    expect(() => publishGuide(db, jordan, stale.id, "", now)).toThrow(/Local Bench/);
    expect(() => course()).not.toThrow();
  });

  it("a demo sign-off stands in for the reviewers, but never for a broken case", () => {
    vi.stubEnv("HUB_DEMO_SIGNOFF", "1");
    const c = createGuide(db, jordan, { title: "ZZ Test demo", completion: "confirm", doc: doc(NORTH_BRISBANE_BENCH) as never }, now);
    setDemoSignOff(db, jordan, c.id, true, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).not.toThrow();
    const broken = structuredClone(NORTH_BRISBANE_BENCH);
    broken.inputs.supply.find((r) => r.id === "w-c")!.state = "approved";
    const b = createGuide(db, jordan, { title: "ZZ Test broken", completion: "confirm", doc: doc(broken) as never }, now);
    setDemoSignOff(db, jordan, b.id, true, now);
    expect(() => publishGuide(db, jordan, b.id, "", now, { allowUnverified: true })).toThrow(/doesn’t hold together/);
  });
});

describe("an attempt", () => {
  it("gives readers the frame only, and the case without feedback, levels or codes", () => {
    const c = course();
    const b = allBlocks(readGuide(db, riley, c.slug).doc).find((x) => x.type === "network") as unknown as NetworkData;
    expect([b.cards, b.steps, b.variations, b.inputs.supply]).toEqual([[], [], [], []]);
    const v = startNetwork(db, riley, c.id, B, now);
    expect(v.view?.before).toBeNull();
    expect(JSON.stringify(v)).not.toMatch(/"feedback"|"levels"|"codes"|honest-interim/);
    expect(networkState(db, riley, c.slug, "nb", { embed: true }).block?.cards).toEqual([]);
  });

  it("is idempotent: a resent start, move, submit or viewed changes nothing twice", () => {
    const c = course();
    const a = startNetwork(db, riley, c.id, B, now);
    expect(startNetwork(db, riley, c.id, B, now).attemptId).toBe(a.attemptId);
    move(riley, c.id, { do: "open", card: "w-a" });
    move(riley, c.id, { do: "open", card: "w-a" });
    playThrough(riley, c.id);
    playThrough(riley, c.id);
    const s1 = submitNetwork(db, riley, c.id, B, now);
    const s2 = submitNetwork(db, riley, c.id, B, now);
    expect(s2.debrief).toEqual(s1.debrief);
    viewedNetwork(db, riley, c.id, B, now);
    viewedNetwork(db, riley, c.id, B, now);
    const ev = events(c.id);
    const count = (e: string) => ev.filter((x) => x.event === e).length;
    expect([count("candidate_card_opened"), count("gap_reviewed"), count("response_submitted"), count("activity_completed")]).toEqual([2, 1, 1, 1]);
    expect(count("participant_choice_branch_selected")).toBe(1);
    expect(s1.debrief).toMatchObject({ ending: "phased", valid: true, score: 21 });
  });

  it("logs no typed words, and a copied draft as copied, never sent (criterion 6)", () => {
    const c = course();
    startNetwork(db, riley, c.id, B, now);
    playThrough(riley, c.id);
    const ev = events(c.id);
    const text = JSON.stringify(ev);
    expect(text).not.toContain("Paperbark Rise");
    expect(text).not.toContain("small local Care Partner");
    const copied = ev.find((x) => x.event === "outreach_draft_copied")!;
    expect(JSON.parse(copied.detail)).toMatchObject({ sent: false, fictional: true });
    expect(ev.some((x) => /sent/.test(x.event))).toBe(false);
  });

  it("refuses moves out of order, and a changed answer", () => {
    const c = course();
    startNetwork(db, riley, c.id, B, now);
    expect(() => move(riley, c.id, { do: "answer", step: "protect", option: "honest-interim" })).toThrow(/Diagnose/);
    move(riley, c.id, { do: "open", card: "w-a" });
    move(riley, c.id, { do: "diagnose", diagnosis: RIGHT });
    move(riley, c.id, { do: "answer", step: "protect", option: "honest-interim" });
    expect(() => move(riley, c.id, { do: "answer", step: "protect", option: "monday-start" })).toThrow(/already decided/);
    expect(() => submitNetwork(db, riley, c.id, B, now)).toThrow(/Finish the case/);
  });

  it("retries on the next branch, keeping the first attempt’s debrief", () => {
    const c = course();
    startNetwork(db, riley, c.id, B, now);
    playThrough(riley, c.id);
    const first = submitNetwork(db, riley, c.id, B, now);
    const second = retryNetwork(db, riley, c.id, { ...B, from: first.attemptId }, now);
    expect(second.attemptNo).toBe(2);
    expect(second.status).toBe("active");
    const row = db.prepare("SELECT variation FROM network_attempts WHERE id = ?").get(second.attemptId) as { variation: string };
    expect(row.variation).toBe("chosen-approved");
  });

  it("shows authors counts only under five people", () => {
    const c = course();
    startNetwork(db, riley, c.id, B, now);
    playThrough(riley, c.id);
    submitNetwork(db, riley, c.id, B, now);
    const s = networkStats(db, jordan, c.id).blocks[0];
    expect(s).toMatchObject({ people: 1, suppressed: true, dims: null, endings: null, codes: null, critical: null });
    expect(() => networkStats(db, riley, c.id)).toThrow();
    const r = networkRegister(db).find((x) => x.guideId === c.id)!;
    expect(r).toMatchObject({ suppressed: true, critical: "", endings: "", codes: "" });
    expect(r.dims.diagnosis).toBe("");
  });
});

describe("the Work Tool: role-restricted, demo data only (criteria 11 and 12)", () => {
  it("is for the business planner only: anyone else gets nothing, and can’t save", () => {
    expect(toolHome(db, casey)).toMatchObject({ access: { role: "owner" } });
    for (const u of [sam, riley, jordan, ash]) {
      const h = toolHome(db, u);
      expect(h.access).toBeNull();
      expect(Object.keys(h).sort()).toEqual(["access", "notice"]);
      expect(() => saveBoard(db, u, { name: "x", state: {}, idem: "key-12345678" }, now)).toThrow(/business owner/);
      expect(() => logToolEvent(db, u, { event: "network_builder_opened" }, now)).toThrow(/business owner/);
    }
  });

  it("keeps a business’s boards inside it", () => {
    const b = saveBoard(db, casey, { name: "Morning cover", state: {}, idem: "key-aaaaaaaa" }, now);
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)").run(
      riley.org_id,
      riley.id,
      now.toISOString(),
    );
    expect(() => getBoard(db, riley, b.id)).toThrow(/isn’t here/);
    expect(() => saveBoard(db, riley, { id: b.id, state: {}, idem: "key-bbbbbbbb" }, now)).toThrow(/isn’t here/);
    expect((toolHome(db, riley) as { boards: unknown[] }).boards).toEqual([]);
  });

  it("saves idempotently: the same key returns the same version, and an unchanged board makes no new one", () => {
    const state = { stages: { d9: "interested" } };
    const first = saveBoard(db, casey, { name: "Morning cover", state, idem: "key-11111111" }, now);
    const again = saveBoard(db, casey, { name: "Morning cover", state, idem: "key-11111111" }, now);
    expect(again).toMatchObject({ id: first.id, version: 1, replayed: true });
    const unchanged = saveBoard(db, casey, { id: first.id, state, idem: "key-22222222" }, now);
    expect(unchanged).toMatchObject({ version: 1, unchanged: true });
    const next = saveBoard(db, casey, { id: first.id, state: { stages: { d9: "evidence" } }, idem: "key-33333333" }, now);
    expect(next.version).toBe(2);
    expect((db.prepare("SELECT COUNT(*) AS n FROM network_board_versions").get() as { n: number }).n).toBe(2);
    expect(() => saveBoard(db, casey, { id: first.id, state, idem: "" }, now)).toThrow(/key/);
  });

  it("refuses a skipped stage, a provider-owned stage and any card that isn’t demo data", () => {
    // Each stage is checked in turn: a candidate can be recorded as interested and given a checklist, never verified without evidence.
    expect(() => cleanBoard({ stages: { d9: "evidence" } })).not.toThrow();
    expect(() => cleanBoard({ stages: { d9: "verification" } })).toThrow(/hasn’t been sent/);
    expect(() => cleanBoard({ stages: { d8: "approved" } })).toThrow(/Only the provider/);
    expect(() => cleanBoard({ stages: { d3: "booked" } })).toThrow(/Only the provider’s scheduling/);
    expect(() => cleanBoard({ stages: { d8: "interested" } })).toThrow(/doesn’t move back/);
    expect(() => cleanBoard({ stages: { d7: "evidence" } })).not.toThrow();
    expect(() => cleanBoard({ stages: { d7: "verification" } })).toThrow(/hasn’t been sent/);
    expect(() => cleanBoard({ stages: { d8: "verification" } })).not.toThrow();
    expect(() => cleanBoard({ stages: { d5: "available" } })).toThrow(/expired/i);
    expect(() => cleanBoard({ stages: { "real-worker-1": "interested" } })).toThrow(/Only the demo cards/);
  });

  it("never turns pipeline moves into capacity", () => {
    const before = demoView().snapshot;
    const after = demoView(cleanBoard({ stages: { d7: "evidence", d8: "verification", d9: "interested" } })).snapshot;
    expect(after).toEqual(before);
    expect(applyBoard(cleanBoard({ stages: { d8: "verification" } })).supply.find((r) => r.id === "d8")?.state).toBe("verification");
  });

  it("counts demo worker 3 once across two areas, and shows stale, expired and restricted workers as not ready", () => {
    const v = demoView();
    const d3 = v.coverage.cells.flatMap((c) => c.supply.filter((x) => x.id === "d3" && x.hours > 0).map((x) => x.hours));
    expect(d3.reduce((t, h) => t + h, 0)).toBeLessThanOrEqual(5);
    const card = (id: string) => v.cards.find((c) => c.id === id)!;
    expect(card("d4")).toMatchObject({ stage: "approved", staleAvailability: true });
    expect(card("d5").calm).toBe("restricted");
    expect(card("d6").calm).toBe("restricted");
  });

  it("reads no real data: every source is unconnected, and Quality detail never reaches a Care Partner", () => {
    expect(DATA_SOURCES.every((s) => s.connected === false)).toBe(true);
    const text = JSON.stringify(toolHome(db, casey));
    for (const s of DEMO_SCORECARDS) if (s.qualityDetail) expect(text).not.toContain(s.qualityDetail);
    expect(text).toMatch(/Demo data only/);
    // The tool's server imports nothing that holds real records: only the pure model, the demo seed and the planner access check.
    const src = fs.readFileSync(path.join(process.cwd(), "src/server/networkTool.ts"), "utf8");
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["./auth", "./caseloadPlanner", "./db", "@/content/networkDemo", "@/lib/networkBench", "@/lib/suburbCoverage", "node:crypto"]);
    expect(src).not.toMatch(/FROM (?!network_|business_planner|users\b)\w+/);
  });
});
