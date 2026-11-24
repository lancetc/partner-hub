import { beforeEach, describe, expect, it } from "vitest";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { favouriteAction, favouritesList, savePassage } from "./favourites";
import { playbookAction } from "./playbooks";
import {
  drawerData,
  homePins,
  pinTool,
  pocketAdminAction,
  pocketEvent,
  pocketReport,
  pocketSearch,
  reorderPins,
  saveTool,
  toolDetail,
  toolOpened,
} from "./pocketPlaybook";
import { search } from "./search";

/*
  The Live Call Pocket Playbook on the server (docs/pocket-playbook.md): one Favourites list with pins on it, a drawer
  of the person's own pins and recent tools, role-safe task search, ids-and-counts events, and the owners' report.
*/

let db: Db;
let jordan: User, riley: User, sam: User;
const now = new Date("2026-11-24T00:00:00Z");
const QC = "contribution-quick-calc";
const INCIDENT = "incident-first-steps";
const RATE = "invoice-rate-check";

/** Approves a seed Job Aid the way an owner would, so it's in Work Tools for its roles. */
function approve(id: string) {
  const act = (input: Record<string, unknown>) => playbookAction(db, jordan, input, now);
  act({ action: "save-contact", key: "finance-support", routes: { partner: "Finance queue", coordinator: "Finance queue", staff: "Finance queue" } });
  const seed = SEED_SNIPPETS.find((s) => s.id === id)!.release;
  act({
    action: "save-release",
    id,
    data: { ...seed, effectiveOn: "2026-11-01", reviewBy: "2027-05-20", approvals: { owner: "Finance lead", clinical: "", quality: "" } },
  });
  act({ action: "submit", id });
  act({ action: "approve", id });
}
const events = (event?: string) =>
  db.prepare(`SELECT * FROM aid_events${event ? " WHERE event = ?" : ""}`).all(...(event ? [event] : [])) as Record<string, unknown>[];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
});

