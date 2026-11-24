import type { AlisModule } from "../alisCourse";
import { opt } from "./part1";

/*
  ALIS Part 2: Using your incident management system. One fictional incident runs through all five modules: Mimi, who
  gets personal care at home from All Well Services (a fictional provider), her daughter Lynn, the worker Janie, Simon
  (Quality and Risk Manager) and Luca (Complaints Coordinator).
*/

const MIMI =
  "Mimi gets personal care at home from All Well Services. A bottle of her perfume went missing, and her daughter Lynn suspects Janie, Mimi's personal care worker, took it. Lynn complained, and Simon, the Quality and Risk Manager, responded straight away to check what support Mimi needed.";

export const ALIS_PART_2: AlisModule[] = [
  {
    part: 2,
    n: 1,
    slug: "alis-p2-responding-to-incidents",
    title: "Responding to incidents",
    summary: "Spotting incidents and near misses at home and in the community, what to do first, and practising open disclosure.",
    outcome: "Respond to an incident by looking after the people affected first, and practise open disclosure.",
    minutes: 15,
    sensitive: true,
    explore: [
      "identifying incidents and near misses in home and community settings",
      "what to do when an incident happens",
      "open disclosure with older people and their supporters",
    ],
    blocks: [
      {
        kind: "text",
        id: "element",
        title: "Element 2: Respond to the incident",
        body: "Providers must keep an IMS that promotes older people's health, safety, wellbeing and quality of life, and continuous improvement. This module is about the second of the six elements: **respond to the incident**.\n\nMeet the immediate needs of the people affected to protect their health, safety and wellbeing. Assess the level of harm and act to reduce any ongoing risk. Your IMS sets clear expectations for what workers do once they know an incident has happened.",
        verify: "The source cites Rules 2025 Chapter 4, Part 10, Division 1 for IMS requirements; confirm the section reference before adding it.",
      },
      {
        kind: "reveal",
        id: "definitions",
        title: "Incidents and near misses",
        intro: "Open each to recap.",
        items: [
          {
            title: "Incidents",
            body: "Acts, omissions, events or circumstances in connection with providing aged care services that have caused, or could reasonably have been expected to cause, harm to the older person or someone else. Includes alleged and suspected incidents.",
          },
          { title: "Near misses", body: "Events that didn't cause harm but had the potential to." },
        ],
      },
      {
        kind: "flip",
        id: "identified",
        title: "How you might find out",
        intro: "Incidents come to light in different ways. Turn each card.",
        cards: [
          { front: "You see it", back: "A worker sees something happen while helping a client cook a meal." },
          { front: "You find the result", back: "A worker arrives to find a client on the floor after a fall." },
          { front: "Someone tells you", back: "A client's daughter tells a worker she's worried about something that happened last week." },
        ],
      },
      {
        kind: "callout",
        id: "starts",
        style: "important",
        label: "Response starts at once",
        body: "Incident response starts as soon as any worker becomes aware of an incident. Every witnessed, suspected or alleged incident and near miss is documented, responded to and managed through the IMS.",
      },
      {
        kind: "flip",
        id: "respond",
        title: "How providers must respond",
        intro: "Think about the people involved, how they were or could have been affected, and the circumstances. Turn each card.",
        cards: [
          {
            front: "Assess and support",
            back: "Assess what support the person needs for their safety, health and wellbeing, and provide it, including treatment if needed.",
          },
          { front: "Listen", back: "Give the person time to tell you what happened, in their own words." },
          { front: "Involve them", back: "Involve the person, or their representative, in managing and resolving the incident." },
          { front: "Talk openly", back: "Use open disclosure: an honest, ongoing conversation with the person and their supporters." },
        ],
      },
      {
        kind: "reveal",
        id: "plan",
        title: "Your incident response plan",
        intro: "Your IMS should include a response plan to guide workers. Open each part.",
        items: [
          {
            title: "Ensure health, safety and wellbeing",
            body: "Look after the people involved first: first aid, medical or psychological treatment, and steps to stop it happening again right now.",
          },
          { title: "Engage with the people affected", body: "Talk with them, involve them, and keep them informed." },
          { title: "Report", body: "Escalate internally, record in the IMS, and make any notifications required, including police and the Commission." },
        ],
      },
      {
        kind: "sequence",
        id: "order-response",
        title: "Put the response in order",
        intro: "You've seen how providers must respond and what goes in a response plan. Now put the first steps together.",
        prompt: "Drag the steps into the order you'd take them once you know an incident has happened.",
        steps: [
          "Become aware of the incident: you see it, find the result, or someone tells you",
          "Look after the person first: first aid or treatment, and steps to stop it happening again right now",
          "Give the person time to tell you what happened, in their own words",
          "Involve the person or their representative in managing it, and talk openly with them",
          "Escalate internally, record it in the IMS, and make any notifications required",
        ],
        feedback:
          "People first, then the paperwork. The person's safety, health and wellbeing come before anything else. Listening and involving them come next, and open disclosure carries on from there. Escalating, recording and notifying follow.",
        verify:
          "Confirm this order matches Trilogy Care's incident response procedure, in particular listening before involving the person, and escalating, recording and notifying as the last step.",
      },
      {
        kind: "steps",
        id: "mimi",
        title: "Scenario: Mimi's missing perfume",
        intro: "Step through what happens at All Well Services.",
        steps: [
          { title: "The service", body: "All Well Services gives Mimi personal care at home. Her daughter Lynn visits often." },
          { title: "Something's missing", body: "Mimi can't find a favourite bottle of perfume." },
          { title: "A suspicion", body: "Lynn suspects Janie, Mimi's personal care worker, took it, and calls All Well Services to complain." },
          {
            title: "The complaint is taken",
            body: "Luca, the Complaints Coordinator, takes the complaint and tells Simon, the Quality and Risk Manager, the same day.",
          },
          { title: "First, Mimi", body: "Simon calls Mimi and Lynn to check Mimi is safe and to ask what support she needs." },
          { title: "Into the IMS", body: "The alleged incident is recorded and managed through the IMS." },
        ],
      },
      {
        kind: "scenario",
        id: "immediate",
        title: "What do Simon and Luca do first?",
        context: MIMI,
        prompt: "What must Simon and Luca do straight away?",
        choices: [
          {
            id: "a",
            text: "Assess the support Mimi needs, involve Mimi and Lynn in managing it, and keep talking openly with them",
            verdict: "best",
            feedback: "Yes. Safety and wellbeing first, the people affected involved, and open disclosure from the start.",
          },
          {
            id: "b",
            text: "Leave the complaint until there's proof the perfume was stolen",
            verdict: "risky",
            feedback: "No. Alleged and suspected incidents are managed too. Waiting for proof leaves Mimi unsupported.",
          },
          {
            id: "c",
            text: "Tell Lynn the matter will be investigated, then not contact them until it's finished",
            verdict: "acceptable",
            feedback: "Investigating is right, but open disclosure means an ongoing conversation, not silence until the end.",
          },
        ],
      },
      {
        kind: "jobaid",
        id: "first-steps-aid",
        title: "Job aid: incident first steps",
        intro:
          "Trilogy Care's own first steps for when you think a reportable incident may have happened, in a client's home or on the phone. Keep it where you can find it.",
        snippetId: "sirs-first-steps",
        why: "It turns the response you've just practised into Trilogy Care's first steps, starting with the person's safety.",
      },
      {
        kind: "callout",
        id: "wellbeing",
        style: "tip",
        label: "Safety, health and wellbeing",
        body: "Safety and health are physical and psychological. Wellbeing is physical (how the body is working), psychological (how a person thinks, feels and copes), spiritual (a sense of meaning and purpose) and social (connection and belonging).",
      },
      {
        kind: "reveal",
        id: "open-disclosure",
        title: "The elements of open disclosure",
        intro:
          "Open disclosure is the conversation you have with an older person, and their supporter or representative, when something has gone wrong that harmed or could have harmed them. Open each element.",
        items: [
          { title: "Identify when things go wrong", body: "Recognise an incident and start the conversation early." },
          { title: "Address immediate needs and provide support", body: "Look after the person first." },
          { title: "Acknowledge, and empathise, express regret or apologise", body: "Say sorry that it happened, and mean it." },
          { title: "Find out and explain what happened", body: "Share what you learn, and what you're doing about it." },
          { title: "Learn and improve", body: "Make changes so it doesn't happen again, and tell the person what changed." },
        ],
        verify: "Confirm the five elements match the current Aged Care Open Disclosure Framework and Guidance.",
      },
      {
        kind: "scenario",
        id: "apologise",
        title: "Should Simon apologise?",
        context:
          "Simon meets Mimi and Lynn. He acknowledges the incident, lets them say how they feel, explains what All Well Services has done and will do to understand what happened, and how it plans to stop it happening again.",
        prompt: "Should Simon also apologise or say he's sorry this happened?",
        choices: [
          {
            id: "a",
            text: "Yes: empathising, expressing regret or apologising is part of open disclosure",
            verdict: "best",
            feedback:
              "Yes. An apology or expression of regret is part of open disclosure. Check what your state or territory's laws say about apologies, and follow Trilogy Care's guidance.",
          },
          {
            id: "b",
            text: "No: an apology would be an admission of fault",
            verdict: "risky",
            feedback: "No. Saying sorry that something happened is part of open disclosure, not an admission of liability.",
          },
          {
            id: "c",
            text: "No need: he's already done everything open disclosure asks",
            verdict: "risky",
            feedback: "Not quite. Acknowledging and explaining are part of it, but so is expressing regret or apologising.",
          },
        ],
        verify: "Apology protections differ by state and territory; confirm the wording with Quality and legal.",
      },
    ],
    short: {
      brief:
        "Incident response starts **as soon as any worker becomes aware** of an incident or near miss: you see it, find the result, or someone tells you. Witnessed, suspected and alleged incidents are all managed through the IMS.\n\n**What comes first:**\n\n- Assess and provide the support the person needs for their safety, health and wellbeing, including treatment if needed.\n- Listen, and involve the person or their representative in managing it.\n- Escalate, record in the IMS and make any notifications required.\n\n**Open disclosure** is an honest, ongoing conversation with the person and their supporters: identify when things go wrong, address immediate needs, acknowledge and apologise or express regret, find out and explain what happened, and learn and improve. Saying sorry is part of it, not an admission of fault.",
      confidence: "I can put the person's safety first and talk openly after an incident.",
    },
    keyPoints: [
      "Response starts as soon as any worker becomes aware of an incident, witnessed, suspected or alleged.",
      "Look after the person's safety, health and wellbeing first.",
      "Involve the person and their supporters, and practise open disclosure throughout.",
      "Apologising or expressing regret is part of open disclosure.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "Who might discover an incident or near miss?",
        options: [
          opt("a", "Anyone: a worker who sees it, an older person who tells you, or someone else who lets a worker know", "Correct.", true),
          opt("b", "Only the worker on shift when it happened", "No. Many incidents come to light later, or from someone else."),
          opt("c", "Only a manager", "No. Anyone can discover an incident."),
          opt("d", "Only the older person it happened to", "No. Witnesses, supporters and workers can all discover one."),
        ],
        explain:
          "Anyone can discover an incident. Response starts when any worker becomes aware of it, and every witnessed, suspected or alleged incident is managed in the IMS.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "You've just become aware of an incident in a client's home. What comes first?",
        options: [
          opt("a", "Assess and provide the support needed for the safety, health and wellbeing of the people affected", "Correct.", true),
          opt("b", "Record the incident in the IMS before you do anything else", "No. Recording matters, but people come first."),
          opt("c", "Notify the Commission", "No. Look after the people affected first; notification follows within the timeframe."),
          opt("d", "Work out who was at fault", "No. That comes later, through analysis, and the focus is learning."),
        ],
        explain:
          "Assess and provide the support people need for their safety, health and wellbeing, involve them in managing the incident, and use open disclosure. Then record and report.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Which of these is NOT an element of open disclosure?",
        options: [
          opt(
            "a",
            "Avoid discussing how the incident is being managed with the older person, to protect the organisation's reputation",
            "Correct: this is not part of open disclosure. Being honest and timely is.",
            true,
          ),
          opt("b", "Acknowledge what happened, and empathise, express regret or apologise", "This is an element of open disclosure."),
          opt("c", "Find out and explain what happened", "This is an element of open disclosure."),
          opt("d", "Learn from the experience and make improvements", "This is an element of open disclosure."),
        ],
        explain:
          "The elements are: identify when things go wrong; address immediate needs and provide support; acknowledge, and empathise, express regret or apologise; find out and explain what happened; learn and improve. Being slow or seeming to cover up damages trust.",
      },
      {
        id: "q4",
        from: "new",
        prompt: "When you think about someone's wellbeing after an incident, what does it include?",
        options: [
          opt("a", "Physical, psychological, spiritual and social wellbeing", "Correct.", true),
          opt("b", "Physical injuries only", "No. Psychological harm matters as much."),
          opt("c", "Whether the person wants to make a complaint", "No. That's separate from their wellbeing."),
          opt("d", "Only what's in their care and services plan", "No. Look at the whole person."),
        ],
        explain:
          "Wellbeing is physical (how the body works), psychological (how a person thinks, feels and copes), spiritual (meaning and purpose) and social (connection and belonging).",
      },
      {
        id: "q5",
        from: "module activity",
        prompt: "Simon has explained to Mimi and Lynn what happened and what All Well Services is doing. Should he also apologise or express regret?",
        options: [
          opt("a", "Yes. It's part of open disclosure, and isn't an admission of fault", "Correct.", true),
          opt("b", "No. An apology admits liability", "No. Expressing regret is part of open disclosure."),
          opt("c", "No. Explaining what happened is enough", "No. Acknowledging and apologising is its own element."),
          opt("d", "Only if the investigation finds Janie took the perfume", "No. You can be sorry something happened without knowing the cause."),
        ],
        explain:
          "Empathising, expressing regret or apologising is one of the elements of open disclosure. Know your state or territory's legal protections for apologies.",
      },
    ],
  },
  {
    part: 2,
    n: 2,
    slug: "alis-p2-recording-incidents",
    title: "Recording incidents",
    summary: "What goes in an incident record, why minor incidents matter, and keeping records private and for long enough.",
    outcome: "Record an incident with the details the IMS needs, and recognise patterns across records.",
    minutes: 15,
    sensitive: true,
    explore: ["the details to record in the IMS after an incident", "recognising patterns in your IMS", "privacy and keeping incident records"],
    blocks: [
      {
        kind: "text",
        id: "element",
        title: "Element 3: Record and report the incident",
        body: `Record and report the incident to understand what happened and what comes next, including any notifications and follow-up. This module is about **recording**; Part 3 covers reporting reportable incidents through the SIRS.\n\n**So far:** ${MIMI}`,
        verify: "The source cites Rules 2025 Chapter 4, Part 10, Division 1 for recording requirements; confirm the section reference.",
      },
      {
        kind: "text",
        id: "system",
        title: "What your recording system must let you do",
        body: "- capture each incident: what happened, actual or potential harm, assessments and actions, and who was consulted\n- review and analyse incidents, find similar ones and fix systemic issues\n- record and identify recurring incidents and patterns of abuse\n- report to the Commission and other bodies when required\n- keep documents up to date and available to the older person and their supporters when needed\n- store records safely and securely: protected electronic systems, and paper records never taken to a worker's home\n\nKnow who collects information about an incident, and keep related records (emails and letters, for example) with the incident record.",
      },
      {
        kind: "reveal",
        id: "what",
        title: "Which incidents to record",
        intro: "Every incident connected with providing aged care services that causes, or could reasonably be expected to cause, harm. Open each.",
        items: [
          { title: "During services", body: "Incidents that happened while services were being provided." },
          { title: "A failure to provide", body: "Incidents that happened because services, or good quality services, weren't provided." },
          { title: "Suspected or alleged", body: "Incidents someone suspects or alleges, like Mimi's perfume." },
          { title: "Near misses", body: "Events that could have caused harm but didn't." },
        ],
      },
      {
        kind: "steps",
        id: "details",
        title: "Details to record",
        intro: "Step through the details an incident record needs. The Commission's best practice guidance has the full list: keep it handy.",
        steps: [
          { title: "What happened", body: "A description of the incident or allegation, the people directly involved and any witnesses." },
          { title: "Who's recording", body: "The details of the person making the record." },
          { title: "The first assessment", body: "What the initial assessment of the incident found." },
          { title: "Who was consulted", body: "Consultations with the older person affected, and their supporters where appropriate." },
          { title: "What was done", body: "Actions taken in response, including support and assistance for the older person." },
          { title: "Links to earlier incidents", body: "Whether there are previous incidents this one should be linked to." },
          { title: "Notifications", body: "Who was notified (police, the Commission, family) and when." },
        ],
        verify: "Confirm the required details against the Aged Care Rules 2025 recording requirements and the best practice guidance.",
      },
      {
        kind: "text",
        id: "patterns",
        title: "Small incidents add up",
        body: "Your records must let you sort and group information to find similar incidents, trends and patterns. Support workers to notice repeated minor behaviours or incidents and record them.\n\nOne minor incident may not cause much harm. Repeated, the harm builds. A pattern tells you past incidents weren't managed well enough to stop them recurring, and that you need a different solution.",
      },
      {
        kind: "scenario",
        id: "asterisk",
        title: "Simon spots a pattern",
        context:
          "Checking the IMS, Simon finds other reports of Mimi's things going missing. He recognises a pattern. But there's no evidence anyone stole anything, so instead of finding a different way to prevent it, he adds an asterisk to the record to come back to if anyone ever admits to theft.",
        prompt: "Is this the right action?",
        choices: [
          {
            id: "no",
            text: "No. A pattern means past responses haven't worked, so Simon needs to act on it now",
            verdict: "best",
            feedback: "Right. Patterns are a signal to find a different solution, not to wait.",
          },
          {
            id: "yes",
            text: "Yes. Without evidence of theft there's nothing to act on",
            verdict: "risky",
            feedback: "No. The pattern itself needs managing, whatever the cause turns out to be.",
          },
        ],
      },
      {
        kind: "text",
        id: "privacy",
        title: "Privacy and keeping records",
        body: "Keep personal and sensitive information, including incident records, stored securely, and protect privacy when records are shared inside or outside the organisation. Use a notice of collection when you gather personal or sensitive information from or about anyone affected.\n\nPrivacy laws (such as the Privacy Act 1988 and the Australian Privacy Principles) apply alongside the duty to protect older people's personal information in section 168 of the Aged Care Act 2024.\n\nKeep incident records for **7 years** after the date the incident was identified.",
        verify: "Confirm the 7-year retention period and the s168 reference against the Aged Care Act 2024 and Rules 2025, and Trilogy Care's records policy.",
      },
    ],
    short: {
      brief:
        "Record every incident connected with providing aged care services: those **during services**, those from a **failure to provide** services, **suspected or alleged** incidents, and **near misses**.\n\nA record includes:\n\n- what happened, who was involved and any witnesses\n- who's making the record, and what the first assessment found\n- who was consulted, and what was done\n- links to earlier incidents\n- who was notified, and when\n\nRecord minor incidents too. One may not cause much harm, but repeated, the harm builds. A **pattern** means past responses haven't stopped it, and a different solution is needed.\n\nStore records securely (paper records never go to a worker's home) and keep them for **7 years** after the date the incident was identified.",
      confidence: "I can record an incident with the details the IMS needs.",
    },
    keyPoints: [
      "Record every incident: during services, from a failure to provide services, suspected or alleged, and near misses.",
      "A record includes what happened, who was involved, the assessment, consultations, actions, links and notifications.",
      "Record minor incidents so patterns can be seen; a pattern means a different solution is needed.",
      "Store records securely and keep them for 7 years after the incident was identified.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "Which of these does NOT need to be in an incident record?",
        options: [
          opt(
            "a",
            "Personal details of the older person's representatives who weren't involved",
            "Correct: these aren't needed, and including them isn't good privacy practice.",
            true,
          ),
          opt("b", "A description of the incident and the people involved, including witnesses", "This is needed in the record."),
          opt("c", "Details of consultations with the older person affected", "This is needed in the record."),
          opt("d", "Whether there are earlier incidents it should be linked to", "This is needed in the record."),
        ],
        explain:
          "A record includes the description and people involved, the person recording, the initial assessment, consultations, actions taken and links to previous incidents. Details of people who weren't involved aren't part of it.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "Your IMS should let you record and identify which patterns?",
        options: [
          opt("a", "Any pattern of recorded incidents, however minor or serious", "Correct.", true),
          opt("b", "Only patterns of serious incidents", "No. Repeated minor incidents can build up to serious harm."),
          opt("c", "Only patterns the Commission asks about", "No. Patterns are for you to find and act on."),
          opt("d", "Only patterns involving the same worker", "No. Patterns can involve places, times, tasks or people."),
        ],
        explain:
          "Support workers to recognise and record repeated minor incidents. Each may not cause much harm, but repeated they can build up and increase harm.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "How long must incident records be kept?",
        options: [
          opt("a", "7 years after the date the incident was identified", "Correct.", true),
          opt("b", "3 years", "No. It's 7 years."),
          opt("c", "5 years", "No. It's 7 years."),
          opt("d", "Until the incident is closed", "No. Records are kept long after an incident is closed."),
        ],
        explain:
          "In line with best practice records management and legislative requirements, incident records are kept for 7 years after the date the incident was identified.",
      },
      {
        id: "q4",
        from: "new",
        prompt: "Which incidents must be recorded in the IMS?",
        options: [
          opt("a", "Incidents during services, from a failure to provide services, suspected or alleged incidents, and near misses", "Correct.", true),
          opt("b", "Only incidents that are reportable to the Commission", "No. Every incident is recorded, reportable or not."),
          opt("c", "Only incidents a worker witnessed", "No. Suspected and alleged incidents are recorded too."),
          opt("d", "Only incidents where someone was hurt", "No. Near misses are recorded too."),
        ],
        explain:
          "Every incident connected with providing aged care services that causes, or could reasonably be expected to cause, harm is recorded, including suspected or alleged incidents and near misses.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "A worker wants to finish writing up an incident at home tonight on the paper form. What's the right advice?",
        options: [
          opt("a", "Don't take incident records home: complete and store them securely through the provider's system", "Correct.", true),
          opt("b", "That's fine if the form goes back to the office tomorrow", "No. Paper records shouldn't go to a worker's home."),
          opt("c", "Photograph it on a personal phone instead", "No. That puts sensitive information at risk."),
          opt("d", "Email it to a personal address to finish later", "No. Records must be kept secure."),
        ],
        explain: "Incident records are personal and sensitive. Keep them in protected systems, and never take paper records to a worker's home.",
      },
    ],
  },
  {
    part: 2,
    n: 3,
    slug: "alis-p2-analysing-incidents",
    title: "Analysing incidents",
    summary: "The steps of incident analysis, when an investigation is needed, and how to investigate fairly.",
    outcome: "Analyse an incident with a problem-solving approach and decide whether to investigate.",
    minutes: 15,
    sensitive: true,
    explore: ["the key steps of incident analysis", "when an investigation is needed", "good practice in investigating"],
    blocks: [
      {
        kind: "text",
        id: "element",
        title: "Element 4: Analyse the incident",
        body: `Understand the underlying causes, and how systems and practice could change to reduce the risk of it happening again.\n\n**So far:** ${MIMI} The incident was recorded in the IMS and a meeting was set up with Mimi and Lynn. Simon found earlier reports of Mimi's things going missing.`,
        verify: "The source cites Rules 2025 Chapter 4, Part 10, Division 1 for analysis requirements; confirm the section reference.",
      },
      {
        kind: "flip",
        id: "must",
        title: "Your system for analysing incidents must let you",
        intro: "Turn each card.",
        cards: [
          { front: "Find the causes", back: "Confirm what caused the incident, not just what happened." },
          { front: "See trends", back: "Use incident data to spot trends and patterns." },
          { front: "Involve workers", back: "Talk with the workers involved about what happened and what would help." },
          { front: "Share and act", back: "Bring findings to clinical or governance meetings and decide what to change." },
        ],
        verify: "The source's four flip cards are pictures only; confirm these four points with Quality against the best practice guidance.",
      },
      {
        kind: "steps",
        id: "five-step",
        title: "The 5-step problem-solving approach",
        intro: "Analysis focuses on the first three steps. Steps 4 and 5 come in the next two modules.",
        steps: [
          { title: "1. Define the problem", body: "Understand the incident: what happened, and who was involved?" },
          { title: "2. Find the root causes", body: "Examine the incident and its causes. This may need an internal or external investigation." },
          { title: "3. Develop possible solutions", body: "Identify a range of ways to fix what caused it." },
          { title: "4. Select and implement a solution", body: "Choose and carry out the actions (Implementing actions)." },
          { title: "5. Evaluate the outcome", body: "Check whether it worked (Closing the loop)." },
        ],
      },
      {
        kind: "text",
        id: "extent",
        title: "How much analysis?",
        body: "How far you go, and who's involved, depends on:\n\n- how severe the incident was\n- its impact on the people affected, and their views\n- whether it could have been prevented, and the chance it happens again\n- whether the same or a similar incident has happened before, or involved the same people\n- whether it's a reportable incident under the SIRS\n- whether it may involve unlawful or criminal activity\n\nAfter analysis, decide whether an investigation is needed, and whether it's internal or external. Not every incident needs one.",
      },
      {
        kind: "reveal",
        id: "investigate",
        title: "Internal or external investigation?",
        intro: "Open each consideration.",
        items: [
          { title: "Severity and harm", body: "Serious harm, or a risk of it, points to an investigation." },
          { title: "Prevention and recurrence", body: "Could it have been prevented? Could it happen again?" },
          { title: "Worker conduct", body: "If a worker's conduct may be involved, the investigation must be fair and independent enough to be trusted." },
          { title: "Unlawful or criminal activity", body: "Police may investigate; don't do anything that would interfere." },
          {
            title: "The Commission",
            body: "After a SIRS notification, the Commission may require a final report, ask for specific remedial action, or require an investigation into an incident or pattern of incidents.",
          },
          { title: "Police and coroner", body: "When notified, these authorities decide whether they need you to investigate." },
        ],
      },
      {
        kind: "checklist",
        id: "plan",
        title: "Planning an investigation",
        intro: "Your procedures should set out how to investigate. Use this list to structure the plan.",
        items: [
          "Choose who will conduct the investigation",
          "Define its scope",
          "Identify sources of evidence",
          "Plan key actions and timeframes",
          "Identify the people affected",
          "Identify the risks",
          "Contact external parties, such as police or the coroner, if needed",
          "Make findings and recommend actions",
        ],
      },
      {
        kind: "scenario",
        id: "factors",
        title: "Should All Well Services investigate?",
        context: "Simon and Luca use the 5-step approach to analyse Mimi's incident. Now they must decide whether to hold an internal investigation.",
        prompt: "Which factors should guide their decision?",
        choices: [
          {
            id: "a",
            text: "How severe or harmful it was, whether it could recur, whether a worker's conduct is involved, and whether it may be unlawful",
            verdict: "best",
            feedback: "Yes. These are the factors that decide whether an investigation is needed.",
          },
          {
            id: "b",
            text: "Whether Simon has time this week",
            verdict: "risky",
            feedback: "No. Workload isn't a reason to investigate or not.",
          },
          {
            id: "c",
            text: "Whether Mimi and Lynn want Simon to investigate",
            verdict: "acceptable",
            feedback: "Their views matter and shape the response, but they don't decide on their own whether an investigation is needed.",
          },
        ],
      },
      {
        kind: "scenario",
        id: "fair",
        title: "Being fair",
        context: "Simon decides to investigate. Janie is the worker Lynn suspects.",
        prompt: "How can Simon show the investigation is fair?",
        choices: [
          {
            id: "a",
            text: "Let the people affected take part, communicate openly, explain everyone's rights and responsibilities, and give procedural fairness, including to Janie",
            verdict: "best",
            feedback: "Yes. A supportive, fair investigation does all four, and the plan should say how.",
          },
          {
            id: "b",
            text: "Keep Janie out of it so she can't influence the outcome",
            verdict: "risky",
            feedback: "No. Procedural fairness means Janie hears the concern and gets to respond.",
          },
          {
            id: "c",
            text: "Decide the outcome first, then collect evidence to support it",
            verdict: "risky",
            feedback: "No. Findings come from the evidence.",
          },
        ],
      },
    ],
    short: {
      brief:
        "Analysis is about understanding the **underlying causes** of an incident, and how systems and practice could change to reduce the risk of it happening again. It focuses on the first three steps of the 5-step problem-solving approach:\n\n1. Define the problem\n2. Find the root causes\n3. Develop possible solutions\n\nHow far you go depends on how severe it was, its impact and the person's views, whether it could have been prevented or could recur, whether it's happened before, whether it's reportable under the SIRS, and whether it may be unlawful.\n\n**Not every incident needs an investigation**, but your IMS must say when one does. If you investigate, plan it and keep it fair: participation, open communication, clear rights and responsibilities, and procedural fairness, including for the worker involved.",
      confidence: "I can decide whether an incident needs investigating, and explain why.",
    },
    keyPoints: [
      "Analysis focuses on defining the problem, finding root causes and developing possible solutions.",
      "How much analysis depends on severity, impact, preventability, history, reportability and possible criminality.",
      "Not every incident needs an investigation, but your IMS must say when one does.",
      "Investigations are planned and fair: participation, communication, rights and responsibilities, procedural fairness.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "Which three steps should incident analysis focus on?",
        options: [
          opt("a", "Define the problem, find the root causes, and develop possible solutions", "Correct.", true),
          opt("b", "Define the problem, implement the solution, and evaluate the outcome", "No. Implementing and evaluating come after analysis."),
          opt("c", "Find who was at fault, discipline them, and close the record", "No. Analysis is about causes and learning."),
          opt("d", "Notify the Commission, notify police, and close the record", "No. Those are reporting steps, not analysis."),
        ],
        explain:
          "Analysis covers step 1, define the problem; step 2, determine the root causes; step 3, develop possible solutions. Implementing and evaluating solutions are the next steps.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "Do you need to investigate every incident?",
        options: [
          opt("a", "No. Often the causes are clear from the first analysis, but your IMS must say when to investigate", "Correct.", true),
          opt("b", "Yes. Every incident needs a formal investigation", "No. Many incidents' causes are clear from the initial analysis."),
          opt("c", "Only if the Commission asks", "No. Your own IMS also decides when to investigate."),
          opt("d", "Only if someone was injured", "No. Investigation depends on several factors, not injury alone."),
        ],
        explain:
          "Not every incident needs investigating. Your IMS must say when further investigation is needed to find causes, the level of harm and any operational issues. The Commission can also require one after a SIRS notification.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Which is part of planning an investigation?",
        options: [
          opt("a", "Define the scope and identify sources of evidence", "Correct.", true),
          opt("b", "Decide the outcome before gathering evidence", "No. Findings come from the evidence."),
          opt("c", "Keep the older person out of it to avoid upsetting them", "No. People affected should be able to take part."),
          opt("d", "Contact police only once the investigation is finished", "No. Contact external parties when needed, not afterwards."),
        ],
        explain:
          "An investigation plan covers who investigates, scope, sources of evidence, key actions and timeframes, people affected, risks, external parties, and findings and recommendations.",
      },
      {
        id: "q4",
        from: "new",
        prompt: "After receiving a SIRS notification, what can the Commission do?",
        options: [
          opt("a", "Require a final report, ask for specific remedial action, or require an investigation", "Correct.", true),
          opt("b", "Nothing: a notification is only for its records", "No. The Commission can act on notifications."),
          opt("c", "Take over managing the incident from the provider", "No. The provider keeps managing the incident."),
          opt("d", "Only pass it to the police", "No. The Commission has its own range of actions."),
        ],
        explain:
          "The Commission may require a final report about an incident, request specific remedial action, or require an investigation of an incident or a pattern of incidents.",
      },
      {
        id: "q5",
        from: "module activity",
        prompt: "During an investigation, how does a provider show it's being fair?",
        options: [
          opt("a", "Participation, open communication, explaining rights and responsibilities, and procedural fairness", "Correct.", true),
          opt("b", "Not telling the worker involved until it's over", "No. Procedural fairness lets them respond."),
          opt("c", "Keeping the older person and family out of it", "No. Those affected should be able to take part."),
          opt("d", "Finishing it as quickly as possible, whatever the evidence", "No. Speed doesn't replace fairness."),
        ],
        explain:
          "A supportive, fair approach lets those affected participate, communicates through open disclosure, makes sure everyone knows their rights and responsibilities, and gives procedural fairness.",
      },
    ],
  },
  {
    part: 2,
    n: 4,
    slug: "alis-p2-implementing-actions",
    title: "Implementing actions",
    summary: "Choosing actions that prevent incidents and improve care, and turning them into an action plan.",
    outcome: "Choose actions in response to an incident and build them into an action plan.",
    minutes: 15,
    sensitive: true,
    explore: ["questions to decide what to do after an incident", "actions that improve care and prevent ongoing risk", "the parts of an action plan"],
    blocks: [
      {
        kind: "text",
        id: "element",
        title: "Element 5: Implement actions",
        body: `Implement actions that improve how incidents are handled and help prevent future risk, then monitor whether they work.\n\n**So far:** ${MIMI} A SIRS notification of alleged stealing by a worker was made to the Commission. The next day, another look around Mimi's home found the perfume, and All Well Services updated the Commission. The investigation found Mimi had a history of misplacing things that workers had quickly found: near misses that had never been recorded in the IMS.`,
        verify: "The source cites Rules 2025 Chapter 4, Part 10, Division 1 for improvement requirements; confirm the section reference.",
      },
      {
        kind: "reveal",
        id: "questions",
        title: "Three questions for choosing actions",
        intro:
          "After analysis (and any investigation), act to prevent similar incidents or reduce their harm, and to handle them better. First ask: could it have been prevented, is there ongoing risk, and how do we reduce it? Then open each question.",
        items: [
          { title: "What are we trying to accomplish?", body: "Set clear goals and expectations for the action." },
          { title: "How will we know the action has led to an improvement?", body: "Decide now what you'll measure or check." },
          { title: "What changes will lead to lasting improvement?", body: "Look for changes that stick, not quick fixes." },
        ],
      },
      {
        kind: "text",
        id: "examples",
        title: "Examples of actions",
        body: "- train or re-train workers\n- change organisational or clinical governance\n- review, update or write procedures\n- change the environment or equipment\n- promote a safety culture (for example, in induction)\n- add extra workers for a task (for example, two-person transfers)\n- get specialist advice or use other strategies to manage risk\n- update the older person's care and services plan with the causes or impacts of the incident\n- involve Human Resources where needed",
      },
      {
        kind: "steps",
        id: "action-plan",
        title: "Building an action plan",
        intro: "Once you've chosen your actions, plan them. Step through.",
        steps: [
          { title: "Define the actions", body: "Break them down logically and in sequence. This is the framework for the plan." },
          { title: "Set expectations", body: "What does success look like, and by when?" },
          { title: "Assess risks and barriers", body: "What could get in the way?" },
          { title: "Identify resources and supports", body: "What will people need to carry it out?" },
          { title: "Delegate tasks", body: "Assign each task to the right person." },
          {
            title: "Communicate updates and findings",
            body: "Keep the older person, supporters and stakeholders informed, and update the Commission with significant new information if the incident was notified through the SIRS.",
          },
          { title: "Evaluate for lasting improvement", body: "Set aside time to check the changes are working over time." },
        ],
        verify: "The source shows only the first and last two steps in text; confirm the middle steps and their order with Quality.",
      },
      {
        kind: "scenario",
        id: "goals",
        title: "What does Simon want to achieve?",
        context:
          "Simon is deciding on actions after Mimi's incident: refresher IMS training, updating Mimi's care and services plan, and a cognitive assessment for Mimi.",
        prompt: "What should Simon consider when thinking about what they want to achieve?",
        choices: [
          {
            id: "a",
            text: "Set clear goals, and set expectations for the chosen actions",
            verdict: "best",
            feedback: "Yes. Goals and expectations tell everyone what success looks like.",
          },
          { id: "b", text: "Decide who to blame for the incident", verdict: "risky", feedback: "No. Blame doesn't prevent the next incident; clear goals do." },
          {
            id: "c",
            text: "Pick whichever action is quickest",
            verdict: "acceptable",
            feedback: "Simple can be fine, but choose actions for the improvement they make, not their speed.",
          },
        ],
      },
      {
        kind: "scenario",
        id: "contact",
        title: "Keeping in touch with Mimi",
        context: "Simon and Luca have put the actions in place.",
        prompt: "Should All Well Services keep in regular contact with Mimi?",
        choices: [
          {
            id: "yes",
            text: "Yes, regular contact about progress, actions and outcomes",
            verdict: "best",
            feedback: "Yes. Open disclosure continues: Mimi and Lynn hear about progress and changes.",
          },
          { id: "no", text: "No, the incident has been dealt with", verdict: "risky", feedback: "No. Communication continues through the whole process." },
        ],
      },
    ],
    short: {
      brief:
        "After analysis, act to prevent similar incidents or reduce their harm. First ask: could it have been prevented, is there ongoing risk, and how do we reduce it? Then three questions guide your choice:\n\n- What are we trying to accomplish?\n- How will we know the action has led to an improvement?\n- What changes will lead to lasting improvement?\n\nActions might be training, reviewing procedures, changing the environment or equipment, specialist advice, or updating the person's care and services plan.\n\nBuild them into an **action plan**: start by defining the actions logically and in sequence, then set expectations and plan supports, resources and who does what. Keep the person and their supporters informed, and **update the Commission** with significant new information if the incident was notified through the SIRS.",
      confidence: "I can choose actions after an incident and build them into a plan.",
    },
    keyPoints: [
      "Ask: what are we trying to accomplish, how will we know it's improved, and what will make it last?",
      "Actions can include training, procedures, environment, care plan updates and specialist advice.",
      "An action plan starts by defining actions logically and in sequence.",
      "Keep people informed, and update the Commission with significant new information.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "Which is NOT one of the three questions for choosing actions after an incident?",
        options: [
          opt("a", "What is the simplest thing we can change?", "Correct: simplicity isn't the test of a good action.", true),
          opt("b", "What do we want to achieve?", "This is one of the three questions."),
          opt("c", "How will we know a change creates an improvement?", "This is one of the three questions."),
          opt("d", "What changes will make a lasting improvement?", "This is one of the three questions."),
        ],
        explain:
          "The three questions are: what do we want to achieve; how will we know a change creates an improvement; what changes will make a lasting improvement. Whether an action is simple or complex isn't how to judge it.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "Which action helps prevent a similar incident happening again?",
        options: [
          opt("a", "Updating the person's care and services plan to address the causes or impacts of the incident", "Correct.", true),
          opt("b", "Removing the incident record once it's been dealt with", "No. Records are kept and used to learn."),
          opt("c", "Finding the person to blame", "No. Blame doesn't fix causes."),
          opt("d", "Recording fewer near misses to reduce workload", "No. Near misses are how you prevent incidents."),
        ],
        explain:
          "Actions that prevent recurrence include training, changes to governance, policies and procedures, promoting a safe culture of care, updating care and services plans, and educating older people and their supporters.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "What is the first step in creating an action plan?",
        options: [
          opt("a", "Define the actions by breaking them down logically and in sequence", "Correct. That's the framework for the plan.", true),
          opt("b", "Assess the risks and barriers", "No. That comes after the actions are defined."),
          opt("c", "Identify resources to support people", "No. That comes later."),
          opt("d", "Delegate tasks to the right people", "No. You need defined actions to delegate."),
        ],
        explain: "Start by defining actions logically and sequentially. Then set expectations and plan supports, resources and who does what.",
      },
      {
        id: "q4",
        from: "new",
        prompt: "Mimi's perfume is found the day after All Well Services notified the Commission. What should the provider do?",
        options: [
          opt("a", "Update the Commission with the significant new information", "Correct.", true),
          opt("b", "Nothing: the incident no longer exists", "No. The Commission needs to know what's changed."),
          opt("c", "Delete the IMS record", "No. The record stays, with the outcome added."),
          opt("d", "Wait for the Commission to ask", "No. New information is given as soon as reasonably practicable."),
        ],
        explain:
          "When an incident was (or should have been) notified through the SIRS, give the Commission any significant new information from analysis, investigation or the action plan as soon as reasonably practicable.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "The actions are in place. What should the organisation do next?",
        options: [
          opt("a", "Set aside time and resources to check the changes lead to lasting improvement", "Correct.", true),
          opt("b", "Close the record straight away", "No. First check the actions are working."),
          opt("c", "Stop contact with the older person", "No. Keep them informed."),
          opt("d", "Wait for another incident to see if it worked", "No. Evaluate on purpose, not by waiting."),
        ],
        explain: "Once actions are carried out, dedicate time and resources to review whether they result in sustained improvement over time.",
      },
    ],
  },
  {
    part: 2,
    n: 5,
    slug: "alis-p2-closing-the-loop",
    title: "Closing the loop",
    summary: "Using incident data to find systemic issues, evaluating what you did, and telling the right people about the outcome.",
    outcome: "Evaluate and communicate the outcome of an incident, and use incident data for continuous improvement.",
    minutes: 15,
    sensitive: true,
    explore: [
      "how analysing incident trends closes the loop",
      "evaluating and communicating outcomes",
      "how closing the loop helps meet continuous improvement obligations",
    ],
    blocks: [
      {
        kind: "text",
        id: "element",
        title: "Element 6: Close the loop",
        body: `Find and fix systemic issues; analyse incident trends and data and review the IMS regularly; keep improving quality and safety; and share lessons with leaders, workers, older people and their supporters.\n\n**So far:** ${MIMI} The perfume was found, the Commission was updated, and the investigation found unrecorded near misses. Recommendations were implemented, Mimi was involved through open disclosure, extra supports went into her care and services plan, and Simon and Luca reviewed how well the actions worked.`,
      },
      {
        kind: "steps",
        id: "cycle",
        title: "The closing-the-loop cycle",
        intro: "Closing the loop isn't the end. It's a cycle of continuous improvement. Step through it.",
        steps: [
          { title: "Identify trends and patterns", body: "Look across incidents and near misses, not just one." },
          { title: "Analyse the trends", body: "What do they tell you about risks and gaps?" },
          { title: "Make changes", body: "Improve care, systems and the IMS itself." },
          { title: "Give and get feedback", body: "Share what you learnt and hear from workers, older people and supporters." },
        ],
      },
      {
        kind: "text",
        id: "capture",
        title: "What your IMS must capture to close the loop",
        body: "Enough data and information to:\n\n- identify and address systemic issues in the quality of your services\n- spot repeated similar incidents or near misses\n- analyse trends and find patterns\n- give workers feedback and training on preventing and managing incidents\n- give the Commission information when it asks\n\nReview and analyse incident data **regularly**. What does it say could be improved to reduce the risk of future incidents?",
      },
      {
        kind: "reveal",
        id: "evaluate",
        title: "Questions to evaluate your incident management",
        intro: "Ask these regularly. Open each.",
        items: [
          { title: "Have we achieved our goals?", body: "Compare what happened with what you set out to achieve." },
          { title: "Have the changes improved practice or reduced risk?", body: "Look at the evidence, such as fewer repeats." },
          { title: "What was the impact on older people and others involved?", body: "Ask them." },
          { title: "What further work do we need to do?", body: "Continuous improvement doesn't stop." },
          {
            title: "How good was our analysis and action?",
            body: "Think about how timely the analysis was, the actions taken, their results, the feedback from people involved, and the lessons learnt and shared.",
          },
        ],
      },
      {
        kind: "reveal",
        id: "communicate",
        title: "Who needs to hear the outcome",
        intro: "Communicating outcomes restores trust and shows what you've done to improve. Open each group.",
        items: [
          { title: "Older people and their supporters", body: "Those involved hear what was found and what changed, in a way that suits them." },
          { title: "Aged care workers", body: "Including workers involved, with fair process and in a way that suits their needs." },
          { title: "Internal stakeholders", body: "Managers, responsible persons and the governing body." },
          { title: "External agencies", body: "For example the police or the coroner, where involved." },
          { title: "The Commission", body: "When the incident was, or should have been, notified through the SIRS." },
          { title: "Other stakeholders", body: "Anyone else with a legitimate need to know, with privacy protected." },
        ],
      },
      {
        kind: "checklist",
        id: "outcomes",
        title: "Checklist: communicating outcomes and follow-up",
        intro: "Use this job aid when you share the outcome of an incident.",
        items: [
          "Share the outcome with decision-makers and get their input",
          "Identify who needs updates: people involved, supporters, workers and the governing body, external agencies, the Commission, others",
          "Work out what information each person or group needs, and protect the privacy of those involved",
          "Use each person's preferred way of communicating, with an interpreter if needed",
          "Record who you gave information to about the outcome",
          "Assign people to carry out any remaining actions",
          "Update the IMS and tell the relevant stakeholders",
        ],
      },
      {
        kind: "scenario",
        id: "janie",
        title: "Telling Janie the outcome",
        context: "Simon needs to tell Janie, the worker Mimi and Lynn suspected, the outcome of the incident management process.",
        prompt: "How should Simon approach it?",
        choices: [
          {
            id: "a",
            text: "Meet Janie face to face to explain the outcome and actions, and give her a written summary",
            verdict: "best",
            feedback: "Yes. A conversation respects Janie, and the written record makes the outcome clear.",
          },
          {
            id: "b",
            text: "Call Janie and talk it through, with nothing in writing",
            verdict: "acceptable",
            feedback: "A call can suit her, but a written outcome is important when someone was suspected.",
          },
          {
            id: "c",
            text: "Close the record without telling Janie, since the perfume was found",
            verdict: "risky",
            feedback: "No. The people involved, including the worker, should hear the outcome.",
          },
        ],
      },
      {
        kind: "callout",
        id: "close",
        style: "important",
        label: "When can an incident be closed?",
        body: "Close an incident in the IMS once the approved actions are complete, stakeholders have been told the outcome, and the IMS has been updated with the details and outcomes. Keep monitoring whether the actions reduce recurrence.",
      },
      {
        kind: "sequence",
        id: "order-cycle",
        title: "Mimi's incident, start to finish",
        intro:
          "Mimi's incident has now been through elements 2 to 6 of the IMS, from the first response to closing the loop. Look back over the whole chapter.",
        prompt: "Put the stages of managing Mimi's incident in the order they happen.",
        steps: [
          "Respond to the incident: Simon checks Mimi is safe and asks what support she needs",
          "Record and report the incident: the alleged stealing goes into the IMS and the Commission is notified",
          "Analyse the incident: Simon and Luca use the 5-step approach and investigate",
          "Implement actions: extra supports go into Mimi's care and services plan, and Mimi and Lynn hear about progress",
          "Close the loop: Simon and Luca review how well the actions worked and share the outcome, including with Janie",
        ],
        feedback:
          "Respond, record and report, analyse, implement actions, close the loop: elements 2 to 6 of an IMS. Closing the loop isn't the end. The data and lessons feed back into the cycle, so the next incident is handled better.",
      },
      {
        kind: "commit",
        id: "chapter-commit",
        title: "Your next step",
        intro: "You've followed one incident from the first response to closing the loop. Choose one thing to put into practice. Only you see what you pick.",
        prompt: "What's one thing you'll do at work this week?",
        suggestions: [
          "Find the incident first steps job aid and save it where I can reach it during a visit or a call",
          "Record the next near miss or minor incident I notice, however small, so patterns can be seen",
          "Ask my manager how incident outcomes are shared in our team, and what changed after a recent one",
        ],
        timing: "This week",
      },
    ],
    short: {
      brief:
        "Closing the loop isn't the end: it's a **cycle of continuous improvement**. Identify trends and patterns across incidents and near misses, analyse them, make changes, and give and get feedback.\n\nReview and analyse incident data **regularly**, and evaluate what you did: have you achieved your goals, have the changes reduced risk, and what was the impact on the people involved?\n\nTell the right people the outcome, in a way that suits each of them and with privacy protected: the person and their supporters, workers (including any worker involved), internal stakeholders, external agencies, and the Commission when the incident was, or should have been, notified through the SIRS.\n\n**Close an incident** only when the approved actions are complete, stakeholders know the outcome and the IMS is updated.",
      confidence: "I can share an incident's outcome and know when it can be closed.",
    },
    keyPoints: [
      "Closing the loop is part of a continuous cycle, not the end of the process.",
      "Review and analyse incident data regularly to find systemic issues and trends.",
      "Communicate outcomes in the way that suits each person, protecting privacy.",
      "Close an incident once actions are complete, stakeholders are informed and the IMS is updated.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt: "How often should you review and analyse incident data?",
        options: [
          opt("a", "Regularly, to focus your continuous improvement", "Correct.", true),
          opt("b", "Only after a reportable incident", "No. All incident data is reviewed regularly."),
          opt("c", "Once, when an incident is closed", "No. Trends only show up over time."),
          opt("d", "Only when the Commission asks", "No. Regular review is your own job."),
        ],
        explain: "Review and analyse incident data regularly to inform continuous improvement in quality and safety.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "How should you communicate incident outcomes to workers?",
        options: [
          opt("a", "In ways that suit their needs and the situation, including in writing where appropriate", "Correct.", true),
          opt("b", "Only in a meeting", "No. Choose the way that suits the person and situation."),
          opt("c", "Only by email", "No. One method won't suit everyone."),
          opt("d", "Workers don't need to hear outcomes", "No. Sharing outcomes is how workers learn."),
        ],
        explain: "Consider workers' needs and preferences, choose an appropriate way to communicate, and put outcomes in writing where appropriate.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "When can you label an incident 'closed' in the IMS?",
        options: [
          opt("a", "When the approved actions are complete, stakeholders are told the outcome, and the IMS is updated", "Correct.", true),
          opt("b", "When the decision-maker says most of the actions are done", "No. All approved actions need to be complete."),
          opt("c", "When the actions are done but the details are still to be entered", "No. The IMS must be updated first."),
          opt("d", "As soon as the older person is safe", "No. That's the start of the process, not the end."),
        ],
        explain:
          "Close the record after the approved actions are implemented, stakeholders know the outcome, and the IMS holds the details and outcomes. Keep monitoring the actions' effect over time.",
      },
      {
        id: "q4",
        from: "module activity",
        prompt: "Once a provider has closed the loop on an incident, does it need to look at that incident data again?",
        options: [
          opt("a", "Yes. Closing the loop is part of a continuous cycle of improvement", "Correct.", true),
          opt("b", "No. Once it's closed, it's over", "No. Data keeps informing trends and improvements."),
          opt("c", "Only if the same person has another incident", "No. Patterns can involve anyone."),
          opt("d", "Only if the Commission reopens it", "No. Ongoing review is the provider's job."),
        ],
        explain: "Closing the loop isn't the end of the process. It's part of a constant cycle of continuous improvement in incident management and analysis.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "Which group should hear the outcome of an incident's management?",
        options: [
          opt(
            "a",
            "Those involved and their supporters, workers, the governing body, external agencies and the Commission as relevant, with privacy protected",
            "Correct.",
            true,
          ),
          opt("b", "Only the person who reported it", "No. Several groups may need to know."),
          opt("c", "Everyone in the organisation, with full personal details", "No. Share what each group needs, and protect privacy."),
          opt("d", "Nobody: outcomes are confidential", "No. Communicating outcomes rebuilds trust."),
        ],
        explain:
          "Identify who needs the outcome (people involved, supporters, internal stakeholders, external agencies, the Commission and other stakeholders) and what each needs, while protecting privacy.",
      },
    ],
  },
];
