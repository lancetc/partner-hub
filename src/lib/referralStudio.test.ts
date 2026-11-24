import { describe, expect, it } from "vitest";
import { callerLineProblems, emptyNote, endCall, proposalIssues, startState, type FamilyNote } from "./familyCall";
import {
  CLAIM_RISK,
  claimCorrection,
  claimFlagsOf,
  claimState,
  detailsProblem,
  engineOf,
  parseStudio,
  scenarioCard,
  scenarioProblems,
  startStudio,
  studioCaseProblems,
  studioForReaders,
  studioResult,
  studioSignOffProblems,
  studioSummary,
  studioTurn,
  withOverrides,
  type StudioScenario,
  type StudioState,
} from "./referralStudio";
import {
  assetStanding,
  buildKit,
  cleanKitFields,
  DRAFT_MARK,
  kitFieldProblems,
  kitStatus,
  layerOf,
  PATHWAY_STATUSES,
  plain,
  PROVIDER_READY,
  STUDIO_EVENTS,
} from "./referralKit";
import { STAGE_ORDER, type Stage } from "./referralJourney";
import { KIT_TEMPLATE, LOCAL_REFERRAL_STUDIO, REFERRAL_CLAIMS, STUDIO_SCENARIOS } from "@/content/referralStudio";

/*
  The Local Referral Studio's engine and kit (PRD section 16's acceptance criteria): stage branching, an unsupported
  speed or availability promise, claim expiry blocking, the outreach fields, and the measures kept apart.
*/

const TODAY = "2026-11-24";
const GP = STUDIO_SCENARIOS.find((x) => x.id === "gp-admin")!;
const HOSPITAL = STUDIO_SCENARIOS.find((x) => x.id === "hospital-discharge")!;
const approvedAll = REFERRAL_CLAIMS.map((c) => ({
  ...c,
  status: "approved" as const,
  approvedBy: "Owner",
  approvedOn: "2026-11-01",
  effectiveFrom: "2026-11-01",
  reviewBy: "2027-05-01",
}));

/** Plays a conversation through the pure engine, as the server does. */
function play(sc: StudioScenario, stage: Stage, lines: string[], note: FamilyNote = emptyNote(), register = REFERRAL_CLAIMS) {
  let st: StudioState = startStudio(sc, stage, register, { cues: false });
  const replies: string[] = [];
  for (const text of lines) {
    if (st.engine.ended) break;
    const r = studioTurn(sc, register, st, { text, mode: "text" });
    st = r.state;
    replies.push(r.out.authored);
  }
  st = { ...st, engine: endCall(engineOf(sc, stage, register), st.engine, "end") };
  return { st, replies, d: studioResult(sc, register, st, note, TODAY) };
}

describe("the seed content", () => {
  it("every scenario passes its case check, fixtures included", () => {
    for (const sc of STUDIO_SCENARIOS) expect(scenarioProblems(sc, REFERRAL_CLAIMS)).toEqual([]);
  });
  it("the block seed parses and passes its case check, but can’t be signed off as it stands", () => {
    const d = parseStudio(structuredClone(LOCAL_REFERRAL_STUDIO), "block", { str: (v) => (typeof v === "string" ? v : undefined), unfinished: () => {} });
    expect(d.scenarios).toHaveLength(2);
    expect(studioCaseProblems(d, REFERRAL_CLAIMS)).toEqual([]);
    const hard = studioSignOffProblems(d, REFERRAL_CLAIMS, TODAY);
    expect(hard.join(" ")).toMatch(/record the content owner/);
    expect(hard.join(" ")).toMatch(/accept or edit the selection rationale/);
  });
  it("names no person, so publishing queues no portrait", () => {
    for (const sc of STUDIO_SCENARIOS) expect(sc.family.characters).toEqual([]);
  });
});

