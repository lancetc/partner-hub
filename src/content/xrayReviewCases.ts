import type { XLine, XRayBlockData } from "@/lib/xray";
import type { FundingData, FundingLine, FundingSource } from "@/lib/xrayFunding";

/*
  The Quote/Invoice X-Ray's first two cases (docs/invoice-xray.md, "Quote and invoice review"): one equipment quote
  and one supplier invoice, drafted from the PRD "Excluded Item and Grey-Area Quote/Invoice X-Ray" (21 November 2026).

  Everything here is fictional: the shop, the practice, the prices and the documents. The participants are the
  Invoice X-Ray's own library characters (Mrs Wong and Mr Brennan), so no new portrait is needed. Every source passage
  is a training extract or summary to verify against the current publication, and the internal process and price
  sources are placeholders. Nothing is signed off: the policy owner, Operations/Finance, the AT–HM or clinical reviewer
  and Quality check every decision, rule, source, price and script before a case is published.
*/

const line = (l: XLine): XLine => l;
const fline = (l: FundingLine): FundingLine => l;
const unsigned = { owner: "", finance: "", operations: "", quality: "", approvedOn: "" };
const source = { title: "", version: "", reviewedOn: "" };
const COMPLAINTS =
  "Placeholder until Quality supplies the approved route and wording: “If you’re not happy with this, please tell me, and I’ll explain how to make a complaint through Trilogy Care. You can also contact the Aged Care Quality and Safety Commission. Raising a concern won’t affect your services.”";
const RATIONALE = {
  theme: "Illustrative: quote rework and complaints after an item’s name or a supplier’s say-so is taken as a yes or no. Replace with a verified theme.",
  themeId: "",
  behaviour:
    "Ask what the person wants, check the right list and their individual approval, ask for the missing advice or detail, choose a route, explain it and record the follow-up.",
  barrier: "Hypothesis: the item’s name, a retailer’s claim or a supplier’s fee line is used as the rule. Verify it with the people doing the work.",
  whyBlock: "A realistic document gives a line-by-line evidence search and a decision; the explanation rehearses the hard conversation.",
  otherResponse: "A quote template that asks suppliers for itemisation and specifications, and the Can this be funded? Job Aid.",
  measure: "",
  owner: "",
  decision: "" as const,
  review: "" as const,
};
const JOB_AID = {
  snippetId: "can-this-be-funded",
  why: "The same checks, in order, for a real request: the goal first, then the list, approval, route, advice, price and contribution.",
};
const src = (s: Omit<FundingSource, "reviewer" | "reviewed">): FundingSource => ({ ...s, reviewer: "", reviewed: false });

const PRICES = src({
  id: "src-prices",
  kind: "pricing",
  title: "Prices for Support at Home participants",
  ref: "Agreed, all-inclusive prices; separate fees; self-managed overhead; ad hoc agreement; invoicing after delivery (training summary)",
  passage:
    "Training summary, to verify: prices must be reasonable, transparent, all-inclusive and agreed with the participant. Providers can’t separately charge participants admin or travel fees for ordinary services. Under self-management, a permitted overhead is capped and included in the final price. An ad hoc item or service has its price agreed before it’s confirmed, and invoices follow delivery, with the right units, unit price, item and date.",
  url: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services/prices-for-support-at-home-participants",
  version: "As checked 21 Nov 2026",
  effectiveDate: "2026-11-21",
  reviewBy: "2027-02-28",
});

// ---------------------------------------------------------------------------------------------
// Case A: Mrs Wong's rise chair, a retailer's quote
// ---------------------------------------------------------------------------------------------

const WONG_MODEL = {
  acknowledge_goal: "I can hear how much you want to get up from your chair on your own, safely. That’s what we want too.",
  confirmed: "Chairs designed to help someone stand can be funded through AT–HM, which is separate from your everyday services budget.",
  checking:
    "Before anything’s bought, this kind of chair needs a health professional’s advice on the right one for you, and then an AT–HM approval. Some of these chairs are too high or deep for a smaller person, so the OT will check that first. The cushions aren’t something AT–HM covers; you can buy them yourself if you’d like them.",
  source: "That comes from the AT–HM list (July 2026) and the AT–HM scheme rules, as checked on 21 November 2026.",
  next: "Your OT can visit on 3 December. After that I’ll lodge the request, confirm your contribution with Finance and agree the price with you before the shop delivers. I’ll call you after the visit.",
  price: "There may be a contribution for AT–HM items. I’ll confirm it from your notice before you agree to anything.",
};

