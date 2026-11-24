import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { ensurePlanner } from "./caseloadPlanner";
import { favouritesList } from "./favourites";
import { allBlocks } from "@/lib/magazine";
import type { StudioData } from "@/lib/referralStudio";
import { LOCAL_REFERRAL_STUDIO_DATA, STUDIO_SCENARIOS } from "@/content/referralStudio";
import { claimRegister, setClaimStatus } from "./referralClaims";
import {
  assetEvent,
  deletePractice,
  endPractice,
  openEvidence,
  practiceTurn,
  practiceViewed,
  purgeExpired,
  recordActivity,
  saveAsset,
  savePitchCard,
  startPractice,
  studioAdmin,
  studioHome,
  studioPractice,
  studioRegister,
  studioWorkbook,
  submitPractice,
  type StudioModel,
} from "./referralStudio";

/*
  The Local Referral Studio on the server (PRD section 16 and the build request): the Work Tool is for the business
  owner and the people they authorise; one business never sees another's drafts or notes; the bounded referrer is held
  to the scenario, with the reviewed script when it fails or strays; events and reports carry no words; saves are
  idempotent; nothing is ever "sent"; a withdrawn claim blocks publishing and marks saved assets for review.
*/

let db: Db;
let casey: User, sam: User, riley: User, jordan: User;
const now = new Date("2026-11-24T00:00:00Z");
const TODAY = "2026-11-24";
const HOSPITAL = STUDIO_SCENARIOS.find((x) => x.id === "hospital-discharge")!;
const SOUND = HOSPITAL.family.fixtures.find((f) => f.id === "hd-sound")!;
let n = 0;
const tid = () => `turn-${++n}`;

beforeEach(() => {
  db = openDb(":memory:");
  [casey, sam, riley, jordan] = ["casey", "sam", "riley", "jordan"].map((id) => userById(db, id)!);
  ensurePlanner(db, now);
  // No model is connected unless a test says so: the reviewed script runs, and nothing paid is ever called.
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
  vi.stubEnv("HUB_DEMO_SIGNOFF", "0");
});
afterEach(() => vi.unstubAllEnvs());

const events = () => db.prepare("SELECT event, detail FROM referral_studio_events ORDER BY id").all() as { event: string; detail: string }[];

/** The sound hospital conversation in the Work Tool, through the API functions. */
async function soundPractice(u: User, model?: StudioModel) {
  startPractice(db, u, { scenarioId: "hospital-discharge", stage: "unknown" }, now);
  for (const t of SOUND.turns) await practiceTurn(db, u, { turnId: tid(), text: t.text, mode: "text" }, now, model);
  endPractice(db, u, { how: "end" }, now);
  return submitPractice(db, u, { note: SOUND.note }, now);
}

/** Test-only sign-off, so a reviewed block can publish. The demo's stays empty. */
function signed(over: (d: StudioData) => void = () => {}): StudioData {
  const d = structuredClone(LOCAL_REFERRAL_STUDIO_DATA);
  d.approval = {
    owner: "O",
    pathway: "R",
    partnerships: "P",
    quality: "Q",
    privacy: "Pr",
    approvedOn: TODAY,
    reviewBy: "2027-05-01",
    scenarioReviewed: d.scenarios.map((x) => `${x.id}@${x.version}`).join(", "),
  };
  d.rationale.decision = "accepted";
  for (const sc of d.scenarios) for (const r of Object.values(sc.family.risks)) if (r.critical) Object.assign(r, { approvedBy: "Quality", approvedOn: TODAY });
  over(d);
  return d;
}
function course(data: StudioData = signed()) {
  const c = createGuide(
    db,
    jordan,
    {
      title: "Referral practice",
      completion: "confirm",
      doc: {
        schema: 2,
        pages: [
          {
            id: "p1",
            title: "Practice",
            purpose: "",
            template: "blank",
            kind: "content",
            required: true,
            allActivities: false,
            sections: [{ id: "s1", title: "Practice", blocks: [{ id: "studio", type: "referralstudio", ...data }] }],
          },
        ],
      } as never,
    },
    now,
  );
  publishGuide(db, jordan, c.id, "", now);
  return c;
}