describe("AC1–AC3: the hospital social worker, stage unknown", () => {
  it("a careful conversation asks the stage, checks rather than promises, and earns the evidence it cites", () => {
    const fx = HOSPITAL.family.fixtures.find((f) => f.id === "hd-sound")!;
    const { d, replies } = play(
      HOSPITAL,
      "unknown",
      fx.turns.map((t) => t.text),
      fx.note,
    );
    expect(d.critical).toBe(false);
    expect(d.ready).toBe(true);
    expect(d.stageAsked).toBe(true);
    const pathway = d.dims.find((x) => x.label === "Pathway fit")!;
    expect(pathway.level).toBe(3);
    expect(pathway.evidence.map((e) => e.quote).join(" ")).toMatch(/aged care assessment/);
    const close = d.dims.find((x) => x.label === "Practical close")!;
    expect(close.evidence.map((e) => e.quote).join(" ")).toMatch(/call you back by 3/);
    // The referrer pushes back after the opening, word for word, and answers the stage question with the variant's line.
    expect(replies[0]).toMatch(/quick sign-on/);
    expect(replies[0]).toMatch(/nobody’s seen a letter/);
    // Feedback never says services are confirmed.
    const words = JSON.stringify([d.base.endingLabel, d.base.endingText, d.stageNote, d.next]);
    expect(words).not.toMatch(/services? (?:is|are) confirmed|confirmed start|worker is booked/i);
    expect(d.base.endingText).toMatch(/Nothing about tomorrow is settled/);
  });

  it("AC2: “same-day care” and a worker tomorrow get critical flags with the exact phrase, the approved correction and a retry", () => {
    const { d, replies } = play(HOSPITAL, "unknown", [
      "Yes, we offer same-day care, so discharge them and I’ll organise it.",
      "Don’t worry, we can have someone there tomorrow.",
    ]);
    expect(d.critical).toBe(true);
    expect(d.ready).toBe(false);
    expect(d.base.recommendation).toBe("another-attempt");
    const signon = d.claimFindings.find((c) => c.claim === "same-day-signon")!;
    expect(signon.quote).toBe("Yes, we offer same-day care, so discharge them and I’ll organise it.");
    expect(signon.correction.text).toMatch(/doesn’t mean services start within 24 hours/);
    expect(signon.correction.label).toMatch(/Draft wording for practice/);
    expect(signon.source.url).toBe("https://trilogycare.com.au/same-day-sign-on");
    const promise = d.claimFindings.find((c) => c.claim === "local-speed")!;
    expect(promise.quote).toMatch(/we can have someone there tomorrow/);
    expect(d.base.critical.sort()).toEqual(["discharge-go", "promise-worker", CLAIM_RISK].sort());
    // The referrer challenges, never applauds.
    expect(replies[0]).toMatch(/Signing a form|Same-day what|can’t discharge/);
    // Claim and model accuracy is zero, but the positive score elsewhere stays visible.
    expect(d.dims.find((x) => x.label === "Model and claim accuracy")!.level).toBe(0);
  });

  it("a hedged promise (“I can’t promise a worker tomorrow”) isn’t a claim", () => {
    expect(claimFlagsOf(REFERRAL_CLAIMS, "hospital", "I can’t guarantee a worker tomorrow, but intake can check.", 1)).toEqual([]);
    expect(claimFlagsOf(REFERRAL_CLAIMS, "hospital", "We guarantee a worker tomorrow.", 1)).toHaveLength(1);
  });

  it("“we get clients set up faster” is challenged: what do you mean by faster?", () => {
    const { replies, d } = play(HOSPITAL, "unknown", ["We get clients set up faster than other providers."]);
    expect(replies[0]).toMatch(/What do you mean by faster/);
    expect(d.claimFindings[0]).toMatchObject({ claim: "local-speed", turn: 1 });
  });
});