const wongFunding: FundingData = {
  version: "wong-rise-chair-1",
  ruleSet: "quote-xray-rules-2026-11 (draft)",
  mode: "formative",
  documentRole: "retailer_quote",
  goal: "“I want to get up out of my chair on my own, without pulling on the table.”",
  request: "Mrs Wong’s message: “The shop says these chairs are covered by my package. Can you approve it so they can deliver on Friday?”",
  evidence: [
    { id: "ev-goal", kind: "goal", title: "Her goal, in her words", text: "“I want to get up out of my chair on my own, without pulling on the table.”" },
    {
      id: "ev-plan",
      kind: "plan",
      title: "Care plan excerpt (agreed 2 September 2026)",
      text: "Mobility: difficulty standing up from low seating; pushes up on the armrests and a nearby table. A fall in the lounge in August, with no injury. Goal: stand up safely on her own. Action: OT home mobility assessment (referral sent 10 November; the visit isn’t booked yet).",
    },
    {
      id: "ev-approvals",
      kind: "approval",
      title: "Approvals on file",
      text: "Ongoing services: domestic assistance and social support. AT–HM: nothing approved, and no request lodged.",
    },
    {
      id: "ev-shop",
      kind: "message",
      title: "The shop’s note on the quote",
      text: "“Lift chairs are on the government list, so your package will pay. Delivery Friday if you confirm by Wednesday.”",
    },
  ],
  sources: [
    src({
      id: "src-athm-list",
      kind: "athm_list",
      title: "AT–HM list",
      ref: "Seating that helps a person stand (training extract)",
      passage:
        "Training extract, to verify against the current list: some seating designed to help a person stand is on the list. An item in this kind of entry needs advice from a suitable health professional before it’s provided, and has to meet an assessed need. Being on the list doesn’t approve an item for a particular person.",
      url: "https://www.health.gov.au/resources/publications/assistive-technology-and-home-modifications-list-at-hm-list",
      version: "July 2026",
      effectiveDate: "2026-07-01",
      reviewBy: "2027-01-31",
    }),
    src({
      id: "src-athm-scheme",
      kind: "athm_scheme",
      title: "AT–HM scheme",
      ref: "Assessed need, approval, funding and exclusions (training summary)",
      passage:
        "Training summary, to verify: AT–HM funding is separate from the quarterly budget for ongoing services. An item needs an assessed need, the advice its entry requires, and approval before it’s bought. A general household item isn’t made eligible by buying it alongside an AT–HM item. Delivery and set-up follow the item’s approval.",
      url: "https://www.health.gov.au/our-work/support-at-home/delivering-services-for-support-at-home/assistive-technology-and-home-modifications-at-hm-scheme",
      version: "As checked 21 Nov 2026",
      effectiveDate: "2026-11-21",
      reviewBy: "2027-02-28",
    }),
    PRICES,
    src({
      id: "src-tc-athm",
      kind: "internal_process",
      title: "AT–HM requests (placeholder Hub record)",
      ref: "From a retailer’s quote to an approved purchase (editorial example)",
      passage:
        "Don’t confirm an AT–HM purchase from a retailer’s quote. Get the clinician’s advice, lodge the request, confirm the approval and the participant’s contribution, and agree the price before anything is ordered.",
      url: "",
      version: "Draft 1",
      effectiveDate: "2026-11-24",
      reviewBy: "2027-02-28",
    }),
  ],
  lines: [
    fline({
      lineId: "wq-l1",
      itemType: "Lift-assist (riser) recliner chair",
      priceContext: "athm_item",
      decision: "check_advice",
      alsoAccepted: ["potentially_fundable"],
      route: "assistive_technology",
      routeAlso: [],
      axes: {
        list_scope: { state: "met", note: "The case’s AT–HM list extract covers seating designed to help a person stand.", owner: "AT–HM list" },
        assessed_need: { state: "met", note: "Her care plan records difficulty standing up from low seating.", owner: "" },
        clinical_advice: {
          state: "unknown",
          note: "The entry needs a health professional’s advice. The OT visit isn’t booked yet.",
          owner: "OT (referral sent 10 Nov)",
        },
        individual_approval: { state: "unknown", note: "No AT–HM approval is recorded.", owner: "Trilogy Care AT–HM process" },
        funding_route: { state: "met", note: "AT–HM assistive technology, not the quarterly budget.", owner: "" },
        document_detail: { state: "met", note: "One item, priced. Its size and seat height follow the OT’s advice.", owner: "" },
        price_agreement: { state: "unknown", note: "A retailer’s price isn’t an agreed price.", owner: "Coordinator, with Mrs Wong" },
        participant_contribution: { state: "unknown", note: "Her AT–HM contribution is to be confirmed from her notice.", owner: "Finance" },
        delivery_evidence: { state: "not_applicable", note: "A quote: nothing has been delivered.", owner: "" },
        source_confidence: { state: "met", note: "The list entry and the scheme rules settle the route; the advice settles the item.", owner: "" },
      },
      askWho: ["clinician"],
      sourceIds: ["src-athm-list", "src-athm-scheme", "src-tc-athm"],
      evidenceIds: ["ev-plan", "ev-approvals", "ev-shop"],
      wrong: [
        {
          decision: "ready",
          code: "listed_as_approved",
          why: "lift chairs being on the AT–HM list makes this potentially fundable, not approved for Mrs Wong. Her advice, approval, contribution and price are all still open.",
        },
        {
          decision: "out_of_scope",
          code: "furniture_excluded",
          why: "not every chair is ordinary furniture. Seating designed to help a person stand can be AT–HM, with advice and approval.",
        },
        { decision: "other_route", code: "wrong_route", why: "AT–HM is the right route for this. What’s missing is the advice and the approval." },
      ],
      consequence:
        "Approve it on the shop’s say-so and Mrs Wong may get a chair that doesn’t fit her, from the wrong account, with a contribution nobody explained. Refuse it as furniture and she loses a route to something that could keep her standing safely.",
      components: [],
      invoice: null,
    }),
    fline({
      lineId: "wq-l2",
      itemType: "Delivery and placement of the chair",
      priceContext: "athm_wraparound",
      decision: "potentially_fundable",
      alsoAccepted: ["check_advice"],
      route: "assistive_technology",
      routeAlso: [],
      axes: {
        list_scope: { state: "met", note: "Delivery can follow an approved AT–HM item, under the reviewed AT–HM rule.", owner: "" },
        assessed_need: { state: "not_applicable", note: "It follows the chair’s need.", owner: "" },
        clinical_advice: { state: "not_applicable", note: "", owner: "" },
        individual_approval: { state: "unknown", note: "It follows the chair’s approval, which isn’t in place.", owner: "Trilogy Care AT–HM process" },
        funding_route: { state: "met", note: "With the chair, through AT–HM.", owner: "" },
        document_detail: { state: "met", note: "A single delivery charge.", owner: "" },
        price_agreement: { state: "unknown", note: "Not agreed.", owner: "Coordinator, with Mrs Wong" },
        delivery_evidence: { state: "not_applicable", note: "A quote.", owner: "" },
        source_confidence: { state: "met", note: "", owner: "" },
      },
      askWho: ["supplier", "finance"],
      sourceIds: ["src-athm-scheme", "src-prices"],
      evidenceIds: ["ev-approvals"],
      wrong: [],
      consequence: "Delivery isn’t a separate decision. It stands or falls with the chair’s approval and the agreed price.",
      components: [],
      invoice: null,
    }),
    fline({
      lineId: "wq-l3",
      itemType: "Decorative cushion set",
      priceContext: "private",
      decision: "out_of_scope",
      alsoAccepted: [],
      route: "none",
      routeAlso: [],
      axes: {
        list_scope: { state: "out_of_scope", note: "A decorative household accessory, with no assessed need behind it.", owner: "AT–HM scheme" },
        assessed_need: { state: "not_applicable", note: "Nothing in her plan calls for it.", owner: "" },
        clinical_advice: { state: "not_applicable", note: "", owner: "" },
        individual_approval: { state: "not_applicable", note: "", owner: "" },
        funding_route: { state: "met", note: "Not through Support at Home: a private choice.", owner: "" },
        document_detail: { state: "met", note: "", owner: "" },
        price_agreement: { state: "not_applicable", note: "", owner: "" },
        delivery_evidence: { state: "not_applicable", note: "", owner: "" },
        source_confidence: { state: "met", note: "The scheme’s rule on household items settles it.", owner: "" },
      },
      askWho: [],
      sourceIds: ["src-athm-scheme"],
      evidenceIds: ["ev-plan"],
      wrong: [
        {
          decision: "potentially_fundable",
          code: "household_item_funded",
          why: "buying it with an AT–HM item doesn’t make a decorative cushion eligible. It’s her choice to buy it privately.",
        },
        { decision: "ready", code: "unsupported_approval", why: "nothing supports funding a decorative cushion. It’s a private choice." },
      ],
      consequence: "Fund it and her budget pays for something no assessed need supports. Say so kindly: she can still buy it herself.",
      components: [],
      invoice: null,
    }),
  ],
  asks: [
    {
      id: "ask-wq-clinician",
      who: "clinician",
      lineId: "wq-l1",
      reply:
        "The OT’s team says: “We can visit on 3 December. We’ll look at her seat height, how she stands and the room. Some riser chairs are too deep or too high for a smaller person, so please don’t order anything before then.”",
    },
    {
      id: "ask-wq-shop",
      who: "supplier",
      lineId: "wq-l1",
      reply: "The shop says: “It’s our standard size. We don’t know her measurements, but most people manage. We can hold the price for 14 days.”",
    },
    {
      id: "ask-wq-delivery",
      who: "supplier",
      lineId: "wq-l2",
      reply: "The shop says: “Delivery is $90 whatever the chair. It’s refunded if the order’s cancelled before dispatch.”",
    },
    {
      id: "ask-wq-wong",
      who: "participant",
      lineId: "wq-l1",
      reply:
        "Mrs Wong says: “I just want to stop pulling on the table to get up. I don’t mind which chair, as long as it’s safe and not too big for the lounge.”",
    },
    {
      id: "ask-wq-cushions",
      who: "participant",
      lineId: "wq-l3",
      reply: "Mrs Wong says: “Oh, the cushions were the shop’s idea. I don’t need them.”",
    },
    {
      id: "ask-wq-finance",
      who: "finance",
      lineId: "",
      reply:
        "Finance says: “AT–HM purchases go through an AT–HM request, never her quarterly budget. Her AT–HM contribution is confirmed from her notice when the request is lodged.”",
    },
  ],
  overall: "pending",
  overallAlso: [],
  model: WONG_MODEL,
  modelSourceId: "src-athm-list",
  alternative:
    "I know Friday would have been lovely, and I’m sorry it’ll take a little longer. Let’s make sure the chair is the right one for you first: the OT’s visit is the step that gets us there.",
  complaints: COMPLAINTS,
  twistDecision: "ask_detail",
  aiCoach: false,
  jobAid: JOB_AID,
  rationale: RATIONALE,
  reviewers: { policy: "", clinical: "" },
};