describe("who may use the Work Tool (role restriction)", () => {
  it("the business owner gets the Studio; people they haven't authorised, coordinators and authors get nothing", () => {
    expect(studioHome(db, casey, now)).toMatchObject({ access: { role: "owner" } });
    for (const u of [sam, riley, jordan]) {
      expect(studioHome(db, u, now)).toEqual({ access: null });
      expect(() => startPractice(db, u, { scenarioId: "gp-admin", stage: "unknown" }, now)).toThrow(/business owner/);
      expect(() => saveAsset(db, u, { idem: "asset-12345678", fields: {} }, now)).toThrow(/business owner/);
    }
  });

  it("one business never sees another’s drafts, pitch cards or notes", () => {
    const { asset } = saveAsset(
      db,
      casey,
      { idem: "asset-aaaaaaaa", kind: "pitchcard", fields: { serviceArea: "north-brisbane", contactRoute: "business-phone" } },
      now,
    );
    recordActivity(
      db,
      casey,
      { idem: "act-aaaaaaaa", metOn: TODAY, category: "gp", area: "north-brisbane", theme: "admin", owner: "owner", assetId: asset.id },
      now,
    );
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, ?, 'owner', 'test', ?)").run(
      riley.org_id,
      riley.id,
      now.toISOString(),
    );
    const theirs = studioHome(db, riley, now);
    expect(theirs).toMatchObject({ assets: [], activity: [] });
    expect(() => assetEvent(db, riley, { assetId: asset.id, event: "copied" }, now)).toThrow(/isn’t here/);
    expect(() => savePitchCard(db, riley, { assetId: asset.id }, now)).toThrow(/isn’t here/);
    // Practice is private to the person, even within the business.
    startPractice(db, casey, { scenarioId: "gp-admin", stage: "unknown" }, now);
    expect(studioHome(db, riley, now)).toMatchObject({ practice: { current: null } });
  });
});

describe("AC1: a text practice with the hospital social worker, stage unknown, in the Work Tool", () => {
  it("plays through to a debrief on the reviewed script, and completes once the debrief is read", async () => {
    const v = await soundPractice(casey);
    expect(v.current!.screen).toBe("debrief");
    expect(v.current!.caller).toBe("script");
    const d = v.current!.debrief!;
    expect(d.ready).toBe(true);
    expect(d.critical).toBe(false);
    expect(d.dims.map((x) => x.label)).toEqual([
      "Pathway fit",
      "Listening and referrer value",
      "Model and claim accuracy",
      "Person-centred choice and consent",
      "Practical close",
    ]);
    const done = practiceViewed(db, casey, {}, now);
    expect(done.current!.status).toBe("completed");
    expect(events().map((e) => e.event)).toEqual(
      expect.arrayContaining(["roleplay_started", "stage_selected", "pitch_submitted", "objection_answered", "feedback_viewed", "roleplay_completed"]),
    );
  });

  it("refuses a reply with a real-looking identifier, and keeps none of it", async () => {
    startPractice(db, casey, { scenarioId: "hospital-discharge", stage: "unknown" }, now);
    await expect(
      practiceTurn(db, casey, { turnId: tid(), text: "Her Medicare number is 2123 45670 1, can you start tomorrow?", mode: "text" }, now),
    ).rejects.toThrow(/practice tool with fictional people/);
    const v = studioPractice(db, casey, {}, now);
    expect(v.current!.transcript).toEqual([]);
    expect(JSON.stringify(events())).not.toMatch(/2123|Medicare/);
    expect(events().some((e) => e.event === "details_refused")).toBe(true);
  });

  it("opening evidence reveals only that section’s facts", () => {
    startPractice(db, casey, { scenarioId: "hospital-discharge", stage: "unknown" }, now);
    const v = openEvidence(db, casey, { section: "hd-escalate" }, now);
    const ev = v.current!.evidence;
    expect(ev.find((x) => x.id === "hd-escalate")!.facts[0].text).toMatch(/Placeholder/);
    expect(ev.find((x) => x.id === "hd-stages")!.facts).toEqual([]);
  });
});