describe("pins are a preference on one Favourites list", () => {
  it("pinning saves the tool to Favourites once, and unpinning keeps the Favourite", () => {
    const first = pinTool(db, riley, { kind: "tool", id: QC }, now);
    expect(first).toMatchObject({ pinned: true, saved: true, first: true });
    // A double tap or a retry: still one Favourite, one pin, one event.
    expect(pinTool(db, riley, { kind: "tool", id: QC }, now)).toMatchObject({ pinned: true, first: false });
    expect(favouritesList(db, riley, {}, now).counts.all).toBe(1);
    expect(events("tool_pinned")).toHaveLength(1);
    expect(drawerData(db, riley, now).pinned.map((p) => p.id)).toEqual([QC]);
    expect(homePins(db, riley, now).pinned.map((p) => p.title)).toEqual(["Contribution Quick-Calc"]);

    expect(pinTool(db, riley, { kind: "tool", id: QC, on: false }, now)).toMatchObject({ pinned: false, saved: true });
    pinTool(db, riley, { kind: "tool", id: QC, on: false }, now);
    const list = favouritesList(db, riley, {}, now);
    expect(list.items.map((i) => [i.title, i.pinned])).toEqual([["Contribution Quick-Calc", false]]);
    expect(events("tool_unpinned")).toHaveLength(1);
    expect(drawerData(db, riley, now).pinned).toEqual([]);
    // The second pin, after the first, says nothing more about where pins appear.
    expect(pinTool(db, riley, { kind: "tool", id: QC }, now).first).toBe(false);
  });

  it("pins a Job Aid the same way, and the Favourites page's Pin is the same preference", () => {
    approve(RATE);
    pinTool(db, riley, { kind: "job_aid", id: RATE }, now);
    pinTool(db, riley, { kind: "tool", id: INCIDENT }, now);
    expect(drawerData(db, riley, now).pinned.map((p) => p.id)).toEqual([RATE, INCIDENT]);
    const aidFav = favouritesList(db, riley, { kind: "job_aid" }, now).items[0];
    expect(aidFav.pinned).toBe(true);
    // Unpinned from the Favourites page: gone from the drawer and home, still saved.
    favouriteAction(db, riley, { action: "pin", id: aidFav.id, on: false }, now);
    expect(drawerData(db, riley, now).pinned.map((p) => p.id)).toEqual([INCIDENT]);
    expect(favouritesList(db, riley, { kind: "job_aid" }, now).items).toHaveLength(1);
    expect(events("job_aid_favourited")).toHaveLength(1);
  });

  it("reorders the person's own pins only", () => {
    pinTool(db, riley, { kind: "tool", id: QC }, now);
    pinTool(db, riley, { kind: "tool", id: INCIDENT }, now);
    const ids = drawerData(db, riley, now).pinned.map((p) => p.favId);
    const theirs = pinTool(db, jordan, { kind: "tool", id: QC }, now).favId!;
    reorderPins(db, riley, { ids: [ids[1], theirs, ids[0]] }, now);
    expect(drawerData(db, riley, now).pinned.map((p) => p.id)).toEqual([INCIDENT, QC]);
    expect(drawerData(db, jordan, now).pinned.map((p) => p.id)).toEqual([QC]);
  });

  it("saving a tool is one row however often it's pressed, and removing it also removes the pin", () => {
    saveTool(db, riley, { id: QC }, now);
    saveTool(db, riley, { id: QC }, now);
    expect(favouritesList(db, riley, {}, now).counts.all).toBe(1);
    pinTool(db, riley, { kind: "tool", id: QC }, now);
    saveTool(db, riley, { id: QC, on: false }, now);
    expect(favouritesList(db, riley, {}, now).counts.all).toBe(0);
    expect(drawerData(db, riley, now).pinned).toEqual([]);
  });

  it("can't pin a tool a role may not use", () => {
    expect(() => pinTool(db, sam, { kind: "tool", id: QC }, now)).toThrow(/isn’t available/);
    expect(() => pinTool(db, sam, { kind: "job_aid", id: RATE }, now)).toThrow(/isn’t shared/);
  });
});

