import { freshHiringLab } from "@/lib/hiringRunway";
import { HIRING_CASES } from "./hiringCases";
import { ONE_DAY_CASES } from "./oneDayCases";
import { GROWTH_CASES } from "./growthCases";
import { WORKLOAD_CASES } from "./workloadCases";
import { COVERAGE_CASES } from "./coverageCases";
import { REFERRAL_CASES } from "./referralCases";
import { RELIABILITY_CASES } from "./reliabilityCases";
import { CASH_BRIDGE_CASES } from "./cashBridgeCases";
import { freshCaseThread } from "@/lib/caseThread";
import { CASE_FAMILY_FRIEND, CASE_REFUSED_CHECK } from "./caseThreadCases";
import { DOT_QUARTER_END } from "./budgetLabCases";
import { DOT_KITCHEN, OKAFOR_TRANSFER, PEARCE_BEDROOM } from "./hazardScenes";
import { DOT_DISCHARGE } from "./dischargeCases";
import { DOT_GARDENER } from "./vettingCases";

/*
  Demonstration Magazine articles (docs/magazine-demos.md): one of each kind the Magazine can do beside a full course.
  They're drafts for review, created by scripts/seed-magazine-demos.ts, and each one's content is sourced:

  - a one-page field guide (Invoices that get paid first time), from the Partnering topics on pricing and invoicing;
  - expert guidance on a problem ("Could you just help me into the shower?"), from Your Services and Who Can Deliver Them;
  - a business growth simulator (Maya's next coordinator), the Hiring Runway Decision Lab with its framing;
  - brokered partner onboarding, moved from Resources and expanded from the Partnering topics into a short course;
  - the client journey map, moved from Resources into an article that explains how to read it;
  - a coordinator’s working day (Leila’s Monday), the One Day, Five Perspectives journey map with its framing;
  - a growth readiness calculator in a feature article (Can we take on the next 10 clients?), for business owners;
  - a coordinator’s week in a feature article (Where does a coordinator’s week go?), the Workload Lens with its framing;
  - local supplier coverage in a feature article (Is this suburb ready for growth?), the Local Coverage Comparison;
  - local referral relationships in a feature article (Which referrals become active clients?), the Referral Journey Calculator;
  - service reliability in a feature article (What does a missed service cost?), the Service Reliability Calculator;
  - cash timing in a feature article (Can we fund the next 90 days?), the 90-Day Cash Bridge;
  - a participant’s quarter end in a feature article (Dot at quarter end), the Quarterly Budget Decision Lab;
  - two "What Would You Do?" Community Case Threads (What would you do?), Margaret's chosen worker and Graham's refused check;
  - three Spot the Hazard rooms in a Notice article (Look before you help), Mrs Pearce, Mr Okafor and Dot;
  - a return home from hospital (Dot comes home), the 72-Hour Discharge Pivot with its framing;
  - a participant-chosen contractor (Dot's gardener), the Contractor Vetting Card with its framing.

  Anything not in those sources is flagged: "verify" (a claim to confirm, which holds publishing until resolved) or
  "illustrative" (made-up linking copy or an example).
*/

type Demo = {
  key: string;
  title: string;
  standfirst: string;
  cover: string;
  audience: string[];
  completion: "reference" | "confirm" | "decision";
  doc: { schema: 2; pages: unknown[]; tags?: { roles: string[]; goals: string[] } };
};

const page = (id: string, title: string, purpose: string, template: string, sections: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  title,
  purpose,
  template,
  kind: "content",
  required: true,
  allActivities: false,
  ...extra,
  sections,
});
// Section ids are prefixed: ids are unique across a whole guide (pages, sections and blocks).
const section = (id: string, title: string, blocks: unknown[]) => ({ id: `s-${id}`, title, blocks });
const verify = (note: string) => ({ flag: { kind: "verify", note } });
const illustrative = (note: string) => ({ flag: { kind: "illustrative", note } });
const source = (s: string, ref?: string) => ({ evidence: [{ source: s, ...(ref ? { ref } : {}) }] });

// ---------------------------------------------------------------------------------------------
// 1. A one-page field guide
// ---------------------------------------------------------------------------------------------

