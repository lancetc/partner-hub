import type { SignalAction, SignalBlockData } from "@/lib/signal";

/*
  Starter cases for Spot the Signal (docs/spot-the-signal.md), written from the three cases in the PRD.
  Everything in them is made up: the people, the invoices, the notes, the voicemails and the figures.

  They are DRAFTS. The answers are a regulatory judgement, so each case has no approval recorded and
  cannot be published until Trilogy Care's Clinical and Quality reviewers have checked the scripts and the
  answer key against the current SIRS provider guidelines and local procedures, and their names and the
  date are entered. The escalation routes are worded generically ("the approved pathway") on purpose:
  no phone number, team name or system is assumed. Reviewers replace them with the real ones.
*/

const SOURCE = {
  title: "Reportable incidents and SIRS: Provider guidelines (Aged Care Quality and Safety Commission)",
  version: "2.0, October 2026",
  reviewedOn: "",
};
const NO_APPROVAL = { owner: "", clinical: "", quality: "", approvedOn: "", effectiveOn: "", reviewOn: "" };
const TYPES = [
  { id: "t-fin", label: "Stealing or financial coercion by an aged care worker" },
  { id: "t-psych", label: "Psychological or emotional abuse" },
  { id: "t-neglect", label: "Neglect" },
  { id: "t-force", label: "Unreasonable use of force" },
];

type Roles = Record<"safety" | "clinical" | "incident" | "finance" | "note" | "wait" | "emergency", Pick<SignalAction, "role" | "feedback" | "consequence">>;
/** The same seven routes in every case; what each is worth depends on the case. */
const actions = (r: Roles): SignalAction[] => [
  {
    id: "act-safety",
    label: "Check the person’s immediate safety through the approved pathway",
    guidance: "Find out whether they’re safe and how they are right now.",
    ...r.safety,
  },
  { id: "act-clinical", label: "Ask for an urgent clinical assessment", guidance: "Through the approved clinical pathway.", ...r.clinical },
  { id: "act-incident", label: "Tell the incident and Quality lead now", guidance: "With what was seen, what was said, and what isn’t known.", ...r.incident },
  { id: "act-finance", label: "Send the invoice question to Finance", guidance: "", ...r.finance },
  { id: "act-note", label: "Make a routine note and leave it there", guidance: "", ...r.note },
  { id: "act-wait", label: "Wait until there’s more proof before telling anyone", guidance: "", ...r.wait },
  { id: "act-000", label: "Call 000", guidance: "For an immediate emergency.", ...r.emergency },
];
const WAIT = {
  role: "unsafe" as const,
  feedback:
    "Waiting for proof is how a concern stays unseen. You don’t need to be sure: an allegation or a reasonable suspicion is enough to pass on, and the people who assess it gather the rest.",
  consequence: "One week later (in this made-up timeline): no one has reviewed the three updates together. They are still in three different places.",
};
const NO_EMERGENCY = {
  role: "helpful" as const,
  feedback:
    "Nothing in these three updates describes an immediate emergency. If someone were in immediate danger or acutely unwell, 000 would be right, and you’d still tell the incident lead.",
  consequence: "",
};