describe("AC4: the GP practice manager’s admin objection", () => {
  const route = GP.family.fixtures.find((f) => f.id === "gp-route-fx")!;
  it("answering with the My Aged Care route and a next step changes the branch and the feedback", () => {
    const good = play(
      GP,
      "unknown",
      route.turns.map((t) => t.text),
      route.note,
    );
    const generic = play(GP, "unknown", [
      "We’re a leading provider with a full range of services. Our services include cleaning, gardening and personal care.",
      "We support people across the whole area with everything they need.",
      "Thanks for your time.",
    ]);
    // The branch: the "another form?" push only comes when the admin question wasn't answered.
    expect(generic.st.engine.fired).toContain("gp-beat-forms");
    expect(good.replies.join(" ")).toMatch(/government’s referral, not yours/);
    expect(good.d.base.ending).toBe("gp-end-route");
    expect(generic.d.base.ending).toBe("gp-end-generic");
    // A generic monologue doesn't get full listening credit.
    const listen = (x: typeof good) => x.d.dims.find((y) => y.label === "Listening and referrer value")!.level;
    expect(listen(good)).toBe(3);
    expect(listen(generic)).toBeLessThanOrEqual(1);
  });
  it("the assumed stage is revealed and the careful correction is rewarded", () => {
    const good = play(
      GP,
      "unknown",
      route.turns.map((t) => t.text),
      route.note,
    );
    expect(good.replies[0]).toMatch(/approval letter, but no funding yet/);
    expect(good.d.actual).toBe("waiting");
    expect(good.d.stageNote).toMatch(/“Approved, waiting for allocation”/);
    expect(good.d.next.step).toMatch(/My Aged Care’s information about the wait/);
  });
});

describe("AC5: the stage changes the proposed step, and an unknown stage never gets a provider-ready close", () => {
  it("a sign-up pitch is a move only where the referrer's actual stage allows it", () => {
    const pitch = "If she wants to look at us, with her agreement I can introduce her to our intake team.";
    const unknown = play(HOSPITAL, "unknown", [pitch]);
    const allocated = play(HOSPITAL, "allocated", [pitch]);
    expect(unknown.st.engine.evals[0].risks.map((r) => r.id)).toContain("cta-too-early");
    expect(allocated.st.engine.evals[0].moves.map((r) => r.id)).toContain("offer-intro");
    expect(unknown.replies[0]).toMatch(/don’t even know if she’s been assessed/);
  });
  it("the kit’s call to action follows the stage, and only allocated or changing carries a provider-ready close", () => {
    const base = cleanKitFields({ serviceArea: "north-brisbane", contactRoute: "business-phone", audience: "gp" });
    const ctas = Object.fromEntries(
      STAGE_ORDER.map((stage) => [
        stage,
        plain(buildKit(KIT_TEMPLATE, REFERRAL_CLAIMS, { ...base, stage }, { businessName: "Demo Care", today: TODAY }).onePager.cta),
      ]),
    );
    for (const stage of STAGE_ORDER) expect(PROVIDER_READY.test(ctas[stage])).toBe(stage === "allocated");
    expect(ctas.unknown).toMatch(/won’t assume they’re ready to choose a provider/);
    expect(ctas.assessment).toMatch(/My Aged Care first/);
    expect(new Set(Object.values(ctas)).size).toBe(STAGE_ORDER.length);
    const urgent = buildKit(KIT_TEMPLATE, REFERRAL_CLAIMS, { ...base, stage: "urgent", audience: "hospital" }, { businessName: "Demo Care", today: TODAY });
    expect(urgent.onePager.handoff.length).toBeGreaterThan(3);
  });
});

