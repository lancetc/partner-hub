import type { CompletionMode, GuideAudience, GuideDoc } from "@/lib/magazine";

/*
  The Magazine pilot: a one-page guide (an editorial story) and a four-page course, "Checking supplier
  invoices", for new care coordinators. The cases and the people in them are made up (flagged
  "illustrative" for reviewers). Neither makes any claim about rates, timeframes or approval rules: they
  point readers to current guidance for those, as the brief asks.
*/

export type SeedGuide = {
  id: string;
  slug: string;
  title: string;
  standfirst: string;
  cover: string | null;
  audience: GuideAudience[];
  completion: CompletionMode;
  doc: GuideDoc;
};

const GLOSSARY = {
  source: "Partner Hub glossary",
  ref: "Bill Matching",
  quote: "Matching invoice line items to approved service plan items.",
};

const CHECKLIST_ITEMS = [
  "The client’s name and the service period are right.",
  "Each line names one service you can find in the agreed services.",
  "Each line shows the date of the visit and the hours or quantity.",
  "The hours or quantity match what was booked and delivered.",
  "The price on each line matches what was agreed with the supplier.",
  "Anything you can’t match is queried before the bill is approved, and the query is noted.",
];

/** The PRD's pilot course: Decide, Do, Notice, then Decide again, with the invoice review job aid. */
const CHECKING_INVOICES: SeedGuide = {
  id: "mag-checking-invoices",
  slug: "checking-supplier-invoices",
  title: "Checking supplier invoices",
  standfirst: "Inspect a supplier invoice, spot the detail that’s missing, and decide what to clarify before it’s approved.",
  cover: "/images/magazine/invoice-cover.svg",
  audience: ["coordinator", "staff"],
  completion: "confirm",
  doc: {
    schema: 2,
    pages: [
      {
        id: "why-detail",
        title: "Why the detail matters",
        purpose: "Make your first call on an invoice that doesn’t line up with what was agreed.",
        template: "decide",
        kind: "content",
        required: true,
        sections: [
          {
            id: "why-situation",
            title: "The situation",
            blocks: [
              {
                id: "why-situation-text",
                type: "text",
                body: "Priya is three weeks into her role as a care coordinator. A bill from **Tidy Homes** arrives for Mr Alan Brooks, who had cleaning on Tuesday and help with shopping on Thursday.\n\nThe invoice has one line: **Home help, 3 hours.**",
                flag: {
                  kind: "illustrative",
                  note: "Priya, Mr Brooks and Tidy Homes are made up for this course.",
                },
              },
            ],
          },
          {
            id: "why-choice",
            title: "What would you do?",
            blocks: [
              {
                id: "why-decision",
                type: "decision",
                prompt: "Three hours sounds about right. What does Priya do first?",
                choices: [
                  {
                    id: "why-approve",
                    text: "Approve it: the total looks right.",
                    verdict: "risky",
                    feedback: "A total that looks right isn’t a bill that matches. Each hour needs to point to a service Mr Brooks agreed to.",
                  },
                  {
                    id: "why-compare",
                    text: "Put it beside Mr Brooks’s agreed services before deciding anything.",
                    verdict: "best",
                    feedback: "Yes. Matching each line to an agreed service is the check. The next pages show how.",
                  },
                ],
                source: {
                  label: "Glossary: Bill Matching",
                  href: "/resources/glossary",
                },
                evidence: [GLOSSARY],
              },
            ],
          },
          {
            id: "why-principle",
            title: "The principle",
            blocks: [
              {
                id: "why-principle-callout",
                type: "callout",
                style: "important",
                label: "Match lines, not totals",
                body: "Every line on a bill should point to a service that was agreed and delivered. When it doesn’t, ask before you approve.",
                evidence: [GLOSSARY],
              },
            ],
          },
        ],
      },
      {
        id: "what-to-check",
        title: "What to check",
        purpose: "The checks to run on any supplier invoice, in order, and the mistake to avoid.",
        template: "do",
        kind: "content",
        required: true,
        sections: [
          {
            id: "check-when",
            title: "When you’ll do this",
            blocks: [
              {
                id: "check-when-text",
                type: "text",
                body: "Every time a supplier bill arrives for one of your clients, before it’s approved.",
              },
            ],
          },
          {
            id: "check-steps",
            title: "Step by step",
            blocks: [
              {
                id: "check-steps-text",
                type: "text",
                body: "1. Open the client’s agreed services.\n2. Check the client’s name and the service period on the invoice.\n3. Match each line to one agreed service.\n4. Check the date, and the hours or quantity, on each line.\n5. Check the price on each line against what was agreed with the supplier.\n6. Query anything you can’t match, and note what you asked.",
              },
            ],
          },
          {
            id: "check-example",
            title: "A worked example",
            blocks: [
              {
                id: "check-example-media",
                type: "textMedia",
                body: "Mr Brooks’s agreed services list cleaning and shopping help separately. So an invoice for him should too: one line for each, with its date and hours.",
                media: {
                  src: "/images/magazine/agreed-services.svg",
                  alt: "Mr Brooks’s agreed services: cleaning on Tuesdays and shopping help on Thursdays, each on its own line.",
                  caption: "The agreed services: what each line should match.",
                },
                layout: "media-right",
                flag: {
                  kind: "illustrative",
                  note: "A made-up client’s services.",
                },
              },
            ],
          },
          {
            id: "check-mistake",
            title: "A common mistake",
            blocks: [
              {
                id: "check-mistake-callout",
                type: "callout",
                style: "important",
                label: "Watch for",
                body: "Approving on the total. Three hours can be right overall and still hide an hour you can’t account for.",
              },
            ],
          },
          {
            id: "check-practice",
            title: "Quick practice",
            blocks: [
              {
                id: "check-practice-decision",
                type: "decision",
                prompt: "Which step catches a line that joins two different services?",
                choices: [
                  {
                    id: "check-p-name",
                    text: "Checking the client’s name and the service period.",
                    verdict: "risky",
                    feedback: "That confirms the bill is for the right person and time, but not what each line covers.",
                  },
                  {
                    id: "check-p-match",
                    text: "Matching each line to one agreed service.",
                    verdict: "best",
                    feedback: "Right. A line that covers two services can’t match just one.",
                  },
                  {
                    id: "check-p-price",
                    text: "Checking the price on each line.",
                    verdict: "acceptable",
                    feedback: "It might show up here too, but matching each line to a service is where it’s clearest.",
                  },
                ],
              },
            ],
          },
          {
            id: "check-job-aid",
            title: "Your job aid",
            blocks: [
              {
                id: "check-checklist",
                type: "checklist",
                title: "Invoice review checklist",
                items: CHECKLIST_ITEMS,
                resource: {
                  href: "/resources/glossary",
                  label: "Billing terms in the glossary",
                },
              },
            ],
          },
        ],
      },
      {
        id: "read-invoice",
        title: "Read the invoice",
        purpose: "Inspect an invoice, then try a second one yourself.",
        template: "notice",
        kind: "content",
        required: true,
        sections: [
          {
            id: "read-example",
            title: "The example",
            blocks: [
              {
                id: "read-image",
                type: "image",
                media: {
                  src: "/images/magazine/invoice-annotated.svg",
                  alt: "The Tidy Homes invoice for Mr Brooks with three numbered notes: 1, one line covers two kinds of help; 2, no dates or visit times; 3, nothing says which agreed service each hour was for.",
                  caption: "Three things you can’t confirm from this invoice.",
                },
                width: "wide",
                enlarge: true,
                flag: {
                  kind: "illustrative",
                  note: "A made-up invoice drawn for this course.",
                },
              },
            ],
          },
          {
            id: "read-notice",
            title: "What to notice",
            blocks: [
              {
                id: "read-notice-text",
                type: "text",
                body: "1. **One line, two kinds of help.** Cleaning and shopping help are separate services.\n2. **No dates or times.** You can’t see which visits the hours belong to.\n3. **No link to an agreed service.** Nothing says which hours were which.",
              },
            ],
          },
          {
            id: "read-your-turn",
            title: "Your turn",
            blocks: [
              {
                id: "read-second",
                type: "decision",
                prompt: "Tidy Homes sends a new invoice. What still needs checking?",
                context:
                  "It now has two lines: “Cleaning, Tuesday, 2 hours” and “Shopping help, Thursday, 1 hour”. The agreed services say cleaning is on Tuesdays and shopping help on Thursdays.",
                choices: [
                  {
                    id: "read-done",
                    text: "Nothing: both lines match an agreed service.",
                    verdict: "risky",
                    feedback: "Each line now matches a service, but the hours and prices still need checking against what was booked and agreed.",
                  },
                  {
                    id: "read-hours",
                    text: "That the hours match what was booked and delivered, and the prices match the agreement.",
                    verdict: "best",
                    feedback: "Yes. The lines now match services; the last checks are the quantities and the prices.",
                  },
                ],
                flag: {
                  kind: "illustrative",
                  note: "A made-up second invoice.",
                },
              },
            ],
          },
        ],
      },
      {
        id: "make-the-call",
        title: "Make the call",
        purpose: "Decide what to clarify with the supplier, and what happens next.",
        template: "decide",
        kind: "content",
        required: true,
        sections: [
          {
            id: "call-situation",
            title: "The reply",
            blocks: [
              {
                id: "call-situation-text",
                type: "text",
                body: "Priya asked Tidy Homes for an itemised invoice. Their reply: “We’ve always sent one line. Can’t you just approve it?”",
                flag: { kind: "illustrative", note: "A made-up reply." },
              },
            ],
          },
          {
            id: "call-choice",
            title: "What would you do?",
            blocks: [
              {
                id: "call-decision",
                type: "decision",
                prompt: "How does Priya respond?",
                choices: [
                  {
                    id: "call-explain",
                    text: "Explain that each line needs to match one of Mr Brooks’s agreed services, and ask again for the dates and hours for each.",
                    verdict: "best",
                    feedback: "Clear and fair: it says why, and exactly what’s needed. Note the request so anyone can follow it.",
                  },
                  {
                    id: "call-approve",
                    text: "Approve it this time, and ask for itemised invoices from now on.",
                    verdict: "risky",
                    feedback: "That leaves this bill unmatched. Ask for the detail on this one too.",
                  },
                  {
                    id: "call-escalate",
                    text: "Pass it straight to someone else to deal with.",
                    verdict: "acceptable",
                    feedback: "Ask for help if you need it, but a clear request to the supplier usually resolves it.",
                  },
                ],
              },
            ],
          },
          {
            id: "call-next",
            title: "Next step",
            blocks: [
              {
                id: "call-next-callout",
                type: "callout",
                style: "tip",
                label: "Check the current guidance",
                body: "Rules about timeframes, rates and who approves a bill can change. Use the current invoice guidance in Resources.",
                link: { href: "/resources", label: "Open Resources" },
              },
            ],
          },
        ],
      },
    ],
  },
};