export const SIGNAL_CASES: { id: "a" | "b" | "c"; name: string; teaches: string; data: SignalBlockData }[] = [
  {
    id: "a",
    name: "Money and pressure",
    teaches: "A pattern across sources that points to a worker. Escalate; don’t investigate.",
    data: {
      title: "Money and pressure",
      client: "Margaret Alder",
      role: "You’re Mrs Alder’s Care Partner, catching up on this morning’s updates.",
      intro: "Three ordinary updates. One client. What needs your attention?",
      awareAt: "2026-11-20T10:05",
      awareNote:
        "In this training case the provider is taken to have become aware when the voicemail was received and the three updates could be read together.",
      artefacts: [
        {
          id: "a-invoice",
          kind: "invoice",
          title: "Cleaning invoice, fortnight to 18 November",
          source: "Supplier invoice (cleaner engaged by the provider)",
          eventAt: "Service dates 5 to 18 November",
          receivedAt: "Thu 20 Nov, 8:45 am",
          context:
            "Service agreement excerpt: domestic assistance, 2 hours each fortnight. Any change to hours is agreed with the client and their Care Partner beforehand. No change is on file.",
          audio: "",
          passages: [
            {
              id: "a-i1",
              text: "Domestic assistance, 6 hours",
              amount: "$390.00",
              previous: "2 hours ($130.00) on each of the last two invoices",
              signal: "material",
              kind: "observed",
              why: "The hours tripled with no agreed change on file. That is a question worth asking. By itself it isn’t proof of anything.",
            },
            { id: "a-i2", text: "Additional services", amount: "$85.00", previous: "Not on earlier invoices", signal: "none", kind: "observed", why: "" },
            { id: "a-i3", text: "Travel", amount: "$12.00", previous: "$12.00 on each of the last two invoices", signal: "none", kind: "observed", why: "" },
          ],
        },
        {
          id: "a-note",
          kind: "note",
          title: "Gardener’s shift note",
          source: "Gardener (a different supplier), written after the visit",
          eventAt: "Tue 18 Nov, about 3:00 pm",
          receivedAt: "Thu 20 Nov, 9:15 am",
          context: "",
          audio: "",
          passages: [
            {
              id: "a-n1",
              text: "Mowed and edged the front lawn and cleared the back gutters.",
              amount: "",
              previous: "",
              signal: "none",
              kind: "observed",
              why: "",
            },
            {
              id: "a-n2",
              text: "Mrs Alder seemed upset and didn’t want to chat the way she usually does.",
              amount: "",
              previous: "",
              signal: "none",
              kind: "observed",
              why: "",
            },
            {
              id: "a-n3",
              text: "As I was packing up I heard the cleaner say to her, “Keep this between us or your visits may stop.”",
              amount: "",
              previous: "",
              signal: "material",
              kind: "observed",
              why: "The gardener heard this first-hand and wrote down the exact words. That makes it an observation, and the words matter: they sound like pressure to stay quiet.",
            },
            {
              id: "a-n4",
              text: "I reckon the cleaner is taking advantage of her.",
              amount: "",
              previous: "",
              signal: "material",
              kind: "hypothesis",
              why: "This is the gardener’s own conclusion, not something they saw. Pass it on as their view. The gardener is a source, not an investigator.",
            },
          ],
        },
        {
          id: "a-voicemail",
          kind: "voicemail",
          title: "Voicemail from Mrs Alder’s daughter",
          source: "Dana Alder, daughter. She doesn’t live with her mother.",
          eventAt: "Thu 20 Nov, 10:02 am",
          receivedAt: "Thu 20 Nov, 10:05 am",
          context: "Dana is her mother’s listed contact. She wasn’t at the house during the cleaner’s visits.",
          audio: "",
          passages: [
            {
              id: "a-v1",
              text: "Hi, it’s Dana Alder, Margaret’s daughter. I’m calling about Mum.",
              amount: "",
              previous: "",
              signal: "none",
              kind: "observed",
              why: "",
            },
            {
              id: "a-v2",
              text: "She told me last night that the cleaner asked for her bank card and her PIN.",
              amount: "",
              previous: "",
              signal: "material",
              kind: "reported",
              why: "Dana is passing on what her mother told her. It’s a serious allegation and it’s second-hand: record it as reported, in her words.",
            },
            {
              id: "a-v3",
              text: "And there’s a withdrawal on her statement that she can’t explain.",
              amount: "",
              previous: "",
              signal: "material",
              kind: "reported",
              why: "Reported by Dana. No one in the service has seen the statement. It’s a reason to escalate, not a finding.",
            },
            {
              id: "a-v4",
              text: "I haven’t spoken to the cleaner and I don’t know if anyone else was there.",
              amount: "",
              previous: "",
              signal: "none",
              kind: "observed",
              why: "",
            },
            { id: "a-v5", text: "Can someone please call me back today?", amount: "", previous: "", signal: "none", kind: "observed", why: "" },
          ],
        },
      ],
      actions: actions({
        safety: {
          role: "essential",
          feedback: "Yes. Before anything is classified, someone needs to know Mrs Alder is safe and how she is, without confronting the cleaner.",
          consequence: "",
        },
        clinical: {
          role: "helpful",
          feedback:
            "Reasonable if there’s any sign she’s unwell or very distressed. On these facts the first needs are her safety and getting this to the incident lead.",
          consequence: "",
        },
        incident: {
          role: "essential",
          feedback:
            "Yes, now. Three sources point the same way and one involves a worker engaged to deliver her care. The authorised team assesses it; your job is to hand it over clearly.",
          consequence: "",
        },
        finance: {
          role: "helpful",
          feedback: "The invoice does need querying, but as a billing question it would sit in a queue. By itself this misses what the other two updates add.",
          consequence: "",
        },
        note: {
          role: "insufficient",
          feedback: "A note records it, and no one acts on a note. An allegation involving a worker can’t be left there.",
          consequence: "Next week (in this made-up timeline): the note is on file. The cleaner’s next visit went ahead.",
        },
        wait: WAIT,
        emergency: NO_EMERGENCY,
      }),
      key: {
        connection: "yes",
        types: TYPES,
        typeId: "t-fin",
        priority: "p1",
        alsoAccept: ["unknown"],
        why: "The invoice alone proves nothing. Read together, the three updates raise an allegation, or at least a reasonable suspicion, that a worker engaged to deliver Mrs Alder’s care pressured her over money and asked for her bank card and PIN. That is connected with the delivery of her care, and it fits the reportable type for stealing or financial coercion by an aged care worker, which includes contracted workers. In this training case the reported conduct gives reasonable grounds to report to police, so the authorised team assesses it as Priority 1, and the provider notifies the Commission within 24 hours of becoming aware. None of that was yours to decide or to prove. Your part was to check she’s safe, keep the exact words, and escalate straight away without confronting the cleaner.",
        anchor: "Provider guidelines V2.0 (October 2026): reportable incident types; Priority 1 criteria. Reviewers to confirm the section references.",
        handover:
          "Client: Margaret Alder. Sources: cleaning invoice received 20 Nov 8:45 am; gardener’s shift note about 18 Nov 3:00 pm, received 20 Nov 9:15 am; voicemail from her daughter Dana Alder, 20 Nov 10:02 am.\n\nObserved: the invoice shows 6 hours of domestic assistance against 2 hours agreed, with no change on file. The gardener writes that he heard the cleaner say, “Keep this between us or your visits may stop.”\n\nReported: Dana says her mother told her the cleaner “asked for her bank card and her PIN”, and that there is “a withdrawal on her statement that she can’t explain”. Dana was not present. The gardener’s view is that the cleaner is taking advantage of her; that is his opinion.\n\nImmediate concern: Mrs Alder may be under pressure from a worker who is due to visit again. Her safety and how she is have not yet been checked.\n\nAction taken: escalated to the incident and Quality lead at 10:20 am on 20 Nov and asked for a safety check. I have not spoken to the cleaner.\n\nStill needed: Mrs Alder’s own account, if she wants to give it; the bank statement; when the cleaner is next booked; whether anyone else was present.",
        needed: [
          "Mrs Alder’s own account, if she wants to give it",
          "The bank statement",
          "When the cleaner is next due to visit",
          "Whether anyone else was present",
        ],
      },
      source: SOURCE,
      approval: NO_APPROVAL,
    },
  },
  {
    id: "b",
    name: "Worrying, but outside the SIRS type",
    teaches: "Not SIRS reportable on the facts doesn’t mean nothing to do.",
    data: {
      title: "Worrying, but is it SIRS?",
      client: "Tom Reyes",
      role: "You’re Mr Reyes’s Care Partner, catching up on this morning’s updates.",
      intro: "Three ordinary updates. One client. What needs your attention?",
      awareAt: "",
      awareNote:
        "No awareness time is set for this case: on the facts given there is no reportable incident to start a clock for. If new facts change that, the authorised team works out when the provider became aware.",
      artefacts: [
        {
          id: "b-invoice",
          kind: "invoice",
          title: "Gardening invoice, October to November",
          source: "Supplier invoice (gardener engaged by the provider)",
          eventAt: "Service dates 20 October to 14 November",
          receivedAt: "Mon 17 Nov, 9:00 am",
          context: "Care Partner note, 3 November: one-off hedge removal agreed with Mr Reyes beforehand. Quote of $420 accepted.",
          audio: "",
          passages: [
            {
              id: "b-i1",
              text: "Garden maintenance, 2 hours",
              amount: "$140.00",
              previous: "$140.00 on each of the last two invoices",
              signal: "none",
              kind: "observed",
              why: "",
            },
            {
              id: "b-i2",
              text: "One-off hedge removal",
              amount: "$420.00",
              previous: "Not on earlier invoices",
              signal: "distractor",
              kind: "observed",
              why: "The bill is higher, and the file shows the job was agreed beforehand at that price. An unusual figure with an ordinary explanation isn’t a signal.",
            },
          ],
        },
        {
          id: "b-note",
          kind: "note",
          title: "Gardener’s shift note",
          source: "Gardener, written after the visit",
          eventAt: "Fri 14 Nov, about 11:00 am",
          receivedAt: "Mon 17 Nov, 9:20 am",
          context: "",
          audio: "",
          passages: [
            { id: "b-n1", text: "Finished the hedge removal and tidied the side path.", amount: "", previous: "", signal: "none", kind: "observed", why: "" },
            {
              id: "b-n2",
              text: "Mr Reyes didn’t seem himself. He asked me twice what day it was and couldn’t find his keys, which isn’t like him.",
              amount: "",
              previous: "",
              signal: "material",
              kind: "observed",
              why: "The gardener saw this himself and says it’s new. A change like this needs prompt clinical review. It isn’t yours, or the gardener’s, to say what’s causing it.",
            },
            { id: "b-n3", text: "Might just be a bad night’s sleep.", amount: "", previous: "", signal: "none", kind: "hypothesis", why: "" },
          ],
        },
        {
          id: "b-voicemail",
          kind: "voicemail",
          title: "Voicemail from Mr Reyes’s daughter",
          source: "Carla Reyes, daughter. She lives interstate.",
          eventAt: "Mon 17 Nov, 9:48 am",
          receivedAt: "Mon 17 Nov, 9:50 am",
          context: "Carla is her father’s listed contact.",
          audio: "",
          passages: [
            { id: "b-v1", text: "Hi, it’s Carla Reyes, Tom’s daughter.", amount: "", previous: "", signal: "none", kind: "observed", why: "" },
            {
              id: "b-v2",
              text: "My cousin Lee has been round at Dad’s a lot lately and I think he’s leaning on him for money.",
              amount: "",
              previous: "",
              signal: "material",
              kind: "reported",
              why: "Carla’s report of possible pressure over money. It may or may not be so, and it needs safeguarding action either way.",
            },
            {
              id: "b-v3",
              text: "Lee isn’t one of your workers, he’s family, and it’s not when the carers are there.",
              amount: "",
              previous: "",
              signal: "material",
              kind: "reported",
              why: "This is what decides the SIRS question on these facts: the person said to be applying pressure isn’t a worker of the provider, and it isn’t connected with the delivery of care.",
            },
            { id: "b-v4", text: "Dad wouldn’t tell me how much.", amount: "", previous: "", signal: "none", kind: "reported", why: "" },
          ],
        },
      ],
      actions: actions({
        safety: { role: "essential", feedback: "Yes. He may be newly confused and under pressure at home: someone needs to know how he is.", consequence: "" },
        clinical: {
          role: "essential",
          feedback: "Yes. A new change in thinking or memory needs prompt clinical review. Don’t assume the cause.",
          consequence: "",
        },
        incident: {
          role: "essential",
          feedback:
            "Yes. Possible financial pressure from a family member needs safeguarding action through the approved route, whether or not it turns out to be reportable under SIRS.",
          consequence: "",
        },
        finance: {
          role: "insufficient",
          feedback:
            "The invoice is already explained: the hedge removal was agreed beforehand. There’s nothing for Finance here, and the real concerns are in the other two updates.",
          consequence: "",
        },
        note: {
          role: "insufficient",
          feedback: "“Probably not SIRS” doesn’t mean a note is enough. New confusion and possible pressure over money both need someone to act.",
          consequence: "Next week (in this made-up timeline): the note is on file. No one has seen Mr Reyes.",
        },
        wait: WAIT,
        emergency: NO_EMERGENCY,
      }),
      key: {
        connection: "no",
        types: TYPES,
        typeId: "",
        priority: "none",
        alsoAccept: ["unknown"],
        why: "On the facts given, the person said to be pressuring Mr Reyes is a family member, not a worker or contractor of the provider, and it isn’t connected with the delivery of his care. So the SIRS type for stealing or financial coercion by an aged care worker isn’t established, and the higher invoice has an ordinary explanation. That is not the same as nothing to do. New confusion needs prompt clinical review, and possible financial pressure from family needs safeguarding action. A sudden change in thinking isn’t, by itself, a SIRS reportable type either. The authorised team reassesses if new facts show a connection with his care or a different reportable type.",
        anchor:
          "Provider guidelines V2.0 (October 2026): connection with funded aged care; reportable incident types. Reviewers to confirm the section references.",
        handover:
          "Client: Tom Reyes. Sources: gardener’s shift note about 14 Nov 11:00 am, received 17 Nov 9:20 am; voicemail from his daughter Carla Reyes, 17 Nov 9:48 am; gardening invoice received 17 Nov.\n\nObserved: the gardener writes that Mr Reyes “asked me twice what day it was and couldn’t find his keys, which isn’t like him”. The invoice is $420 higher than usual; the file shows a one-off hedge removal agreed on 3 Nov at that price.\n\nReported: Carla says, “My cousin Lee has been round at Dad’s a lot lately and I think he’s leaning on him for money.” She says Lee “isn’t one of your workers, he’s family, and it’s not when the carers are there”. She doesn’t know how much.\n\nImmediate concern: a new change in Mr Reyes’s thinking or memory, cause unknown, and possible pressure over money at home.\n\nAction taken: asked for an urgent clinical assessment and escalated to the incident and Quality lead for safeguarding at 10:05 am on 17 Nov.\n\nStill needed: how Mr Reyes is today; his own account, if he wants to give it; whether anyone connected with his care is involved.",
        needed: ["How Mr Reyes is today", "His own account, if he wants to give it", "Whether anyone connected with his care is involved"],
      },
      source: SOURCE,
      approval: NO_APPROVAL,
    },
  },
  {
    id: "c",
    name: "Reportable, without a Priority 1 condition",
    teaches: "A reportable type with no Priority 1 condition on the facts. The response is still prompt.",
    data: {
      title: "What the gardener overheard",
      client: "Helen Park",
      role: "You’re Mrs Park’s Care Partner, catching up on this afternoon’s updates.",
      intro: "Three ordinary updates. One client. What needs your attention?",
      awareAt: "2026-11-19T16:40",
      awareNote: "In this training case the provider is taken to have become aware when the voicemail was received and the updates could be read together.",
      artefacts: [
        {
          id: "c-invoice",
          kind: "invoice",
          title: "Personal care invoice, fortnight to 16 November",
          source: "Supplier invoice (care worker engaged by the provider)",
          eventAt: "Service dates 3 to 16 November",
          receivedAt: "Wed 19 Nov, 2:10 pm",
          context:
            "Rate notice, 1 November: the hourly rate for personal care was corrected from $72 to $78 from 1 November. Mrs Park and her Care Partner were told in writing.",
          audio: "",
          passages: [
            {
              id: "c-i1",
              text: "Personal care, 4 visits of 1 hour",
              amount: "$312.00",
              previous: "$288.00 on each of the last two invoices",
              signal: "distractor",
              kind: "observed",
              why: "It’s higher, and the rate notice on file explains exactly why. A documented rate correction isn’t a signal.",
            },
            { id: "c-i2", text: "Travel", amount: "$16.00", previous: "$16.00 on each of the last two invoices", signal: "none", kind: "observed", why: "" },
          ],
        },
        {
          id: "c-note",
          kind: "note",
          title: "Gardener’s shift note",
          source: "Gardener (a different supplier), written after the visit",
          eventAt: "Thu 13 Nov, about 10:30 am",
          receivedAt: "Wed 19 Nov, 3:05 pm",
          context: "",
          audio: "",
          passages: [
            { id: "c-n1", text: "Weeded the front beds and pruned the roses.", amount: "", previous: "", signal: "none", kind: "observed", why: "" },
            {
              id: "c-n2",
              text: "While I was by the window I heard the care worker tell Mrs Park she was “useless” and “more trouble than she’s worth”.",
              amount: "",
              previous: "",
              signal: "material",
              kind: "observed",
              why: "First-hand, with the exact words. Demeaning comments from a worker during a visit are connected with the delivery of her care.",
            },
            {
              id: "c-n3",
              text: "It’s the third visit I’ve heard that sort of thing.",
              amount: "",
              previous: "",
              signal: "material",
              kind: "observed",
              why: "The gardener’s own account that it has happened more than once. A pattern matters.",
            },
            { id: "c-n4", text: "She went very quiet afterwards.", amount: "", previous: "", signal: "none", kind: "observed", why: "" },
          ],
        },
        {
          id: "c-voicemail",
          kind: "voicemail",
          title: "Voicemail from Mrs Park’s son",
          source: "Daniel Park, son.",
          eventAt: "Wed 19 Nov, 4:36 pm",
          receivedAt: "Wed 19 Nov, 4:40 pm",
          context: "Daniel is his mother’s listed contact. He isn’t at the house during care visits.",
          audio: "",
          passages: [
            { id: "c-v1", text: "It’s Daniel Park, Helen’s son.", amount: "", previous: "", signal: "none", kind: "observed", why: "" },
            {
              id: "c-v2",
              text: "Mum says she dreads Thursdays now because of how the carer talks to her.",
              amount: "",
              previous: "",
              signal: "material",
              kind: "reported",
              why: "Daniel passing on what his mother says. Reported, and it lines up with what the gardener heard.",
            },
            {
              id: "c-v3",
              text: "She keeps repeating it: “I’m more trouble than I’m worth.”",
              amount: "",
              previous: "",
              signal: "material",
              kind: "reported",
              why: "Her words, as her son reports them. They match the gardener’s note closely.",
            },
            {
              id: "c-v4",
              text: "She hasn’t seen the doctor about any of this, and I’m not saying anyone’s hurt her.",
              amount: "",
              previous: "",
              signal: "none",
              kind: "reported",
              why: "",
            },
            { id: "c-v5", text: "I’d like someone to ring me.", amount: "", previous: "", signal: "none", kind: "observed", why: "" },
          ],
        },
      ],
      actions: actions({
        safety: {
          role: "essential",
          feedback: "Yes. Mrs Park is said to dread the visits, and another one is coming. Someone needs to check how she is and what she wants to happen.",
          consequence: "",
        },
        clinical: {
          role: "helpful",
          feedback:
            "Reasonable. A clinical view of how this is affecting her could also change the assessment. On these facts the first steps are her wellbeing and the incident lead.",
          consequence: "",
        },
        incident: {
          role: "essential",
          feedback:
            "Yes, promptly. Two sources describe demeaning comments by a worker during visits. A 30-day reporting window later on is not 30 days to pass it on.",
          consequence: "",
        },
        finance: {
          role: "insufficient",
          feedback: "The invoice is explained by the rate notice. There’s nothing to query, and it’s not what matters here.",
          consequence: "",
        },
        note: {
          role: "insufficient",
          feedback: "An allegation about how a worker treats a client can’t be left in a routine note.",
          consequence: "Next Thursday (in this made-up timeline): the same worker visits again. The note is on file.",
        },
        wait: WAIT,
        emergency: NO_EMERGENCY,
      }),
      key: {
        connection: "yes",
        types: TYPES,
        typeId: "t-psych",
        priority: "p2",
        alsoAccept: ["unknown"],
        why: "A gardener’s first-hand account and a son’s report describe repeated demeaning comments by a worker engaged to deliver Mrs Park’s care, during visits. In this training case that supports the reportable type of psychological or emotional abuse. No Priority 1 condition is established on the facts supplied: there’s no known treatment need and nothing indicating a report to police. Harm that could reasonably have been expected doesn’t, by itself, make an incident Priority 1 under the October 2026 guidelines. So the authorised team records a Priority 2 assessment, and the provider notifies the Commission within 30 calendar days of becoming aware. That window is the provider’s outer limit. The internal response, and looking after Mrs Park, happen now. If a later clinical review found she needed treatment for the effect on her, the authorised reviewer would reassess the priority.",
        anchor: "Provider guidelines V2.0 (October 2026): reportable incident types; Priority 1 and Priority 2. Reviewers to confirm the section references.",
        handover:
          "Client: Helen Park. Sources: gardener’s shift note about 13 Nov 10:30 am, received 19 Nov 3:05 pm; voicemail from her son Daniel Park, 19 Nov 4:36 pm; personal care invoice received 19 Nov.\n\nObserved: the gardener writes that he heard the care worker tell Mrs Park she was “useless” and “more trouble than she’s worth”, and that “it’s the third visit I’ve heard that sort of thing”. The invoice is $24 higher; the rate notice of 1 Nov explains it.\n\nReported: Daniel says his mother “dreads Thursdays now because of how the carer talks to her” and keeps repeating, “I’m more trouble than I’m worth.” He says she hasn’t seen the doctor and he isn’t saying anyone has hurt her.\n\nImmediate concern: Mrs Park’s wellbeing, and that the same worker is due again on Thursday.\n\nAction taken: escalated to the incident and Quality lead at 4:55 pm on 19 Nov and asked for a wellbeing check. I have not spoken to the worker.\n\nStill needed: Mrs Park’s own account and wishes; whether she needs any treatment or support; the worker’s roster.",
        needed: ["Mrs Park’s own account, and what she wants to happen", "Whether she needs treatment or support", "When the worker is next rostered"],
      },
      source: SOURCE,
      approval: NO_APPROVAL,
    },
  },
];
