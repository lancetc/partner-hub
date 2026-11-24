import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide } from "./magazine";
import { gateQuestion, lineDiff, readiness } from "@/lib/playbook";
import { activityDone } from "@/lib/magazine";
import { SEED_SNIPPETS } from "@/content/playbooks";
import {
  acknowledge,
  askLead,
  gapAction,
  markViewed,
  playbookAction,
  playbookLibrary,
  playbookList,
  replyToGap,
  resolveSnippet,
  toggleSaved,
} from "./playbooks";

/* Live playbooks: one approved release everywhere, owner review before a source change shows, instant withdrawal, and Ask a Lead never posts what it shouldn't. */

let db: Db;
let jordan: User, riley: User, sam: User;
const now = new Date("2026-11-20T00:00:00Z");
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);
const SIRS = "sirs-first-steps";
const INVOICE = "rejected-supplier-invoice";
const sirsRelease = () => SEED_SNIPPETS.find((s) => s.id === SIRS)!.release;
const act = (input: Record<string, unknown>, at = now) => playbookAction(db, jordan, input, at);
const configureContacts = () => {
  for (const key of ["incident-responder", "finance-support"])
    act({
      action: "save-contact",
      key,
      routes: { partner: "Call the incident line in the staff directory", coordinator: "Call the incident line", staff: "Incident line" },
    });
};
/** Approves a release of a snippet, from its seed steps, with the sign-offs it needs. */
function release(id: string, extra: Record<string, unknown> = {}, at = now) {
  const seed = SEED_SNIPPETS.find((s) => s.id === id)!.release;
  const data = {
    ...seed,
    effectiveOn: "2026-11-20",
    reviewBy: "2027-05-20",
    approvals: { owner: "Policy owner", clinical: "Clinical", quality: "Quality" },
    ...extra,
  };
  act({ action: "save-release", id, data }, at);
  act({ action: "submit", id }, at);
  return act({ action: "approve", id }, at);
}
type View = Extract<ReturnType<typeof resolveSnippet>, { permitted: true }>;
const view = (u: User, id: string, at = now) => resolveSnippet(db, u, id, at) as View;
const ask = (u: User, input: Record<string, unknown>) =>
  askLead(db, u, input, now) as { id: string; route: string; status: string; repeated?: boolean; held?: string[] };
const pages = (snippetId: string) => [
  {
    id: "p1",
    title: "Playbook",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Steps", blocks: [{ id: "pb", type: "playbook", snippetId }] }],
  },
];

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
});