export const seedGuides: SeedGuide[] = [
  {
    id: "mag-invoice-mismatch",
    slug: "when-an-invoice-doesnt-match",
    title: "When an invoice doesn’t match the service",
    standfirst:
      "A supplier sends one line for a week of different help. Here’s how to compare it with what was agreed, decide what to do next, and keep the client’s budget clear.",
    cover: "/images/magazine/invoice-cover.svg",
    audience: ["coordinator", "staff"],
    completion: "decision",
    doc: {
      schema: 2,
      pages: [
        {
          id: "page-1",
          title: "",
          purpose: "",
          template: "decide",
          kind: "content",
          required: true,
          sections: [
            {
              id: "situation",
              title: "The invoice",
              blocks: [
                {
                  id: "situation-text",
                  type: "text",
                  body: "It’s Monday morning and Priya, three weeks into her role as a care coordinator, opens the supplier bills waiting for her.\n\nOne is from **Tidy Homes**, who support Mr Alan Brooks at home. Last week he had help with cleaning on Tuesday and a trip to the shops on Thursday. The invoice has a single line:\n\n**Home help, 3 hours.**\n\nThree hours sounds about right. But Priya can’t tell which hours went where, or whether each one was for something Mr Brooks agreed to.",
                  flag: {
                    kind: "illustrative",
                    note: "Priya, Mr Brooks and Tidy Homes are made up for this guide.",
                  },
                },
              ],
            },
            {
              id: "agreed",
              title: "What was agreed",
              blocks: [
                {
                  id: "agreed-media",
                  type: "textMedia",
                  heading: "Start with the agreed services",
                  body: "Before looking at the bill, look at what was agreed. Mr Brooks’s services list each kind of help separately, with how often it happens.\n\nChecking a bill means matching **each line on the invoice** to one of those agreed services. That’s what the Hub’s glossary calls *bill matching*.",
                  media: {
                    src: "/images/magazine/agreed-services.svg",
                    alt: "Mr Brooks’s agreed services: cleaning on Tuesdays and shopping help on Thursdays, each listed on its own line.",
                    caption: "The agreed services list each kind of help on its own line.",
                  },
                  layout: "media-right",
                  evidence: [GLOSSARY],
                },
                {
                  id: "agreed-callout",
                  type: "callout",
                  style: "important",
                  label: "Match lines, not totals",
                  body: "A total that looks right isn’t the same as a bill that matches. Each line needs to point to a service that was agreed and delivered.",
                  evidence: [GLOSSARY],
                },
              ],
            },
            {
              id: "closer",
              title: "A closer look",
              blocks: [
                {
                  id: "closer-image",
                  type: "image",
                  media: {
                    src: "/images/magazine/invoice-annotated.svg",
                    alt: "The Tidy Homes invoice for Mr Brooks with three numbered notes: 1, one line covers two different kinds of help; 2, no dates or visit times; 3, nothing says which agreed service each hour was for.",
                    caption: "Three things Priya can’t confirm from this invoice.",
                  },
                  width: "wide",
                  enlarge: true,
                  flag: {
                    kind: "illustrative",
                    note: "A made-up invoice drawn for this guide.",
                  },
                },
                {
                  id: "closer-text",
                  type: "text",
                  body: "Laid beside the agreed services, the gaps are easier to see:\n\n1. **One line, two kinds of help.** Cleaning and shopping help are separate services, but the invoice joins them.\n2. **No dates or times.** Priya can’t see which visits the hours belong to.\n3. **No link to an agreed service.** Nothing says which hours were cleaning and which were shopping.\n\nNone of this means the invoice is wrong. It means Priya can’t yet show that it’s right.",
                },
              ],
            },
            {
              id: "decide",
              title: "What would you do next?",
              blocks: [
                {
                  id: "decide-question",
                  type: "decision",
                  prompt: "You’re Priya. What do you do with the Tidy Homes invoice?",
                  context: "Mr Brooks says the visits went well, and Tidy Homes is a supplier he likes.",
                  choices: [
                    {
                      id: "approve",
                      text: "Approve it. Three hours is about what was booked, and Mr Brooks is happy.",
                      verdict: "risky",
                      feedback:
                        "The total might be right, but you can’t match one line to two different agreed services. Approving it means the client’s statement shows spending you can’t explain line by line.",
                    },
                    {
                      id: "itemise",
                      text: "Ask Tidy Homes for an itemised invoice: each service, its date and its hours. Then match each line to the agreed services.",
                      verdict: "best",
                      feedback:
                        "Yes. An itemised invoice lets you match each line to an agreed service, and you haven’t accused anyone of anything. Keep a note of the request so the next person can follow it.",
                    },
                    {
                      id: "reject",
                      text: "Reject it and tell Tidy Homes it won’t be paid.",
                      verdict: "risky",
                      feedback:
                        "Nothing suggests the services weren’t delivered. You just can’t match them yet. Asking for detail keeps the relationship and gets you what you need.",
                    },
                  ],
                  source: {
                    label: "Glossary: Bill Matching",
                    href: "/resources/glossary",
                  },
                  evidence: [GLOSSARY],
                },
              ],
            },
            {
              id: "why",
              title: "Why it matters",
              blocks: [
                {
                  id: "why-text",
                  type: "text",
                  body: "Mr Brooks’s budget pays for the help he chose. When every line on a bill matches an agreed service, he (and anyone helping him) can see exactly where it went. When lines are lumped together, that picture blurs, and questions come later, when they’re harder to answer.\n\nAsking for detail is also fair to the supplier. It gives Tidy Homes a clear way to show the work they did.",
                },
                {
                  id: "why-example",
                  type: "callout",
                  style: "example",
                  label: "How Priya asked",
                  body: "“Hi Jo, thanks for last week’s invoice for Mr Brooks. Could you send an itemised version with each service, the date and the hours on its own line? That lets us match it to his agreed services. Thanks!”",
                  flag: {
                    kind: "illustrative",
                    note: "A sample message; not a required wording.",
                  },
                },
                {
                  id: "why-tip",
                  type: "callout",
                  style: "tip",
                  label: "Check the current guidance",
                  body: "Rules about timeframes, rates and who approves a bill can change. Use the current invoice guidance in Resources rather than memory.",
                  link: { href: "/resources", label: "Open Resources" },
                },
              ],
            },
            {
              id: "takeaways",
              title: "Key points",
              blocks: [
                {
                  id: "takeaways-text",
                  type: "text",
                  body: "- Match **each line** of an invoice to an agreed service, not just the total.\n- A line you can’t match isn’t necessarily wrong: ask for detail before you decide.\n- Keep a note of what you asked and why.",
                },
                {
                  id: "takeaways-checklist",
                  type: "checklist",
                  title: "Invoice review checklist",
                  items: [
                    "The client’s name and the service period are right.",
                    "Each line names one service you can find in the agreed services.",
                    "Each line shows the date of the visit and the hours or quantity.",
                    "The hours or quantity match what was booked and delivered.",
                    "The price on each line matches what was agreed with the supplier.",
                    "Anything you can’t match is queried before the bill is approved, and the query is noted.",
                  ],
                  resource: {
                    href: "/resources/glossary",
                    label: "Billing terms in the glossary",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
  CHECKING_INVOICES,
];