const wong: XRayBlockData = {
  title: "Mrs Wong’s rise chair quote",
  intro:
    "Mrs Wong wants a chair that helps her stand up safely, and a furniture shop has quoted. Inspect each line and the evidence, decide what can happen next, then explain it to her.",
  phase: "quote",
  supplier: "Riverbend Comfort Furniture (fictional)",
  docNumber: "RQ-3318",
  docDate: "2026-11-17",
  decisionDate: "2026-11-24",
  participant: { name: "Mrs Wong", about: "Lives at home, and finds it harder each month to get up from her low armchair." },
  facts: [
    "Her care plan notes difficulty standing up from a low chair, and a fall in the lounge in August.",
    "No OT or physiotherapist advice about a chair is on file yet.",
    "No AT–HM approval for a chair is recorded.",
    "Her AT–HM contribution in this case is to be confirmed from her notice. A teaching case, not a real rate.",
    "Prices are fictional and include GST.",
  ],
  rate: { category: "AT–HM (rate to be confirmed)", basisPoints: null },
  reasons: [
    { id: "wq-r-open", text: "It’s the kind of item the AT–HM list includes, but her advice, approval and price aren’t in place yet" },
    { id: "wq-r-advice", text: "Its list entry needs a health professional’s advice, and there isn’t any yet" },
    { id: "wq-r-follows", text: "An associated cost that follows the chair’s approval and price, not a decision of its own" },
    { id: "wq-r-household", text: "A household accessory with no assessed need: a private choice if she wants it" },
    { id: "wq-r-listed", text: "Chairs like this are on the AT–HM list, so it’s approved" },
    { id: "wq-r-furniture", text: "Furniture isn’t funded" },
    { id: "wq-r-budget", text: "She has funds left this quarter" },
  ],
  checks: [
    { id: "wq-e-advice", text: "An OT’s or physio’s advice on the right chair for her" },
    { id: "wq-e-approval", text: "AT–HM approval for the chair" },
    { id: "wq-e-contribution", text: "Her AT–HM contribution, from her notice" },
    { id: "wq-e-price", text: "A price agreed through the approved process" },
    { id: "wq-e-receipt", text: "A paid receipt" },
  ],
  lines: [
    line({
      id: "wq-l1",
      description: "Lift-assist recliner chair, dual motor",
      detail: "Fabric ‘Harbour Grey’, standard size",
      amountCents: 165000,
      outcome: "needs_review",
      account: "none",
      reasons: ["wq-r-advice", "wq-r-open"],
      evidence: ["wq-e-advice", "wq-e-approval"],
      feedback:
        "Being on the AT–HM list makes it potentially fundable, not approved for Mrs Wong. Its entry needs a health professional’s advice, she has no AT–HM approval, and a retailer’s price isn’t an agreed price. The next step is the OT’s advice.",
      changes:
        "With the OT’s written advice for this model, an AT–HM approval, her contribution confirmed and the price agreed, it would be ready for the approved process.",
      source: {
        rule: "AT–HM list entry: advice from a suitable health professional, an assessed need, and approval.",
        fact: "Care plan: difficulty standing; OT referral sent, visit not booked; no AT–HM approval.",
        procedure: "Don’t confirm an AT–HM purchase from a retailer’s quote.",
      },
    }),
    line({
      id: "wq-l2",
      description: "Delivery and placement",
      detail: "Room of her choice, packaging removed",
      amountCents: 9000,
      outcome: "needs_review",
      account: "none",
      reasons: ["wq-r-follows"],
      evidence: ["wq-e-approval", "wq-e-price"],
      feedback: "Delivery follows the chair. It can be part of an approved AT–HM purchase, but it isn’t approved on its own, and its price isn’t agreed.",
      changes: "Once the chair is approved and its price agreed, delivery goes with it.",
      source: { rule: "Delivery follows the AT–HM item’s approval (reviewed AT–HM rule).", fact: "No approval yet.", procedure: "" },
    }),
    line({
      id: "wq-l3",
      description: "Decorative cushion set (3)",
      detail: "Velvet, assorted colours",
      amountCents: 12000,
      outcome: "needs_review",
      account: "none",
      reasons: ["wq-r-household"],
      evidence: [],
      feedback:
        "A decorative accessory has no assessed need behind it, and buying it with an AT–HM item doesn’t change that. It’s a private choice: say so kindly, without implying her need for the chair isn’t real.",
      changes: "Nothing in this case would change it. A cushion an OT prescribed for pressure care would be a different item, and a different question.",
      source: { rule: "General household items aren’t AT–HM.", fact: "No assessed need for decorative cushions.", procedure: "" },
    }),
  ],
  next: {
    prompt: "This is a quote. What happens with it now?",
    options: [
      {
        id: "wq-n-pending",
        text: "Keep it pending: ask her OT for advice, lodge an AT–HM request once the advice is in, confirm her contribution, and agree the price before anything is ordered",
        right: true,
        critical: false,
        why: "Being on the list is where it starts. Advice, approval, contribution and an agreed price come before any purchase.",
      },
      {
        id: "wq-n-approve",
        text: "Confirm the order for Friday: lift chairs are on the AT–HM list",
        right: false,
        critical: true,
        why: "A list entry isn’t an approval for Mrs Wong, and this chair may not suit her.",
      },
      {
        id: "wq-n-quarterly",
        text: "Pay for it from her quarterly budget, since she has funds left",
        right: false,
        critical: true,
        why: "AT–HM isn’t paid from the quarterly budget for ongoing services. It has its own funding and approval.",
      },
      {
        id: "wq-n-refuse",
        text: "Tell her chairs are furniture and can’t be funded",
        right: false,
        critical: true,
        why: "Seating that helps a person stand can be AT–HM. A blanket refusal isn’t supported by the sources.",
      },
    ],
  },
  explain: {
    lineId: "wq-l1",
    ask: "Mrs Wong asks: “The shop says these chairs are covered. Can you just approve it so they can deliver on Friday?”",
    draft: {
      ack: "I can hear how much you want to get up from your chair on your own, safely.",
      rule: "Chairs that help someone stand can be funded through AT–HM, separately from your everyday services. Before anything’s bought, a health professional needs to advise on the right chair for you, and then it needs an AT–HM approval.",
      split: "There may be a contribution for AT–HM items. I’ll confirm it from your notice before you agree to anything.",
      next: "Your OT can visit on 3 December. After that I’ll lodge the request and agree the price with you before the shop delivers, and I’ll call you after the visit.",
    },
    model: Object.values(WONG_MODEL).join(" "),
    checklist: [
      { id: "wq-c-goal", label: "Acknowledges her goal: getting up safely", anyOf: ["get up", "stand", "on your own", "safely"] },
      {
        id: "wq-c-route",
        label: "Says what can be confirmed: AT–HM can fund chairs like this",
        anyOf: ["at–hm", "at-hm", "assistive technology", "can be funded", "list"],
      },
      {
        id: "wq-c-check",
        label: "Says what still needs checking: advice and approval",
        anyOf: ["your ot", "the ot", "occupational", "physio", "advice", "approval"],
      },
      { id: "wq-c-next", label: "Gives a next step and who owns it", anyOf: ["i'll", "i will", "visit", "call you", "lodge", "we'll"] },
    ],
    avoid: [
      { phrase: "it's approved", why: "Nothing is approved yet. The advice and the AT–HM approval come first." },
      { phrase: "you're covered", why: "Don’t promise funding before the advice, approval and price are in place." },
      { phrase: "furniture isn't funded", why: "Seating that helps a person stand can be AT–HM. Don’t teach a rule that isn’t true." },
      { phrase: "chairs aren't covered", why: "Seating that helps a person stand can be AT–HM." },
    ],
  },
  twist: {
    fact: "On 3 December the OT visits. This chair’s seat is too high and deep for Mrs Wong to sit back and stand up safely. The OT recommends, in writing, a smaller lift-assist model with a lower seat.",
    lineId: "wq-l1",
    outcome: "needs_review",
    account: "none",
    why: "The quoted chair doesn’t meet her assessed need. Ask the shop to quote the model the OT recommends: the AT–HM route, approval, contribution and agreed price all still apply.",
  },
  source,
  approval: unsigned,
  funding: wongFunding,
};