describe("releasing", () => {
  it("starts unreleased: hidden from readers, and a course can still publish it", () => {
    expect(resolveSnippet(db, riley, SIRS, now)).toMatchObject({
      readiness: "fallback",
      unreleased: true,
      release: null,
      fallback: { text: expect.stringMatching(/call 000/) },
    });
    const c = createGuide(db, jordan, { title: "Incidents", completion: "confirm", doc: { schema: 2, pages: pages(SIRS) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).not.toThrow();
    // A Job Aid that isn't in the library still stops it.
    const bad = createGuide(db, jordan, { title: "Broken", completion: "confirm", doc: { schema: 2, pages: pages("no-such-aid") } }, now);
    expect(() => publishGuide(db, jordan, bad.id, "", now, { allowUnverified: true })).toThrow(/isn’t in the library/);
  });

  it("won't approve without configured contacts, the right sign-offs, or with a typed-in phone number", () => {
    expect(() => release(SIRS)).toThrow(/Configure these contacts/);
    configureContacts();
    expect(() => release(SIRS, { approvals: { owner: "Owner", clinical: "", quality: "" } })).toThrow(/Clinical and Quality co-approval/);
    const steps = sirsRelease().steps.map((s, i) => (i === 2 ? { ...s, text: "Ring 0412 345 678 now." } : s));
    expect(() => release(SIRS, { steps })).toThrow(/phone number/);
    expect(release(SIRS)).toMatchObject({ number: 1 });
  });

  it("separates the worker's alert (as soon as possible) from the provider's 24-hour Commission notification", () => {
    const steps = sirsRelease().steps;
    expect(steps.find((s) => s.id === "notify")!.text).toMatch(/as soon as possible/);
    expect(steps.find((s) => s.id === "notify")!.why).toMatch(/24-hour Commission notification .* doesn’t make your internal alert something that can wait/);
    expect(steps.find((s) => s.id === "unsure")!.text).toMatch(/authorised provider team decides the SIRS category and priority/);
  });
});

describe("one release everywhere", () => {
  it("resolves the same snippet to its current approved release in two courses, the list and the Wallet", () => {
    configureContacts();
    release(INVOICE);
    const a = createGuide(db, jordan, { title: "Course A", completion: "confirm", doc: { schema: 2, pages: pages(INVOICE) } }, now);
    const b = createGuide(db, jordan, { title: "Course B", completion: "confirm", doc: { schema: 2, pages: pages(INVOICE) } }, now);
    publishGuide(db, jordan, a.id, "", now);
    publishGuide(db, jordan, b.id, "", now);
    toggleSaved(db, riley, INVOICE, true, now);
    expect(playbookList(db, riley, now).playbooks).toEqual([expect.objectContaining({ id: INVOICE, saved: true, number: 1 })]);
    expect(
      playbookLibrary(db, jordan, now)
        .snippets.find((s) => s.id === INVOICE)!
        .placements.map((p) => p.title)
        .sort(),
    ).toEqual(["Course A", "Course B"]);
    expect(resolveSnippet(db, riley, INVOICE, now)).toMatchObject({
      readiness: "current",
      release: { number: 1 },
      contacts: [{ key: "finance-support", route: expect.stringMatching(/incident line/) }],
    });
  });
});

describe("source changes", () => {
  it("shows owners a pending diff; readers keep the approved release until a new one is approved", () => {
    configureContacts();
    release(INVOICE);
    markViewed(db, riley, INVOICE, now);
    act({
      action: "save-source",
      docId: "supplier-invoices",
      anchor: "rejected-invoice",
      text: "When a supplier invoice is rejected:\nCheck the rejection reason.\nCall the supplier the same day.",
    });
    const lib = playbookLibrary(db, jordan, now).snippets.find((s) => s.id === INVOICE)!;
    expect(lib.source.state).toBe("changed");
    expect(lib.source.diff.filter((d) => d.kind === "add").map((d) => d.text)).toContain("Call the supplier the same day.");
    // Readers still see release 1, and no pending notice.
    expect(resolveSnippet(db, riley, INVOICE, now)).toMatchObject({ release: { number: 1 }, pending: null });
    expect(resolveSnippet(db, jordan, INVOICE, now).pending).toBe("changed");
    // The old release can't be re-approved against a changed source; a new one written from it can.
    const r2 = release(INVOICE, { changeSummary: "Call the supplier the same day." });
    expect(r2).toMatchObject({ number: 2 });
    expect(resolveSnippet(db, riley, INVOICE, now)).toMatchObject({
      release: { number: 2 },
      updatedSince: [{ number: 2, summary: "Call the supplier the same day." }],
    });
  });

  it("parks a missing section for mapping instead of guessing", () => {
    configureContacts();
    act({ action: "save-snippet", id: INVOICE, data: { ...SEED_SNIPPETS[1].data, source: { docId: "supplier-invoices", anchor: "no-such-section" } } });
    expect(playbookLibrary(db, jordan, now).snippets.find((s) => s.id === INVOICE)!.source.state).toBe("unmapped");
    expect(() => act({ action: "save-release", id: INVOICE, data: SEED_SNIPPETS[1].release })).toThrow(/can’t be found/);
  });
});

describe("withdrawal and expiry", () => {
  it("withdraws actionable steps everywhere at once, to the fallback", () => {
    configureContacts();
    release(SIRS);
    act({ action: "withdraw", id: SIRS, reason: "Responder route changing" });
    expect(resolveSnippet(db, riley, SIRS, now)).toMatchObject({
      readiness: "fallback",
      release: null,
      withdrawnReason: "Responder route changing",
      fallback: { contacts: [{ key: "incident-responder" }] },
    });
    act({ action: "restore", id: SIRS });
    expect(resolveSnippet(db, riley, SIRS, now).readiness).toBe("current");
  });

  it("stops a safety-critical snippet at its review date; an operational one shows as review due", () => {
    configureContacts();
    release(SIRS);
    release(INVOICE);
    expect(resolveSnippet(db, riley, SIRS, later(200)).readiness).toBe("fallback");
    expect(resolveSnippet(db, riley, INVOICE, later(200))).toMatchObject({ readiness: "review_due", release: { number: 1 } });
    expect(readiness({ risk: "operational" }, false, undefined, "2026-11-20")).toBe("fallback");
  });

  it("keeps role-limited snippets away from other roles", () => {
    configureContacts();
    act({ action: "save-snippet", id: INVOICE, data: { ...SEED_SNIPPETS[1].data, audiences: ["staff"] } });
    expect(resolveSnippet(db, riley, INVOICE, now)).toMatchObject({ permitted: false });
    expect(() => toggleSaved(db, riley, INVOICE, true, now)).toThrow(/isn’t shared with your role/);
  });
});

describe("Ask a Lead", () => {
  beforeEach(() => {
    configureContacts();
    release(SIRS);
  });

  it("gives an urgent concern the urgent route, and stores or posts nothing", () => {
    const r = askLead(db, riley, { snippetId: SIRS, stepId: "notify", issue: "lead", question: "He fell this morning and is bleeding, what do I do?" }, now);
    expect(r).toMatchObject({ route: "urgent", fallback: { text: expect.stringMatching(/000/) } });
    expect(db.prepare("SELECT COUNT(*) AS n FROM playbook_gaps").get()).toEqual({ n: 0 });
  });

  it("holds a question that might identify someone for review, and tells the asker so", () => {
    const r = ask(riley, { snippetId: SIRS, stepId: "notify", issue: "notcovered", question: "What if Mrs Jones says she doesn't want it reported?" });
    expect(r).toMatchObject({ route: "review", status: "awaiting_review", held: ["a person’s name"] });
    expect(view(sam, SIRS).questions).toEqual([]);
    expect(view(riley, SIRS).questions[0]).toMatchObject({ status: "awaiting_review", mine: true });
    gapAction(db, jordan, { action: "decline", gapId: r.id, note: "Please ask it without the name." }, now);
    expect(view(riley, SIRS).questions[0]).toMatchObject({ status: "declined", note: "Please ask it without the name." });
  });

  it("posts a safe question once (retries don't duplicate), alerts leads, labels replies, and flags answers from an older release", () => {
    const q = { snippetId: SIRS, stepId: "unsure", issue: "unclear", question: "Who counts as the designated responder after hours?", idempotencyKey: "k1" };
    const r = ask(riley, q);
    expect(askLead(db, riley, q, now)).toMatchObject({ id: r.id, repeated: true });
    expect(r).toMatchObject({ route: "posted", status: "posted" });
    expect(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE category = 'playbook' AND user_id = 'jordan'").get()).toEqual({ n: 1 });
    replyToGap(db, sam, { gapId: r.id, body: "I think it's whoever is on call." }, now);
    replyToGap(db, jordan, { gapId: r.id, body: "The on-call responder in the staff directory." }, now);
    expect(() => replyToGap(db, sam, { gapId: r.id, body: "Approved", policy: true }, now)).toThrow();
    const v = view(sam, SIRS).questions[0];
    expect(v.status).toBe("answered");
    expect(v.replies.map((x) => x.label)).toEqual(["peer", "lead"]);
    // A new release makes earlier answers visibly stale.
    act({
      action: "save-source",
      docId: "incident-procedure",
      anchor: "first-steps",
      text: "If a reportable incident may have occurred:\nProtect the person’s immediate safety.\nNotify the after-hours responder.",
    });
    release(SIRS, { changeSummary: "After-hours responder named." });
    expect(view(sam, SIRS).questions[0].replies.every((x) => x.stale)).toBe(true);
  });

  it("refuses an identifying reply, and lets the asker close their question", () => {
    const r = ask(riley, { snippetId: SIRS, issue: "unclear", question: "Does the record step mean the incident system or the care notes?" });
    expect(() => replyToGap(db, sam, { gapId: r.id, body: "Like Mr Smith last week" }, now)).toThrow(/Keep replies general/);
    expect(() => gapAction(db, sam, { action: "close", gapId: r.id }, now)).toThrow(/Only the person who asked/);
    gapAction(db, riley, { action: "close", gapId: r.id }, now);
    expect(view(riley, SIRS).questions[0].status).toBe("resolved");
  });

  it("records an acknowledgement of the current release, which isn't an incident report", () => {
    expect(acknowledge(db, riley, SIRS, now)).toEqual({ acked: true });
    expect(resolveSnippet(db, riley, SIRS, now).acked).toBe(true);
  });
});

describe("the gates", () => {
  it("flags urgency and identifying details, and leaves a general question alone", () => {
    expect(gateQuestion("Someone is missing right now")).toMatchObject({ urgent: true });
    expect(gateQuestion("Client on 12/11 had incident #AB1234").identifying).toEqual(expect.arrayContaining(["a date", "an incident or case number"]));
    expect(gateQuestion("Which step comes first if I can't reach the responder?")).toEqual({ urgent: false, identifying: [] });
    expect(lineDiff("a\nb", "a\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "c" },
    ]);
  });
});

describe("playbook blocks in a course", () => {
  it("are reference, so they never hold up finishing a page", () => {
    expect(activityDone({ id: "pb1", type: "playbook", snippetId: SIRS }, {})).toBeNull();
  });
});