describe("what each person sees", () => {
  it("keeps restricted titles out of other roles' drawer, search and site search", () => {
    // Sam is a Care Partner: the incident path is theirs, the Quick-Calc and the scripts aren't.
    expect(drawerData(db, sam, now).tools.map((t) => t.id)).toEqual([INCIDENT]);
    const found = pocketSearch(db, sam, "gardener contribution", now);
    expect(JSON.stringify(found)).not.toMatch(/Quick-Calc|contribution-question/);
    expect(pocketSearch(db, sam, "bruise", now).tools.map((r) => r.id)).toEqual([INCIDENT]);
    expect(search(db, sam, "Quick-Calc").map((r) => r.id)).not.toContain(`pocket:${QC}`);
    expect(search(db, riley, "Quick-Calc").map((r) => r.id)).toContain(`pocket:${QC}`);
    expect(() => toolDetail(db, sam, QC, now)).toThrow(/isn’t available/);
    // An approved Job Aid shared with coordinators and staff only: not in a Care Partner's search either.
    approve(RATE);
    expect(pocketSearch(db, riley, "approve supplier invoice", now).tools.map((r) => r.id)).toContain(RATE);
    expect(pocketSearch(db, sam, "approve supplier invoice", now).tools.map((r) => r.id)).not.toContain(RATE);
  });

  it("finds tools and scripts by everyday task words, tools before learning", () => {
    const r = pocketSearch(db, riley, "gardener contribution", now);
    expect(r.tools[0].id).toBe(QC);
    expect(r.tools.map((x) => x.id)).toContain("contribution-question");
    expect(pocketSearch(db, riley, "daughter wants budget", now).tools.map((x) => x.id)).toContain("family-asks-to-decide");
    expect(pocketSearch(db, riley, "missed visit", now).tools.map((x) => x.id)).toContain("contractor-no-show");
    expect(pocketSearch(db, riley, "zzqx nothing here", now).none).toBe(true);
  });

  it("searches a saved highlight for its owner only", () => {
    approve(RATE);
    // Riley highlights the aid's quick action. Jordan, who could open the same aid, never sees Riley's highlight.
    const quick = "Compare the service, date, unit and rate on each invoice line.";
    savePassage(db, riley, { source: "aid", id: RATE, quote: quick }, now);
    expect(pocketSearch(db, riley, "invoice line", now).highlights.map((h) => h.title)).toHaveLength(1);
    expect(pocketSearch(db, jordan, "invoice line", now).highlights).toEqual([]);
  });

  it("a withdrawn tool leaves the drawer, search and home at once, and pinned copies show a safe unavailable state", () => {
    pinTool(db, riley, { kind: "tool", id: QC }, now);
    pocketAdminAction(db, jordan, { action: "withdraw", id: QC, reason: "The category map is being corrected." }, now);
    expect(drawerData(db, riley, now).tools.map((t) => t.id)).not.toContain(QC);
    expect(pocketSearch(db, riley, "gardener contribution", now).tools.map((t) => t.id)).not.toContain(QC);
    expect(search(db, riley, "Quick-Calc").map((r) => r.id)).not.toContain(`pocket:${QC}`);
    const pinned = homePins(db, riley, now).pinned[0];
    expect(pinned).toMatchObject({ state: "unavailable", inDrawer: false });
    const detail = toolDetail(db, riley, QC, now);
    expect(detail.tool.state).toBe("withdrawn");
    expect(detail.ruleSets).toEqual([]);
    expect(favouritesList(db, riley, {}, now).items[0]).toMatchObject({ state: "unavailable" });
    expect(() => pinTool(db, riley, { kind: "tool", id: INCIDENT }, now)).not.toThrow();
    expect(() => pinTool(db, riley, { kind: "tool", id: QC }, now)).toThrow(/withdrawn/);
    pocketAdminAction(db, jordan, { action: "restore", id: QC }, now);
    expect(drawerData(db, riley, now).tools.map((t) => t.id)).toContain(QC);
  });

  it("recent tools are the person's own, newest first, without the pinned ones", () => {
    toolOpened(db, riley, { id: INCIDENT, place: "drawer", key: "k-open-0001" }, now);
    toolOpened(db, riley, { id: QC, place: "drawer", key: "k-open-0002" }, new Date(now.getTime() + 60_000));
    expect(drawerData(db, riley, now).recent.map((r) => r.id)).toEqual([QC, INCIDENT]);
    pinTool(db, riley, { kind: "tool", id: QC }, now);
    expect(drawerData(db, riley, now).recent.map((r) => r.id)).toEqual([INCIDENT]);
    expect(drawerData(db, jordan, now).recent).toEqual([]);
  });

  it("the incident path comes with the directory route for the role, and says what Quality still has to supply", () => {
    const d = toolDetail(db, riley, INCIDENT, now);
    expect(d.incident?.responder).toEqual({ label: "Designated incident responder", route: "" });
    expect(d.incident?.problems.join(" ")).toMatch(/Incident Management System link/);
    // It links the existing Job Aid, which shows its own fallback route until Quality approves a release.
    expect(d.related.map((r) => [r.id, r.state])).toEqual([["sirs-first-steps", "unavailable"]]);
    playbookAction(
      db,
      jordan,
      { action: "save-contact", key: "incident-responder", routes: { partner: "Quality on call", coordinator: "Quality on call", staff: "Quality on call" } },
      now,
    );
    expect(toolDetail(db, riley, INCIDENT, now).incident?.responder?.route).toBe("Quality on call");
  });
});

