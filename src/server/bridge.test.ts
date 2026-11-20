import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide, readGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import { chspBridge, compare, familySummary, privateBridge, sahPicture, type BridgeBlockData, type BridgeInput } from "@/lib/bridge";
import { categoryOn, rulesStale, visitsIn } from "@/lib/sahRules";
import { BRIDGE_CASES } from "@/content/bridgeCases";
import { bridgeState, checkBridge, liveCopied, liveStatus, saveBridge, setLiveRelease } from "./bridge";

/* While You Wait: exact only when it's a quote, a wait is never a date, and private visits keep their price. */

let db: Db;
let jordan: User, riley: User, sam: User;
const now = new Date("2026-11-20T00:00:00Z");
const TODAY = "2026-11-20";
const SIGNED = {
  owner: "Learning",
  operations: "SaH Operations",
  finance: "Finance",
  quality: "Quality",
  privacy: "Privacy",
  communications: "Communications",
  approvedOn: "2026-11-20",
};
const SOURCE = { title: "Support at Home contributions", version: "2026-10" };
const seed = () => BRIDGE_CASES[0].data;
const scenario = (patch: Partial<BridgeInput> = {}): BridgeInput => ({ ...structuredClone(seed().scenario), ...patch });
const signed = (): BridgeBlockData => ({ ...seed(), approval: SIGNED, source: SOURCE });
const pages = (data: BridgeBlockData) => [
  {
    id: "p1",
    title: "While you wait",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Calculator", blocks: [{ id: "br", type: "bridge", ...data }] }],
  },
];
const blocking = (data: BridgeBlockData) => publishChecks({ schema: 2, pages: pages(data) } as never, "confirm").blocking;
function course(data: BridgeBlockData) {
  const c = createGuide(db, jordan, { title: "While you wait", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
});

describe("the private bridge", () => {
  it("prices the PRD's quote exactly: $230 a full week, $920 for four", () => {
    const p = privateBridge(scenario(), TODAY);
    expect(p).toMatchObject({ exact: true, weeklyCents: 23000, badge: "scenario" });
    expect(p.scenarios.find((s) => s.weeks === 4)).toMatchObject({ cents: 92000, visits: 8 });
  });

  it("recalculates from the scheduled visits when the pattern or start changes", () => {
    const more = scenario({ needs: [...scenario().needs.map((n) => (n.service === "domestic_assistance" ? { ...n, days: [2, 4] } : n))] });
    expect(privateBridge(more, TODAY).weeklyCents).toBe(37000);
    // A Wednesday start: the first Monday visit falls in week two, so four weeks hold four Wednesdays and four Mondays still.
    const midweek = privateBridge(scenario({ start: "2026-11-25" }), TODAY).scenarios.find((s) => s.weeks === 4)!;
    expect(midweek.visits).toBe(visitsIn("2026-11-25", 4, [2]) + visitsIn("2026-11-25", 4, [0]));
    expect(visitsIn("2026-11-25", 1, [0])).toBe(1);
    expect(visitsIn("2026-11-25", 1, [2, 4])).toBe(2);
  });

  it("drops the exact label when anything is missing, expired or unknown", () => {
    const q = scenario().quote;
    const cases: [Partial<typeof q>, RegExp][] = [
      [{ travelCents: null }, /Travel or visit charges aren’t known/],
      [{ minimumHours: null }, /visit minimum isn’t known/],
      [{ validUntil: "2026-11-19" }, /expired on/],
      [{ available: null }, /isn’t confirmed/],
      [{ surchargesKnown: false }, /surcharges aren’t confirmed/],
      [{ prices: { domestic_assistance: 7000 } }, /no quoted price for personal care/],
    ];
    for (const [patch, why] of cases) {
      const p = privateBridge(scenario({ quote: { ...q, ...patch } }), TODAY);
      expect(p).toMatchObject({ exact: false, weeklyCents: null, scenarios: [], badge: "confirm" });
      expect(p.reasons.join(" ")).toMatch(why);
    }
  });

  it("applies a visit minimum and a visit charge", () => {
    const short = scenario({
      needs: [{ id: "n", service: "personal_care", hoursPerVisit: 0.5, days: [0] }],
      quote: { ...scenario().quote, minimumHours: 1, travelCents: 1500 },
    });
    expect(privateBridge(short, TODAY).weeklyCents).toBe(9000 + 1500);
  });
});

describe("CHSP and interim funding", () => {
  it("shows no made-up fee, and the stage alone never confirms a referral", () => {
    expect(chspBridge(scenario({ stage: "full_allocated" }))).toMatchObject({ state: "Potential option: check eligibility", quoted: false, weeklyCents: null });
    const pending = chspBridge(
      scenario({ chsp: { referral: "confirmed", provider: "available", contributionCents: null, services: ["domestic_assistance"] } }),
    );
    expect(pending).toMatchObject({ state: "Referral confirmed; provider or fee pending", weeklyCents: null });
    const quoted = chspBridge(scenario({ chsp: { referral: "confirmed", provider: "available", contributionCents: 1200, services: ["domestic_assistance"] } }));
    expect(quoted).toMatchObject({ quoted: true, weeklyCents: 1200, state: "Provider available; contribution quoted" });
  });

  it("only flags interim Support at Home funding when it's the stage", () => {
    expect(chspBridge(scenario()).interimSah).toBe(false);
    expect(chspBridge(scenario({ stage: "interim_allocated" })).interimSah).toBe(true);
  });
});

describe("the funded picture", () => {
  it("never turns a wait into a start date", () => {
    const s = sahPicture(scenario({ waitWeeks: 6 }), TODAY);
    expect(s).toMatchObject({ startConfirmed: false, startDate: "", allocationConfirmed: false });
    expect(s.startNote).toMatch(/Start date not confirmed/);
    // A date alone isn't enough without the stage that makes it real.
    expect(sahPicture(scenario({ serviceStartDate: "2027-01-04" }), TODAY).startConfirmed).toBe(false);
    expect(sahPicture(scenario({ stage: "commenced", serviceStartDate: "2027-01-04", allocationDate: "2026-12-14" }), TODAY)).toMatchObject({
      startConfirmed: true,
      startDate: "2027-01-04",
      allocationConfirmed: true,
    });
  });

  it("a part pensioner gets no exact contribution without a verified notice, and legacy status isn't ignored", () => {
    const s = sahPicture(scenario({ pension: "part", legacy: "yes" }), TODAY);
    const clean = s.lines.find((l) => l.service === "domestic_assistance")!;
    expect(clean).toMatchObject({ category: "everyday", contributionCents: null });
    expect(clean.note).toMatch(/Rate to confirm/);
    expect(s.pensionNote).toMatch(/doesn’t set a rate/);
    expect(s.legacyNote).toMatch(/no worse off/);
  });

  it("uses a verified rate when there is one", () => {
    const s = sahPicture(scenario({ rates: { verified: true, independence: 500, everyday: 1750, source: "Notice", effectiveOn: "2026-11-01" } }), TODAY);
    expect(s.lines.find((l) => l.service === "domestic_assistance")).toMatchObject({ priceCents: 14000, contributionCents: 2450 });
  });

  it("puts funded personal care at 0% from 1 October 2026, and private personal care keeps its price", () => {
    expect(categoryOn("personal_care", "2026-09-30")).toBe("independence");
    expect(categoryOn("personal_care", "2026-10-01")).toBe("clinical");
    const all = compare(scenario(), TODAY);
    expect(all.sah.lines.find((l) => l.service === "personal_care")).toMatchObject({ category: "clinical", contributionCents: 0 });
    expect(all.private.lines.find((l) => l.service === "personal_care")?.totalCents).toBe(9000);
  });

  it("knows when the ruleset is past its review date", () => {
    expect(rulesStale("2026-11-20")).toBe(false);
    expect(rulesStale("2027-05-01")).toBe(true);
  });
});

describe("the family summary", () => {
  const opts = { to: "Chloe", participant: "Arthur", worker: "Sam", nextStep: "confirm the CHSP referral", owner: "Care Coordinator", followUp: "2026-11-25" };
  it("for an authorised caller: the quote with its validity, the CHSP check, and no start date", () => {
    const t = familySummary(scenario(), { ...opts, authorised: true }, TODAY);
    expect(t).toMatch(/\$230 a week/);
    expect(t).toMatch(/valid until/);
    expect(t).toMatch(/Scenario only/);
    expect(t).toMatch(/isn’t confirmed yet/);
    expect(t).toMatch(/keep their private price/);
    expect(t).not.toMatch(/will be reimbursed|automatically|backdat/i);
  });

  it("for a caller without authority: no personal financial or care details", () => {
    const t = familySummary(scenario(), { ...opts, authorised: false }, TODAY);
    expect(t).not.toMatch(/\$|Arthur|approved|cleaning|personal care/i);
    expect(t).toMatch(/only discuss the details of someone’s situation with them, or with a person they’ve authorised/);
  });
});

describe("the practice block", () => {
  it("can't be published without sign-off, even with Publish anyway, and keeps the model summary off the page", () => {
    expect(blocking(seed()).join(" ")).toMatch(/sign-off is required/);
    expect(blocking(signed())).toEqual([]);
    const draft = createGuide(db, jordan, { title: "Draft", completion: "confirm", doc: { schema: 2, pages: pages(seed()) } }, now);
    expect(() => publishGuide(db, jordan, draft.id, "", now, { allowUnverified: true })).toThrow(/While You Wait calculator needs its sign-off/);
    const c = course(signed());
    const page = JSON.stringify(readGuide(db, riley, c.slug));
    expect(page).toContain("Can Trilogy start privately next Monday?");
    expect(page).not.toContain("Our next step is to confirm the CHSP referral and call you by Wednesday");
    expect(page).not.toContain("flips over automatically");
  });

  it("keeps the learner to the parts they may change, checks their summary, and shows the model after", () => {
    const c = course(signed());
    saveBridge(
      db,
      riley,
      c.id,
      { blockId: "br", input: { ...scenario(), waitWeeks: 10, quote: { ...scenario().quote, prices: { domestic_assistance: 1 } }, stage: "commenced" } },
      now,
    );
    const s = bridgeState(db, riley, c.id, "br");
    expect(s.input).toMatchObject({ waitWeeks: 10, stage: "approved_priority", quote: { prices: { domestic_assistance: 7000 } } });
    expect(s.model).toBe("");
    expect(() => checkBridge(db, riley, c.id, { blockId: "br", summary: "Too short." }, now)).toThrow(/Write the summary first/);
    const out = checkBridge(
      db,
      riley,
      c.id,
      {
        blockId: "br",
        summary: "Hi Chloe, Arthur is approved and waiting. The private quote is $230 a week. Funding will flip over automatically in six weeks.",
      },
      now,
    );
    expect(out.checked.avoided.map((a) => a.phrase)).toEqual(["automatically", "in six weeks"]);
    expect(out.checked.covered.find((x) => x.id === "br-c-quote")?.met).toBe(true);
    expect(out.model).toMatch(/Hi Chloe/);
    const ev = db.prepare("SELECT detail FROM magazine_events WHERE event = 'bridge.checked'").get() as { detail: string };
    expect(ev.detail).not.toMatch(/Chloe|\$230/);
  });
});

describe("the live-call tool", () => {
  it("is for staff and coordinators, and stays off until a superadmin records every approval", () => {
    expect(liveStatus(db, sam)).toMatchObject({ allowed: false, released: false });
    expect(liveStatus(db, riley)).toMatchObject({ allowed: true, released: false, canRelease: false, approvals: null });
    expect(() => liveCopied(db, riley, { authorised: true }, now)).toThrow(/isn’t available/);
    expect(() => setLiveRelease(db, riley, { released: true }, now)).toThrow(/superadmin/);
    expect(() => setLiveRelease(db, jordan, { released: true, operations: "Ops" }, now)).toThrow(/Finance, Quality, Privacy and Communications/);
    setLiveRelease(db, jordan, { released: true, operations: "Ops", finance: "Fin", quality: "Qual", privacy: "Priv", communications: "Comms" }, now);
    expect(liveStatus(db, riley)).toMatchObject({ allowed: true, released: true });
    expect(liveCopied(db, riley, { authorised: false }, now)).toEqual({ copied: true });
    const a = db.prepare("SELECT * FROM audit WHERE event = 'bridge.summary_copied'").get() as Record<string, unknown>;
    expect(a).toMatchObject({ actor: "riley", next: JSON.stringify("generic") });
    expect(() => liveCopied(db, sam, { authorised: true }, now)).toThrow();
  });
});