// ---------------------------------------------------------------------------------------------
// Invoice case: Mr Brennan's podiatry, a supplier invoice to the provider
// ---------------------------------------------------------------------------------------------

const BRENNAN_MODEL = {
  acknowledge_goal: "I know you want your feet looked after so you can keep walking to the shops, and the podiatry is helping.",
  confirmed: "Your 6 November visit matches what we agreed and is going through the approved process. Podiatry is in your plan, with no contribution from you.",
  checking:
    "The ‘foot care and pedicure package’ puts nail care, polish and travel in one line. Nail care for your foot health can be part of the podiatry; the polish is a cosmetic extra, and travel is already in the agreed price. So we’ve asked the practice to itemise it, and to correct a couple of other lines.",
  source:
    "That follows the price we agreed with you and the government’s pricing rules for Support at Home, as checked on 21 November 2026, and Trilogy Care’s invoice procedure.",
  next: "I’ve asked the practice for an itemised, corrected invoice this week, and I’ll let you know when it’s sorted. Nothing extra will be charged to you.",
  price: "Your agreed price stays at $132 a visit, with no separate fees.",
};

const brennanFunding: FundingData = {
  version: "brennan-podiatry-invoice-1",
  ruleSet: "quote-xray-rules-2026-11 (draft)",
  mode: "formative",
  documentRole: "supplier_invoice",
  goal: "“I want my feet looked after so I can keep walking to the shops.”",
  request:
    "The practice emails: “Our invoice for Mr Brennan’s November visits is attached. Please pay within 7 days. He said the polish was part of his foot care, so it’s all covered.”",
  evidence: [
    { id: "ev-goal", kind: "goal", title: "His goal, in his words", text: "“I want my feet looked after so I can keep walking to the shops.”" },
    {
      id: "ev-plan",
      kind: "plan",
      title: "Care plan excerpt (agreed 1 October 2026)",
      text: "Podiatry: thickened nails and foot pain affecting his walking. A 45-minute podiatry visit every two weeks this period. Goal: keep walking to the local shops.",
    },
    {
      id: "ev-supplier",
      kind: "agreement",
      title: "The practice’s agreement with Trilogy Care",
      text: "Podiatry visit, 45 minutes: $120, all-inclusive. No separate travel, admin or booking charges. Invoice after each visit, with the date, units and rate. Any other item needs a quote and Trilogy Care’s approval first.",
    },
    {
      id: "ev-participant",
      kind: "agreement",
      title: "Mr Brennan’s price agreement (signed 2 October 2026)",
      text: "Podiatry visit, 45 minutes: $132 (the practice’s $120 plus Trilogy Care’s 10% self-managed overhead). No other charges.",
    },
    {
      id: "ev-records",
      kind: "delivery",
      title: "Service records from the practice",
      text: "6 Nov: 9:00 to 9:45, nail and skin care, signed. 20 Nov: 9:00 to 9:45, nail care and footwear advice, signed. No record for 4 Dec: it’s booked.",
    },
    {
      id: "ev-checkin",
      kind: "history",
      title: "Check-in call note, 21 November",
      text: "Mr Brennan confirmed both November visits happened. He said the podiatrist “did the nails, and someone at the front put clear polish on, which was nice”.",
    },
  ],
  sources: [
    src({
      id: "src-service-list",
      kind: "service_list",
      title: "Support at Home service list",
      ref: "Allied health: podiatry (training extract)",
      passage:
        "Training extract, to verify: podiatry is a listed allied health service. It has to align with the participant’s assessed needs and approved services, and be agreed in the care plan.",
      url: "https://www.health.gov.au/resources/publications/support-at-home-service-list",
      version: "September 2026",
      effectiveDate: "2026-09-01",
      reviewBy: "2027-03-01",
    }),
    src({
      id: "src-faq",
      kind: "service_list",
      title: "Support at Home service list FAQs",
      ref: "Professional scope: podiatry and nail care (training extract)",
      passage:
        "Training extract, to verify the current version: a podiatrist may assess nail cutting as appropriate, within their scope, for a person’s foot health.",
      url: "https://www.health.gov.au/sites/default/files/2025-10/support-at-home-service-list-faqs.pdf",
      version: "October 2025",
      effectiveDate: "2025-10-01",
      reviewBy: "2027-03-01",
    }),
    PRICES,
    src({
      id: "src-tc-invoice",
      kind: "internal_process",
      title: "Supplier invoices procedure (placeholder Hub record)",
      ref: "Checking the agreed rate before approving an invoice (editorial example)",
      passage:
        "For each invoice line, compare the service, the date, the unit and the rate with the agreement. If every line matches, continue with approval. If a line differs, pause the approval and raise a query through the approved query process. Don’t adjust the invoice yourself.",
      url: "",
      version: "Draft 1",
      effectiveDate: "2026-11-24",
      reviewBy: "2027-02-28",
    }),
    src({
      id: "src-tc-price",
      kind: "internal_price",
      title: "Quick-Calc rule set sah-qc-2026-10 (pilot, awaiting Finance)",
      ref: "Category map: allied health is Clinical Supports",
      passage:
        "Allied health, including podiatry, is in Clinical Supports: no participant contribution. A pilot rule set awaiting Finance approval, shared with the Pocket Playbook’s Quick-Calc.",
      url: "",
      version: "sah-qc-2026-10",
      effectiveDate: "2026-10-01",
      reviewBy: "2027-04-01",
    }),
  ],
  lines: [
    fline({
      lineId: "bi-l1",
      itemType: "Podiatry visit, delivered",
      priceContext: "self_managed",
      decision: "ready",
      alsoAccepted: [],
      route: "ongoing_quarterly",
      routeAlso: [],
      axes: {
        list_scope: { state: "met", note: "Podiatry is a listed allied health service.", owner: "" },
        assessed_need: { state: "met", note: "His care plan: thickened nails and foot pain.", owner: "" },
        individual_approval: { state: "met", note: "Approved in his care plan.", owner: "" },
        funding_route: { state: "met", note: "Ongoing services, self-managed with a third-party practice.", owner: "" },
        clinical_advice: { state: "met", note: "Delivered by the podiatrist, within their scope.", owner: "" },
        document_detail: { state: "met", note: "Date, units and rate shown.", owner: "" },
        price_agreement: { state: "met", note: "Matches the supplier agreement ($120) and his agreed price ($132).", owner: "" },
        delivery_evidence: { state: "met", note: "A signed service record, and his check-in call.", owner: "" },
        participant_contribution: { state: "met", note: "Clinical Supports: no contribution.", owner: "" },
        source_confidence: { state: "met", note: "", owner: "" },
      },
      askWho: [],
      sourceIds: ["src-service-list", "src-prices", "src-tc-invoice", "src-tc-price"],
      evidenceIds: ["ev-supplier", "ev-participant", "ev-records", "ev-checkin"],
      wrong: [],
      consequence:
        "Hold a line that matches and was delivered, and a supplier waits for money it’s owed. Ready means it goes through the approved process: it’s still not a payment you make yourself.",
      components: [],
      invoice: {
        agreed: { qty: 1, unit: "45-min visit", rateCents: 12000 },
        invoiced: { qty: 1, unit: "45-min visit", rateCents: 12000 },
        serviceDate: "2026-11-06",
        evidence: "Signed service record, 9:00 to 9:45, and his check-in call.",
      },
    }),
    fline({
      lineId: "bi-l2",
      itemType: "A bundle: nail care, polish and travel",
      priceContext: "unknown",
      decision: "ask_detail",
      alsoAccepted: [],
      route: "unknown",
      routeAlso: ["ongoing_quarterly"],
      axes: {
        list_scope: { state: "unknown", note: "Part of it may be podiatry; part looks cosmetic. The line doesn’t say.", owner: "The practice" },
        assessed_need: { state: "unknown", note: "Nail care may be part of his foot-health need; polish isn’t.", owner: "The podiatrist" },
        clinical_advice: { state: "unknown", note: "No note says why the nail care was needed, or who did each part.", owner: "The podiatrist" },
        individual_approval: { state: "mismatch", note: "A package isn’t a service in his agreement.", owner: "" },
        funding_route: { state: "unknown", note: "Depends on what each part is.", owner: "" },
        document_detail: { state: "unclear", note: "One line for three different things.", owner: "The practice" },
        price_agreement: { state: "mismatch", note: "No agreed price for a package; travel is already in the visit price.", owner: "Finance (supplier query)" },
        delivery_evidence: { state: "unknown", note: "The 6 Nov record shows one 45-minute visit, not a separate package.", owner: "The practice" },
        participant_contribution: { state: "unknown", note: "Depends on what each part is.", owner: "" },
        source_confidence: { state: "met", note: "", owner: "" },
      },
      askWho: ["supplier", "clinician"],
      sourceIds: ["src-faq", "src-prices", "src-tc-invoice"],
      evidenceIds: ["ev-supplier", "ev-records", "ev-checkin"],
      wrong: [
        {
          decision: "ready",
          code: "cosmetic_bundled",
          why: "the line hides nail polish and travel inside foot care. A cosmetic extra can’t be funded inside a clinical line, and travel is already in the agreed price.",
        },
        {
          decision: "potentially_fundable",
          code: "cosmetic_bundled",
          why: "it can’t go forward as one line: the cosmetic part and travel have to come out first.",
        },
        {
          decision: "out_of_scope",
          code: "categorical_exclusion",
          why: "not all nail care is cosmetic. A podiatrist may assess nail care as part of his foot health: itemise it, don’t refuse it.",
        },
      ],
      consequence:
        "Pay it as one line and Mr Brennan’s funding pays for nail polish and travel that was already in the price. Refuse it outright and he may lose nail care that’s part of his foot health.",
      components: [
        {
          label: "Nail care (thickened nails)",
          amountCents: 6000,
          clinical: true,
          note: "Within a podiatrist’s scope when assessed for his foot health. It may already be part of the 45-minute visit.",
        },
        { label: "Nail polish", amountCents: 2000, clinical: false, note: "Cosmetic. Never funded inside a clinical line: a private choice, if he wants it." },
        { label: "Travel", amountCents: 1500, clinical: null, note: "The supplier agreement is all-inclusive: no separate travel." },
      ],
      invoice: {
        agreed: null,
        invoiced: { qty: 1, unit: "package", rateCents: 9500 },
        serviceDate: "2026-11-06",
        evidence: "The 6 Nov service record shows one 45-minute visit.",
      },
    }),
    fline({
      lineId: "bi-l3",
      itemType: "Podiatry visit, invoiced at a different length and rate",
      priceContext: "self_managed",
      decision: "ask_detail",
      alsoAccepted: [],
      route: "ongoing_quarterly",
      routeAlso: [],
      axes: {
        list_scope: { state: "met", note: "Podiatry is listed.", owner: "" },
        assessed_need: { state: "met", note: "In his care plan.", owner: "" },
        individual_approval: { state: "met", note: "Approved in his care plan.", owner: "" },
        funding_route: { state: "met", note: "Ongoing services, self-managed.", owner: "" },
        clinical_advice: { state: "met", note: "Delivered by the podiatrist.", owner: "" },
        document_detail: { state: "met", note: "Date, units and rate shown.", owner: "" },
        price_agreement: { state: "mismatch", note: "Invoiced as 1 hour at $160; agreed as a 45-minute visit at $120.", owner: "Finance (supplier query)" },
        delivery_evidence: { state: "met", note: "Delivered: the signed record shows 9:00 to 9:45.", owner: "" },
        participant_contribution: { state: "met", note: "Clinical Supports: no contribution.", owner: "" },
        source_confidence: { state: "met", note: "", owner: "" },
      },
      askWho: ["supplier"],
      sourceIds: ["src-prices", "src-tc-invoice", "src-tc-price"],
      evidenceIds: ["ev-supplier", "ev-participant", "ev-records"],
      wrong: [
        {
          decision: "ready",
          code: "unagreed_price_accepted",
          why: "a delivered invoice isn’t agreement to a new price. The visit was agreed at 45 minutes for $120, and the record shows 45 minutes.",
        },
        {
          decision: "out_of_scope",
          code: "categorical_exclusion",
          why: "the visit happened and is approved. Query the units and rate; don’t refuse the service.",
        },
      ],
      consequence:
        "Pay it as invoiced and the price changes after delivery without anyone agreeing it, so his funding pays $40 more than agreed. Adjust it yourself and you skip the query the supplier is owed.",
      components: [],
      invoice: {
        agreed: { qty: 1, unit: "45-min visit", rateCents: 12000 },
        invoiced: { qty: 1, unit: "hour", rateCents: 16000 },
        serviceDate: "2026-11-20",
        evidence: "Signed service record: 9:00 to 9:45.",
      },
    }),
    fline({
      lineId: "bi-l4",
      itemType: "A supplier’s admin and travel line",
      priceContext: "supplier_fee",
      decision: "ask_detail",
      alsoAccepted: [],
      route: "unknown",
      routeAlso: [],
      axes: {
        list_scope: { state: "not_applicable", note: "A supplier charge, not a service.", owner: "" },
        assessed_need: { state: "not_applicable", note: "", owner: "" },
        clinical_advice: { state: "not_applicable", note: "", owner: "" },
        individual_approval: { state: "not_applicable", note: "", owner: "" },
        funding_route: { state: "unknown", note: "Depends on what it’s for.", owner: "" },
        document_detail: { state: "unclear", note: "It doesn’t say what it’s for.", owner: "The practice" },
        price_agreement: {
          state: "mismatch",
          note: "The supplier agreement is all-inclusive: no separate travel or admin.",
          owner: "Finance (supplier query)",
        },
        delivery_evidence: { state: "not_applicable", note: "A charge, not a service.", owner: "" },
        source_confidence: { state: "met", note: "", owner: "" },
      },
      askWho: ["supplier", "finance"],
      sourceIds: ["src-prices", "src-tc-invoice"],
      evidenceIds: ["ev-supplier", "ev-participant"],
      wrong: [
        {
          decision: "ready",
          code: "fee_passed_to_participant",
          why: "the supplier agreement is all-inclusive, and an ordinary service never carries a separate admin or travel fee to Mr Brennan.",
        },
        {
          decision: "out_of_scope",
          code: "supplier_fee_as_participant_fee",
          why: "it’s on the supplier’s invoice to Trilogy Care, not a fee charged to Mr Brennan. Query it under the supplier agreement rather than calling it a banned participant fee.",
        },
      ],
      consequence:
        "Pass it on and Mr Brennan pays a separate fee he never agreed and the rules don’t allow. Call it a banned participant fee and you’ve misread whose document it is: it’s a question for the supplier agreement.",
      components: [],
      invoice: {
        agreed: null,
        invoiced: { qty: 1, unit: "fee", rateCents: 2500 },
        serviceDate: "2026-11-20",
        evidence: "A charge, not a service.",
      },
    }),
    fline({
      lineId: "bi-l5",
      itemType: "A booked visit, invoiced before it happened",
      priceContext: "self_managed",
      decision: "ask_detail",
      alsoAccepted: [],
      route: "ongoing_quarterly",
      routeAlso: [],
      axes: {
        list_scope: { state: "met", note: "Podiatry is listed.", owner: "" },
        assessed_need: { state: "met", note: "In his care plan.", owner: "" },
        individual_approval: { state: "met", note: "Approved in his care plan.", owner: "" },
        funding_route: { state: "met", note: "Ongoing services, self-managed.", owner: "" },
        clinical_advice: { state: "met", note: "", owner: "" },
        document_detail: { state: "met", note: "", owner: "" },
        price_agreement: { state: "met", note: "Matches the agreed visit and rate.", owner: "" },
        delivery_evidence: { state: "mismatch", note: "Dated 4 December, after the invoice: it hasn’t happened.", owner: "The practice" },
        participant_contribution: { state: "met", note: "Clinical Supports: no contribution.", owner: "" },
        source_confidence: { state: "met", note: "", owner: "" },
      },
      askWho: ["supplier"],
      sourceIds: ["src-prices", "src-tc-invoice", "src-tc-price"],
      evidenceIds: ["ev-participant", "ev-supplier", "ev-records"],
      wrong: [
        {
          decision: "ready",
          code: "no_delivery_evidence",
          why: "it’s dated 4 December, after the invoice. A booking isn’t delivery: it’s invoiced once it happens.",
        },
      ],
      consequence: "Pay it now and his funding pays for a visit that might not happen. Invoices follow delivery.",
      components: [],
      invoice: {
        agreed: { qty: 1, unit: "45-min visit", rateCents: 12000 },
        invoiced: { qty: 1, unit: "45-min visit", rateCents: 12000 },
        serviceDate: "2026-12-04",
        evidence: "A booking. No service record yet.",
      },
    }),
  ],
  asks: [
    {
      id: "ask-bi-package",
      who: "supplier",
      lineId: "bi-l2",
      reply: "The practice says: “The package is nail care, a coat of polish and our travel. We charge it to everyone who has their nails done.”",
    },
    {
      id: "ask-bi-podiatrist",
      who: "clinician",
      lineId: "bi-l2",
      reply:
        "The podiatrist says: “His nails are thickened and were catching on his socks. I reduced them during the visit, for his foot health. The polish was done at the front desk, on request.”",
    },
    {
      id: "ask-bi-brennan",
      who: "participant",
      lineId: "bi-l2",
      reply: "Mr Brennan says: “The nails were sore, that was the main thing. The polish? I didn’t ask for it, but I didn’t mind.”",
    },
    {
      id: "ask-bi-units",
      who: "supplier",
      lineId: "bi-l3",
      reply: "The practice says: “Our system defaulted to an hourly line. The visit was 45 minutes. We can reissue it.”",
    },
    {
      id: "ask-bi-fee",
      who: "supplier",
      lineId: "bi-l4",
      reply: "The practice says: “That’s our monthly admin and travel charge. We add it to every account.”",
    },
    {
      id: "ask-bi-finance",
      who: "finance",
      lineId: "bi-l4",
      reply: "Finance says: “Their agreement with us is all-inclusive. Query it with them. Nothing separate goes on Mr Brennan’s statement.”",
    },
    { id: "ask-bi-booked", who: "supplier", lineId: "bi-l5", reply: "The practice says: “We invoice the next visit in advance so it’s paid on time.”" },
  ],
  overall: "pending",
  overallAlso: [],
  model: BRENNAN_MODEL,
  modelSourceId: "src-prices",
  alternative:
    "Thanks for telling me about the polish. You haven’t done anything wrong. We just need the practice to show each part separately, so the right things are paid.",
  complaints: COMPLAINTS,
  twistDecision: "ready",
  aiCoach: false,
  jobAid: JOB_AID,
  rationale: RATIONALE,
  reviewers: { policy: "", clinical: "" },
};

