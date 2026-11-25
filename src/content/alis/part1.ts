import type { AlisModule, AlisQuestion } from "../alisCourse";

/* ALIS Part 1: Incident management systems. In the Hub's own words; see content/alisCourse.ts. */

type Opt = AlisQuestion["options"][number];
/** An answer option: `right` marks the one correct answer. */
export const opt = (id: string, text: string, feedback: string, right = false): Opt => ({ id, text, feedback, ...(right && { correct: true as const }) });

const PRIORITY_VERIFY =
  "Confirm the Priority 1 and Priority 2 criteria and timeframes against the current SIRS provider guidelines and the Aged Care Rules 2025.";

export const ALIS_PART_1: AlisModule[] = [
  {
    part: 1,
    n: 1,
    slug: "alis-p1-introduction-to-the-sirs",
    title: "Introduction to the SIRS",
    summary: "Why incident management matters, what the law asks of providers, and when an incident must be reported to the Commission.",
    outcome: "Explain your role in managing incidents and when a reportable incident must be notified to the Commission.",
    minutes: 15,
    explore: [
      "why effective incident management matters",
      "your role and obligations in managing incidents",
      "your role and obligations in reporting incidents",
      "why reporting to the SIRS is important",
    ],
    blocks: [
      {
        kind: "flip",
        id: "reflect",
        title: "What do you already know?",
        intro: "Before you start, think about each question, then turn the card to compare.",
        cards: [
          {
            front: "How confident are you with incident management systems?",
            back: "There's no wrong answer. Keep your answer in mind: by the end of this part you should be able to explain what an IMS is and how you use it.",
          },
          {
            front: "What is the Serious Incident Response Scheme (SIRS)?",
            back: "Introduced in 2021, the SIRS made every aged care provider responsible for preventing and managing incidents, learning from incident data, and notifying reportable incidents to the Aged Care Quality and Safety Commission. It has covered care at home since December 2022, and under the Aged Care Act 2024 it applies to Support at Home providers like Trilogy Care, as obligations for incident management and reportable incidents.",
          },
          {
            front: "Why do incident management and reportable incidents matter?",
            back: "Older people have the right to be safe and to live with dignity, free from abuse, neglect and exploitation. Managing incidents well reduces that risk, builds providers' skills, and stops preventable incidents happening again.",
          },
          {
            front: "Which incidents go in the incident management system (IMS)?",
            back: "All of them: incidents that have happened, and those alleged or suspected to have happened. Recording them is good practice and a legal requirement.",
          },
        ],
      },
      {
        kind: "text",
        id: "law",
        title: "What the law asks of providers",
        body: "Provider obligations are set out in the **Aged Care Act 2024** and the **Aged Care Rules 2025** (and, where they apply, grant agreements). You can find both on the Federal Register of Legislation.\n\nRelevant registered providers (categories 1, 3, 4, 5 and 6) must:\n\n- have an effective incident management system (IMS), and record and manage every incident in it\n- manage incidents and take reasonable steps to prevent them\n- never victimise or discriminate against anyone who raises an incident\n- help people understand their rights under the Statement of Rights and the Aged Care Code of Conduct\n\nProviders in categories 4, 5 and 6 must also meet the strengthened Aged Care Quality Standards. When something goes wrong, the **Aged Care Open Disclosure Framework and Guidance** sets out the open conversation a provider must have with the older person and their supporters.\n\nThe **SIRS** sits alongside all of this. It's how providers notify the Commission of a defined set of reportable incidents, and what they're doing about them.",
        verify:
          "Confirm which registration categories the IMS and Quality Standards obligations apply to under the Aged Care Rules 2025, and which apply to Trilogy Care.",
      },
      {
        kind: "steps",
        id: "elements",
        title: "Six essential elements of an effective IMS",
        intro: "Every relevant provider needs an IMS that supports these six elements. Work through them in order: you'll meet each one again in Part 2.",
        steps: [
          {
            title: "Ensure leadership and a safety culture",
            body: "Leaders set the tone: incidents are taken seriously, people feel safe to speak up, and the focus is learning, not blame.",
          },
          { title: "Respond to the incident", body: "Meet the immediate needs of the people affected, assess the harm and reduce any ongoing risk." },
          {
            title: "Record and report the incident",
            body: "Capture what happened in the IMS, and make any notifications required, including to the Commission for reportable incidents.",
          },
          { title: "Analyse the incident", body: "Understand the causes and what in your systems and practice could change." },
          { title: "Implement actions", body: "Put improvements in place to prevent similar incidents, and check they work." },
          { title: "Close the loop", body: "Share what was learnt, look at trends and keep improving the quality and safety of care." },
        ],
      },
      {
        kind: "callout",
        id: "everyone",
        style: "important",
        label: "Everyone's responsibility",
        body: "Managing incidents, near misses and suspected or alleged incidents is everyone's job. Know who to speak to in your organisation, respond without delay, and make sure the incident is recorded in the IMS. If you're not sure of your role, ask your manager.",
      },
      {
        kind: "text",
        id: "priorities",
        title: "Priority 1 and Priority 2 reportable incidents",
        body: "Every incident goes in the IMS. If it's one of the **eight reportable incident types**, the provider must also notify the Commission through the SIRS (the SIRS notification in the My Aged Care service and support portal), classified as Priority 1 or Priority 2.\n\n- **Priority 1**: notify the Commission **within 24 hours** of becoming aware, and give all the required details **within 5 days**.\n- **Priority 2**: any reportable incident that isn't Priority 1. Notify the Commission **within 30 calendar days** of becoming aware.\n\nSignificant new information about a reported incident must be given to the Commission as soon as reasonably practicable. The incident may also need to go to the police, the coroner or the Australian Health Practitioner Regulation Agency (Ahpra). Incidents that are unlawful, or may be criminal, must be reported to police within 24 hours of becoming aware.\n\nIncidents that aren't reportable must still be recorded and managed in the IMS.",
        verify: PRIORITY_VERIFY,
      },
      {
        kind: "flip",
        id: "priority-one",
        title: "What makes an incident Priority 1?",
        intro: "A reportable incident is Priority 1 when any of these is true. Turn each card.",
        cards: [
          {
            front: "Harm that needs treatment",
            back: "It caused, or could reasonably have been expected to cause, physical or psychological injury or discomfort that needs medical or psychological treatment to resolve.",
          },
          { front: "Reasonable grounds to call police", back: "There are reasonable grounds to report the incident to the police." },
          { front: "Unlawful sexual contact or inappropriate sexual conduct", back: "Always Priority 1 when it's inflicted on an older person." },
          { front: "Unexpected death", back: "Always Priority 1 when the death resulted from the care delivered, or from a failure to deliver it." },
          {
            front: "Unexplained absence",
            back: "Always Priority 1 when the older person goes missing during the delivery of services and there are reasonable grounds to call police.",
          },
        ],
        verify: PRIORITY_VERIFY,
      },
      {
        kind: "sort",
        id: "try-priority",
        title: "Priority 1 or Priority 2?",
        prompt: "Each of these is a reportable incident. Is it Priority 1 or Priority 2?",
        groups: [
          { id: "p1", label: "Priority 1" },
          { id: "p2", label: "Priority 2" },
        ],
        items: [
          {
            id: "injury",
            text: "While helping Vera dress, a worker handles her roughly. Her wrist is injured and her GP treats it.",
            group: "p1",
            feedback:
              "The harm needs medical treatment to resolve, so it's Priority 1. Notify the Commission within 24 hours of becoming aware, with all the required details within 5 days.",
          },
          {
            id: "mocked",
            text: "A worker mocks Ewan's memory in front of his friend. He's upset that afternoon but settles. He needs no treatment, and there are no reasonable grounds to call police.",
            group: "p2",
            feedback:
              "It's reportable, but no Priority 1 criterion applies: no harm needing treatment and no grounds to call police. That makes it Priority 2: notify within 30 calendar days.",
          },
          {
            id: "missing",
            text: "Noreen goes missing while a worker is with her at the shops. They can't find her, and there are reasonable grounds to report it to police.",
            group: "p1",
            feedback: "An unexplained absence during the delivery of services, with reasonable grounds to call police, is always Priority 1.",
          },
        ],
        verify: `${PRIORITY_VERIFY} Confirm the Priority 1 or 2 answer for each of the three situations.`,
      },
      {
        kind: "jobaid",
        id: "first-steps-aid",
        title: "Job aid: incident first steps",
        intro:
          "Trilogy Care's own first steps for when you think a reportable incident may have happened, in a client's home or on the phone. Open it now, so you know where it is before you need it.",
        snippetId: "sirs-first-steps",
        why: "Priorities and timeframes come after the first minutes, and this is what Trilogy Care asks you to do in them, starting with the person's safety.",
      },
      {
        kind: "reveal",
        id: "eight-types",
        title: "The eight reportable incident types",
        intro: "Open each type for a one-line description. Part 3 covers each one as it applies in home and community settings.",
        items: [
          { title: "Unreasonable use of force", body: "Anything from a deliberate, violent attack to unwarranted rough handling." },
          {
            title: "Unlawful sexual contact or inappropriate sexual conduct",
            body: "Any sexual contact or conduct by a worker, and any non-consensual sexual contact or conduct.",
          },
          {
            title: "Psychological or emotional abuse",
            body: "Conduct that causes, or could reasonably be expected to cause, psychological or emotional distress.",
          },
          { title: "Unexpected death", body: "In home settings, a death that resulted from the care delivered or a failure to deliver it." },
          {
            title: "Stealing or financial coercion",
            body: "Stealing by a worker, or a worker's coercive, deceptive or controlling conduct about the person's finances.",
          },
          { title: "Neglect", body: "Reckless or intentional failures, significant failures or ongoing poor conduct in delivering care." },
          { title: "Inappropriate use of restrictive practices", body: "Any restrictive practice used in a way that doesn't meet the legal requirements." },
          {
            title: "Unexplained absence",
            body: "In home settings, the person goes missing during the delivery of services and there are reasonable grounds to report it to police.",
          },
        ],
        verify:
          "Five types are defined the same in every setting; unexpected death, restrictive practices and unexplained absence differ for home and community settings. Confirm the short descriptions against the Aged Care Rules 2025 (s16-5).",
      },
      {
        kind: "text",
        id: "responsibilities",
        title: "When a serious incident happens",
        body: "Providers need a systematic way to reduce risk and to respond quickly when something goes wrong. When a serious incident happens, the provider must:\n\n1. Check the person affected and anyone else involved are safe.\n2. Respond promptly, and escalate or call police where needed.\n3. Talk with the older person (and their representatives, if they wish) about what happened, as long as that won't cause more harm.\n4. Record it in the IMS, as with every incident.\n5. Decide whether it's a Priority 1 or Priority 2 reportable incident.\n6. Notify the Commission within the timeframe, answering every question in the SIRS notification accurately.\n7. Meet any other mandatory reporting requirements.\n8. Look for causes, in this incident and in any pattern of similar ones.\n9. Work with the older person to resolve it, keep them updated, share findings and ask what outcome they want.\n10. Answer any request from the Commission.\n11. Record what happened afterwards, follow up with everyone involved, and analyse incident data regularly to prevent repeats.\n\nYour job at Trilogy Care is to know your part in this and to raise every incident through our procedures.",
      },
      {
        kind: "steps",
        id: "commission",
        title: "The Commission's role in the SIRS",
        intro:
          "The Commission regulates aged care end to end. With reportable incidents, its first priority is to understand quickly whether an older person is at immediate risk.",
        steps: [
          { title: "Considers each notification", body: "Looks at every SIRS notification as a whole, including the provider's response." },
          { title: "Supports providers", body: "Helps registered providers build and run effective incident management systems." },
          { title: "Builds capability", body: "Builds providers' ability to prevent and manage reportable incidents." },
          { title: "Oversees and responds", body: "Oversees how providers notify and manage reportable incidents, and acts where it needs to." },
          { title: "Shares what it learns", body: "Analyses incident information and shares trends and systemic issues with the sector." },
        ],
      },
    ],
    short: {
      brief:
        "Every incident, including near misses and alleged or suspected incidents, is **recorded and managed in the IMS**. That's everyone's responsibility: know who to speak to, respond without delay, and make sure it's recorded.\n\nIf it's one of the **eight reportable incident types**, the provider also notifies the Commission through the SIRS:\n\n- **Priority 1**: within **24 hours** of becoming aware, with all the required details **within 5 days**. For example, when the harm needs medical or psychological treatment (or could reasonably have been expected to), or there are reasonable grounds to call police.\n- **Priority 2**: any reportable incident that isn't Priority 1, within **30 calendar days**.\n\nThese obligations are set out in the **Aged Care Act 2024** and the **Aged Care Rules 2025**.",
      confidence: "I can tell a Priority 1 incident from a Priority 2 one.",
    },
    keyPoints: [
      "Every relevant provider must have and use an incident management system (IMS).",
      "All incidents, including near misses and alleged or suspected incidents, are recorded and managed in the IMS.",
      "The eight reportable incident types are also notified to the Commission through the SIRS.",
      "Priority 1: within 24 hours, with all details within 5 days. Priority 2: within 30 calendar days.",
      "Managing incidents is everyone's responsibility.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "Which best describes what an effective incident management system helps a provider do?",
        options: [
          opt(
            "a",
            "Strengthen systems, improve the quality and safety of care, build skills to respond, reduce preventable incidents and build a safety culture",
            "Yes. These are the benefits of an effective IMS.",
            true,
          ),
          opt("b", "Decide which incidents can be left out of the record", "No. Every incident, including near misses, belongs in the IMS."),
          opt("c", "Avoid having to notify the Commission", "No. An IMS supports reporting; it doesn't replace notifying reportable incidents."),
          opt("d", "Keep incident information away from the older person and their family", "No. Open disclosure means being open with the people affected."),
        ],
        explain:
          "An effective IMS strengthens systems, improves the quality and safety of care, builds skills to resolve and respond to incidents, reduces preventable incidents and builds a safety culture.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "Which set of responsibilities belongs to a provider when an incident happens?",
        options: [
          opt(
            "a",
            "Assess and respond, support the people affected, record it in the IMS, notify authorities as the law requires, and act to prevent it happening again",
            "Yes. That's the whole cycle of incident management.",
            true,
          ),
          opt("b", "Record it in the IMS only if it's a reportable incident", "No. Every incident is recorded, reportable or not."),
          opt(
            "c",
            "Notify the Commission, then wait for its instructions before doing anything else",
            "No. The provider responds and supports people straight away.",
          ),
          opt("d", "Respond to the person, and record it only if they make a complaint", "No. Recording doesn't depend on a complaint."),
        ],
        explain:
          "Providers assess and respond to incidents, support those affected, record the details in the IMS, notify the relevant authorities as the law requires, and use the IMS to prevent similar incidents and improve care.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "When must a provider notify the Commission of an incident?",
        options: [
          opt("a", "When it meets the definition of a reportable incident", "Correct. Reportable incidents are notified through the SIRS.", true),
          opt("b", "Only when the older person asks for it to be reported", "No. The duty to notify doesn't depend on a request."),
          opt("c", "When it has happened more than once and could become a complaint", "No. One reportable incident is enough; repetition isn't the test."),
          opt("d", "Whenever the provider decides it would be helpful", "No. The test is the legal definition of a reportable incident."),
        ],
        explain:
          "The Commission must be notified when an incident meets the definition of a reportable incident. Every other incident is still managed in the IMS.",
      },
      {
        id: "q4",
        from: "new",
        prompt: "A provider classifies a reportable incident as Priority 1. What must it do?",
        options: [
          opt("a", "Notify the Commission within 24 hours of becoming aware, and give all required details within 5 days", "Correct.", true),
          opt(
            "b",
            "Notify the Commission within 5 days of becoming aware",
            "No. Five days is for the remaining details; the first notice is due within 24 hours.",
          ),
          opt("c", "Notify the Commission within 30 calendar days", "No. That's the Priority 2 timeframe."),
          opt("d", "Record it in the IMS; the Commission only needs Priority 2 incidents", "No. Priority 1 incidents are the most urgent to notify."),
        ],
        explain: "Priority 1 reportable incidents are notified within 24 hours of becoming aware, with all required details within 5 days.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "Which incident is Priority 2?",
        options: [
          opt(
            "a",
            "A reportable incident that doesn't meet any Priority 1 criterion, notified within 30 calendar days",
            "Correct. Priority 2 is every reportable incident that isn't Priority 1.",
            true,
          ),
          opt("b", "Any incident that isn't one of the eight reportable types", "No. Those aren't notified at all; they're managed in the IMS."),
          opt("c", "A reportable incident where there are reasonable grounds to call police", "No. Reasonable grounds to call police make it Priority 1."),
          opt("d", "A near miss", "No. Near misses aren't reportable, though they're recorded in the IMS."),
        ],
        explain:
          "A Priority 2 reportable incident is any reportable incident that doesn't meet the Priority 1 criteria. It's notified within 30 calendar days of becoming aware.",
      },
    ],
  },
  {
    part: 1,
    n: 2,
    slug: "alis-p1-what-is-an-ims",
    title: "What is an Incident Management System?",
    summary: "The key ideas, the four components of an IMS, the six essential elements, and what an effective IMS does for older people and your team.",
    outcome: "Describe the four components and six essential elements of an effective incident management system.",
    minutes: 12,
    explore: [
      "the key components of an IMS",
      "the six essential elements of an effective IMS",
      "your role and responsibilities as a leader",
      "the benefits of an effective IMS, including meeting the strengthened Quality Standards",
    ],
    blocks: [
      {
        kind: "text",
        id: "why",
        title: "Why an IMS?",
        body: "Registered providers must deliver safe, quality funded aged care services. That includes effective systems for managing risk, and managing the incidents that happen in connection with care.\n\nWe all have a part in preventing and managing incidents. Leaders in particular set a culture that values open disclosure, accountability and continuous improvement.",
      },
      {
        kind: "reveal",
        id: "concepts",
        title: "Key ideas",
        intro: "Open each idea.",
        items: [
          {
            title: "Incident",
            body: "Any act, omission, event or circumstance in connection with providing aged care services that has caused, or could reasonably have been expected to cause, harm to the older person or anyone else (a worker, for example). It includes incidents that are alleged or suspected, raised by older people, visitors or workers.",
          },
          {
            title: "Near miss",
            body: "Something that didn't cause harm but could have. For example, a mop bucket left at the top of a client's back steps that nobody tripped over. Recording near misses helps you learn about risks before someone is hurt.",
          },
          {
            title: "Incident management system (IMS)",
            body: "The policies, procedures, processes and practices an organisation uses to identify, manage, resolve and prevent incidents and near misses, step by step.",
          },
          {
            title: "In connection with providing aged care services",
            body: "Incidents that happen at the organisation; while services are delivered (including taking someone to an appointment or an activity); while workers carry out their duties; or later, because of a service that was given, or should have been and wasn't.",
          },
        ],
      },
      {
        kind: "flip",
        id: "components",
        title: "The four key components of an IMS",
        intro: "Every effective IMS has these four components. Turn each card.",
        cards: [
          { front: "Policies and procedures", back: "How you'll identify, respond to, manage, resolve and learn from incidents." },
          { front: "A recording tool", back: "An electronic or paper-based system that captures information about each incident." },
          { front: "A staff training program", back: "Training that shows how the system works and everyone's roles and responsibilities in it." },
          {
            front: "Governance and accountability",
            back: "Arrangements that oversee how the system runs and make sure it drives continuous improvement.",
          },
        ],
      },
      {
        kind: "match",
        id: "match-components",
        title: "Match the components",
        intro: "Check you can tell the four components apart before you see how each IMS is tailored.",
        prompt: "Match each component to what it does.",
        pairs: [
          { left: "Policies and procedures", right: "Set out how you'll identify, respond to, manage, resolve and learn from incidents" },
          { left: "A recording tool", right: "Captures information about each incident, electronically or on paper" },
          { left: "A staff training program", right: "Shows how the system works and everyone's roles and responsibilities in it" },
          { left: "Governance and accountability", right: "Oversees how the system runs and makes sure it drives continuous improvement" },
        ],
        feedback:
          "Every effective IMS has all four. The design is tailored to the organisation, but none can be left out: a recording tool nobody's trained to use, or policies nobody oversees, won't do the job.",
      },
      {
        kind: "text",
        id: "tailored",
        title: "Every IMS is tailored",
        body: "The four components are common to every IMS, but the design is tailored to:\n\n- the size of the organisation\n- where it operates\n- the services it provides\n- the older people it supports\n\nTrain regularly so the IMS is understood and used. For services in a home or community setting, training should cover how workers raise and manage incidents when they're working in someone's home or out in the community.",
      },
      {
        kind: "scenario",
        id: "try-it",
        title: "Which component needs attention?",
        context:
          "Odette coordinates a home-care team. At a team meeting, three newer support workers mention near misses on recent visits: a loose stair rail and a slippery bath mat. None was recorded. One didn't know near misses count; two weren't sure how to use the recording form on their phones. The form itself works well.",
        prompt: "Which IMS component most needs attention?",
        choices: [
          {
            id: "a",
            text: "A staff training program",
            verdict: "best",
            feedback:
              "Yes. Training shows how the system works and everyone's role in it, including how to raise incidents from a client's home. Remind people often why near misses matter.",
          },
          {
            id: "b",
            text: "A new recording tool",
            verdict: "risky",
            feedback: "Not this time. The form works. The gap is knowing that near misses count and how to use the form, and a new tool wouldn't fix that.",
          },
          {
            id: "c",
            text: "Governance and accountability",
            verdict: "acceptable",
            feedback:
              "Partly. Oversight should notice when near-miss reports are low, and check the fix works. But the gap Odette found is knowledge, and training fixes that.",
          },
        ],
      },
      {
        kind: "steps",
        id: "elements",
        title: "The six essential elements, in a cycle",
        intro: "An IMS supports continuous improvement in quality and safety through six elements. The last leads back to the first.",
        steps: [
          { title: "1. Ensure leadership and a safety culture", body: "Visible leadership, and a culture where people report incidents and learn from them." },
          { title: "2. Respond to the incident", body: "Look after the people affected first, assess the harm and reduce ongoing risk." },
          { title: "3. Record and report the incident", body: "Record it in the IMS and make the notifications required." },
          { title: "4. Analyse the incident", body: "Find the underlying causes." },
          { title: "5. Implement actions", body: "Make changes that prevent similar incidents, and monitor them." },
          { title: "6. Close the loop", body: "Share lessons, review trends and keep improving." },
        ],
      },
      {
        kind: "text",
        id: "benefits",
        title: "What an effective IMS gives you",
        body: "An effective IMS:\n\n- supports a blame-free culture focused on learning, so workers report incidents (and stay)\n- helps you understand risk while meeting older people's needs and preferences\n- supports care and assessment planning\n- gives older people confidence in the care they receive\n- helps prevent incidents and keep improving services\n- helps meet broader obligations, including **strengthened Aged Care Quality Standard 2: The organisation, Outcome 2.5 Incident management**",
      },
    ],
    short: {
      brief:
        "An **incident** is any act, omission, event or circumstance in connection with providing aged care services that caused, or could reasonably have been expected to cause, harm. It includes alleged or suspected incidents. A **near miss** didn't cause harm but could have: record it too.\n\nEvery IMS has **four key components**:\n\n- policies and procedures\n- a recording tool\n- a staff training program\n- governance and accountability\n\nThe design is tailored to the organisation's size, location, services and the older people it supports.\n\nAn IMS supports **six essential elements**, in a cycle: ensure leadership and a safety culture; respond to the incident; record and report the incident; analyse the incident; implement actions; close the loop.",
      confidence: "I can name the four components and six elements of an IMS.",
    },
    keyPoints: [
      "An incident includes harm that happened, could reasonably have happened, or is alleged or suspected.",
      "Near misses are recorded too: they're how you learn before someone is hurt.",
      "Four components: policies and procedures, a recording tool, a training program, governance and accountability.",
      "Six elements: leadership and safety culture, respond, record and report, analyse, implement actions, close the loop.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "Caterina is helping a provider build its IMS. Which list contains only the four key components she needs to include?",
        options: [
          opt(
            "a",
            "Policies and procedures, a recording tool, a training program, and governance and accountability arrangements",
            "Correct. Those are the four.",
            true,
          ),
          opt(
            "b",
            "Policies and procedures, an online complaints database, a training program, and a mission statement",
            "No. A complaints database and a mission statement aren't IMS components.",
          ),
          opt("c", "A recording tool, a satisfaction survey, a staff roster, and governance arrangements", "No. Surveys and rosters aren't IMS components."),
          opt("d", "A training program, a recording tool, a marketing plan, and a complaints poster", "No. Two of these aren't IMS components."),
        ],
        explain:
          "The four key components are policies and procedures; an electronic or paper-based recording tool; a training program; and governance and accountability arrangements that oversee the system and drive continuous improvement.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt:
          "Ilse's daughter is visiting when a worker prompts Ilse's evening tablets. She notices the medication pack isn't the colour it usually is. The worker stops, doesn't give the tablets, and calls the coordinator to check. Should this be recorded in the IMS?",
        options: [
          opt(
            "a",
            "Yes. It's a near miss: the wrong medication could have been taken",
            "Correct. Near misses are recorded so the cause can be found and fixed.",
            true,
          ),
          opt("b", "No. Nobody took the wrong medication, so nothing happened", "No. A near miss had the potential to cause harm, and it's recorded."),
          opt("c", "Only if Ilse's daughter makes a formal complaint", "No. Recording doesn't depend on a complaint."),
          opt("d", "Only if it happens again", "No. Record it now, so a pattern can be seen if it does happen again."),
        ],
        explain:
          "The wrong medication could have been taken if the daughter hadn't noticed. Near misses are recorded, assessed and analysed so practice can change and a similar event is prevented.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Who is responsible for creating a culture of openness where people feel safe to speak up when things go wrong?",
        options: [
          opt(
            "a",
            "Everyone: the governing body sets it, managers lead it, and workers and contractors put it into practice",
            "Correct. Everyone has a part in a safety culture.",
            true,
          ),
          opt("b", "Only the governing body", "No. The board sets the culture, but everyone carries it."),
          opt("c", "Only the quality and risk team", "No. A safety culture can't belong to one team."),
          opt("d", "Only front-line workers, because they see incidents first", "No. Leaders set and model the culture."),
        ],
        explain:
          "Everyone has a role. The governing body creates the culture and oversees incident management; executives implement it and lead by example; workers and contractors put the policies into practice.",
      },
      {
        id: "q4",
        from: "new",
        prompt:
          "A worker is driving a client to a medical appointment when the client is hurt getting out of the car. Is this 'in connection with providing aged care services'?",
        options: [
          opt("a", "Yes. It happened while services were being delivered", "Correct. Taking someone to an appointment is part of service delivery.", true),
          opt("b", "No. It didn't happen in the client's home", "No. Incidents in the community during a service count too."),
          opt("c", "No. Only incidents at the provider's office count", "No. Most home-care incidents happen away from the office."),
          opt("d", "Only if the client was injured badly", "No. Harm, or the potential for harm, is enough for it to be an incident."),
        ],
        explain:
          "Incidents in connection with providing aged care services include those during service delivery anywhere, such as taking someone to an appointment, while workers carry out their duties, or later because of a service given or not given.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "Why does one provider's IMS look different from another's?",
        options: [
          opt(
            "a",
            "It's tailored to the organisation's size, location, services and the older people it supports",
            "Correct. The components are common; the design is tailored.",
            true,
          ),
          opt("b", "Each provider chooses which of the four components to include", "No. Every IMS has all four components."),
          opt("c", "The Commission prescribes a different system for each provider", "No. Providers design their own system to meet the requirements."),
          opt("d", "Some providers don't need to record near misses", "No. Near misses are recorded by every provider."),
        ],
        explain:
          "All IMSs share the four components, but each is tailored to the organisation's size, location, the services it provides and the older people it supports.",
      },
    ],
  },
  {
    part: 1,
    n: 3,
    slug: "alis-p1-creating-an-ims",
    title: "Creating an IMS",
    summary: "The seven principles of incident management, the policies an IMS needs, choosing a recording tool, and the governance that holds it together.",
    outcome: "Identify the principles, policies, records and governance an effective IMS is built on.",
    minutes: 12,
    explore: [
      "the seven principles of effective incident management",
      "the policies and procedures your organisation needs",
      "governance and management oversight",
      "good records management, and tailoring the IMS to your organisation",
    ],
    blocks: [
      {
        kind: "flip",
        id: "principles",
        title: "Seven principles of effective incident management",
        intro: "These principles are the foundation, applied all the time. Turn each card.",
        cards: [
          { front: "Person-centred", back: "The older person is at the centre: their safety, wellbeing, views and preferences guide the response." },
          { front: "Open disclosure", back: "When things go wrong, acknowledge it, apologise or express regret, and talk openly with the people affected." },
          { front: "Outcome-focused", back: "Aim for real outcomes for the person and real improvements to care, not just a finished form." },
          { front: "Accountable", back: "People know their responsibilities and are answerable for them, from the board to the front line." },
          { front: "Clear, simple and consistent", back: "Processes are easy to understand and followed the same way every time." },
          { front: "Timely", back: "Incidents are responded to, recorded, reported and acted on without delay." },
          { front: "Continuous improvement", back: "Every incident is a chance to learn and make care safer." },
        ],
        verify: "The source names the principle 'consumer-centred'; confirm the Hub's 'person-centred' wording and the card explanations with Quality.",
      },
      {
        kind: "scenario",
        id: "try-it",
        title: "One way to report",
        context:
          "Tessa is setting up the IMS for three regional home-care teams. Each reports incidents its own way: one emails the office, one phones a manager, and one fills in a paper form that stays in the car until the end of the week. Reports arrive late, and no two look the same.",
        prompt: "Which change best applies the principles of incident management?",
        choices: [
          {
            id: "a",
            text: "One simple way to record incidents, used by every team, as soon as possible after an incident",
            verdict: "best",
            feedback:
              "Yes. It's clear, simple and consistent, and timely. Records in one shape can be analysed for trends, which drives continuous improvement. Build it with the teams who'll use it.",
          },
          {
            id: "b",
            text: "Let each team keep its own way, as long as reports reach the office by the end of the month",
            verdict: "risky",
            feedback: "No. Three ways aren't consistent, and month's end isn't timely. Incidents need to be responded to, recorded and reported without delay.",
          },
          {
            id: "c",
            text: "Write a detailed manual that explains all three ways",
            verdict: "acceptable",
            feedback:
              "Writing it down helps people know what's expected, but three ways are still three ways, and the delays stay. Aim for clear, simple and consistent.",
          },
        ],
      },
      {
        kind: "reveal",
        id: "policies",
        title: "What your policies and procedures should cover",
        intro:
          "An IMS needs documented policies and procedures for identifying, reporting, managing, resolving and learning from incidents, available to everyone (older people, workers and supporters). Open each area.",
        items: [
          {
            title: "Roles and responsibilities",
            body: "Who identifies, reports, manages, resolves and prevents incidents and near misses; each person's role in using the IMS; the training each role needs; and who notifies reportable incidents to the Commission.",
          },
          {
            title: "Identifying, recording and reporting incidents",
            body: "What incidents and near misses are and which ones the IMS covers; what to record and how, so the data can be analysed; how and where to report internally, and how quickly.",
          },
          {
            title: "When others are notified",
            body: "When and how to tell the older person's supporters or emergency contacts, police or emergency services, and government bodies such as Ahpra or the Commission.",
          },
          {
            title: "Support for the people affected",
            body: "How you'll support their safety, health and wellbeing; involve them in managing and resolving the incident; use open disclosure; and tell them about advocates.",
          },
          {
            title: "Reviewing, analysing and investigating",
            body: "How every incident is analysed (could it have been prevented, how well was it handled, were the right bodies notified), and when and how an investigation is done into causes, harm and contributing operational issues.",
          },
          {
            title: "When further action is needed",
            body: "When action is needed (for example, an ongoing risk) and what kind: changes to services or clinical governance, training or education.",
          },
        ],
      },
      {
        kind: "steps",
        id: "recording-tool",
        title: "Choosing and running your recording tool",
        intro: "Some organisations use a quality management system, others a spreadsheet or paper forms. Whatever you use, work through these questions.",
        steps: [
          { title: "Does it fit your organisation?", body: "It reflects your size and the services you provide." },
          { title: "Does it match your policies?", body: "It captures what your procedures say must be recorded." },
          { title: "Is it easy for workers to use?", body: "Workers in homes and the community can record an incident promptly." },
          { title: "Can you analyse the data?", body: "It lets you find similar incidents, trends and patterns to drive continuous improvement." },
          { title: "Is the information right?", body: "Quality assurance checks that records are accurate, complete and timely." },
          { title: "Is it secure and private?", body: "Personal and sensitive information is stored securely and shared only as allowed." },
          {
            title: "Do people know what you collect?",
            body: "Use a notice of collection when you gather personal or sensitive information about anyone involved.",
          },
        ],
        verify:
          "The source lists seven considerations but only the first and the privacy points are in the outline text; confirm the remaining steps with Quality.",
      },
      {
        kind: "text",
        id: "governance",
        title: "Organisation-wide governance",
        body: "Leaders must actively support a culture of safety, inclusion and continuous improvement, and plan for the risks, workforce needs and quality priorities. Incident management works when workers are empowered to do their jobs well.\n\nThis is reflected in **strengthened Aged Care Quality Standard 2: The organisation**. The governing body sets strategic priorities and promotes a culture of safety and quality.",
      },
      {
        kind: "reveal",
        id: "standard-two",
        title: "Standard 2 Outcomes that support governance",
        intro: "Open each Outcome.",
        items: [
          { title: "Outcome 2.2 Quality, safety and inclusion culture", body: "A culture of safety, quality and inclusion for workers and older people." },
          {
            title: "Outcome 2.3 Accountability, quality system and policies and procedures",
            body: "A quality system used to monitor and continuously improve services.",
          },
          { title: "Outcome 2.4 Risk management", body: "Systems to identify, assess and manage risks to older people and the organisation." },
          {
            title: "Outcome 2.6 Complaints and feedback management",
            body: "Workers (2.6a) and older people (2.6b) are supported to raise complaints and feedback.",
          },
          { title: "Outcome 2.7 Information management", body: "Information is accurate, secure and available to the people who need it." },
          { title: "Outcome 2.9 Human resource management", body: "Workers are skilled, competent and trained, including in the IMS." },
        ],
        verify: "Confirm the Outcome numbers and one-line summaries against the strengthened Aged Care Quality Standards.",
      },
      {
        kind: "flip",
        id: "outcome-25",
        title: "Outcome 2.5: Incident management",
        intro:
          "The core Outcome for incident management: a system to record, respond to and learn from incidents and near misses. Turn each card to see what it asks.",
        cards: [
          { front: "Implement an IMS", back: "Have a system that records, responds to and learns from incidents and near misses." },
          { front: "Timely action", back: "Respond to incidents promptly, including the notifications required." },
          { front: "Encourage reporting and involve older people", back: "Make it easy to report, and involve the older person in what happens next." },
          {
            front: "Support your workforce",
            back: "Give workers training, tools and clear policies about recognising, recording and responding to incidents.",
          },
          { front: "Continuous improvement", back: "Use what incidents show you to make care safer." },
          { front: "Review and improve", back: "Regularly check the IMS itself works, and improve it." },
        ],
        verify: "Confirm the card labels match the actions in Outcome 2.5 of the strengthened Quality Standards.",
      },
      {
        kind: "callout",
        id: "consult",
        style: "tip",
        label: "Build it with the people who use it",
        body: "Design and refine the IMS with workers, so it's practical and understood. Then promote it: an IMS only works when everyone knows what's expected of them.",
      },
    ],
    short: {
      brief:
        "Seven **principles** are the foundation of incident management: person-centred; open disclosure; outcome-focused; accountable; clear, simple and consistent; timely; continuous improvement.\n\n**Policies and procedures** are documented and available to everyone: older people, workers and supporters. They cover roles, recording and reporting, when others are notified, support for the people affected, analysis and investigation, and further action.\n\nThe **recording tool** might be a quality management system, a spreadsheet or paper forms. It should fit your organisation, be easy for workers to use, keep information secure and private, and let you analyse trends.\n\n**Governance** holds it together. **Outcome 2.5 Incident management**, in strengthened Quality Standard 2: The organisation, is the core Outcome. Build the IMS with the workers who'll use it.",
      confidence: "I can name the principles, policies and governance an effective IMS is built on.",
    },
    keyPoints: [
      "Seven principles: person-centred, open disclosure, outcome-focused, accountable, clear, simple and consistent, timely, continuous improvement.",
      "Policies and procedures are documented and available to older people, workers and supporters.",
      "The recording tool fits your organisation, is easy to use, secure, and lets you analyse trends.",
      "Outcome 2.5 of the strengthened Quality Standards is the core Outcome for incident management.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "When things go wrong, what does the open disclosure principle ask your organisation to do?",
        options: [
          opt("a", "Acknowledge what happened, apologise or express regret, and talk openly with the people affected", "Correct.", true),
          opt("b", "Wait until the investigation is finished before saying anything", "No. Open disclosure starts early and continues through the process."),
          opt("c", "Avoid apologising, in case it's taken as an admission of fault", "No. Expressing regret or apologising is part of open disclosure."),
          opt("d", "Tell the family, but not the older person", "No. The older person is at the centre of the conversation."),
        ],
        explain:
          "Open disclosure is one of the seven principles: acknowledge, apologise or express regret, and have an open discussion with those affected. It's also required under the Aged Care Act 2024 and is key to a safety culture.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "A provider's board is developing its IMS. What should the board and executive team do?",
        options: [
          opt(
            "a",
            "Consult workers to understand what happens in practice when an incident occurs",
            "Correct. Workers know how incidents are really handled.",
            true,
          ),
          opt("b", "Write the IMS themselves, then tell workers when it's finished", "No. Without workers' input the system may not work in practice."),
          opt("c", "Copy another provider's IMS as it is", "No. An IMS is tailored to your organisation."),
          opt("d", "Leave it to the IT team, because it's a recording system", "No. An IMS is more than a recording tool."),
        ],
        explain:
          "Consulting workers shows the board and executives how incident handling works in practice. Once the IMS is built, they promote it so workers understand what's expected of them.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Which is a consideration when choosing the recording tool for your IMS?",
        options: [
          opt("a", "How easy it is for workers to use, and whether it supports analysis for continuous improvement", "Correct.", true),
          opt("b", "Which product other providers in the sector prefer", "No. The tool should fit your organisation, not the sector's favourite."),
          opt("c", "Whether the Commission has endorsed a particular product", "No. The Commission doesn't endorse a recording product."),
          opt("d", "Whether workers can keep records on their personal phones", "No. Records must be stored securely."),
        ],
        explain:
          "Consider your organisation's characteristics, your policies, how documents are stored, how easy it is for workers to use, and whether it lets you analyse trends for continuous improvement. Know the Aged Care Rules 2025 requirements for the IMS too.",
      },
      {
        id: "q4",
        from: "new",
        prompt: "Which Outcome of strengthened Quality Standard 2: The organisation is the core Outcome for incident management?",
        options: [
          opt("a", "Outcome 2.5 Incident management", "Correct.", true),
          opt("b", "Outcome 2.7 Information management", "No. 2.7 supports incident management, but it isn't the core Outcome."),
          opt("c", "Outcome 2.9 Human resource management", "No. 2.9 covers a skilled, trained workforce."),
          opt("d", "Outcome 2.4 Risk management", "No. 2.4 covers risk more broadly."),
        ],
        explain: "Outcome 2.5 Incident management asks for a system to record, respond to and learn from incidents and near misses.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "Who should be able to see your incident management policies and procedures?",
        options: [
          opt("a", "Everyone: older people, their supporters and workers", "Correct. They're documented and made available to everyone.", true),
          opt("b", "Only managers", "No. Workers need them to do their part, and older people need to know how incidents are handled."),
          opt("c", "Only the Commission, on request", "No. They're for the people who use them."),
          opt("d", "Nobody outside the quality team", "No. A hidden policy can't guide anyone."),
        ],
        explain:
          "Policies and procedures must be documented and made available to everyone in the organisation, including older people, workers and supporters.",
      },
    ],
  },
  {
    part: 1,
    n: 4,
    slug: "alis-p1-implementing-your-ims",
    title: "Implementing your IMS",
    summary: "Leadership, a safety culture, training and engagement: what makes an IMS work in practice, and how to keep improving it.",
    outcome: "Describe how leadership, a safety culture and training make an IMS effective.",
    minutes: 12,
    explore: ["the importance of strong leadership", "ideas for building and keeping a safety culture", "training workers", "ways to improve your IMS"],
    blocks: [
      {
        kind: "text",
        id: "leadership",
        title: "What leadership looks like",
        body: "An IMS works when the governing body and managers visibly lead a safety culture, and when people at every level are committed to incident management.\n\nLeadership isn't only about position. Everyone can show personal leadership, and when they do, people feel safer to speak up.",
      },
      {
        kind: "flip",
        id: "safety-culture",
        title: "What a safety culture includes",
        intro: "Turn each card.",
        cards: [
          { front: "Older people at the centre", back: "Decisions start with the older person's safety, wellbeing and preferences." },
          { front: "Open disclosure", back: "When something goes wrong, people are told honestly and promptly." },
          { front: "Openness and honesty", back: "People can raise a concern without fear of blame or reprisal." },
          { front: "Accountability", back: "Everyone knows their responsibilities and owns them." },
          { front: "Governance", back: "Leaders oversee incidents, trends and actions, and set the direction." },
          { front: "Training and support", back: "Workers know how to use the IMS and are supported when they do." },
        ],
      },
      {
        kind: "text",
        id: "culture",
        title: "Culture can't be switched on by a policy",
        body: "Culture is the attitudes, understanding and behaviour of everyone in the organisation. It's owned by everyone, and the governing body shapes it through its leadership, decisions and direction.\n\nIn an effective safety culture:\n\n- leaders draw a clear line between acceptable and unacceptable behaviour\n- workers, older people and supporters are willing to report incidents and near misses\n- people want to learn from incidents and near misses\n- the organisation is flexible, and people adapt and change to improve\n\nWithout a strong safety culture, the IMS is at risk.",
      },
      {
        kind: "scenario",
        id: "try-it",
        title: "Should Kofi speak up?",
        context:
          "Kofi is new. On a morning visit he finds Mavis's walking frame parked across the room, out of her reach, where the last visit left it. She'd started to get up without it and steadied herself on the table. She isn't hurt and laughs it off. Kofi doesn't want to get a colleague in trouble, or seem to be complaining.",
        prompt: "What should Kofi do?",
        choices: [
          {
            id: "a",
            text: "Make sure Mavis is safe, then record the near miss in the IMS and tell his coordinator what happened",
            verdict: "best",
            feedback:
              "Yes. Near misses are how we learn before someone is hurt. Describe what happened, not who's to blame: in a safety culture, speaking up is expected and supported.",
          },
          {
            id: "b",
            text: "Mention it quietly to his colleague next time, and leave it there",
            verdict: "acceptable",
            feedback: "Kind, and it might fix it this once. But nothing's recorded, so nobody can spot a pattern or change how visits end. Record it as well.",
          },
          {
            id: "c",
            text: "Say nothing: Mavis wasn't hurt and she laughed it off",
            verdict: "risky",
            feedback: "No. It could have caused harm, so it belongs in the IMS. Staying quiet means the same thing could happen again, with a worse outcome.",
          },
        ],
      },
      {
        kind: "flip",
        id: "culture-change",
        title: "Ways to support cultural change",
        intro: "Turn each card for an idea.",
        cards: [
          { front: "Learn from mistakes", back: "Treat incidents as information to learn from, not failures to hide." },
          { front: "Address cultural barriers", back: "Find out what stops workers, older people and supporters from reporting, and remove it." },
          { front: "Show the benefits", back: "Share how reporting has made care safer." },
          {
            front: "Governance support",
            back: "Have the governing body routinely review incident and near miss data, trends, investigation outcomes and actions.",
          },
          { front: "Promote a blame-free culture", back: "Call out behaviour that doesn't fit a blame-free, learning culture." },
          { front: "Share information", back: "Share lessons across teams and services." },
          { front: "Review internal documents", back: "Check your policies, forms and training still support the culture you want." },
        ],
      },
      {
        kind: "text",
        id: "training",
        title: "Training for an effective IMS",
        body: "Training is the fourth key component. It defines roles and makes sure your whole workforce:\n\n- knows its roles and responsibilities in incident management\n- is trained to use the IMS to identify, record, prevent and manage incidents\n- is reminded often why reporting incidents and near misses matters\n\nIncident management isn't just reporting. It's supporting older people after an incident, understanding causes, and learning to reduce risk. Involve people at every level in analysing incidents and finding improvements.",
      },
      {
        kind: "checklist",
        id: "engagement",
        title: "Questions to ask about engaging older people",
        intro:
          "Encouraging older people and their supporters to report builds an open, transparent environment. Tick each question once you've thought about it for your service.",
        items: [
          "How do older people and their supporters report incidents to us, and resolve them with us?",
          "How do we handle those reports?",
          "Do we share improvements that came from reported incidents with older people and their supporters?",
          "What could we do differently so older people and supporters feel safer to report incidents and near misses?",
        ],
      },
      {
        kind: "text",
        id: "improve",
        title: "Improving your IMS",
        body: "Once your IMS is running, set aside time and resources to review how well it works and fix what doesn't. That gives you:\n\n- reliable processes that meet your obligations\n- good use of resources and workers\n- continuous improvement of services\n- resources that help workers prevent and manage incidents\n\nThorough incident analysis keeps the trust of the people involved and strengthens your safety culture.",
      },
    ],
    short: {
      brief:
        "An IMS works when the governing body and managers **visibly lead a safety culture**, and people at every level are committed to incident management. Leadership isn't only about position: everyone can show it.\n\n**Culture can't be switched on by a policy.** It's the attitudes, understanding and behaviour of everyone in the organisation. In an effective safety culture:\n\n- leaders draw a clear line between acceptable and unacceptable behaviour\n- workers, older people and supporters are willing to report incidents and near misses\n- people want to learn from them\n- the organisation adapts and changes to improve\n\n**Training**, the fourth key component, makes sure everyone knows their role, can use the IMS, and is reminded often why reporting matters. Review the IMS regularly and improve it.",
      confidence: "I can explain how leadership, safety culture and training make an IMS work.",
    },
    keyPoints: [
      "An effective IMS needs visible leadership and a safety culture owned by everyone.",
      "In a safety culture, people report incidents and near misses and learn from them.",
      "Training makes sure everyone knows their role and how to use the IMS.",
      "Review the IMS regularly and improve it.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "Which pair describes the right culture for an effective IMS?",
        options: [
          opt("a", "Strong governance, and an open, safe environment for speaking up", "Correct.", true),
          opt(
            "b",
            "Cash rewards for workers who report, and penalties for those who don't",
            "No. Reporting should come from culture and training, not rewards or fear.",
          ),
          opt("c", "Dealing with incidents quietly so they don't upset anyone", "No. Ignoring incidents undermines safety."),
          opt("d", "Leaving incident management to the quality team", "No. Culture is owned by everyone."),
        ],
        explain:
          "The right culture means everyone practises open disclosure and is open when things go wrong, with strong governance, policies that are followed, and workers trained to use the IMS.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "Which is a feature of an effective safety culture?",
        options: [
          opt(
            "a",
            "Workers, older people and supporters are willing to report incidents and near misses, and the organisation learns from them",
            "Correct.",
            true,
          ),
          opt("b", "Only serious incidents are reported, so managers aren't overloaded", "No. Near misses and minor incidents are reported too."),
          opt("c", "Workers who report an incident are moved to other clients", "No. That discourages reporting."),
          opt("d", "Procedures never change once written", "No. A safety culture adapts and improves."),
        ],
        explain:
          "In an effective safety culture, leaders draw a clear line on behaviour, people are willing to report incidents and near misses, the organisation learns from them, and people adapt and change to improve.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Which is a way to foster cultural change?",
        options: [
          opt("a", "Have the governing body routinely review incident and near miss data, trends, outcomes and actions", "Correct.", true),
          opt("b", "Keep incident data within the quality team", "No. Sharing information is part of changing culture."),
          opt("c", "Name the worker responsible for each incident at team meetings", "No. That's blame, not learning."),
          opt("d", "Wait for a serious incident before training people", "No. Training and reminders come first."),
        ],
        explain:
          "Ways to foster change include learning from mistakes, addressing barriers to reporting, governing body review of incident data, calling out blame, and sharing information.",
      },
      {
        id: "q4",
        from: "new",
        prompt: "What should a training program for your IMS make sure of?",
        options: [
          opt(
            "a",
            "Every worker knows their role, can use the IMS to identify, record, prevent and manage incidents, and is reminded to report incidents and near misses",
            "Correct.",
            true,
          ),
          opt("b", "Managers know how to use the IMS; workers tell a manager", "No. The whole workforce needs to know its role and the system."),
          opt("c", "Workers know how to report serious incidents only", "No. Near misses and minor incidents are reported too."),
          opt("d", "New workers are trained once at induction, with no refreshers", "No. Regular reminders keep reporting front of mind."),
        ],
        explain:
          "An effective training program defines roles, trains the whole workforce in the IMS, and keeps reminding people why reporting incidents and near misses matters.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "Why can't a safety culture be put in place just by writing policies?",
        options: [
          opt("a", "Culture is people's attitudes, understanding and behaviour, owned by everyone and shaped by leaders", "Correct.", true),
          opt("b", "Policies aren't required in an IMS", "No. Policies are one of the four key components."),
          opt("c", "Only the Commission can set a provider's culture", "No. The provider's leaders and people shape it."),
          opt("d", "Culture only matters for the workers who visit most often", "No. It matters for everyone, in every home we support."),
        ],
        explain:
          "Culture is the attitudes, understanding and behaviour of everyone in the organisation. Policies support it, but it's built through leadership, decisions and everyday behaviour.",
      },
    ],
  },
  {
    part: 1,
    n: 5,
    slug: "alis-p1-complaints-and-your-ims",
    title: "Complaints and your IMS",
    summary: "Why complaints and feedback matter, how to make it safe to raise them, and when a complaint also needs to go into the IMS.",
    outcome: "Decide when a complaint or feedback also needs to be managed as an incident in the IMS.",
    minutes: 12,
    explore: [
      "your obligation to have an effective complaints and feedback system",
      "creating an environment that encourages complaints and feedback",
      "how the complaints and feedback system connects with the IMS",
    ],
    blocks: [
      {
        kind: "tabs",
        id: "standards",
        title: "Where complaints fit in the rules",
        intro:
          "Complaints and feedback help you meet your obligations under the Act, the Rules, the Statement of Rights and the strengthened Quality Standards.",
        tabs: [
          {
            label: "Quality Standard 2",
            body: "- **Outcome 2.3 Accountability, quality system and policies and procedures**: use a quality system to keep improving, informed by feedback and analysis of risks, complaints and incidents.\n- **Outcome 2.6a and 2.6b Complaints and feedback management** (workers and individuals): encourage and support complaints and feedback without fear of punishment or unfair treatment, manage them transparently and use them to improve.\n- **Outcome 2.9 Human resource management**: keep a training system that responds to feedback and complaints.",
          },
          {
            label: "Statement of Rights",
            body: "Older people have the right to raise a complaint or give feedback, to be supported to do so (including by an advocate or interpreter), and to have it dealt with fairly and without reprisal.",
          },
          {
            label: "The Rules",
            body: "The Aged Care Rules 2025 set out the complaints and feedback details providers must record and keep, and how complaints and feedback must be managed.",
          },
        ],
        verify:
          "The source cites Rules Chapter 4, Part 7, Division 1 (s154-205) for records and Part 10, Division 2 for managing complaints; confirm the references, and the Statement of Rights summary.",
      },
      {
        kind: "text",
        id: "source",
        title: "Complaints often reveal incidents",
        body: "An incident can be something you know happened, or something alleged or suspected. So you'll often learn about incidents nobody on your team witnessed, and complaints and feedback are one of the most common ways you'll hear about them.",
      },
      {
        kind: "reveal",
        id: "why",
        title: "How complaints and feedback help",
        intro: "Open each one.",
        items: [
          { title: "Continuous improvement", body: "Looking at complaints together shows trends, so small issues are fixed before they become serious." },
          { title: "Identify and manage incidents", body: "A complaint may describe an incident, which then goes into the IMS." },
          { title: "A safe environment", body: "Handling complaints openly and honestly shows people it's safe to speak up." },
          { title: "A source of information", body: "Complaints can reveal patterns of concerning behaviour you wouldn't otherwise see." },
        ],
      },
      {
        kind: "flip",
        id: "environment",
        title: "Making it safe to complain",
        intro: "Raising a concern shouldn't feel overwhelming. Turn each card for a practice that helps.",
        cards: [
          {
            front: "Publicise the process",
            back: "Share the complaints and feedback policy and contact details in welcome packs, on the website and in conversation.",
          },
          { front: "Ask, don't wait", back: "Actively ask older people, supporters and workers for feedback as part of everyday conversations." },
          { front: "Make it accessible", back: "Offer information in other languages and formats, and interpreters, if needed." },
          { front: "Advocates welcome", back: "Tell people they can bring an advocate or supporter, and how to reach one." },
          { front: "No fear of reprisal", back: "Make it clear that raising a concern will never affect the person's care." },
        ],
      },
      {
        kind: "scenario",
        id: "outcome",
        title: "When people don't feel able to complain",
        context:
          "Three clients each had a concern about their services but said nothing: one didn't know how, one worried their care would suffer, and one didn't think anyone would listen.",
        prompt: "Which Outcome of strengthened Quality Standard 2 is most relevant to all three?",
        choices: [
          {
            id: "a",
            text: "Outcome 2.6b Complaints and feedback management for individuals",
            verdict: "best",
            feedback:
              "Yes. Outcome 2.6b asks providers to encourage and support older people and their supporters to complain and give feedback, including through advocates and language services.",
          },
          {
            id: "b",
            text: "Outcome 2.6a Complaints and feedback management for workers",
            verdict: "risky",
            feedback: "Not quite. 2.6a is about workers; these are older people.",
          },
          { id: "c", text: "Outcome 2.9 Human resource management", verdict: "risky", feedback: "Not quite. 2.9 is about a skilled workforce." },
          {
            id: "d",
            text: "Outcome 2.3 Accountability, quality system and policies and procedures",
            verdict: "acceptable",
            feedback: "Related, because complaints inform the quality system, but 2.6b is the Outcome about supporting people to complain.",
          },
        ],
      },
      {
        kind: "steps",
        id: "pathway",
        title: "When a complaint reveals an incident",
        intro: "Follow the steps.",
        steps: [
          { title: "A complaint or feedback arrives", body: "From an older person, a supporter or a worker." },
          { title: "Respond under your complaints policy", body: "Acknowledge it and handle it as your complaints and feedback procedures say." },
          { title: "Spot the incident", body: "Ask: does it describe something that caused, or could have caused, harm?" },
          { title: "Record the incident in the IMS", body: "If it's a reportable incident, also notify the Commission within the timeframe." },
          { title: "Manage it through the IMS", body: "Analyse it, implement actions and close the loop." },
        ],
      },
      {
        kind: "callout",
        id: "police",
        style: "important",
        label: "Unlawful activity",
        body: "If a complaint or feedback describes something unlawful, such as an assault or theft, you must also notify the police or other relevant authorities.",
      },
      {
        kind: "sort",
        id: "which-system",
        title: "Which system?",
        prompt: "Sort each complaint: is it for the complaints and feedback system only, or the complaints system and the IMS?",
        groups: [
          { id: "complaints", label: "Complaints and feedback system only" },
          { id: "both", label: "Complaints system and the IMS" },
        ],
        items: [
          {
            id: "meals",
            text: "Jackson says he doesn't like the frozen meals delivered last week and would prefer salads.",
            group: "complaints",
            feedback: "A valid complaint about a preference, but nothing suggests an incident. Handle it under the complaints policy, with Jackson involved.",
          },
          {
            id: "bathroom",
            text: "Melissa's sister says the bathroom was left wet after a visit and Melissa almost slipped.",
            group: "both",
            feedback: "A near miss: Melissa could have been hurt. Record it in the IMS too, and use open disclosure with Melissa and her sister.",
          },
          {
            id: "heater",
            text: "Gwen says the heater a worker set up makes a zapping sound and wakes her at night.",
            group: "both",
            feedback: "A possible hazard and potential incident. It goes in the IMS as well as the complaints system.",
          },
          {
            id: "invoice",
            text: "A client's son says a statement arrived later than usual.",
            group: "complaints",
            feedback: "Worth fixing through the complaints process, but no harm or potential harm to a person is described.",
          },
          {
            id: "shouted",
            text: "A daughter says a worker shouted at her father when he was slow to get ready.",
            group: "both",
            feedback: "This could be psychological or emotional abuse. Record it in the IMS and check whether it's a reportable incident.",
          },
        ],
      },
      {
        kind: "commit",
        id: "chapter-commit",
        title: "Your next step",
        intro:
          "That's the end of Chapter 1: the SIRS, what an IMS is, building and implementing one, and how complaints connect to it. Choose one thing to put into practice. Only you see what you pick. Keep it about your own work, with nothing that could identify a client.",
        prompt: "What's one thing you'll do at work this week?",
        suggestions: [
          "Find where my team records near misses, and check I could log one from a client's home",
          "Ask my manager who I go to first when I think an incident might be reportable, including out of hours",
          "Find our complaints and feedback information for clients, so I can explain in a sentence how to raise a concern",
        ],
        timing: "This week",
      },
    ],
    short: {
      brief:
        "Complaints and feedback are one of the most common ways you'll hear about incidents, including ones nobody on your team saw.\n\n**Make it safe to complain:** publicise the process, ask for feedback in everyday conversations, offer other languages, formats and interpreters, welcome advocates, and make it clear that raising a concern will never affect someone's care.\n\n**When a complaint reveals an incident**, respond under your complaints policy and ask: does it describe something that caused, or could have caused, harm? If so, record it in the IMS too, and notify the Commission if it's a reportable incident.\n\nIf it describes something unlawful, such as an assault or theft, also notify the police or other relevant authorities.",
      confidence: "I can tell when a complaint also needs to go in the IMS.",
    },
    keyPoints: [
      "Complaints and feedback are one of the most common ways you'll hear about incidents.",
      "Make complaining easy and safe: publicise the process, ask for feedback, offer languages and advocates.",
      "When a complaint reveals an incident, record it in the IMS too, and notify the Commission if it's reportable.",
      "Unlawful activity in a complaint also goes to the police.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "Which practice helps older people feel safe to make a complaint or give feedback?",
        options: [
          opt("a", "Publicising the complaints process with contact details, and actively asking for feedback", "Correct.", true),
          opt("b", "Giving information about complaints only when someone asks", "No. People need to know about the process before they need it."),
          opt("c", "Leaving minor complaints out of the record", "No. Every complaint is recorded."),
          opt("d", "Providing information only in English", "No. Offer other languages if needed."),
        ],
        explain:
          "Talking openly about the complaints policy, publicising it widely, asking for feedback in everyday conversations and offering other languages helps people understand their right to complain and how to do it.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "Jackson tells his worker he doesn't like the frozen meals delivered last week and would prefer salads. Which system should handle this?",
        options: [
          opt("a", "The complaints and feedback system", "Correct. Nothing suggests an incident.", true),
          opt("b", "The complaints and feedback system and the IMS", "No. A food preference isn't an incident."),
          opt("c", "The IMS only", "No. It's feedback, not an incident."),
          opt("d", "Neither: it's just a preference", "No. It's still valid feedback to act on, with Jackson involved."),
        ],
        explain:
          "A dislike of a food is a valid complaint, but nothing suggests an incident. Handle it under the complaints and feedback policy and involve Jackson.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Melissa's sister complains that Melissa's bathroom was left wet after a visit and Melissa almost slipped. Which system should handle this?",
        options: [
          opt("a", "The complaints and feedback system and the IMS", "Correct. It's a near miss.", true),
          opt("b", "The complaints and feedback system only", "No. Melissa nearly fell: that's a near miss for the IMS."),
          opt("c", "Neither, because Melissa wasn't hurt", "No. Near misses are recorded."),
          opt("d", "The IMS only, and the complaint can be closed", "No. It's still a complaint to respond to."),
        ],
        explain:
          "The feedback describes a potential incident. Capture it in both the complaints system and the IMS, and use open disclosure with Melissa and her sister.",
      },
      {
        id: "q4",
        from: "knowledge check",
        prompt: "Gwen mentions that the heater a worker set up makes a zapping sound and wakes her at night. Which system should handle this?",
        options: [
          opt("a", "The complaints and feedback system and the IMS", "Correct. It's a possible hazard and potential incident.", true),
          opt("b", "The complaints and feedback system only", "No. A zapping heater is a possible hazard."),
          opt("c", "Neither: tell Gwen to stop using the heater", "No. It needs to be recorded and managed."),
          opt("d", "Wait to see if it happens again", "No. Act on the hazard now."),
        ],
        explain: "The feedback identifies a potential hazard and incident. Record and manage it in the IMS as well as the complaints system.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "A complaint says a worker took money from a client's purse. What else must happen, besides handling the complaint?",
        options: [
          opt(
            "a",
            "Record it in the IMS, notify police because it may be unlawful, and notify the Commission because it's a reportable incident",
            "Correct.",
            true,
          ),
          opt("b", "Nothing more until the client proves it", "No. Suspected and alleged incidents are managed and reported too."),
          opt("c", "Ask the worker whether it happened, and close the complaint if they say no", "No. That isn't managing the incident."),
          opt("d", "Record it in the complaints system only", "No. It's an incident, and possibly a crime."),
        ],
        explain:
          "Alleged stealing by a worker is a reportable incident and may be unlawful. It goes in the IMS, to the police, and to the Commission within the timeframe, as well as through the complaints process.",
      },
    ],
  },
];