const invoices: Demo = {
  key: "invoices",
  title: "Invoices that get paid first time",
  standfirst: "Three rules, one worked example and a checklist: what Trilogy Care needs on every invoice, so you’re paid on the next pay run.",
  cover: "/images/hero-notes-at-table.webp",
  audience: ["partner"],
  completion: "reference",
  doc: {
    schema: 2,
    pages: [
      page("guide", "Invoices that get paid first time", "Send invoices that match the agreement and are processed on the next pay run.", "do", [
        section("when", "When you’ll use this", [
          {
            id: "when-text",
            type: "text",
            body: "Every time you invoice Trilogy Care for a client’s services. Invoice **weekly or fortnightly**, and always **within 30 days** of the service, or it may not be payable.\n\nInvoices that match the agreement and your portal price list are paid on Trilogy’s regular pay runs, usually within 7 to 10 business days. Anything that isn’t in the agreement goes on hold, and can take weeks to clear.",
            ...source("Partnering topic: Pricing and Getting Paid", "Invoice on time"),
          },
          {
            id: "when-paid",
            type: "callout",
            style: "important",
            label: "You’re paid what you invoice",
            body: "Trilogy doesn’t deduct anything from your invoice. Its fee is charged to the client’s budget, on top of your price. Client contributions are collected by Trilogy, never by you, and your invoice is paid in full either way.",
            ...source("Partnering topic: Pricing and Getting Paid", "You’re paid what you invoice; Contributions aren’t yours to collect"),
          },
        ]),
        section("rules", "Three rules for every invoice", [
          {
            id: "rules-steps",
            type: "process",
            steps: [
              {
                id: "r1",
                title: "Use the official service names",
                body: "Exactly as they appear in the Department’s Support at Home service list and Trilogy’s guide. “Housework” or “home help” can’t be matched to a client’s plan.",
              },
              {
                id: "r2",
                title: "One line per service",
                body: "Each service on its own line, with the date, how long it took and the cost. Don’t bundle three services into one line.",
              },
              {
                id: "r3",
                title: "Keep the records behind it",
                body: "Signed attendance sheets and care notes for every visit, ready if Trilogy asks to see them.",
              },
            ],
            ...source("Partnering topic: Invoicing Trilogy Care Right", "Three rules for every invoice"),
          },
        ]),
        section("example", "A worked example", [
          {
            id: "example-text",
            type: "text",
            body: "Ana’s invoice for Mrs Lowe had one line. It came back unpaid.\n\n| Sent | Resubmitted |\n| --- | --- |\n| Home help, 3 hours, $195 | Tuesday: domestic assistance (cleaning), 1 hour, $65 |\n|  | Tuesday: domestic assistance (laundry), 1 hour, $65 |\n|  | Tuesday: shopping assistance, 1 hour, $65 |\n\nThe resubmitted invoice is processed in the next cycle: each service has its own line and its official name, and Ana’s records back it up.",
            ...illustrative(
              "Ana, Mrs Lowe and the $65 rate are fictional; the service names on the right should be checked against the current service list wording.",
            ),
          },
          {
            id: "example-decision",
            type: "decision",
            prompt: "Ben wrote “Housework” for a cleaning visit, because that’s what Mrs Lowe calls it. What should the invoice say?",
            choices: [
              {
                id: "d1",
                text: "The official service name from the Support at Home service list",
                verdict: "best",
                feedback: "Right. Trilogy matches each line to a service in the client’s plan, so it needs the official name.",
              },
              {
                id: "d2",
                text: "“Housework”, since that’s what the client agreed to",
                verdict: "risky",
                feedback: "Trilogy can’t match “Housework” to a service in Mrs Lowe’s plan. The invoice is held while Ana’s contacted, and payment is delayed.",
              },
              {
                id: "d3",
                text: "“Housework (cleaning)”, so both are there",
                verdict: "acceptable",
                feedback: "Closer, but use the official name on its own. Extra words can still stop a match.",
              },
            ],
            ...source("Partnering topic: Invoicing Trilogy Care Right", "Naming the service"),
          },
        ]),
        section("travel", "Travel, or transport?", [
          {
            id: "travel-callout",
            type: "callout",
            style: "tip",
            label: "One question decides it: is the client in the car?",
            body: "**Your travel, client not in the car:** built into your hourly rates, never billed separately.\n\n**Client transport, client in the car:** its own service, billed per trip by distance band, never per kilometre.",
            ...source("Partnering topic: Pricing and Getting Paid", "Is the client in the car?"),
          },
        ]),
        section("check", "Before you send it", [
          {
            id: "check-list",
            type: "checklist",
            title: "Before you send an invoice",
            items: [
              "Every service is in the client’s agreement",
              "Each service has its own line, with its official service name",
              "Each line has the date, how long it took and the cost",
              "Rates are no higher than your agreed portal price list",
              "It’s within 30 days of the service",
              "Signed attendance sheets and care notes are on file",
            ],
            ...source("Partnering topics: Pricing and Getting Paid; Invoicing Trilogy Care Right"),
          },
        ]),
      ]),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 2. Expert guidance on a problem
// ---------------------------------------------------------------------------------------------

const outsideService: Demo = {
  key: "outside-service",
  title: "“Could you just help me into the shower?”",
  standfirst:
    "When a client asks your worker for help that isn’t their service, the answer is no to the task, not to the person. Here’s what to say, and what to do next.",
  cover: "/images/cleaner.jpg",
  audience: ["partner"],
  completion: "reference",
  doc: {
    schema: 2,
    pages: [
      page(
        "guide",
        "When a client asks for help outside the service",
        "Respond kindly to a request outside the worker’s service, and get the client the right help.",
        "decide",
        [
          section("problem", "The problem", [
            {
              id: "problem-text",
              type: "text",
              heading: "A kind request, the wrong person",
              body: "Ben works in Ana’s business, doing cleaning and laundry for Trilogy clients. On his third visit, Mrs Kowalski asks if he could just help her into the shower while he’s there. She seems a bit unsteady. It would take five minutes.\n\nIt feels unkind to say no. But Ben doesn’t have a Certificate III, and showering isn’t in her plan.",
              ...source("Partnering topic: Your Services and Who Can Deliver Them", "Could you just help me into the shower?"),
            },
            {
              id: "problem-answer",
              type: "callout",
              style: "important",
              label: "The short answer",
              body: "**Say no to the task, not to the person.** Explain it isn’t the service you’re there for, make sure she’s safe right now, and tell Trilogy Care she may need personal care, so her needs can be looked at.",
              ...source("Partnering topic: Your Services and Who Can Deliver Them", "Helpful, within his service"),
            },
          ]),
          section("why", "Why it matters", [
            {
              id: "why-text",
              type: "text",
              body: "Some services are only safe in qualified hands. If your worker isn’t qualified, it isn’t theirs to do, however simple it seems at the time.\n\n- **Personal care** (bathing, dressing, toileting, moving safely): Trilogy usually needs a Certificate III in Aged Care, or similar.\n- **Medication:** support people to take their own. Only a qualified nurse gives it, and only if it’s approved. Even popping tablets out of the packet counts as giving medication.\n- **Nursing, allied health and therapies:** the right qualifications and registration, and only if it’s in the care plan.\n\nIf Ben helps and she slips, he wasn’t trained to support her safely, and the service wasn’t in her plan.",
              ...source("Partnering topic: Your Services and Who Can Deliver Them", "Some services need qualifications"),
            },
          ]),
          section("views", "Three views on it", [
            {
              id: "views",
              type: "perspectives",
              prompt: "How would you handle Mrs Kowalski’s request? Open each view to see how others think about it.",
              views: [
                {
                  id: "v-worker",
                  title: "A support worker",
                  reasoning:
                    "Saying no feels awful when someone’s struggling. What helps is having words ready, and knowing that telling the office isn’t dobbing her in: it’s how she gets the help she actually needs.",
                  misses: "Can underestimate how quickly a five-minute favour becomes an expected part of every visit.",
                },
                {
                  id: "v-owner",
                  title: "A partner business owner",
                  reasoning:
                    "My workers are covered for the services in the agreement. A worker doing personal care without the qualification puts the client, the worker and my business at risk. I brief every new worker on this before their first visit.",
                  misses: "Can focus on risk and forget to close the loop: someone still has to make sure the client’s need is raised.",
                },
                {
                  id: "v-carepartner",
                  title: "A Trilogy Care Partner",
                  reasoning:
                    "A request like this is useful information. It tells me her needs may have changed. When a partner lets us know, we can review her care, and a qualified worker can help her shower.",
                  misses: "Only knows if someone tells them. Without the partner’s report, the need stays invisible.",
                },
              ],
              guidance: {
                body: "Know which service you’re there to deliver. Don’t do tasks that need a qualification you don’t have. Tell Trilogy about the client’s needs, so they can be reviewed.",
                source: { label: "Your Services and Who Can Deliver Them (Partnering with Trilogy Care)" },
              },
              ...illustrative("The three views are written for this article from the topic’s guidance; they aren’t quotes from real people."),
            },
          ]),
          section("say", "What to say", [
            {
              id: "say-tabs",
              type: "tabs",
              tabs: [
                {
                  id: "t-client",
                  label: "To the client",
                  body: "“I’m sorry, I’m not able to help with showering. It needs someone trained for it, and I don’t want you to get hurt. Are you safe for now? I’ll let Trilogy know today that you’d like some help with it.”",
                },
                {
                  id: "t-worker",
                  label: "To your worker",
                  body: "Before their first visit: which services they’re there for, what they mustn’t do without a qualification (personal care, medication), and how to tell you the same day when a client asks for more.",
                },
                {
                  id: "t-trilogy",
                  label: "To Trilogy Care",
                  body: "What the client asked for, when, and anything you noticed (unsteady on her feet, struggling with her tablets). Tell Trilogy and the client’s Care Partner straight away about any change in the client’s condition.",
                },
              ],
              ...illustrative("Suggested wording, written for this article. The reporting duty is from the Partnering topic Before Your First Service."),
            },
            {
              id: "say-decision",
              type: "decision",
              prompt: "On a later visit, Mrs Kowalski asks Ben to pop her lunchtime tablets out of the packet and hand them to her. What does Ben do?",
              choices: [
                {
                  id: "m1",
                  text: "Explain he can’t handle her medication, and tell Trilogy she’s finding it hard",
                  verdict: "best",
                  feedback: "Right. That’s what happened: a nurse set up a pack that makes her tablets easier to manage.",
                },
                {
                  id: "m2",
                  text: "Leave them, and remind her to take her tablets before he heads off",
                  verdict: "acceptable",
                  feedback: "A reminder may be fine, but if she’s struggling to manage her tablets, Trilogy needs to know.",
                },
                {
                  id: "m3",
                  text: "Pop the tablets out for her, since she knows exactly which ones to take",
                  verdict: "risky",
                  feedback: "Even popping tablets out counts as giving medication. That needs a qualified nurse, and approval in her plan.",
                },
              ],
              ...source("Partnering topic: Your Services and Who Can Deliver Them", "The tablets on the bench"),
            },
          ]),
          section("now", "If someone is hurt", [
            {
              id: "now-callout",
              type: "callout",
              style: "important",
              label: "Act first, then report",
              body: "If someone is hurt or in immediate danger, call 000. Then tell Trilogy Care, and report the incident. As a partner you report incidents and help with any investigation.",
              ...source("Partnering topic: Before Your First Service", "What you sign up to"),
              ...verify(
                "Confirm the partner incident route to name here (the Incident Submission Form or a phone number), and the timeframe partners must meet.",
              ),
            },
            {
              id: "now-brief",
              type: "checklist",
              title: "Brief every worker before their first visit",
              items: [
                "Which services they’re there to deliver for this client",
                "No personal care without a Certificate III, or similar",
                "No handling medication: support the client to take their own",
                "Tell you the same day when a client asks for more, or seems to be struggling",
                "If someone is hurt: call 000, then tell you straight away",
              ],
              ...illustrative("A suggested briefing list built from the topic’s guidance."),
            },
            {
              id: "now-action",
              type: "action",
              prompt: "One thing to do this week",
              suggestions: [
                { id: "a1", text: "Run the five-minute briefing with your newest worker" },
                { id: "a2", text: "Agree how your workers tell you when a client asks for more" },
                { id: "a3", text: "Check each worker’s qualifications match the services they deliver" },
              ],
            },
          ]),
        ],
      ),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 3. A business growth simulator
// ---------------------------------------------------------------------------------------------

const maya: Demo = {
  key: "hiring",
  title: "Maya’s next coordinator: when to hire",
  standfirst:
    "A growing caseload, one coordinator and a tight cash position. Explore the options in a fictional business, commit a plan, then see what changes.",
  cover: "/images/hero-thinking-laptop.webp",
  audience: ["partner"],
  // Read and confirm: "decision activity" counts decision questions, and the lab is its own activity.
  completion: "confirm",
  doc: {
    schema: 2,
    pages: [
      page("lab", "Maya’s next coordinator", "Compare workload, operating result and cash before committing to a recruitment plan.", "decide", [
        section("why", "Growth has a timing problem", [
          {
            id: "why-text",
            type: "text",
            heading: "More clients isn’t always more room",
            body: "A growing partner business hits the same squeeze: work arrives before the person to do it, and a new coordinator is paid from the day they join, months before their caseload and your receipts catch up.\n\nIn this lab you work through one fictional business. You’ll see why the answer depends on **hours, not head count**, why **cash and margin** can point in different directions, and why a good plan has a date to look again.",
            ...illustrative("Framing copy for the lab, written for this article."),
          },
          {
            id: "why-callout",
            type: "callout",
            style: "important",
            label: "Practice, with invented figures",
            body: "Maya, her agreement and every number in the lab are fictional. They aren’t Trilogy Care pricing, staffing norms or a recommendation. Her income comes from her own (fictional) agreement, never from a share of public care-management funding.",
          },
        ]),
        section("lab", "The decision lab", [{ id: "maya-lab", type: "hiring", ...freshHiringLab(HIRING_CASES[0].data, "demo1") }]),
        section("after", "Take it back to your business", [
          {
            id: "after-journal",
            type: "journal",
            prompt: "If you ran these numbers for your own business, which figure would you be least sure of, and how would you check it?",
            scaffold: "The figure I’d check first is… because… I’d check it by…",
          },
          {
            id: "after-action",
            type: "action",
            prompt: "One step before your next hiring decision",
            suggestions: [
              { id: "h1", text: "Keep a two-week time diary by work band" },
              { id: "h2", text: "Check when your income actually arrives after each month’s services" },
              { id: "h3", text: "Set a date to revisit your caseload forecast" },
            ],
          },
        ]),
      ]),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 4. Brokered partner onboarding: moved from Resources and expanded
// ---------------------------------------------------------------------------------------------

const brokered: Demo = {
  key: "brokered",
  title: "Your first steps as a brokered partner",
  standfirst: "How the brokered model works, who you’ll work with, and everything between your first referral and getting paid for your first service.",
  cover: "/images/team.jpeg",
  audience: ["partner"],
  completion: "confirm",
  doc: {
    schema: 2,
    pages: [
      page("model", "How the brokered model works", "Explain who does what in the brokered model, and what stays with Trilogy Care.", "adapt", [
        section("intro", "One referral code to start", [
          {
            id: "intro-text",
            type: "text",
            body: "As a brokered partner, your business **coordinates and delivers** the client’s services. Trilogy Care stays the registered provider: it onboards the client, manages their funding and care plan, and checks that everything is in order.\n\nFrom referral to your first service, onboarding takes five steps. Trilogy handles the call, the client’s onboarding and the care plan. You make the referral, sign a contractor agreement with the client, and deliver the care. All you need to start is one referral code.",
            ...source("Resources: Your first steps as a brokered partner"),
          },
        ]),
        section("who", "Who does what", [
          {
            id: "who-diagram",
            type: "hubvisual",
            visual: "onboarding-brokered",
            caption: "The brokered model: you coordinate and deliver; the Care Partner sets the client’s goals, plan and budget; Compliance audits.",
          },
          {
            id: "who-roles",
            type: "accordion",
            heading: "The people you’ll work with",
            items: [
              {
                id: "pm",
                title: "Your Trilogy Partnership Manager",
                body: "Onboards and supports your business, and brings in Compliance to audit. Start here for anything about the partnership: your agreement, the Partner Hub, and marketing approvals.",
              },
              {
                id: "cp",
                title: "The client’s Trilogy Care Partner",
                body: "The client’s case manager at Trilogy Care: their goals, care plan, budget and upgrades. You work together on the client’s care, and tell them straight away about any change in the client’s condition.",
              },
              {
                id: "comp",
                title: "Trilogy Care Compliance",
                body: "Audits partners, including your workers’ checks and qualifications, your insurances and your service records.",
              },
              {
                id: "client",
                title: "The client",
                body: "Sets their goals, plan and budget with the Care Partner, and signs a third party contractor agreement with your business for each service you deliver.",
              },
            ],
            ...source("Resources: brokered onboarding diagram; Partnering topic: Before Your First Service"),
            ...verify("Confirm what Compliance audits for brokered partners, and how often."),
          },
          {
            id: "who-models",
            type: "callout",
            style: "tip",
            label: "Self Managed or Fully Coordinated",
            body: "During onboarding the client chooses how they want to manage their care. Most partner clients choose Self Managed. Either way, Trilogy provides care management, clinical support, funding administration and compliance checks.",
            ...source("Partnering topic: Referring a Client to Trilogy Care", "Self Managed or Fully Coordinated"),
          },
        ]),
      ]),
      page("first-service", "From referral to your first service", "Take a client from referral to a first service with nothing on hold.", "do", [
        section("steps", "The five steps", [
          {
            id: "steps-process",
            type: "process",
            steps: [
              {
                id: "s1",
                title: "You submit the referral",
                body: "With the client’s referral code and their consent to be contacted. A complete form means a faster first call.",
              },
              {
                id: "s2",
                title: "Trilogy onboards the client, by phone",
                body: "Usually within 24 business hours. The call comes from a Queensland 07 number, so tell families to expect it, and to answer.",
              },
              {
                id: "s3",
                title: "You and the client sign a contractor agreement",
                body: "A third party contractor agreement for each service, before it starts.",
              },
              { id: "s4", title: "The client’s care plan and budget are shared with you", body: "So you know what’s approved, and what each service is for." },
              {
                id: "s5",
                title: "Services start",
                body: "Only once the client is fully onboarded. Starting early risks care that isn’t in their plan, and invoices that can’t be paid.",
              },
            ],
            ...source("Partnering topics: Referring a Client to Trilogy Care; Before Your First Service", "After you submit it; Referral to first visit"),
          },
          {
            id: "steps-form",
            type: "checklist",
            title: "What goes on the referral form",
            items: [
              "The client’s details, and their referral code",
              "Whether they’re switching providers, or newly assigned funding",
              "Self Managed or Fully Coordinated, if they know",
              "Language needs, and an alternative contact",
              "Your business details, and the client’s consent to be contacted",
            ],
            ...source("Partnering topic: Referring a Client to Trilogy Care", "What goes on the referral form"),
          },
          {
            id: "steps-switch",
            type: "callout",
            style: "tip",
            label: "Switching from another provider",
            body: "Help them do it in this order, so there’s no gap in their care: tell their current provider and give about two weeks’ notice; reactivate their referral code with My Aged Care (online, or on 1800 200 422); then give Trilogy Care the referral code and start onboarding.",
            ...source("Partnering topic: Referring a Client to Trilogy Care", "Switching, in three steps"),
          },
        ]),
        section("agreement", "The contractor agreement", [
          {
            id: "agreement-text",
            type: "text",
            body: "The agreement is between **your business and the client**. Their representative is the person authorised to deal with Trilogy for them. Trilogy isn’t a party, but pays you from the client’s funding. You need one for every service before it starts. It covers:\n\n- the services, and how long and how often;\n- where they’re delivered;\n- your fees, and any travel or client transport;\n- your workers’ qualifications.",
            ...source("Partnering topic: Before Your First Service", "The third party contractor agreement"),
          },
          {
            id: "agreement-decision",
            type: "decision",
            prompt:
              "Mrs Novak has finished onboarding and is keen to start. Her daughter asks if your worker can come Monday. The contractor agreement isn’t signed yet. What do you say?",
            choices: [
              {
                id: "c1",
                text: "“Let’s get the agreement signed first. I’ll send it today, and we can start as soon as it’s back.”",
                verdict: "best",
                feedback: "Signed, then started. They read it over the weekend, your worker starts Monday, and the first invoice goes straight through.",
              },
              {
                id: "c2",
                text: "“Yes, we’ll start Monday and sort the paperwork that week.”",
                verdict: "risky",
                feedback: "The visit goes ahead with no agreement behind it. The invoice goes on hold, and Mrs Novak isn’t sure what she agreed to pay.",
              },
            ],
            ...source("Partnering topic: Before Your First Service", "“Can we start Monday?”"),
          },
          {
            id: "agreement-qual",
            type: "tabs",
            tabs: [
              { id: "q1", label: "Everyone", body: "Worker screening or a police check." },
              { id: "q2", label: "Personal care", body: "A Certificate III, or similar." },
              { id: "q3", label: "Medication", body: "Help with medication needs a separate medication certificate." },
              { id: "q4", label: "No Certificate III", body: "Cleaning or social support, but not personal care." },
            ],
            ...source("Partnering topic: Before Your First Service", "The right person for the service"),
          },
        ]),
      ]),
      page("paid", "Getting paid and staying audit-ready", "Invoice so you’re paid in full and on time, and keep what an audit will ask for.", "do", [
        section("paid", "Getting paid", [
          {
            id: "paid-text",
            type: "text",
            body: "You’re paid what you invoice: Trilogy doesn’t deduct anything. Its fee is charged to the client’s budget, on top of your price, so when you talk price with a client, remember the total cost to their budget includes it.\n\nClient contributions are collected by Trilogy, **never by you**. Your invoice is paid in full either way, so never ask a client to pay you directly for a funded service.\n\nInvoices that match the agreement and your portal price list are paid on Trilogy’s regular pay runs, usually within 7 to 10 business days.",
            ...source("Partnering topic: Pricing and Getting Paid"),
          },
          {
            id: "paid-link",
            type: "callout",
            style: "tip",
            label: "Get the invoice right",
            body: "Official service names, one line per service, and the records behind it. The one-page guide has a worked example and a checklist.",
            link: { href: "/magazine", label: "Invoices that get paid first time" },
            ...illustrative("Links to the demonstration one-page guide; update the link once it’s published."),
          },
        ]),
        section("compliance", "What you sign up to", [
          {
            id: "compliance-list",
            type: "checklist",
            title: "As a partner, you deliver care under the Aged Care Act, just as Trilogy does",
            items: [
              "Public liability, professional indemnity and workers’ compensation insurance",
              "A register of your workers’ qualifications and checks",
              "Records of every service, kept for seven years",
              "Tell Trilogy and the Care Partner straight away about any change in the client’s condition",
              "Report incidents, and help with any investigation",
            ],
            ...source("Partnering topic: Before Your First Service", "What you sign up to"),
          },
          {
            id: "compliance-meals",
            type: "callout",
            style: "example",
            label: "If you provide meals",
            body: "Meal delivery businesses must be registered with Trilogy Care. Meal preparation happens in the client’s home. The cost of groceries and ingredients isn’t funded, so it can’t go on your invoice.",
            ...source("Partnering topic: Before Your First Service", "If you provide meals"),
          },
          {
            id: "compliance-marketing",
            type: "callout",
            style: "important",
            label: "Check before you publish",
            body: "Anything that mentions Trilogy Care, on your website, social media or printed material, needs Trilogy’s marketing team to see it first. That includes Trilogy’s logo, its name and its services. Start with your Partnership Manager.",
            ...source("Partnering topic: Marketing Your Partnership", "Check before you publish"),
          },
        ]),
        section("first90", "Your first 90 days", [
          {
            id: "first90-timeline",
            type: "timeline",
            events: [
              {
                id: "e1",
                when: "First 30 days",
                title: "Set up",
                body: "Onboarding with your Partnership Manager, your workers’ checks and qualifications registered, and your first referral.",
              },
              {
                id: "e2",
                when: "By 60 days",
                title: "First services",
                body: "Your first clients onboarded, agreements signed and services running, with invoices paid first time.",
              },
              { id: "e3", when: "By 90 days", title: "Review", body: "A check-in with your Partnership Manager: what’s working, and what to change." },
            ],
            ...verify(
              "The P1 onboarding names a 30/60/90-day plan owned by the Partnership Manager. Confirm it applies to brokered partners, and what each milestone actually is.",
            ),
          },
          {
            id: "first90-confidence",
            type: "pulse",
            question: "How ready do you feel to take your first brokered referral?",
            kind: "confidence",
            options: [
              { id: "p1", label: "Not confident" },
              { id: "p2", label: "Unsure" },
              { id: "p3", label: "Somewhat confident" },
              { id: "p4", label: "Confident" },
            ],
          },
        ]),
      ]),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 5. The client journey map, with an explainer
// ---------------------------------------------------------------------------------------------

const journey: Demo = {
  key: "journey",
  title: "The client journey, from enquiry to exit",
  standfirst: "Ten stages, four phases and the waits in between: how to read the Trilogy Care client journey map, and what it means for the clients you refer.",
  cover: "/images/journey-before-it-starts.webp",
  audience: [],
  completion: "reference",
  doc: {
    schema: 2,
    pages: [
      page("map", "The client journey, from enquiry to exit", "Read the client journey map, and use it to set clients’ and families’ expectations.", "notice", [
        section("why", "Why a journey map", [
          {
            id: "why-text",
            type: "text",
            body: "A client meets Trilogy Care many times before services start: a first call, a questionnaire, a welcome meeting, a care plan, a handover. Each person they meet sees one part. The journey map puts the whole thing on one page, from the first enquiry to the day they leave, so everyone can see what comes next, and where it feels hard.",
            ...source("Client Journey Map (v5)"),
          },
        ]),
        section("read", "How to read it", [
          {
            id: "read-text",
            type: "text",
            body: "- **Four phases:** Getting started (stages 1 to 3), Setting up care (4 to 6), Living with care (7 to 9) and Leaving (10).\n- **Ten stages**, each with who leads it, the touchpoint, what the client does, what Trilogy Care does, how it feels, and the pain points.\n- **The moments in between**, often waits: the welcome pack arriving, waiting on the GP, waiting for the care plan, finding the right providers.\n- **The feeling curve** across the top: how each stage tends to feel, from curious at enquiry to settled once care is under way.\n- **Two side roads** where a client’s path can differ: Fully Coordinated, and Self-Managed Plus.",
            ...source("content/journey.ts (Client Journey Map v5): phases, stages, between, forks"),
          },
          {
            id: "read-suggested",
            type: "callout",
            style: "important",
            label: "Parts of the map are still suggestions",
            body: "The map comes from the Client Journey Map (v5) deck. The moments in between stages, the feeling scores and the phase names, and some of the detail in each stage, are suggestions still awaiting validation. Use the map to start a conversation, not as a promise of timeframes.",
            ...source("content/journey.ts header note"),
          },
        ]),
        section("map", "The map", [
          {
            id: "map-visual",
            type: "hubvisual",
            visual: "client-journey",
            caption: "Choose a stage on the feeling curve to jump to it on the road. Full screen and Print are on the road’s toolbar.",
          },
        ]),
        section("meaning", "What it means for the clients you refer", [
          {
            id: "meaning-phases",
            type: "accordion",
            heading: "Phase by phase",
            items: [
              {
                id: "ph1",
                title: "Getting started: enquiry, questionnaire and welcome meeting",
                body: "Fees and co-contributions are hard to understand on a first call. Tell families to expect the call from Trilogy, and that the welcome pack and questionnaire follow. A GP appointment for the health summary often sets the pace.",
              },
              {
                id: "ph2",
                title: "Setting up care: care plan, handover and services starting",
                body: "This is where waiting is hardest: the plan, budget and consents are written up and signed, and much happens behind the scenes. For your clients, services start only once they’re fully onboarded and your agreement is signed.",
              },
              {
                id: "ph3",
                title: "Living with care: ongoing care, review and feedback",
                body: "Routines settle and the first statement arrives to review. Needs change, and a concern or a compliment can come up at any stage. Tell the Care Partner straight away about any change you notice.",
              },
              {
                id: "ph4",
                title: "Leaving",
                body: "A move into residential care, a change of provider, or the end of life. Feelings are mixed. Clear, kind communication matters most here.",
              },
            ],
            ...source("Client Journey Map (v5) and Partnering topics"),
            ...illustrative("The partner guidance in each phase is written for this article; check it with Partnerships before publishing."),
          },
          {
            id: "meaning-pulse",
            type: "pulse",
            question: "Where do the clients you refer most often get stuck?",
            kind: "view",
            options: [
              { id: "v1", label: "Getting started" },
              { id: "v2", label: "Setting up care" },
              { id: "v3", label: "Living with care" },
            ],
          },
          {
            id: "meaning-action",
            type: "action",
            prompt: "One thing to try with your next referral",
            suggestions: [
              { id: "j1", text: "Walk the family through the four phases before their first call" },
              { id: "j2", text: "Tell them which waits to expect, and who to ask during each one" },
              { id: "j3", text: "Check in with the client once their care plan is set up" },
            ],
          },
        ]),
      ]),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 6. One Day, Five Perspectives: a coordinator's working day as a journey-map simulation
// ---------------------------------------------------------------------------------------------

const oneDay: Demo = {
  key: "one-day",
  title: "Leila’s Monday: one day, five perspectives",
  standfirst:
    "Three clients, a Care Partner principal, suppliers and Trilogy Care teams, each seeing part of the picture. Make Leila’s calls, step into the others’ shoes, and end the day with an honest status for everyone.",
  cover: "/images/journey-care-plan.webp",
  audience: [],
  // Read and confirm: the map is its own activity, with its own debrief.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for coordinators, the principals they work with and Trilogy Care teams.
    tags: { roles: ["coordinator", "owner", "staff"], goals: ["clients", "quality"] },
    pages: [
      page("day", "Leila’s Monday", "Keep several clients’ stories, promises and handoffs straight across a working day.", "decide", [
        section("why", "A day is several stories at once", [
          {
            id: "why-text",
            type: "text",
            heading: "Nobody has the whole picture",
            body: "A coordinator’s day isn’t one decision. It’s several unfinished stories at once: a cancelled clean, a worried daughter, a confusing invoice. Each person in them sees a different piece. The client knows what matters to them. The supplier knows their roster. Billing knows the agreed rate. The principal knows where the team is stretched.\n\nIn this simulation you’re **Leila**, a coordinator, for one Monday. You can briefly **play as** someone else to see their side, but what you learn there isn’t something Leila knows until she asks, or someone tells her. The aim isn’t to fix everything by five o’clock. It’s to keep your promises, hand work to the right owner with the right question, and end the day with an honest status for each person.",
            ...illustrative("Framing copy for the journey map, written for this article from the One Day, Five Perspectives brief."),
          },
          {
            id: "why-how",
            type: "text",
            heading: "How to play",
            body: "- Work through the day in order. Nothing moves on until you decide, and there’s no clock.\n- Choose **Play as…** on an event to see it from another person’s side. Then decide what Leila needs to ask.\n- Keep an eye on the **commitments rail**: who promised what, to whom, and by when.\n- At 4:30, give each client an honest status. One can stay open, as long as it has an owner.\n- You can go back to any event and decide again.",
          },
          {
            id: "why-callout",
            type: "callout",
            style: "important",
            label: "A fictional day",
            body: "Leila, the clients, the suppliers and every decision are made up for practice. Nothing here books a service, approves a worker, changes a care plan, authorises an invoice or reports an incident. The times are an illustration, not Trilogy Care turnaround times.",
          },
        ]),
        section("map", "The day", [{ id: "leila-day", type: "onedaymap", ...structuredClone(ONE_DAY_CASES[0].data) }]),
        section("after", "Take it into your week", [
          {
            id: "after-handoff",
            type: "checklist",
            title: "A handoff that will come back",
            items: [
              "The question you need answered, in one sentence",
              "What you already know, and how you know it",
              "Who owns the next step, by name or team",
              "When you’ll check for the answer",
              "What you’ve told the person in the meantime",
            ],
            ...illustrative("Drawn from the simulation’s handoff rubric; check it against the current Trilogy Care handoff process."),
          },
          {
            id: "after-journal",
            type: "journal",
            prompt: "Think of a handoff you made last week. Did it name the question, the owner and when the answer would come back? What happened next?",
            scaffold: "The handoff was… It named… / It didn’t name… Next time I’ll…",
          },
          {
            id: "after-action",
            type: "action",
            prompt: "One habit to try this week",
            suggestions: [
              { id: "d1", text: "Ask the person what matters before accepting someone else’s solution" },
              { id: "d2", text: "Put an owner and a check-back date on every handoff" },
              { id: "d3", text: "End each day with a status for every open client thread" },
            ],
          },
        ]),
      ]),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 7. Can we take on the next 10 clients? A growth readiness calculator in a feature article
// ---------------------------------------------------------------------------------------------

const nextTen: Demo = {
  key: "next-10",
  title: "Can we take on the next 10 clients?",
  standfirst:
    "Ten names on next month’s referral list. Find the week and the service that decide how many you can honestly confirm, try a change, then decide what to tell people.",
  cover: "/images/hero-notes-at-table.webp",
  audience: ["partner"],
  // Read and confirm: the calculator is its own activity, with its own debrief.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for business owners and managers, about growing the business and keeping quality.
    tags: { roles: ["owner"], goals: ["grow", "quality"] },
    pages: [
      page(
        "next-10",
        "Can we take on the next 10 clients?",
        "Test planned starts against week-level coordinator hours and confirmed service coverage before promising dates.",
        "decide",
        [
          section("why", "A client count isn’t a plan", [
            {
              id: "why-text",
              type: "text",
              heading: "Ten names, one month",
              body: "Growth usually arrives as a list: ten names, ten families hoping for a start date. The trouble is that a list hides two things. Setup work clusters in the same week, often the week someone is on leave. And a start that needs an early-morning carer isn’t a start until someone has confirmed they’ll be there.\n\nIn this article you work through one fictional business, **Priya’s**, as she decides what she can honestly promise for February. First you’ll predict. Then the calculator shows you the month **week by week**, and which services have **confirmed** cover. You’ll try a change, choose what to do, and see what happens when she tells people.",
              ...illustrative("Framing copy for the calculator, written for this article from the growth readiness brief."),
            },
            {
              id: "why-callout",
              type: "callout",
              style: "important",
              label: "A planning signal, not a decision",
              body: "The calculator never accepts, refuses or moves a client, and it never ranks people by revenue, funding or how easy they are. If someone has an immediate safety or clinical need, use Trilogy Care’s current escalation and continuity process, not a forecast.",
            },
          ]),
          section("calc", "Priya’s February", [{ id: "next-10-calc", type: "intake", ...structuredClone(GROWTH_CASES[0].data) }]),
          section("after", "Use it on your own month", [
            {
              id: "after-checklist",
              type: "checklist",
              title: "Before you promise a start date",
              items: [
                "The participant’s agreement and plan are in place, or you’ve said they aren’t yet",
                "The start week has the coordinator hours for setup, after leave and your reserve",
                "Each service has a confirmed, current worker for the right area and time of day",
                "Anything unconfirmed has an owner and a date to hear back",
                "You’ve told the person what’s confirmed and what isn’t",
              ],
              ...illustrative("Drawn from the calculator’s rules; check it against the current Trilogy Care onboarding process."),
            },
            {
              id: "after-journal",
              type: "journal",
              prompt: "Think about your next month. Which week would be tightest, and which service would you least want to promise without checking?",
              scaffold: "The tightest week is… because… The service I’d check first is…",
            },
            {
              id: "after-action",
              type: "action",
              prompt: "One habit to try before your next start date",
              suggestions: [
                { id: "n1", text: "Map next month’s starts by week, not just by count" },
                { id: "n2", text: "Re-verify any supplier slot older than a month before counting it" },
                { id: "n3", text: "Tell each family what’s confirmed and when you’ll call back" },
              ],
            },
          ]),
        ],
      ),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 8. Where does a coordinator’s week go? The Workload Lens in a feature article
// ---------------------------------------------------------------------------------------------

const coordinatorWeek: Demo = {
  key: "coordinator-week",
  title: "Where does a coordinator’s week go?",
  standfirst:
    "A full calendar, late callbacks and a coordinator working late. Before deciding to hire, follow one week, see what actually filled it, and test what would help.",
  cover: "/images/hero-headphones-notes.webp",
  audience: ["partner"],
  // Read and confirm: the Workload Lens is its own activity, with its own debrief.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for business owners and coordinators, about growing the business and keeping quality.
    tags: { roles: ["owner", "coordinator"], goals: ["grow", "quality"] },
    pages: [
      page(
        "coordinator-week",
        "Where does a coordinator’s week go?",
        "Account for a coordinator’s week, separating necessary work from rework, before choosing a process fix, a supplier action, cover or hiring.",
        "decide",
        [
          section("why", "A full week isn’t a diagnosis", [
            {
              id: "why-text",
              type: "text",
              heading: "Before the next hire",
              body: "When the calendar is full and callbacks are slipping, the obvious answer is another coordinator. Sometimes it’s the right one. But a full week can be full for different reasons: a spike that won’t last, necessary support for people whose needs have changed, a handoff that keeps generating calls, or a gap that really is there every week.\n\nIn this article you return to **Maya** and her coordinator **Sam**, from *Maya’s next coordinator*, before she makes that decision. You’ll follow one week, tag what filled it, read it from both their sides, and test a change. Each task’s time is counted **once**: a family call about a missed visit is a family call, and the missed visit is laid over it as its cause.",
              ...illustrative("Framing copy for the Workload Lens, written for this article from the coordinator-week brief."),
            },
            {
              id: "why-callout",
              type: "callout",
              style: "important",
              label: "A planning account, not a productivity score",
              body: "The Workload Lens never scores a person, ranks a coordinator or sets a number of clients per coordinator. Its categories aren’t billing codes. Client conversations, reviews, follow-up and escalation are necessary work, and nothing here recommends shortening them. If a client has changing or urgent needs, follow Trilogy Care’s current escalation and continuity process.",
            },
          ]),
          section("lens", "Sam’s week", [{ id: "coordinator-week-lens", type: "workload", ...structuredClone(WORKLOAD_CASES[0].data) }]),
          section("after", "Map your own team’s week", [
            {
              id: "after-checklist",
              type: "checklist",
              title: "Before you decide your team needs another person",
              items: [
                "You’ve sampled more than one week, and said whether each was ordinary, quiet or pressured",
                "Each task has one category, so nothing is counted twice; causes are tagged on top",
                "You’ve kept necessary conversations, reviews and escalations apart from rework",
                "Each source of rework has a named cause, an owner and evidence you’ll check",
                "You’ve kept a reserve for the unexpected, rather than planning every hour",
                "You’ve set a date to look again, beside overdue reviews and callback times",
              ],
              ...illustrative("Drawn from the Workload Lens rules; check it with Care Coordination operations and the pilot group."),
            },
            {
              id: "after-journal",
              type: "journal",
              prompt: "Think about a recent week in your business. What filled it that nobody planned for, and how much of it was caused somewhere else?",
              scaffold: "The unplanned work was mostly… Some of it was caused by… The change I’d test first is…",
            },
            {
              id: "after-action",
              type: "action",
              prompt: "One step before your next staffing decision",
              suggestions: [
                { id: "w1", text: "Agree with your coordinator to sample two weeks, in aggregate, by kind of work" },
                { id: "w2", text: "Name the handoff or invoice problem that causes the most repeat calls, and who owns it" },
                { id: "w3", text: "Set a review date to check overdue reviews and callback times beside the hours" },
              ],
            },
          ]),
        ],
      ),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 9. Is this suburb ready for growth? The Local Coverage Comparison in a feature article
// ---------------------------------------------------------------------------------------------

const suburbGrowth: Demo = {
  key: "suburb-growth",
  title: "Is this suburb ready for growth?",
  standfirst:
    "Three new enquiries and a map full of contractors. Before you say yes, check who is actually approved, free and confirmed for the service, the place and the time your clients need.",
  cover: "/images/hero-gardener-phone.webp",
  audience: ["partner"],
  // Read and confirm: the Local Coverage Comparison is its own activity, with its own debrief.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for business owners, about growing the business and keeping quality.
    tags: { roles: ["owner"], goals: ["grow", "quality"] },
    pages: [
      page(
        "suburb-growth",
        "Is this suburb ready for growth?",
        "Compare client demand with usable contractor capacity by service, place and time window, act on current gaps through the accountable team, and choose where to build the supplier network first.",
        "decide",
        [
          section("why", "A contractor count isn’t capacity", [
            {
              id: "why-text",
              type: "text",
              heading: "The map that looks full",
              body: "Growth often starts with a good sign: enquiries from one part of town, and a directory that shows plenty of contractors nearby. The trouble is that a listing isn’t a visit. Some people on the map are still being checked. Some are approved, but free only in the afternoon, or only for cleaning. Some are already fully booked. And the one person who would cover a 7 am shower might be the only one, with nobody behind them.\n\nIn this article you return to **Maya**, from *Maya’s next coordinator*, as she looks at three fictional suburbs around Toowoomba. You’ll predict which is ready for more starts, look at what clients actually need by **service and time window**, sort the contractors into what’s usable now and what isn’t, and then make two separate decisions: what can’t wait, and where to build the network over the next six to eight weeks.",
              ...illustrative("Framing copy for the Local Coverage Comparison, written for this article from the suburb-growth brief."),
            },
            {
              id: "why-callout",
              type: "callout",
              style: "important",
              label: "A planning comparison, not an approval",
              body: "Nothing in this article approves a contractor, sets a clinical priority, changes a care plan or promises a service date: those stay with the provider’s own processes. A participant can choose their worker; the provider’s checks and agreement still apply. If a confirmed service has no worker, use Trilogy Care’s current continuity and escalation process now, not a recruitment plan.",
            },
          ]),
          section("compare", "Maya’s three suburbs", [{ id: "suburb-growth-compare", type: "coverage", ...structuredClone(COVERAGE_CASES[0].data) }]),
          section("after", "Look at your own local area", [
            {
              id: "after-checklist",
              type: "checklist",
              title: "Before you take on more starts in an area",
              items: [
                "You’ve listed what clients need by service, capability, area and time window, not just by headcount",
                "Confirmed, being-arranged and forecast demand are kept apart",
                "Only provider-approved workers with confirmed, recently verified availability in the window count as spare",
                "Each current gap has gone to the accountable team, with an honest message to the participant",
                "You know who would cover a foreseeable absence, and whether that meets the owner’s backup target",
                "A participant’s chosen worker is on the provider’s checking route, not dropped",
              ],
              ...illustrative("Drawn from the Local Coverage rules; check it with Care Partner Operations and supplier onboarding."),
            },
            {
              id: "after-journal",
              type: "journal",
              prompt:
                "Think about one area you work in. Which service and time of day would you least want to promise without checking, and who could cover it if your usual worker were away?",
              scaffold: "The service and time I’d check first is… The backup I’m relying on is… I’d confirm it by…",
            },
            {
              id: "after-action",
              type: "action",
              prompt: "One step before your next start in a new area",
              suggestions: [
                { id: "g1", text: "List the next month’s needs by service and time window for that area" },
                { id: "g2", text: "Re-confirm the availability of anyone you’re counting on, and note the date" },
                { id: "g3", text: "Name one backup for your most fragile recurring visit, and tell the accountable team about any gap now" },
              ],
            },
          ]),
        ],
      ),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 10. Which referrals become active clients? The Referral Journey Calculator in a feature article
// ---------------------------------------------------------------------------------------------

const referralActive: Demo = {
  key: "referral-active",
  title: "Which referrals become active clients?",
  standfirst:
    "A long list of names from one relationship, a handful from another. Before you decide where your time goes, follow the same people from first contact to a first visit, and past it.",
  cover: "/images/journey-handover.webp",
  audience: ["partner"],
  // Read and confirm: the Referral Journey Calculator is its own activity, with its own debrief.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for business owners, about growing the business and keeping quality.
    tags: { roles: ["owner"], goals: ["grow", "quality"] },
    pages: [
      page(
        "referral-active",
        "Which referrals become active clients?",
        "Compare local referral relationships by the same arrival cohort and a stated denominator, with the stage at first contact visible; separate funding waits, participant choice, capacity and handoff delays; and choose one relationship action and one operational fix.",
        "decide",
        [
          section("why", "Volume isn’t value", [
            {
              id: "why-text",
              type: "text",
              heading: "The relationship that sends the most names",
              body: "“The hospital sends lots of names, but hardly any become clients.” It’s a common feeling, and it’s often wrong. Some of those people are still waiting for a funding allocation. Some chose another provider, which is their right. Some agreed to start and are waiting for a worker. Another relationship might send far fewer people, who arrive funded and ready to choose. Counting enquiries, or dividing this month’s starts by this month’s enquiries, compares unlike things and can push you towards pressure nobody wants.\n\nIn this article you return to **Maya**, from *Maya’s next coordinator* and *Is this suburb ready for growth?*, as she looks back at the enquiries from three fictional local relationships: a GP practice, a hospital discharge team and a community organisation. You’ll predict which helped her grow, sort introductions by **the stage people were at when they first made contact**, follow the **same cohort** through to a first service and beyond, and then choose one relationship action and one operational fix.",
              ...illustrative("Framing copy for the Referral Journey Calculator, written for this article from the referral-to-active-client brief."),
            },
            {
              id: "why-callout",
              type: "callout",
              style: "important",
              label: "A learning comparison, not a referral system",
              body: "Nothing in this article contacts a referrer, records a real referral or decides anyone’s eligibility. Live referrals and consent belong in the CRM or Portal. Choosing a provider, or waiting, is the older person’s decision. And nobody can promise a place in the funding queue because of who made an introduction.",
            },
          ]),
          section("compare", "Maya’s three relationships", [{ id: "referral-active-journey", type: "referral", ...structuredClone(REFERRAL_CASES[0].data) }]),
          section("after", "Look at your own relationships", [
            {
              id: "after-checklist",
              type: "checklist",
              title: "Before you judge a referral relationship",
              items: [
                "You’re comparing one arrival cohort, with its denominator stated, not this month’s starts over this month’s enquiries",
                "You know the stage each person was at when they first made contact, and didn’t infer it from who referred them",
                "People waiting for an assessment or a funding allocation are counted as open, not lost",
                "An agreement isn’t counted as a delivered service",
                "Relationship effort and case onboarding are kept apart, and urgent care isn’t treated as wasted effort",
                "Small samples and young cohorts are read for what they show, not ranked",
                "A person who chose another provider, or chose to wait, is recorded honestly and not followed up with pressure",
              ],
              ...illustrative("Drawn from the Referral Journey rules; check it with the referral pathway and intake owners and Partnerships."),
            },
            {
              id: "after-journal",
              type: "journal",
              prompt:
                "Think about one relationship you’re building. What usually happens between their introduction and a first visit, and which part of that wait is yours to improve?",
              scaffold: "The step that takes longest is… The part I can influence is… I’d check it by…",
            },
            {
              id: "after-action",
              type: "action",
              prompt: "One step before your next conversation with a referrer",
              suggestions: [
                { id: "g1", text: "Count last quarter’s enquiries from one relationship by the stage people were at when they first made contact" },
                { id: "g2", text: "Follow one month’s enquiries to their own starts, and note how many are still open and why" },
                { id: "g3", text: "Note one handoff that slowed a start, and who owns that step" },
              ],
            },
          ]),
        ],
      ),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 11. What does a missed service cost? The Service Reliability Calculator in a feature article
// ---------------------------------------------------------------------------------------------

const missedService: Demo = {
  key: "missed-service",
  title: "What does a missed service cost?",
  standfirst:
    "Mrs Patel’s cleaner didn’t come before her book group, and it wasn’t the only one. Before you plan more outreach, follow one month of missed visits: who went without, what it took to repair, and what it would take to make Tuesdays dependable.",
  cover: "/images/journey-services-start.webp",
  audience: ["partner"],
  // Read and confirm: the Service Reliability Calculator is its own activity, with its own debrief.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for business owners, about keeping quality and growing the business.
    tags: { roles: ["owner"], goals: ["quality", "grow"] },
    pages: [
      page(
        "missed-service",
        "What does a missed service cost?",
        "Separate supplier failures from participants’ own cancellations and booking errors, protect the person first, measure recovery to the restored service, count recovery work once, and compare a reliability action with a referral push on care, workload and money separately.",
        "decide",
        [
          section("why", "More than one missed visit", [
            {
              id: "why-text",
              type: "text",
              heading: "The cost you don’t see on an invoice",
              body: "A missed visit looks like a supplier problem, and sometimes it is. But the cause might be an unconfirmed booking, an unsuitable time, a handoff that went wrong, or the participant’s own change of plan. And what it costs isn’t mostly money: it’s a person going without, a coordinator’s afternoon spent repairing it, and, when it keeps happening, a team with no time to start anyone new.\n\nIn this article you return to **Maya**, from *Which referrals become active clients?*, as she plans a campaign to visit more GP practices. Then **Mrs Patel’s** Tuesday clean doesn’t happen, on the day her book group meets at her home. You’ll respond to her first, then sort the month’s log by cause, count the repair work once, follow the repeat on a reliability timeline, and decide whether reliability comes before more leads.",
              ...illustrative("Framing copy for the Service Reliability Calculator, written for this article from the missed-service brief."),
            },
            {
              id: "why-callout",
              type: "callout",
              style: "important",
              label: "A learning calculation, not a complaints or booking system",
              body: "Nothing in this article books a visit, approves or penalises a supplier, records a complaint or decides what’s claimable. A person’s concern, complaint or request to change provider follows the provider’s own process, and a real case stays in the Operations and Quality systems. An urgent safety concern goes straight to the escalation process, without waiting for any calculation.",
            },
          ]),
          section("month", "Mrs Patel’s Tuesdays, and Maya’s month", [
            { id: "missed-service-calculator", type: "reliability", ...structuredClone(RELIABILITY_CASES[0].data) },
          ]),
          section("after", "Look at your own month", [
            {
              id: "after-checklist",
              type: "checklist",
              title: "Before you put a cost on missed services",
              items: [
                "The person who went without has been asked what they need, and told what happens next",
                "Anything urgent or unsafe has gone to the escalation process first",
                "Supplier failures are counted only once verified; participants’ own cancellations and booking errors are in their own lines",
                "A replacement booking or an invoice isn’t counted as a delivered visit",
                "Recovery is measured to the visit that actually happened, and open visits keep their age",
                "Each recovery task is counted once, whatever causes it’s tagged with",
                "Costs are only those recorded and actually borne; nobody’s missed support is given a dollar value",
                "Any saving is a forecast to check, and freed hours aren’t counted as both money and capacity",
              ],
              ...illustrative("Drawn from the Service Reliability rules; check it with Care Coordination Operations, Quality, Finance and the policy owner."),
            },
            {
              id: "after-journal",
              type: "journal",
              prompt:
                "Think about the last visit that didn’t happen as agreed in your business. What started it, and how long until the person actually had their service again?",
              scaffold: "What started it was… It was restored after… The person was told… I’d check…",
            },
            {
              id: "after-action",
              type: "action",
              prompt: "One step before your next growth plan",
              suggestions: [
                { id: "g1", text: "Count last month’s missed visits by who or what started them, with the supplier ones verified" },
                { id: "g2", text: "List every visit still open, with its age and who owns it" },
                { id: "g3", text: "Name one recurring gap and the specific action that would fix it, with a date to check" },
              ],
            },
          ]),
        ],
      ),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 12. Can we fund the next 90 days? The 90-Day Cash Bridge in a feature article
// ---------------------------------------------------------------------------------------------

const fund90: Demo = {
  key: "fund-90",
  title: "Can we fund the next 90 days?",
  standfirst:
    "Maya’s caseload plan says hire. Her bank account has its own calendar. Before the next coordinator starts, follow the next 90 days date by date: when the money clears, when the pay runs leave, and what it takes to keep a reserve.",
  cover: "/images/hero-notes-at-table.webp",
  audience: ["partner"],
  // Read and confirm: the 90-Day Cash Bridge is its own activity, with its own debrief.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for business owners, about growing the business.
    tags: { roles: ["owner"], goals: ["grow"] },
    pages: [
      page(
        "fund-90",
        "Can we fund the next 90 days?",
        "Separate earned, invoiced and received income, put every payment on its real date, find the dated cash low point and the opening cash needed, test a late receipt, and choose a funded action that keeps every agreed service covered.",
        "decide",
        [
          section("why", "Profit isn’t cash on a Thursday", [
            {
              id: "fund-why-text",
              type: "text",
              heading: "When the money clears",
              body: "A business can be profitable over a quarter and still miss a pay run. Fees are earned at the end of a month and paid weeks later; wages, super and setup bills leave on their own dates. A monthly margin summary can’t see the Thursday in between.\n\nIn this article you return to **Maya**, from *Maya’s next coordinator: when to hire*, as she gets ready to bring on a second coordinator. You’ll place her income on a timeline, read her next 90 days date by date, find the real low point, test a late remittance and a moved hire, and choose what she does, with a date to check the actuals.",
              ...illustrative("Framing copy for the 90-Day Cash Bridge, written for this article from the cash-timing brief."),
            },
            {
              id: "fund-why-callout",
              type: "callout",
              style: "important",
              label: "A planning and learning tool, not a funding decision",
              body: "Nothing here is a credit, hiring, pricing, claims or accounting decision. Your own fees and payment dates come from your signed agreement or a verified finance record, never from public Support at Home funding or the care-management allocation. If your business has a gap today, talk to your accountant or Finance contact.",
            },
          ]),
          section("bridge", "Maya’s next 90 days", [{ id: "fund-90-bridge", type: "cashbridge", ...structuredClone(CASH_BRIDGE_CASES[0].data) }]),
          section("after", "Look at your own 90 days", [
            {
              id: "fund-after-checklist",
              type: "checklist",
              title: "Before you commit to a hire or a start",
              items: [
                "Every receipt is on the date it clears, not the date it’s earned or advised",
                "Enquiries and clients waiting for an allocation make no receipt",
                "Every pay run is on its actual pay date, with super and on-costs on theirs",
                "Setup bills, owner drawings, tax and loan payments are dated, or marked as left out",
                "The lowest date is read from the dated ledger, not a week or month-end total",
                "A late receipt has been tested, and you know which pay date it would hit",
                "Any finance is approved and fully costed, and a credit limit isn’t counted as cash",
                "Every agreed start still has a trained coordinator, and there’s a date to check the actuals",
              ],
              ...illustrative("Drawn from the 90-Day Cash Bridge rules; check it with Finance and the partner commercial agreement owner."),
            },
            {
              id: "fund-after-journal",
              type: "journal",
              prompt: "Think about your next pay date. What has to clear before it, and how sure are you of that date?",
              scaffold: "My next pay date is… Before it, I’m relying on… I’d check…",
            },
            {
              id: "fund-after-action",
              type: "action",
              prompt: "One step before your next hire or start",
              suggestions: [
                { id: "f1", text: "List the next six pay dates, with what each will cost" },
                { id: "f2", text: "Write down when each expected remittance clears, and which are confirmed" },
                { id: "f3", text: "Book a date to replace this month’s estimates with actuals" },
              ],
            },
          ]),
        ],
      ),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// 13. What would you do? Two "What Would You Do?" Community Case Threads
// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// 14. Dot at quarter end: the Quarterly Budget Decision Lab in a feature article
// ---------------------------------------------------------------------------------------------

const quarterEnd: Demo = {
  key: "quarter-end",
  title: "Dot at quarter end: what’s really left?",
  standfirst:
    "Dot has $2,400 in her balance with four weeks to go, and her daughter wants more help added. Before anyone books anything, work out what’s really there, ask Dot what she wants, and plan with her.",
  cover: "/images/hero-garden-lunch.webp",
  audience: ["coordinator", "staff"],
  // Read and confirm: the lab is its own activity, completed on the server once its feedback is viewed.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for coordinators, about money and client experience.
    tags: { roles: ["coordinator"], goals: ["money", "clients"] },
    pages: [
      page(
        "quarter-end",
        "Dot at quarter end: what’s really left?",
        "Tell the current balance from the projected one, check approved services and the care plan, put the person’s own choice first, route AT–HM separately, and explain the plan, the contribution and what may carry over.",
        "decide",
        [
          section("qe-why", "A balance isn’t a shopping list", [
            {
              id: "qe-why-text",
              type: "text",
              heading: "Late in the quarter, the number on the statement can mislead",
              body: "A sizeable balance near the end of a quarter can look like money that has to be used. Usually it isn’t. Some of it is already booked; some of it will carry over; and what matters is what the person wants and can actually have before the quarter ends.\n\nIn this article you meet **Dot** again: she tends her roses, never misses bowls, and would rather wait for Lena than have a new cleaner. Her daughter **Fiona** has emailed with ideas. You’ll read the statement and care plan, check with Dot, build a possible plan from real dates, and explain it to her. **A low closing balance isn’t the goal.** A plan Dot understands and agrees with is.",
              ...illustrative("Framing copy for the Quarterly Budget Decision Lab, written for this article from the PRD’s section 5."),
            },
            {
              id: "qe-why-callout",
              type: "callout",
              style: "important",
              label: "Practice case: fictional figures",
              body: "Dot’s figures, prices and rates are illustrative training figures, not a client record or an approved service plan. Nothing here books a service, makes a claim, sends an invoice or changes a care plan. For a real participant, use the current authorised budget, care plan and statement, and Trilogy Care’s approved process.",
            },
          ]),
          section("qe-lab", "Dot’s quarter", [{ id: "quarter-end-lab", type: "budgetlab", ...structuredClone(DOT_QUARTER_END) }]),
          section("qe-after", "Before you change a real participant’s services", [
            {
              id: "qe-after-checklist",
              type: "checklist",
              title: "Near quarter end",
              items: [
                "I’ve opened the current authorised budget, care plan and statement",
                "I can say what’s current and what’s projected, and that booked services aren’t spent or claimed",
                "I know the carryover threshold for this person, and that the amount above it isn’t a target",
                "I asked the person what they want before suggesting anything, and a family member’s request didn’t decide for them",
                "Every change is approved, agreed and deliverable before the quarter ends, and any contribution was explained first",
                "Equipment and home modifications go through AT–HM, never the ongoing budget",
                "I’ve recorded what was agreed and when I’ll check the next statement",
              ],
              ...illustrative("Drawn from the quarter-end rules in the lab; check it with Operations/Finance and the Support at Home policy owner."),
            },
            {
              id: "qe-after-journal",
              type: "journal",
              prompt: "Think of the last time someone asked you to “use up” a balance. What did the person themselves want, and how did you find out?",
              scaffold: "They asked because… What the person wanted was… Next time I’d…",
            },
          ]),
        ],
      ),
    ],
  },
};

const whatWouldYouDo: Demo = {
  key: "what-would-you-do",
  title: "What would you do? Two conversations about choice",
  standfirst:
    "Margaret wants a family friend to help her shower. Graham won’t have anyone check on him after a fall. Write what you’d say first, then compare it with experienced coordinators.",
  cover: "/images/hero-notes-at-table.webp",
  audience: ["coordinator", "staff"],
  // Read and confirm: each case thread is its own activity, finished on the server's record.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for coordinators and Trilogy Care staff, about clients and quality.
    tags: { roles: ["coordinator", "staff"], goals: ["clients", "quality"] },
    pages: [
      page(
        "what-would-you-do",
        "What would you do?",
        "Practise what to say, what to do next and who to involve when a person’s choice and the provider’s duties pull in different directions, then compare your first take with experienced coordinators.",
        "say",
        [
          section("wwyd-why", "Two calls, many good answers", [
            {
              id: "wwyd-why-text",
              type: "text",
              heading: "Commit, compare, reconsider",
              body: "Some conversations have a firm safety boundary and still more than one good way to say it. In each case below, write the first few sentences you’d say, what you’d do next and who needs to know, **before** you see anyone else’s. Your first take is private.\n\nThen read the pinned case note and how experienced coordinators would handle it, mark what’s helpful, save a phrase you want to keep, and reflect on what you’d change. Sharing your own response is optional, and a moderator reads it first.",
              ...illustrative("Framing copy for the case threads, written for this article from the PRD’s learner journey."),
            },
            {
              id: "wwyd-why-callout",
              type: "callout",
              style: "important",
              label: "A learning discussion, not a reporting system",
              body: "These are fictional cases. If you’re dealing with a real fall, injury, refusal or safeguarding concern now, don’t post it here: follow the incident first steps and contact your clinical or care partner team.",
            },
          ]),
          section("wwyd-a", "A worker the client trusts", [{ id: "wwyd-case-a", type: "casethread", ...freshCaseThread(CASE_FAMILY_FRIEND) }]),
          section("wwyd-b", "A safety check refused after a fall", [{ id: "wwyd-case-b", type: "casethread", ...freshCaseThread(CASE_REFUSED_CHECK) }]),
        ],
        { allActivities: true },
      ),
    ],
  },
};

const spotTheHazard: Demo = {
  key: "spot-the-hazard",
  title: "Look before you help: spot the hazard",
  standfirst:
    "Three rooms in three homes. Before you help someone move, shower or eat, look around: notice what matters, decide what comes first, and respond within your role.",
  cover: "/images/home-hero-day.webp",
  audience: ["partner", "coordinator", "staff"],
  // Read and confirm: each scene is its own activity, completed on the server once its debrief is viewed.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for Care Partners and coordinators, about quality, safety and the person's experience.
    tags: { roles: ["partner", "coordinator"], goals: ["quality", "clients"] },
    pages: [
      page(
        "look",
        "Look before you help",
        "Notice environmental risks in someone’s home, judge which comes first, and respond within your role: talking with the person, respecting their choices and belongings, and reporting or escalating what needs it.",
        "notice",
        [
          section("look-why", "Noticing is the first step", [
            {
              id: "look-why-text",
              type: "text",
              heading: "It’s their home, and you’re a visitor in it",
              body: "Falls, equipment faults and infections at home usually start with something small that someone could have noticed: a cord across the way to the bathroom, a brake left off, used gloves next to the bread.\n\nIn each room below, **look around before you help**. Flag what needs attention, say what you’d deal with first, then choose what you’d do next. Not everything in a person’s home is a hazard: their photos, their boxes, their gardening gloves are theirs. The skill is noticing what matters, and then **talking with them** about it.",
              ...illustrative("Framing copy for the Spot the Hazard scenes, written for this article from the PRD’s sections 1 and 4."),
            },
            {
              id: "look-why-callout",
              type: "callout",
              style: "important",
              label: "Practice with drawn, fictional rooms",
              body: "These rooms are drawn for training, not taken from anyone’s home. The hazards and actions are examples for review, not Trilogy Care policy: in a real home, the person’s care plan and Trilogy Care’s current procedures decide what you do. If someone is hurt or in danger, follow the incident first steps.",
            },
          ]),
          section("look-pearce", "Mrs Pearce: from the bedroom to the bathroom", [
            { id: "look-pearce-scan", type: "hazardscan", ...structuredClone(PEARCE_BEDROOM) },
          ]),
          section("look-okafor", "Mr Okafor: before he gets up", [{ id: "look-okafor-scan", type: "hazardscan", ...structuredClone(OKAFOR_TRANSFER) }]),
          section("look-dot", "Dot’s kitchen at lunchtime", [{ id: "look-dot-scan", type: "hazardscan", ...structuredClone(DOT_KITCHEN) }]),
          section("look-after", "On your next visit", [
            {
              id: "look-after-checklist",
              type: "checklist",
              title: "Before you help someone move",
              items: [
                "I looked along the way they’ll walk: cords, rugs, mats, lighting, things on the floor",
                "Their walking aid is within reach, and in good order",
                "Brakes are on and checked, and the equipment isn’t damaged",
                "I told the person what I noticed, and asked before moving anything of theirs",
                "I made a safe change only with their agreement and within my role",
                "I reported what needs more: a fault, a leak, a change in how they’re managing",
              ],
              ...illustrative("Drawn from the scenes’ actions; check it with Quality and the relevant procedure owners."),
            },
            {
              id: "look-after-journal",
              type: "journal",
              prompt:
                "Think of a home you visit. What’s one thing on the way to the bathroom you’d look at differently now, and how would you raise it with the person?",
              scaffold: "On the way to the bathroom there’s… I’d raise it by…",
            },
          ]),
        ],
        { allActivities: true },
      ),
    ],
  },
};

const dischargePivot: Demo = {
  key: "discharge-pivot",
  title: "Dot comes home: the 72-hour discharge pivot",
  standfirst:
    "The hospital says Dot may go home tomorrow. The wound-care plan isn’t signed, the first nursing visit isn’t confirmed, and Fiona wants to know if everything’s arranged. Work out what’s known, who owns each decision, and what you can honestly say.",
  cover: "/images/hero-thinking-laptop.webp",
  audience: ["coordinator", "staff"],
  // Read and confirm: the simulation is its own activity, completed on the server once its debrief is viewed.
  completion: "confirm",
  doc: {
    schema: 2,
    // How it browses: for coordinators and Trilogy Care teams, about quality, safety and the person's experience.
    tags: { roles: ["coordinator", "staff"], goals: ["quality", "clients"] },
    pages: [
      page(
        "discharge-pivot",
        "Dot comes home",
        "Assemble a safe, honest handover for a participant’s return home from hospital: confirm what’s known, involve the participant, escalate an unmet clinical need to the people who own it, and record what’s confirmed, pending and unresolved with named owners.",
        "decide",
        [
          section("dp-why", "A recommendation isn’t an arrangement", [
            {
              id: "dp-why-text",
              type: "text",
              heading: "The handover only looks complete",
              body: "When someone is coming home from hospital, the information arrives in pieces: a phone call, a ward note, a recommendation, a family member’s question. It’s easy to treat “the OT recommends a chair” as “a chair is arranged”, or a request to a nurse as a confirmed visit.\n\nIn this simulation you’re the coordinator on the afternoon before **Dot** may go home. Alerts arrive as the story moves. Check the handover record, decide what to verify, arrange, escalate and follow up, then record your handover. **An honest “not ready, and escalated” can be the right answer.** Finishing fast is never what counts.",
              ...illustrative("Framing copy for the 72-Hour Discharge Pivot, written for this article from the PRD’s sections 1 and 5."),
            },
            {
              id: "dp-why-callout",
              type: "callout",
              style: "important",
              label: "Practice with a fictional case",
              body: "Dot, Fiona and every alert, record and supplier answer here are invented. The clinical details are examples for review, not instructions. Nothing here books a service, messages a hospital or family, orders equipment, submits a review or changes a record. For a real discharge, follow Trilogy Care’s current approved procedures, contacts and clinical escalation route.",
            },
          ]),
          section("dp-sim", "Wednesday afternoon at the desk", [{ id: "dp-pivot", type: "discharge", ...structuredClone(DOT_DISCHARGE) }]),
          section("dp-after", "Before you tell anyone it’s arranged", [
            {
              id: "dp-after-checklist",
              type: "checklist",
              title: "Hospital to home",
              items: [
                "I have the signed discharge summary, not just a ward note",
                "I asked the participant what they want and who can know what",
                "The first essential service is confirmed in writing, with who is accountable, or the gap is escalated to the clinical lead and the hospital",
                "Equipment goes through AT–HM, with a safe interim plan from the practitioner",
                "A Support Plan Review request is pending, not an approval",
                "I recorded what’s confirmed, pending and unresolved, with an owner for each",
                "Someone named checks the first days at home",
              ],
              ...illustrative("Drawn from the simulation’s gates; check it against the Hospital-to-Home Handover Check once it’s approved."),
            },
            {
              id: "dp-after-journal",
              type: "journal",
              prompt: "Think of a return home from hospital you’ve helped with. What looked arranged that wasn’t yet, and who needed to know?",
              scaffold: "It looked arranged because… The person who needed to know was… Next time I’d…",
            },
          ]),
        ],
      ),
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// Dot's gardener: the Contractor Vetting Card (docs/document-auditor.md)
// ---------------------------------------------------------------------------------------------

const contractorVetting: Demo = {
  key: "contractor-vetting",
  title: "Dot’s gardener: checking a contractor she’s chosen",
  standfirst:
    "Dot wants to keep the gardener she trusts. His business has sent its pack: an active ABN, an old police certificate beside a newer clearance, an expired insurance certificate, an extra job and a quote above the median. Find a safe way to keep her choice, and tell her honestly where it stands.",
  cover: "/images/hero-gardener-phone.webp",
  audience: ["coordinator", "staff"],
  // Read and confirm: the card is its own activity, completed on the server once its debrief is viewed.
  completion: "confirm",
  doc: {
    schema: 2,
    tags: { roles: ["coordinator", "staff"], goals: ["quality", "clients"] },
    pages: [
      page(
        "contractor-vetting",
        "Dot’s gardener",
        "Check a participant-chosen contractor proportionately: the business and the worker apart, the accepted screening route, Trilogy Care’s insurance policy, the scope and the price, then recommend a next step and explain it to the participant.",
        "decide",
        [
          section("cv-why", "Protect the choice, check the arrangement", [
            {
              id: "cv-why-text",
              type: "text",
              heading: "Neither a rubber stamp nor a veto",
              body: "When a participant chooses their own worker, two mistakes are easy. One is to treat an active ABN as if it settled everything, and let the worker start. The other is to treat every odd-looking document as a reason to say no, so the participant loses someone they trust over a gap that a phone call would close.\n\nIn this card you’re **Dot’s** coordinator. Her gardener’s business has sent its onboarding pack. Check the business and the person who’ll do the work separately, work out which screening route applies, check the insurance against Trilogy Care’s policy, separate the jobs, and read the price as two prices: what the supplier charges Trilogy Care, and what Dot pays. Then recommend what happens next, and write to Dot.",
              ...illustrative("Framing copy for the Contractor Vetting Card, written for this article from the PRD’s sections 1 and 3."),
            },
            {
              id: "cv-why-callout",
              type: "callout",
              style: "important",
              label: "Practice with a fictional pack",
              body: "Dot, the gardener’s business, its ABN, the insurer, every certificate, the benchmark and every price here are invented, and the ABN Lookup is simulated. The insurance policy and the benchmark are training versions. Nothing here approves a contractor, checks a real register, agrees a price or contacts anyone. For a real request, follow Trilogy Care’s current approved supplier onboarding and worker screening procedures.",
            },
          ]),
          section("cv-card", "The pack on your desk", [{ id: "cv-card-block", type: "auditor", ...structuredClone(DOT_GARDENER) }]),
          section("cv-after", "Before you tell anyone they can start", [
            {
              id: "cv-after-checklist",
              type: "checklist",
              title: "A participant-chosen worker",
              items: [
                "I know who the participant wants, for what, and by when",
                "The task is in their approved plan, or it’s gone to the care-plan process",
                "I checked the business and each worker separately",
                "The worker has one accepted screening route, verified by the approved method",
                "Insurance is checked against Trilogy Care’s policy, not presented as law",
                "I have the supplier cost and the participant’s price, separately, and the price is agreed in writing",
                "I told the participant what’s checked, what’s outstanding, who owns it and when I’ll be back in touch",
              ],
              ...illustrative("Drawn from the card’s checks; check it against the Choosing and Checking Your Contractor Job Aid once it’s approved."),
            },
            {
              id: "cv-after-journal",
              type: "journal",
              prompt: "Think of a time a participant wanted to keep a worker they trusted. What was really missing, and how did you explain the wait?",
              scaffold: "What was missing was… I explained it by… Next time I’d…",
            },
          ]),
        ],
      ),
    ],
  },
};

export const MAGAZINE_DEMOS: Demo[] = [
  invoices,
  outsideService,
  maya,
  brokered,
  journey,
  oneDay,
  nextTen,
  coordinatorWeek,
  suburbGrowth,
  referralActive,
  missedService,
  fund90,
  whatWouldYouDo,
  quarterEnd,
  spotTheHazard,
  dischargePivot,
  contractorVetting,
];