describe("AC6, AC7: approved templates, locked claims and expiry", () => {
  const fields = cleanKitFields({
    serviceArea: "north-brisbane",
    contactRoute: "business-email",
    audience: "gp",
    stage: "assessment",
    introduction: "I’ve run a small Care Partner business in North Brisbane for six years.",
  });
  it("only the approved fields can change; locked claims can’t be edited through the form", () => {
    const sneaky = cleanKitFields({ ...fields, wording: "Same-day care!", sections: [], claims: {}, title: "Fastest provider in Brisbane" });
    expect(Object.keys(sneaky).sort()).toEqual([
      "audience",
      "commitment",
      "contactRoute",
      "example",
      "introduction",
      "meeting",
      "recipient",
      "serviceArea",
      "stage",
    ]);
    const kit = buildKit(KIT_TEMPLATE, REFERRAL_CLAIMS, sneaky, { businessName: "Demo Care", today: TODAY });
    expect(JSON.stringify(kit)).not.toMatch(/Fastest provider|Same-day care!/);
    const editable = kit.onePager.contact.filter((l) => !l.locked).map((l) => l.field);
    expect(editable).toEqual(expect.arrayContaining(["serviceArea", "contactRoute", "introduction"]));
    for (const sec of kit.onePager.sections) for (const l of sec.lines) if (/My Aged Care/.test(l.text)) expect(l.locked).toBe(true);
  });
  it("free fields are checked for claims, endorsements, links and personal details", () => {
    const bad = cleanKitFields({
      ...fields,
      introduction: "We offer same-day care, endorsed by Northside Hospital.",
      recipient: "Mrs Smith",
      meeting: "see www.example.test",
    });
    const p = kitFieldProblems(KIT_TEMPLATE, bad, REFERRAL_CLAIMS).join(" ");
    expect(p).toMatch(/same-day care/);
    expect(p).toMatch(/endorsement/);
    expect(p).toMatch(/a person’s name/);
    expect(p).toMatch(/link/);
    expect(kitFieldProblems(KIT_TEMPLATE, fields, REFERRAL_CLAIMS)).toEqual([]);
  });
  it("with draft claims the kit is a draft, marked “Draft — review required”, with version and date", () => {
    const kit = buildKit(KIT_TEMPLATE, REFERRAL_CLAIMS, fields, { businessName: "Demo Care", today: TODAY });
    expect(kit.status).toBe("draft");
    expect(kit.mark).toBe(DRAFT_MARK);
    expect(kit.onePager.footer.join(" ")).toMatch(/local-outreach 1/);
    expect(kit.onePager.footer.join(" ")).toMatch(new RegExp(TODAY));
    expect(kit.onePager.footer.join(" ")).toMatch(/isn’t endorsed by any GP practice or hospital/);
    expect(kit.onePager.footer.join(" ")).toMatch(/Demo Care is an independent Care Partner business/);
  });
  it("approved once the template and every claim are approved and current", () => {
    const t = {
      ...KIT_TEMPLATE,
      status: "approved" as const,
      approval: { brand: "B", partnerships: "P", pathway: "R", quality: "Q", privacy: "Pr", approvedOn: TODAY, reviewBy: "2027-05-01" },
    };
    expect(kitStatus(t, approvedAll, TODAY).approved).toBe(true);
    expect(buildKit(t, approvedAll, fields, { businessName: "Demo Care", today: TODAY }).status).toBe("approved");
  });
  it("a withdrawn or expired claim blocks an approved export, and marks a saved asset for review", () => {
    const t = {
      ...KIT_TEMPLATE,
      status: "approved" as const,
      approval: { brand: "B", partnerships: "P", pathway: "R", quality: "Q", privacy: "Pr", approvedOn: TODAY, reviewBy: "2027-05-01" },
    };
    const made = buildKit(t, approvedAll, fields, { businessName: "Demo Care", today: TODAY });
    const saved = { templateVersion: made.templateVersion, claimVersions: made.claimVersions, status: made.status };
    expect(assetStanding(saved, t, approvedAll, TODAY).state).toBe("approved");
    const withdrawn = withOverrides(approvedAll, { "same-day-signon": { status: "withdrawn" } });
    expect(kitStatus(t, withdrawn, TODAY).approved).toBe(false);
    const after = buildKit(t, withdrawn, fields, { businessName: "Demo Care", today: TODAY });
    expect(after.status).toBe("blocked");
    expect(JSON.stringify(after.onePager)).not.toMatch(/doesn’t mean services start within 24 hours/);
    expect(assetStanding(saved, t, withdrawn, TODAY)).toMatchObject({ state: "outdated" });
    // Past its review date, a claim is expired, and the same happens.
    const late = approvedAll.map((c) => (c.id === "funding-wait" ? { ...c, reviewBy: "2026-11-01" } : c));
    expect(
      claimState(
        late.find((c) => c.id === "funding-wait")!,
        TODAY,
      ),
    ).toBe("expired");
    expect(assetStanding(saved, t, late, TODAY).state).toBe("outdated");
    expect(
      claimCorrection(
        late.find((c) => c.id === "funding-wait")!,
        TODAY,
      ).usable,
    ).toBe(false);
  });
});