describe("AC2 on the server: an unsupported promise is flagged with its phrase, and a retry is offered", () => {
  it("flags same-day care and a worker tomorrow, and logs only ids", async () => {
    startPractice(db, casey, { scenarioId: "hospital-discharge", stage: "unknown" }, now);
    await practiceTurn(db, casey, { turnId: tid(), text: "Yes, we offer same-day care, so discharge them and I’ll organise it.", mode: "text" }, now);
    await practiceTurn(db, casey, { turnId: tid(), text: "Don’t worry, we can have someone there tomorrow.", mode: "text" }, now);
    await practiceTurn(db, casey, { turnId: tid(), text: "Leave it with me.", mode: "text" }, now);
    endPractice(db, casey, { how: "end" }, now);
    const v = submitPractice(db, casey, { note: { agreed: "Someone will be there", owner: "Me", nextContact: "Tomorrow morning", actions: [] } }, now);
    const d = v.current!.debrief!;
    expect(d.ready).toBe(false);
    expect(d.claimFindings.map((c) => c.claim)).toEqual(expect.arrayContaining(["same-day-signon", "local-speed"]));
    const flagged = events().filter((e) => e.event === "critical_claim_flagged");
    expect(flagged.length).toBeGreaterThan(0);
    expect(JSON.parse(flagged[0].detail).claims).toContain("same-day-signon");
    // Try again: a fresh attempt, the old one kept.
    const again = startPractice(db, casey, { scenarioId: "hospital-discharge", stage: "unknown" }, now);
    expect(again.current!.attemptNo).toBe(2);
    expect(events().some((e) => e.event === "roleplay_retried")).toBe(true);
  });
});

describe("no transcript text in events, reports or the export", () => {
  it("events carry ids, versions and levels, never what was typed", async () => {
    await soundPractice(casey);
    practiceViewed(db, casey, {}, now);
    const all = JSON.stringify(events());
    for (const t of SOUND.turns) for (const w of t.text.split(/[,.?]/).filter((x) => x.trim().length > 12)) expect(all).not.toContain(w.trim());
    expect(all).not.toContain(SOUND.note.concern);
    const admin = JSON.stringify(studioAdmin(db, jordan, now));
    expect(admin).not.toContain("Tomorrow is tight");
    expect(studioWorkbook(db, jordan, now).bytes.length).toBeGreaterThan(1000);
  });
});

describe("idempotent saves", () => {
  it("a resent turn, start, asset save or note is counted once", async () => {
    startPractice(db, casey, { scenarioId: "hospital-discharge", stage: "unknown" }, now);
    const again = startPractice(db, casey, { scenarioId: "hospital-discharge", stage: "unknown" }, now);
    expect(again.current!.attemptNo).toBe(1);
    await practiceTurn(db, casey, { turnId: "same-turn", text: SOUND.turns[0].text, mode: "text" }, now);
    const v = await practiceTurn(db, casey, { turnId: "same-turn", text: SOUND.turns[0].text, mode: "text" }, now);
    expect(v.current!.transcript).toHaveLength(1);
    const fields = { serviceArea: "north-brisbane", contactRoute: "business-phone", stage: "assessment" };
    const a1 = saveAsset(db, casey, { idem: "asset-bbbbbbbb", fields }, now);
    const a2 = saveAsset(db, casey, { idem: "asset-bbbbbbbb", fields }, now);
    expect(a2).toMatchObject({ replayed: true, asset: { id: a1.asset.id } });
    const act = { idem: "act-bbbbbbbb", metOn: TODAY, category: "hospital", area: "moreton-bay", theme: "timing", owner: "owner" };
    recordActivity(db, casey, act, now);
    expect(recordActivity(db, casey, act, now)).toMatchObject({ replayed: true });
    expect((db.prepare("SELECT COUNT(*) AS n FROM referral_activity").get() as { n: number }).n).toBe(1);
    expect(events().filter((e) => e.event === "asset_draft_generated")).toHaveLength(1);
  });
});