describe("use events: ids and counts only", () => {
  it("drops anything but ids, and counts a resend once", () => {
    const sent = {
      action: "event",
      event: "calculator_estimate_run",
      toolId: QC,
      ruleSet: 2,
      place: "drawer",
      key: "calc-000001",
      amount: 1771,
      rate: "17.5",
      q: "Dot",
    };
    expect(pocketEvent(db, riley, sent, now)).toEqual({ ok: true, recorded: true });
    expect(pocketEvent(db, riley, sent, now)).toEqual({ ok: true, recorded: false });
    const row = events("calculator_estimate_run")[0];
    expect(row).toMatchObject({ source_kind: "tool", source_id: QC, release: 2, place: "drawer" });
    expect(JSON.stringify(events())).not.toMatch(/1771|17\.5|Dot/);
  });

  it("counts a search with no result without the words, and an issue as a fixed choice", () => {
    pocketEvent(db, riley, { event: "search_no_result", q: "Mrs Smith fell", key: "nores-0001" }, now);
    pocketEvent(db, riley, { event: "tool_issue_reported", toolId: INCIDENT, issue: "contact", text: "the number is wrong", key: "issue-0001" }, now);
    expect(JSON.stringify(events())).not.toMatch(/Smith|number is wrong/);
    expect(events("tool_issue_reported")[0]).toMatchObject({ source_id: INCIDENT, place: "issue:contact" });
  });

  it("refuses an event about a tool or script the role may not use, and events the page can't send", () => {
    expect(() => pocketEvent(db, sam, { event: "tool_opened", toolId: QC }, now)).toThrow(/isn’t available/);
    expect(() => pocketEvent(db, sam, { event: "script_copied", scriptId: "contractor-no-show" }, now)).toThrow(/isn’t available/);
    expect(() => pocketEvent(db, riley, { event: "tool_pinned", toolId: QC }, now)).toThrow(/Unknown event/);
  });

  it("an update since pinning is shown, then seen once when the tool is opened", () => {
    pinTool(db, riley, { kind: "tool", id: QC }, now);
    db.prepare("UPDATE favourites SET seen = '0' WHERE user_id = 'riley'").run();
    expect(drawerData(db, riley, now).pinned[0]).toMatchObject({ state: "updated", note: "Updated since you pinned this." });
    toolOpened(db, riley, { id: QC, place: "drawer", key: "k-open-0003" }, now);
    toolOpened(db, riley, { id: QC, place: "drawer", key: "k-open-0004" }, now);
    expect(drawerData(db, riley, now).pinned[0].state).toBe("draft");
    expect(events("tool_outdated_seen")).toHaveLength(1);
  });
});

describe("the owners' report", () => {
  it("counts use against the eligible audience, by rule set, with no personal detail", () => {
    pinTool(db, riley, { kind: "tool", id: QC }, now);
    toolOpened(db, riley, { id: QC, place: "drawer", key: "k-open-0005" }, now);
    pocketEvent(db, riley, { event: "calculator_needs_verification", toolId: QC, ruleSet: 2, key: "nv-000001" }, now);
    pocketEvent(db, riley, { event: "search_no_result", key: "nores-0002" }, now);
    pocketEvent(db, riley, { event: "script_copied", scriptId: "contractor-no-show", key: "copy-00001" }, now);
    const r = pocketReport(db, jordan, {}, now);
    const qc = r.tools.find((t) => t.id === QC)!;
    expect(qc).toMatchObject({ opens: 1, viewers: 1, thin: true, pinnedNow: 1, needsVerification: 1, status: "draft" });
    expect(qc.byRuleSet.find((b) => b.number === 2)?.needsVerification).toBe(1);
    expect(qc.eligible).toBeGreaterThan(0);
    expect(qc.problems.join(" ")).toMatch(/Awaiting Finance approval/);
    expect(r.totals.searchNoResult).toBe(1);
    expect(r.scripts.find((s) => s.id === "contractor-no-show")?.copies).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/riley|Riley/);
    expect(() => pocketReport(db, riley, {}, now)).toThrow();
    pocketAdminAction(db, jordan, { action: "review", id: QC, decision: "revise", note: "Waiting on Finance's category map." }, now);
    expect(pocketReport(db, jordan, {}, now).tools.find((t) => t.id === QC)?.review?.decision).toBe("Revise");
  });
});