describe("AC8: three email drafts with placeholders, never sent", () => {
  it("placeholders stay until filled, and nothing claims to be sent", () => {
    const f = cleanKitFields({ serviceArea: "north-brisbane", contactRoute: "business-email", stage: "assessment" });
    const kit = buildKit(KIT_TEMPLATE, REFERRAL_CLAIMS, f, { businessName: "Demo Care", today: TODAY });
    expect(kit.emails).toHaveLength(3);
    expect(plain(kit.emails[0].body)).toMatch(/\[Recipient\]/);
    expect(plain(kit.emails[0].body)).toMatch(/\[what you agreed to do\]/);
    const filled = buildKit(
      KIT_TEMPLATE,
      REFERRAL_CLAIMS,
      { ...f, recipient: "the practice manager", commitment: "I’ll drop in the stage guide" },
      { businessName: "Demo Care", today: TODAY },
    );
    expect(plain(filled.emails[0].body)).toMatch(/Hi the practice manager/);
    expect(JSON.stringify(kit)).not.toMatch(/"sent"/);
  });
});

describe("AC12 and section 12: the three layers are kept apart", () => {
  it("a download is material use, never an introduction, agreement or service", () => {
    expect(layerOf("asset_downloaded")).toBe("material");
    expect(layerOf("asset_copied")).toBe("material");
    expect(Object.values(STUDIO_EVENTS)).not.toContain("pathway");
    expect(Object.keys(PATHWAY_STATUSES)).toEqual(["introduced", "pathway", "agreement", "commenced"]);
    expect(new Set(Object.values(PATHWAY_STATUSES).map((x) => x.label)).size).toBe(4);
  });
});

describe("the bounded referrer and personal details", () => {
  it("a model's proposal and line are held to the compiled scenario", () => {
    const eng = engineOf(HOSPITAL, "unknown", REFERRAL_CLAIMS);
    expect(proposalIssues({ intents: ["made-up"], moves: [], risks: [], unclear: false, reply: "Okay." }, eng)).not.toEqual([]);
    expect(proposalIssues({ intents: ["i-ack"], moves: [], risks: [], unclear: false, reply: "Okay." }, eng)).toEqual([]);
    // A line that reveals the stage before it's been asked is refused.
    expect(callerLineProblems(eng, "She has an allocation letter.", { allowed: [], heard: [], authored: "" }).join(" ")).toMatch(/not yet revealed/);
    expect(callerLineProblems(eng, "Okay, go on.", { allowed: [], heard: [], authored: "" })).toEqual([]);
    expect(startState(eng).intensity).toBe(2);
  });
  it("refuses real-looking details", () => {
    expect(detailsProblem("Her Medicare number is 2123 45670 1")).toMatch(/long number|identifier/);
    expect(detailsProblem("Mrs Jones was born 03/04/1941")).toMatch(/name|date of birth/);
    expect(detailsProblem("The patient on your ward")).toBeNull();
  });
});

describe("readers' copy", () => {
  it("learners get the persona card and stage choices, never intents, replies, rubric or fixtures", () => {
    const card = scenarioCard(HOSPITAL);
    expect(JSON.stringify(card)).not.toMatch(/nobody’s seen a letter|i-promise|hd-end-checked|patterns/);
    expect(card.stages.map((x) => x.stage)).toEqual(["unknown", "allocated"]);
    const d = parseStudio(structuredClone(LOCAL_REFERRAL_STUDIO), "b", { str: (v) => (typeof v === "string" ? v : undefined), unfinished: () => {} });
    const readers = studioForReaders(d);
    expect(JSON.stringify(readers)).not.toMatch(/nobody’s seen a letter|hd-end-checked|Illustrative, not yet verified/);
  });
  it("the summary kept for reporting holds no words", () => {
    const { d } = play(HOSPITAL, "unknown", ["Yes, we offer same-day care, so discharge them and I’ll organise it."]);
    expect(JSON.stringify(studioSummary(d))).not.toMatch(/same-day care|discharge them/);
  });
});