const brennan: XRayBlockData = {
  title: "Mr Brennan’s podiatry invoice",
  intro:
    "A podiatry practice has invoiced Trilogy Care for Mr Brennan’s November visits. Check each line against what was agreed and delivered, decide what goes through and what needs a query, then explain it to him.",
  phase: "invoice",
  supplier: "Hillside Foot Health (fictional)",
  docNumber: "INV-20417",
  docDate: "2026-11-20",
  decisionDate: "2026-11-24",
  participant: { name: "Mr Brennan", about: "Lives alone, and self-manages his podiatry with a practice he chose." },
  facts: [
    "Approved in his care plan: podiatry for thickened nails and foot pain, a 45-minute visit every two weeks this period.",
    "He self-manages this service: Trilogy Care engages the practice and stays responsible for it.",
    "Agreed with the practice: $120 a 45-minute visit, all-inclusive, with no separate travel or admin charges.",
    "Agreed with Mr Brennan in writing: $132 a visit (the practice’s $120 plus Trilogy Care’s 10% self-managed overhead).",
    "Podiatry is allied health, in Clinical Supports: no participant contribution in this case.",
    "Prices are fictional.",
  ],
  rate: { category: "Clinical Supports (no contribution)", basisPoints: 0 },
  reasons: [
    { id: "bi-r-matches", text: "Matches the agreed service, units and rate, and there’s evidence it was delivered" },
    { id: "bi-r-bundle", text: "It bundles clinical care with a cosmetic extra and travel: it needs itemising before any rule applies" },
    { id: "bi-r-units", text: "The units or rate don’t match what was agreed, so it’s queried, not paid as invoiced" },
    { id: "bi-r-fee", text: "A separate fee the supplier agreement doesn’t include: a question for the supplier, never a fee passed to him" },
    { id: "bi-r-undelivered", text: "It hasn’t been delivered yet, so it can’t be paid" },
    { id: "bi-r-covered", text: "Podiatry is in his plan, so everything from the podiatrist is covered" },
    { id: "bi-r-nails", text: "Nail care is cosmetic, so it’s never funded" },
    { id: "bi-r-banned", text: "Admin fees are never allowed, so it’s simply refused" },
  ],
  checks: [
    { id: "bi-e-itemised", text: "An itemised breakdown of the package" },
    { id: "bi-e-note", text: "The podiatrist’s note on why the nail care was needed for his foot health" },
    { id: "bi-e-corrected", text: "A corrected line at the agreed units and rate" },
    { id: "bi-e-record", text: "The service record showing how long the visit was" },
    { id: "bi-e-fee", text: "What the fee is for, and whether the supplier agreement allows it" },
    { id: "bi-e-delivered", text: "Evidence the 4 December visit happened" },
    { id: "bi-e-abn", text: "The practice’s ABN" },
  ],
  lines: [
    line({
      id: "bi-l1",
      description: "Podiatry consultation, 45 min",
      detail: "6 Nov 2026 · 1 visit × $120.00",
      amountCents: 12000,
      outcome: "needs_review",
      account: "none",
      reasons: ["bi-r-matches"],
      evidence: [],
      feedback:
        "It matches the agreed service, units and rate, the record shows it was delivered, and it’s approved in his plan. It goes through the approved process: that still isn’t a payment you make yourself.",
      changes: "A different length, rate or date, or no record of delivery, would make it a query.",
      source: {
        rule: "Invoices follow delivery, with the right units, unit price, item and date.",
        fact: "Signed record, 9:00 to 9:45; agreed at $120.",
        procedure: "Compare each line with the agreement.",
      },
    }),
    line({
      id: "bi-l2",
      description: "Foot care and pedicure package",
      detail: "6 Nov 2026 · 1 × $95.00",
      amountCents: 9500,
      outcome: "needs_review",
      account: "none",
      reasons: ["bi-r-bundle"],
      evidence: ["bi-e-itemised", "bi-e-note"],
      feedback:
        "The word “pedicure” doesn’t settle it either way. Nail care a podiatrist assesses for his foot health can be podiatry; polish is cosmetic; travel is already in the agreed price. Itemise it before any rule applies, and keep the cosmetic part out of the funded line.",
      changes:
        "Itemised, with the podiatrist’s note for the nail care and the polish shown as a private choice, the clinical part could be checked against his agreement.",
      source: {
        rule: "A podiatrist may assess nail care within their scope for foot health; a cosmetic extra isn’t bundled into a clinical service.",
        fact: "The record shows one 45-minute visit; he mentioned the polish.",
        procedure: "Pause and query a line that differs from the agreement.",
      },
    }),
    line({
      id: "bi-l3",
      description: "Podiatry consultation, 60 min",
      detail: "20 Nov 2026 · 1 hr × $160.00",
      amountCents: 16000,
      outcome: "needs_review",
      account: "none",
      reasons: ["bi-r-units"],
      evidence: ["bi-e-corrected", "bi-e-record"],
      feedback:
        "The visit happened and is approved, but it’s invoiced as an hour at $160 against an agreed 45-minute visit at $120, and the signed record shows 45 minutes. Query it; a delivered invoice isn’t agreement to a new price.",
      changes: "Reissued as a 45-minute visit at $120, it would match and could go through.",
      source: {
        rule: "Invoices carry the agreed units and unit price.",
        fact: "Signed record: 9:00 to 9:45.",
        procedure: "Don’t adjust the invoice yourself: query it.",
      },
    }),
    line({
      id: "bi-l4",
      description: "Admin and travel fee",
      detail: "November · 1 × $25.00",
      amountCents: 2500,
      outcome: "needs_review",
      account: "none",
      reasons: ["bi-r-fee"],
      evidence: ["bi-e-fee"],
      feedback:
        "This is the supplier’s line to Trilogy Care, so first ask what it is: the supplier agreement is all-inclusive. Whatever the answer, an ordinary service never carries a separate admin or travel fee to Mr Brennan.",
      changes: "If the supplier agreement allowed it, it would be part of the supplier cost, still never a separate fee on his statement.",
      source: {
        rule: "No separate admin or travel fees to the participant for ordinary services.",
        fact: "The supplier agreement is all-inclusive.",
        procedure: "Query it with the supplier.",
      },
    }),
    line({
      id: "bi-l5",
      description: "Podiatry consultation, 45 min",
      detail: "4 Dec 2026 (booked) · 1 visit × $120.00",
      amountCents: 12000,
      outcome: "needs_review",
      account: "none",
      reasons: ["bi-r-undelivered"],
      evidence: ["bi-e-delivered"],
      feedback: "It’s dated after the invoice, so it hasn’t happened. A booking isn’t delivery: ask the practice to invoice it after the visit.",
      changes: "Invoiced after the visit, with its signed record, it would match.",
      source: { rule: "Invoices follow delivery.", fact: "No record for 4 December.", procedure: "Query it." },
    }),
  ],
  next: {
    prompt: "This is an invoice. What happens with it now?",
    options: [
      {
        id: "bi-n-hold",
        text: "Hold the invoice and query it through the approved process: itemise the package with the podiatrist’s note, correct line 3, explain the fee, and invoice 4 December after the visit. Approve nothing until then.",
        right: true,
        critical: false,
        why: "When a line differs from the agreement, approval pauses and a query goes to the supplier. You don’t adjust an invoice yourself.",
      },
      {
        id: "bi-n-approve",
        text: "Approve it: podiatry is in his plan and the practice is engaged",
        right: false,
        critical: true,
        why: "Eligible at the quote stage isn’t approved on the invoice. Each line has to match what was agreed and delivered.",
      },
      {
        id: "bi-n-fee",
        text: "Pay the practice, and add the admin and travel fee to Mr Brennan’s statement",
        right: false,
        critical: true,
        why: "An ordinary service never carries a separate admin or travel fee to the participant.",
      },
      {
        id: "bi-n-fix",
        text: "Change the amounts to the agreed rates yourself and approve it",
        right: false,
        critical: false,
        why: "Don’t adjust an invoice yourself. Query it, so the supplier corrects it and the record shows why.",
      },
    ],
  },
  explain: {
    lineId: "bi-l2",
    ask: "Mr Brennan asks: “Why hasn’t the foot place been paid? They said the polish was part of the foot care, so it’s all covered.”",
    draft: {
      ack: "I know the podiatry is helping you keep walking to the shops.",
      rule: "Nail care for your foot health can be part of your podiatry. The polish is a cosmetic extra, and travel is already in the price we agreed. The invoice puts all three in one line, so we’ve asked the practice to itemise it.",
      split: "There’s no contribution for podiatry, and your agreed price of $132 a visit stays the same, with no separate fees.",
      next: "I’ve asked the practice for a corrected invoice this week, and I’ll let you know when it’s sorted.",
    },
    model: Object.values(BRENNAN_MODEL).join(" "),
    checklist: [
      { id: "bi-c-goal", label: "Acknowledges his goal: his feet and his walking", anyOf: ["walk", "shops", "feet", "foot health"] },
      { id: "bi-c-confirm", label: "Says what’s confirmed: nail care can be part of his podiatry", anyOf: ["nail care", "podiatry", "foot health"] },
      { id: "bi-c-split", label: "Says the polish and travel are separate from it", anyOf: ["polish", "cosmetic", "travel", "itemise", "separately"] },
      {
        id: "bi-c-next",
        label: "Gives the next step and who owns it",
        anyOf: ["i've asked", "i have asked", "i'll", "i will", "corrected invoice", "let you know"],
      },
    ],
    avoid: [
      { phrase: "it's all covered", why: "Not everything on the line is: the polish is cosmetic, and travel is already in the price." },
      { phrase: "nail care isn't funded", why: "Nail care a podiatrist assesses for foot health can be part of podiatry." },
      { phrase: "we'll charge you", why: "Don’t pass a separate fee to him." },
      { phrase: "your fault", why: "He hasn’t done anything wrong." },
    ],
  },
  twist: {
    fact: "The practice reissues line 3 as a 45-minute visit on 20 November at $120, matching the signed service record.",
    lineId: "bi-l3",
    outcome: "needs_review",
    account: "none",
    why: "It now matches the agreed units and rate, and the signed record shows it was delivered: ready for the approved process.",
  },
  source,
  approval: unsigned,
  funding: brennanFunding,
};

export const XRAY_REVIEW_CASES = [
  {
    id: "wong-chair",
    name: "Mrs Wong: rise chair quote",
    teaches: "Quote review: a listed chair is potentially fundable, not approved; advice, approval, route and price come first",
    data: wong,
  },
  {
    id: "brennan-podiatry",
    name: "Mr Brennan: podiatry invoice",
    teaches: "Invoice review: a pedicure bundle, a unit and rate mismatch, a supplier’s fee and a visit invoiced before it happened",
    data: brennan,
  },
] as const;