describe("the kit on the server: approved fields only, never sent", () => {
  it("refuses a field with an unapproved claim or personal details, and records a download or copy as use, never sending", () => {
    expect(() =>
      saveAsset(
        db,
        casey,
        {
          idem: "asset-cccccccc",
          fields: { serviceArea: "north-brisbane", contactRoute: "business-phone", introduction: "We are the fastest provider in Brisbane." },
        },
        now,
      ),
    ).toThrow(/fastest provider/);
    expect(() =>
      saveAsset(db, casey, { idem: "asset-dddddddd", fields: { serviceArea: "north-brisbane", contactRoute: "business-phone", recipient: "Mrs Jones" } }, now),
    ).toThrow(/a person’s name/);
    const { asset } = saveAsset(
      db,
      casey,
      { idem: "asset-eeeeeeee", fields: { serviceArea: "north-brisbane", contactRoute: "business-phone", stage: "unknown" } },
      now,
    );
    expect(asset.status).toBe("draft");
    expect(asset.standing).toBe("draft");
    const c = assetEvent(db, casey, { assetId: asset.id, event: "copied", part: "after-meeting" }, now);
    expect(c.asset).toMatchObject({ copied: true, downloaded: false });
    assetEvent(db, casey, { assetId: asset.id, event: "downloaded" }, now);
    expect(JSON.stringify(db.prepare("SELECT * FROM referral_assets").all())).not.toMatch(/"sent"|sent_at/);
    expect(() => assetEvent(db, casey, { assetId: asset.id, event: "sent" }, now)).toThrow(/Unknown event/);
    const kinds = events().map((e) => e.event);
    expect(kinds).toEqual(expect.arrayContaining(["asset_draft_generated", "asset_copied", "asset_downloaded"]));
    expect(kinds).not.toContain("asset_approved_for_use");
  });

  it("a pitch card saved to Favourites loses its standing when a claim it used is withdrawn", () => {
    const { asset } = saveAsset(
      db,
      casey,
      { idem: "asset-ffffffff", kind: "pitchcard", fields: { serviceArea: "north-brisbane", contactRoute: "business-phone" } },
      now,
    );
    savePitchCard(db, casey, { assetId: asset.id, pin: true }, now);
    const before = favouritesList(db, casey, {}, now) as { items: { title: string; state: string; pinned: boolean }[] };
    const card = before.items.find((x) => x.title.startsWith("Pitch card"))!;
    expect(card).toMatchObject({ state: "current", pinned: true });
    setClaimStatus(db, jordan, { claimId: "same-day-signon", status: "withdrawn" }, now);
    const after = favouritesList(db, casey, {}, now) as { items: { title: string; state: string; note: string }[] };
    expect(after.items.find((x) => x.title.startsWith("Pitch card"))).toMatchObject({ state: "changed", note: expect.stringMatching(/Marked for review/) });
    expect((studioHome(db, casey, now) as { assets: { standing: string }[] }).assets[0].standing).toBe("outdated");
  });

  it("only an author records a claim’s status, an approval needs its approver and dates, and it’s audited", () => {
    expect(() => setClaimStatus(db, casey, { claimId: "funding-wait", status: "approved" }, now)).toThrow();
    expect(() => setClaimStatus(db, jordan, { claimId: "funding-wait", status: "approved" }, now)).toThrow(/approver/);
    setClaimStatus(
      db,
      jordan,
      { claimId: "funding-wait", status: "approved", approvedBy: "Policy owner", approvedOn: TODAY, effectiveFrom: TODAY, reviewBy: "2027-05-01" },
      now,
    );
    expect(claimRegister(db).find((c) => c.id === "funding-wait")).toMatchObject({ status: "approved", approvedBy: "Policy owner" });
    expect((db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'referral_claim.status_set'").get() as { n: number }).n).toBe(1);
  });
});

describe("the Magazine block", () => {
  it("can’t publish unsigned, or with a withdrawn claim, and readers get the frame only", () => {
    expect(() => course(structuredClone(LOCAL_REFERRAL_STUDIO_DATA))).toThrow(/sign-off/);
    setClaimStatus(db, jordan, { claimId: "local-speed", status: "withdrawn" }, now);
    expect(() => course()).toThrow(/sign-off/);
    setClaimStatus(db, jordan, { claimId: "local-speed", status: "draft" }, now);
    const c = course();
    const g = readGuide(db, sam, c.id);
    const b = allBlocks(g.doc).find((x) => x.id === "studio")!;
    expect(JSON.stringify(b)).not.toMatch(/nobody’s seen a letter|i-promise|hd-end-checked|patterns/);
    const v = studioPractice(db, sam, { guideId: c.id, blockId: "studio" }, now);
    expect(v.scenarios.map((x) => x.id)).toEqual(["gp-admin", "hospital-discharge"]);
    expect(v.toolAccess).toBe(false);
    expect(studioRegister(db)).toHaveLength(1);
  });

  it("model fallback: an unavailable, invalid or straying referrer falls back to the reviewed script; a good line is used", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-not-used");
    const c = course(signed((d) => (d.caller = "bounded-ai")));
    const at = { guideId: c.id, blockId: "studio" };
    startPractice(db, sam, { ...at, scenarioId: "hospital-discharge", stage: "unknown" }, now);
    const prompts: string[] = [];
    const down: StudioModel = async () => {
      throw new Error("offline");
    };
    const invalid: StudioModel = async () => ({ intents: ["made-up"], moves: [], risks: [], unclear: false, reply: "Sure." });
    const strays: StudioModel = async () => ({ intents: ["i-ack"], moves: [], risks: [], unclear: false, reply: "She has an allocation letter, so yes." });
    const good: StudioModel = async (p) => (
      prompts.push(p),
      { intents: ["i-check"], moves: [], risks: [], unclear: false, reply: "Fair enough. Who calls me, and when?" }
    );
    let v = await practiceTurn(db, sam, { ...at, turnId: tid(), text: "Tomorrow is tight. What do you need from us?", mode: "text" }, now, down);
    expect(v.current!.transcript[0].by).toBe("script");
    expect(v.current!.notice).toMatch(/reviewed script/);
    v = await practiceTurn(db, sam, { ...at, turnId: tid(), text: "I hear you. What would help most?", mode: "text" }, now, invalid);
    expect(v.current!.transcript[1].by).toBe("script");
    v = await practiceTurn(
      db,
      sam,
      { ...at, turnId: tid(), text: "Let me think about what we can do.", mode: "voice", heard: "Let me think about what we can do." },
      now,
      strays,
    );
    expect(v.current!.transcript[2].by).toBe("script");
    v = await practiceTurn(db, sam, { ...at, turnId: tid(), text: "Our intake team can check what’s possible today.", mode: "text" }, now, good);
    expect(v.current!.transcript[3]).toMatchObject({ by: "ai", reply: expect.stringMatching(/^Fair enough/) });
    const reasons = events()
      .filter((e) => e.event === "caller_fallback_used")
      .map((e) => JSON.parse(e.detail).reason);
    expect(reasons).toEqual(["unavailable", "invalid", "strayed"]);
    // The learner's words go to the model only as data.
    expect(prompts[0]).toMatch(/<learner_reply>\nOur intake team can check what’s possible today\.\n<\/learner_reply>/);
  });

  it("text and voice give the same result", async () => {
    const c = course();
    const at = { guideId: c.id, blockId: "studio" };
    const play = async (u: User, mode: "text" | "voice") => {
      startPractice(db, u, { ...at, scenarioId: "hospital-discharge", stage: "unknown" }, now);
      for (const t of SOUND.turns) await practiceTurn(db, u, { ...at, turnId: tid(), text: t.text, mode, heard: mode === "voice" ? t.text : undefined }, now);
      endPractice(db, u, at, now);
      return submitPractice(db, u, { ...at, note: SOUND.note }, now).current!.debrief!;
    };
    const t = await play(sam, "text");
    const v = await play(riley, "voice");
    expect(v.dims.map((x) => x.level)).toEqual(t.dims.map((x) => x.level));
    expect(v.base.ending).toBe(t.base.ending);
  });
});

describe("retention", () => {
  it("removes the words after the retention days, and an unsaved practice’s words when the next one starts", async () => {
    await soundPractice(casey);
    purgeExpired(db, new Date(now.getTime() + 31 * 86_400_000));
    const v = studioPractice(db, casey, {}, now);
    expect(v.current!.purged).toBe(true);
    expect(v.current!.transcript).toEqual([]);
    // The learner's own words ("…with what intake has found") are gone; the authored model lines and the levels stay.
    expect(JSON.stringify(v.current!.debrief)).not.toMatch(/what intake has found/);
    expect(v.current!.debrief!.dims[0].level).toBe(3);

    startPractice(db, casey, { scenarioId: "gp-admin", stage: "unknown", retain: false }, now);
    await practiceTurn(db, casey, { turnId: tid(), text: "I know your GPs are flat out.", mode: "text" }, now);
    const unsaved = studioPractice(db, casey, {}, now).current!.attemptId;
    startPractice(db, casey, { scenarioId: "hospital-discharge", stage: "unknown" }, now);
    expect(
      (db.prepare("SELECT transcript, purged_at FROM referral_practice WHERE id = ?").get(unsaved) as { transcript: string; purged_at: string }).transcript,
    ).toBe("[]");
    deletePractice(db, casey, { attemptId: unsaved });
    expect(db.prepare("SELECT 1 FROM referral_practice WHERE id = ?").get(unsaved)).toBeUndefined();
  });
});
