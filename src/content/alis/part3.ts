import type { AlisModule, AlisText } from "../alisCourse";
import { opt } from "./part1";

/*
  ALIS Part 3: SIRS in Home Services. The eight reportable incident types as they apply to funded aged care services in
  home and community settings (where three of them are defined differently from residential care), then SIRS in practice.
*/

const PRIORITY_VERIFY = "Confirm the Priority 1 criteria and the 24-hour, 5-day and 30-day timeframes against the current SIRS provider guidelines.";

/** The "Notifying a reportable incident" page every incident-type module shares. */
const notifying = (id: string, extra = ""): AlisText => ({
  kind: "text",
  id,
  title: "Notifying a reportable incident",
  body: `Every incident is managed in the IMS. If it's one of the eight reportable incident types, the provider also notifies the Commission, as Priority 1 or Priority 2. Workers escalate incidents internally; the registered provider is legally responsible for SIRS notifications.\n\nA reportable incident is **Priority 1** if:\n\n- it caused physical or psychological injury or discomfort that needs medical or psychological treatment to resolve; or\n- there are reasonable grounds to report it to police; or\n- it's unlawful sexual contact or inappropriate sexual conduct, an unexpected death resulting from the services delivered (or not delivered), or an unexplained absence during services with reasonable grounds to call police. These are always Priority 1.\n\nPriority 1: notify the Commission **within 24 hours** of becoming aware, with any required details not yet available **within 5 days**. Every other reportable incident is **Priority 2**: notify **within 30 calendar days**. Give significant new information as soon as reasonably practicable.\n\nNear misses aren't reportable, but they're recorded and managed in the IMS.${extra ? `\n\n${extra}` : ""}`,
  verify: PRIORITY_VERIFY,
});

/** What to do after the person is safe, shared by the "Your first priority?" modules. */
const NEXT_STEPS =
  "Once the older person is safe:\n\n- tell your supervisor or manager straight away\n- notify police or other authorities if there are reasonable grounds to\n- record the incident in the IMS\n- decide whether it's a reportable incident and, if so, whether it's Priority 1 or Priority 2\n- notify the Commission within the timeframe\n\nKeep supporting the person and practise open disclosure: address their needs, empathise and express regret or apologise, and explain what's being done so it doesn't happen again. Involve their supporters if they'd like. Apology protections differ by state and territory, so follow Trilogy Care's guidance.";

export const ALIS_PART_3: AlisModule[] = [
  {
    part: 3,
    n: 1,
    slug: "alis-p3-restrictive-practice",
    title: "SIRS in Home Services: Inappropriate use of restrictive practice",
    summary: "The five types of restrictive practice, when their use is reportable in a home or community setting, the warning signs, and what to do.",
    outcome: "Recognise and respond to inappropriate use of a restrictive practice in a home or community setting.",
    minutes: 15,
    sensitive: true,
    explore: [
      "conduct that is reportable inappropriate use of restrictive practices",
      "possible signs",
      "how to respond to an incident, allegation or suspicion",
      "when and how it's reported to the Commission",
    ],
    blocks: [
      {
        kind: "reveal",
        id: "types",
        title: "Five types of restrictive practice",
        intro: "Registered providers must only use restrictive practices as the Aged Care Act 2024 and Aged Care Rules 2025 allow. Open each type.",
        items: [
          { title: "Chemical restraint", body: "Using medication or a chemical substance mainly to influence a person's behaviour." },
          {
            title: "Environmental restraint",
            body: "Restricting a person's free access to parts of their environment, or to their belongings, such as locking doors or removing a mobility aid.",
          },
          { title: "Mechanical restraint", body: "Using a device to prevent, restrict or subdue a person's movement." },
          { title: "Physical restraint", body: "Using physical force to prevent, restrict or subdue a person's movement." },
          { title: "Seclusion", body: "Confining a person alone in a room or space they can't leave, or believe they can't leave." },
        ],
        verify:
          "Confirm the five definitions against Aged Care Rules 2025 (Chapter 1, Part 7, Division 2, s17-5) and the Commission's restrictive practices resources.",
      },
      {
        kind: "callout",
        id: "standard",
        style: "tip",
        label: "Did you know?",
        body: "Strengthened Quality Standard Outcome 3.2.7 asks relevant providers to minimise restrictive practices and make sure they're used only as a last resort, in the least restrictive form and for the shortest time, with the older person's informed consent, and are monitored and regularly reviewed.",
        verify: "Confirm the Outcome number 3.2.7 and wording.",
      },
      {
        kind: "jobaid",
        id: "first-steps-aid",
        title: "Job aid: incident first steps",
        intro:
          "Trilogy Care's own first steps for when you think a reportable incident may have happened, in a client's home or on the phone. It applies to every incident type in this chapter, so keep it where you can find it.",
        snippetId: "sirs-first-steps",
        why: "If you see or suspect a restrictive practice used in a way that isn't in the person's plan, the person's safety and a prompt alert to the incident responder come first.",
      },
      {
        kind: "text",
        id: "reportable",
        title: "When is it reportable?",
        body: "Using a restrictive practice is a reportable incident when it doesn't meet section 18 of the Aged Care Act 2024, which requires that it is:\n\n1. used only as a last resort, to prevent harm, after considering its likely impact\n2. used after alternative strategies, as far as possible\n3. used after those alternatives were documented\n4. used only as far as necessary and in proportion to the risk\n5. used in the least restrictive form and for the shortest time\n6. used with informed consent\n7. monitored and reviewed\n\n**In a home or community setting**, using a restrictive practice is **not** reportable only when all of these are true:\n\n- before it was used, the care and services plan set out when it may be used (including the behaviours of concern) and how (including duration, frequency and intended outcome)\n- it was used in those circumstances, in that way, and in line with the rest of the plan\n- its use was documented as soon as practicable afterwards\n\nEmergency use of a restrictive practice in a home or community setting is reportable, because it won't meet all those requirements.",
        verify:
          "This definition differs between home and residential settings (the Rules' Part 9 requirements apply to residential care). Confirm against Aged Care Rules 2025 Chapter 1, Part 7, Division 1, s16-15, and the SIRS guidelines for home services (Chapter 4).",
      },
      {
        kind: "callout",
        id: "supporters",
        style: "important",
        label: "Restraint by a family member",
        body: "If a supporter (not the provider) inappropriately restrains the person, it isn't a SIRS reportable incident because it isn't connected to the services. But if a worker sees or suspects it, escalate it straight away: safeguarding and other legal obligations still apply.",
      },
      {
        kind: "scenario",
        id: "barry",
        title: "Barry's sleeping tablet",
        context:
          "Barry is in his early 70s, lives at home, gets around well and makes his own decisions. His doctor prescribed sleeping tablets for occasional trouble sleeping, and they're in his care and services plan. One evening Barry tells Ryan, his registered nurse, he's been agitated and sleeping badly. Ryan asks if he'd like a sleeping tablet. Barry says yes, Ryan gives the prescribed dose as the plan sets out, and then checks on him for a couple of hours.",
        prompt: "Is this an inappropriate use of a restrictive practice?",
        choices: [
          {
            id: "no",
            text: "No. The tablet was prescribed, in his plan, offered with his consent and given as the plan sets out",
            verdict: "best",
            feedback: "Right. Barry chose it, the plan covered it, and Ryan monitored him. Nothing here is reportable.",
          },
          {
            id: "yes",
            text: "Yes. Barry was given medication to help him sleep",
            verdict: "risky",
            feedback: "No. Prescribed medication taken with consent, as the plan sets out, isn't chemical restraint.",
          },
        ],
      },
      {
        kind: "steps",
        id: "practice",
        title: "If a restrictive practice is used",
        intro: "Plan and manage any non-emergency restrictive practice with the older person, their supporters and health professionals. Step through.",
        steps: [
          {
            title: "Before",
            body: "The care and services plan (including any behaviour support plan) sets out when it may be used and how. It's developed with the person, considers risks, reflects their needs, goals and preferences, and is available where services are delivered.",
          },
          { title: "During", body: "It's used only as the plan sets out, as a last resort, in the least restrictive way and for the shortest time." },
          {
            title: "After",
            body: "It's documented as soon as practicable, monitored, and the plan is reviewed, especially when circumstances change or after an incident.",
          },
        ],
        verify: "Confirm the before, during and after conditions with the SIRS guidelines for home services (Chapter 4).",
      },
      {
        kind: "flip",
        id: "signs",
        title: "Warning signs",
        intro: "You may not see an incident happen, but you may see signs. Turn each card.",
        cards: [
          { front: "Withdrawn or fearful", back: "The person seems anxious, frightened or withdrawn, especially around certain people." },
          { front: "Unusually drowsy", back: "They're sleepy or sedated at unusual times, which could point to medication used to control behaviour." },
          { front: "Distressed or agitated", back: "Frustration or distress that's new or worse than usual." },
          { front: "Can't move freely", back: "They can't reach their walking aid, a room, or their belongings, or say they were stopped or shut in." },
        ],
        verify: "The source's sign cards are pictures only; confirm these four signs with the clinical owner.",
      },
      {
        kind: "scenario",
        id: "eliza",
        title: "Your first priority?",
        context:
          "Gareth, a volunteer, cleans for Eliza, who has poor mobility and is helped from room to room as her plan sets out. Short of time, he locks her in her bedroom and ignores her calls. An hour later Mariam arrives for personal care. Eliza tells her what happened.",
        prompt: "If you were Mariam, what's your first priority?",
        choices: [
          {
            id: "a",
            text: "Make sure Eliza is safe and well, including arranging medical or psychological treatment if she needs it",
            verdict: "best",
            feedback: "Yes. The person comes first. Then tell your manager so it's recorded, assessed and reported.",
          },
          { id: "b", text: "Record the incident in the IMS", verdict: "acceptable", feedback: "It must be recorded, but only after Eliza is safe." },
          { id: "c", text: "Report it to the Commission", verdict: "acceptable", feedback: "The provider reports it, but Eliza's safety comes first." },
          {
            id: "d",
            text: "Report it to the police",
            verdict: "acceptable",
            feedback: "Police may be needed if there are reasonable grounds, but look after Eliza first.",
          },
        ],
      },
      { kind: "text", id: "next", title: "Your next steps", body: NEXT_STEPS },
      notifying("notify"),
    ],
    short: {
      brief:
        "There are five types of restrictive practice: **chemical**, **environmental**, **mechanical** and **physical restraint**, and **seclusion**.\n\nIn a home or community setting, using one is **not** reportable only when all of these are true:\n\n- before it was used, the care and services plan set out when and how it may be used\n- it was used in those circumstances and in that way\n- its use was documented as soon as practicable afterwards\n\n**Emergency use at home is reportable.**\n\nThe person's safety and wellbeing come first. Then escalate and record it, and the provider notifies the Commission: **Priority 1** within 24 hours of becoming aware if it caused injury or discomfort needing medical or psychological treatment, or there are reasonable grounds to report it to police; otherwise **Priority 2** within 30 calendar days.",
      confidence: "I can tell when using a restrictive practice at home is reportable.",
    },
    keyPoints: [
      "The five types: chemical, environmental, mechanical, physical restraint and seclusion.",
      "At home, use is only not reportable when the plan set it out beforehand, it was used as planned, and it was documented promptly.",
      "Emergency use of a restrictive practice at home is reportable.",
      "The person's safety and wellbeing comes first; then escalate, record and report.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt:
          "Loren uses a walking stick, as her plan sets out. While vacuuming, Anya hides the stick so Loren won't walk around, then leaves without giving it back. Is this an inappropriate use of a restrictive practice?",
        options: [
          opt("a", "Yes. Hiding the stick stopped Loren moving freely around her home", "Correct. It's environmental restraint, and it's reportable.", true),
          opt("b", "No. Anya was worried Loren might hurt herself", "No. Good intentions don't make it a planned, consented practice."),
          opt("c", "No. Anya didn't touch Loren", "No. Restraint doesn't need physical contact."),
          opt("d", "Only if Loren fell", "No. The restraint itself is the incident."),
        ],
        explain:
          "Hiding Loren's walking stick restricted her movement in her own home. It wasn't in her plan, wasn't consented to and wasn't a last resort, so it's a reportable inappropriate use of a restrictive practice.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "That evening, Loren's personal care worker Yumiko realises what happened. What's Yumiko's first priority?",
        options: [
          opt("a", "Make sure Loren is safe and well, including arranging medical or psychological treatment if needed", "Correct.", true),
          opt("b", "Record the incident in the IMS", "Not first. Recording follows once Loren is safe."),
          opt("c", "Find Loren's walking stick", "Helpful, but part of making Loren safe, not the whole of it."),
          opt("d", "Call Anya to ask why she did it", "No. The provider follows that up through the IMS."),
        ],
        explain:
          "The first priority is the older person's safety and wellbeing, including any treatment. Then record the incident, report it to the Commission, and consider other authorities.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Loren wasn't physically hurt and says she doesn't need psychological treatment. How should the provider classify the incident?",
        options: [
          opt("a", "Priority 2", "Correct. No Priority 1 criterion is met.", true),
          opt("b", "Priority 1", "No. It didn't cause harm needing treatment, and nothing suggests grounds to call police."),
          opt("c", "Not reportable, just record it in the IMS", "No. Inappropriate use of a restrictive practice is reportable."),
          opt("d", "A near miss", "No. The restraint happened."),
        ],
        explain: "It didn't cause injury or discomfort needing medical or psychological treatment, so it's a Priority 2 reportable incident.",
      },
      {
        id: "q4",
        from: "knowledge check",
        prompt: "When must a Priority 2 reportable incident be notified to the Commission?",
        options: [
          opt("a", "Within 30 calendar days of becoming aware", "Correct.", true),
          opt("b", "Within 24 hours of becoming aware", "No. That's Priority 1."),
          opt("c", "Within 5 days", "No. Five days is for Priority 1 follow-up details."),
          opt("d", "At the provider's next quarterly report", "No. There's a fixed timeframe."),
        ],
        explain: "Priority 1: within 24 hours, with outstanding details within 5 days. Priority 2: within 30 calendar days of becoming aware.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "In a home or community setting, when is using a restrictive practice NOT a reportable incident?",
        options: [
          opt(
            "a",
            "When the care and services plan set out when and how it may be used beforehand, it was used that way, and it was documented promptly",
            "Correct. All three must be true.",
            true,
          ),
          opt("b", "Whenever it's used in an emergency", "No. Emergency use at home is reportable."),
          opt("c", "When a family member asked for it", "No. A request isn't the test."),
          opt("d", "When the worker thought it was safer", "No. It must be planned and documented."),
        ],
        explain:
          "At home, use is not reportable only when the plan set out the circumstances and manner beforehand, it was used as the plan says, and it was documented as soon as practicable.",
      },
    ],
  },
  {
    part: 3,
    n: 2,
    slug: "alis-p3-unexplained-absence",
    title: "SIRS in Home Services: Unexplained absence",
    summary: "When an older person going missing during services is reportable, who's at risk, and how to respond.",
    outcome: "Recognise and respond to an unexplained absence during the delivery of services.",
    minutes: 15,
    sensitive: true,
    explore: [
      "when an unexplained absence during services has happened",
      "who is at higher risk of going missing",
      "how to respond",
      "when and how it's reported to the Commission",
    ],
    blocks: [
      {
        kind: "text",
        id: "definition",
        title: "What is a reportable unexplained absence?",
        body: "For services in a home or community setting, the Aged Care Rules 2025 define it as the person being absent **from the setting during the delivery of services**, in circumstances where there are **reasonable grounds to report the absence to police**.\n\nIt's **always Priority 1**: notify the Commission within 24 hours of becoming aware when:\n\n- the person was in the provider's physical care immediately before they went missing, and\n- you didn't know of any reason for them going, and you're concerned, and\n- there are reasonable grounds to report them missing to police (whether or not you did).\n\nReasonable grounds include a risk to the person's health and safety: for example, they'd miss a dose of essential medicine, or don't have the cognition to look after themselves.",
        verify: PRIORITY_VERIFY,
      },
      {
        kind: "scenario",
        id: "hudson",
        title: "Hudson at the chemist",
        context:
          "Hudson has diabetes. His worker Luke takes him to collect his medication and have lunch. At the chemist Hudson feels lightheaded and goes to sit outside without telling Luke. Friends from his chess club pass by, see he's tired and drive him home. Luke can't find him, Hudson has no mobile, and he's due a blood sugar check before lunch. Worried, Luke calls the police.",
        prompt: "Is this an unexplained absence during the delivery of services?",
        choices: [
          {
            id: "yes",
            text: "Yes. Hudson went missing while in Luke's care, and there were reasonable grounds to call police",
            verdict: "best",
            feedback: "Right. It's a Priority 1 reportable incident, even though Hudson turned out to be safe.",
          },
          {
            id: "no",
            text: "No. He was with people he knew and got home safely",
            verdict: "risky",
            feedback: "No. What Luke knew at the time is what counts: Hudson was missing, with a health risk, while in his care.",
          },
        ],
      },
      {
        kind: "callout",
        id: "not-reportable",
        style: "important",
        label: "Not a SIRS unexplained absence",
        body: "If a worker arrives for a scheduled service and the person isn't home, or the person says they're going out while, say, home maintenance is being done, it isn't a reportable unexplained absence: they weren't in the provider's physical care. But if there's cause for concern, the worker tells the provider, and the provider follows up using the procedures agreed with the person.",
      },
      {
        kind: "text",
        id: "freedom",
        title: "Freedom and safety",
        body: "Under the Statement of Rights, older people have the right to freedom of movement and independence, and the right to safe care. Support people to keep their independence, including choosing when to be at home and when to go out, while you keep them safe.",
      },
      {
        kind: "flip",
        id: "at-risk",
        title: "Who's at higher risk of going missing?",
        intro: "Turn each card.",
        cards: [
          { front: "A recent change", back: "Someone who's recently moved, had a hospital stay, or had their routine change." },
          { front: "Needs help to walk", back: "Someone who relies on workers or a mobility aid, who may fall or tire while out." },
          { front: "Out in the community", back: "Someone who walks out alone often, especially in unfamiliar places." },
          {
            front: "Cognitive impairment or illness",
            back: "Someone with dementia, confusion, or a health condition like diabetes that makes time missing risky.",
          },
        ],
        verify: "The source's risk cards are pictures only; confirm these four risk groups with the clinical owner.",
      },
      {
        kind: "scenario",
        id: "marleen",
        title: "Your first priority?",
        context:
          "Marleen has impaired vision and bad knees, and noise upsets her. Her plan says workers should encourage her to sit in the garden while they vacuum. Kathryn arrives, sees Marleen asleep in her room, closes the door and vacuums. When she checks later, Marleen is gone. She isn't in the house or garden, and her walking stick and keys are still there.",
        prompt: "If you were Kathryn, what would you do?",
        choices: [
          {
            id: "a",
            text: "Call Marleen's supporters to see if they know where she is; if nobody does, call police straight away; tell your manager so it's recorded and reported",
            verdict: "best",
            feedback: "Yes. Act at once. Reasonable grounds exist, so it's a Priority 1 reportable incident the provider notifies within 24 hours.",
          },
          {
            id: "b",
            text: "Wait a couple of hours to see if she comes back",
            verdict: "risky",
            feedback: "No. Marleen is frail, can't see well and left her stick: waiting puts her at risk.",
          },
          {
            id: "c",
            text: "Finish the clean, then report it on your timesheet",
            verdict: "risky",
            feedback: "No. This needs action now, not at the end of the shift.",
          },
        ],
      },
      notifying(
        "notify",
        "Unexplained absence during services, with reasonable grounds to call police, is always Priority 1. Where there are reasonable grounds, police are notified too.",
      ),
    ],
    short: {
      brief:
        "At home or in the community, an unexplained absence is reportable when the person is absent **during the delivery of services** and there are **reasonable grounds to report the absence to police**. Reasonable grounds include a risk to their health and safety: for example, they'd miss a dose of essential medicine, or don't have the cognition to look after themselves.\n\nIt's **always Priority 1**: the provider notifies the Commission **within 24 hours** of becoming aware, and police are notified too.\n\nIt **isn't** a SIRS unexplained absence when a worker arrives for a scheduled service and the person isn't home: they weren't in the provider's physical care. If there's cause for concern, still tell the provider so it follows up.\n\nAct at once, and respect the person's freedom of movement while keeping them safe.",
      confidence: "I know what to do if someone goes missing during services.",
    },
    keyPoints: [
      "At home, it's reportable when the person goes missing during services and there are reasonable grounds to call police.",
      "Unexplained absence is always Priority 1: notify the Commission within 24 hours.",
      "A person not home when a worker arrives isn't a SIRS unexplained absence, but concerns are still followed up.",
      "Respect freedom of movement while keeping people safe.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt:
          "Janet arrives for Paolo's scheduled personal care, but he isn't home. She calls his family contact, leaves a message and tells her manager. Paolo is independent and there's no reason for concern. Should this be reported to the Commission?",
        options: [
          opt("a", "No. Paolo wasn't in the provider's care when he left, so it isn't a reportable unexplained absence", "Correct.", true),
          opt("b", "Yes. Any missed visit is an unexplained absence", "No. He wasn't in the provider's physical care."),
          opt("c", "Yes, within 30 days as Priority 2", "No. It isn't reportable at all."),
          opt("d", "Only if the family doesn't call back within an hour", "No. There's no concern here; it isn't reportable."),
        ],
        explain:
          "Workers don't notify the Commission when they arrive for a scheduled service and the person isn't there. With concern, the provider would still follow up.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "The Commission doesn't need to be notified about Paolo. What else should happen?",
        options: [
          opt("a", "Talk with Paolo and his family about how to cancel or change services, and record it in the IMS and his plan", "Correct.", true),
          opt("b", "Nothing. It isn't reportable", "No. It still helps to record it and agree how to cancel visits."),
          opt("c", "Stop his services until he explains", "No. That isn't a proportionate response."),
          opt("d", "Report Paolo to police as a missing person", "No. There's no cause for concern."),
        ],
        explain:
          "Make sure the person knows how to cancel or change services, and record it in the IMS and care and services plan so any pattern can be understood over time.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt:
          "At a community dinner, Jovana leaves while her worker Alexandria is in the bathroom. Jovana has left with family before. Alexandria calls the family contact, and Jovana's sister says she picked her up. Is this reportable to the Commission?",
        options: [
          opt("a", "No. She was quickly found to be with a trusted family member, with no reasonable grounds to call police", "Correct.", true),
          opt("b", "Yes. She left during a service", "No. It's only reportable with reasonable grounds to call police."),
          opt("c", "Yes, as Priority 2", "No. It isn't reportable at all."),
          opt("d", "Only if the sister didn't apologise", "No. That isn't the test."),
        ],
        explain:
          "Alexandria took reasonable steps and there were no safety concerns, so it isn't reportable. It's still recorded and managed in the IMS, and Jovana and her family are reminded how to tell the provider about planned absences.",
      },
      {
        id: "q4",
        from: "new",
        prompt: "An unexplained absence during services meets the reportable definition. How is it classified?",
        options: [
          opt("a", "Always Priority 1: notify the Commission within 24 hours", "Correct.", true),
          opt("b", "Priority 2, unless the person was hurt", "No. It's always Priority 1."),
          opt("c", "Priority 1 only if the person isn't found within a day", "No. It's Priority 1 from the start."),
          opt("d", "It isn't reportable if the person is found safe", "No. It's reportable when there were reasonable grounds to call police."),
        ],
        explain: "Unexplained absence during services, with reasonable grounds to call police, is always a Priority 1 reportable incident.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "Which is an example of 'reasonable grounds' to report a missing person to police?",
        options: [
          opt("a", "They'd miss a dose of essential medicine, or don't have the cognition to look after themselves", "Correct.", true),
          opt("b", "They told the worker they were going to the shops", "No. That's a known reason, not an unexplained absence."),
          opt("c", "They weren't home when the worker arrived", "No. They weren't in the provider's care."),
          opt("d", "They were late back from a walk with a friend", "No. Not without a risk to their health or safety."),
        ],
        explain:
          "Reasonable grounds include a risk to the person's health and safety, such as missing essential medicine or lacking the cognition to care for themselves.",
      },
    ],
  },
  {
    part: 3,
    n: 3,
    slug: "alis-p3-neglect",
    title: "SIRS in Home Services: Neglect",
    summary: "What reportable neglect is, the difference between neglect and a person's choice, the warning signs, and what to do.",
    outcome: "Recognise and respond to reportable neglect, and tell it apart from a person's documented choice.",
    minutes: 15,
    sensitive: true,
    explore: ["conduct that is reportable neglect", "possible signs", "how to respond", "when and how it's reported"],
    blocks: [
      {
        kind: "text",
        id: "definition",
        title: "What is reportable neglect?",
        body: "Neglect is reportable when a provider, worker or responsible person has:\n\n- been reckless or intentionally negligent in delivering services; or\n- caused or contributed to a **significant failure** to deliver services, or a **repeated or ongoing pattern** of poor conduct; or\n- delivered inadequate or substandard services; or\n- delivered services that put the person at risk of serious injury or illness.\n\nIt's **not** reportable when the incident results from the person's own choice about their services, and before the incident they'd told the provider, who recorded the choice in writing.",
        verify: "Confirm the neglect definition and the choice exception against the Aged Care Rules 2025 (s16-5).",
      },
      {
        kind: "scenario",
        id: "hugh",
        title: "Hugh's knee",
        context:
          "Hugh, in his 80s, lives at home with his wife; a registered nurse care manager oversees his care. Before his worker arrives, he trips and opens a wound on his knee. Stephanie arrives to clean and cook. Hugh shows her the wound and asks for help. She says she's only there to clean and cook, finishes and leaves. That evening his son Callum sees he's in pain and helps him complain.",
        prompt: "Is there evidence of neglect?",
        choices: [
          {
            id: "yes",
            text: "Yes. Stephanie didn't tell the care manager, so treatment wasn't arranged",
            verdict: "best",
            feedback: "Right. Stephanie didn't need to treat the wound herself, but she needed to escalate it.",
          },
          {
            id: "no",
            text: "No. The fall happened before Stephanie arrived",
            verdict: "risky",
            feedback: "No. The fall wasn't neglect; failing to escalate the wound was.",
          },
        ],
      },
      {
        kind: "callout",
        id: "single-or-ongoing",
        style: "tip",
        label: "Did you know?",
        body: "Neglect can be one significant failure that causes harm, or ongoing, repeated failures to meet assessed needs. It isn't reportable neglect when someone is waiting for a higher level of care that isn't funded, or needs a service outside what the provider delivers. Talk with them about the risks and how to manage them in the meantime.",
      },
      {
        kind: "text",
        id: "choice",
        title: "Choice, control and dignity of risk",
        body: "Older people have the right to control their care, make their own choices, and decide how much risk they accept. Balance your duty to deliver services with supporting those choices, even risky ones.",
      },
      {
        kind: "scenario",
        id: "hazel",
        title: "Hazel stays in bed",
        context:
          "Hazel's health is declining, but she wants to stay at home. Her written plan sets out her morning routine, because she gets agitated without it. One morning she refuses to get up. Her worker Lara gives her time and tries again, reminds her she may feel agitated later, but Hazel wants to stay in bed. Lara records Hazel's refusal as the provider's procedures say.",
        prompt: "Is there evidence of neglect?",
        choices: [
          {
            id: "no",
            text: "No. Hazel made an informed choice, and Lara respected it and recorded it",
            verdict: "best",
            feedback: "Right. Respecting an informed choice isn't neglect, and recording it helps coordinate her care.",
          },
          {
            id: "yes",
            text: "Yes. Lara withheld personal care",
            verdict: "risky",
            feedback: "No. Lara offered care twice; Hazel chose not to accept it.",
          },
        ],
      },
      {
        kind: "callout",
        id: "cognition",
        style: "important",
        label: "When the person has cognitive impairment",
        body: "If a person with cognitive impairment refuses services they need, and that could harm them, tell their substitute decision-maker and make every reasonable effort to encourage them (or find another way to deliver the service). Never let a person's cognitive impairment sway your judgement about whether an incident is reportable. Record every incident or near miss in the IMS.",
      },
      {
        kind: "flip",
        id: "signs",
        title: "Warning signs of neglect",
        intro: "Turn each card.",
        cards: [
          { front: "Untreated illness", back: "Ongoing symptoms, like a cold or infection, that aren't being looked after." },
          { front: "Weight loss", back: "Unexplained weight loss or signs of poor nutrition." },
          { front: "Dehydration", back: "No water within reach, dry lips, confusion." },
          { front: "Oversleeping", back: "Unusual drowsiness, possibly from medication issues." },
          { front: "Poor hygiene", back: "Unwashed hands, clothes or body, or a dirty living space." },
          { front: "Wrong clothing", back: "Dressed inappropriately for the weather." },
          { front: "Isolation", back: "Left alone for long periods, or cut off from others." },
          { front: "Low mood", back: "Sadness, withdrawal or loss of interest." },
          { front: "Untreated wounds", back: "Wounds, pressure areas or skin tears that aren't being cared for." },
        ],
        verify: "The source's sign cards are pictures only; confirm these nine signs with the clinical owner.",
      },
      {
        kind: "hazard",
        id: "spot-neglect",
        title: "Spot the signs: a visit to Mrs Vella",
        intro:
          "Mrs Vella lives alone with her cat, and other workers have covered her last few visits. Look around her unit: some things are signs of possible neglect, and some are simply how she likes to live. Flag what concerns you, say what you'd deal with first, then choose what to do within your role.",
        sceneId: "neglect",
        verify:
          "The scene's signs, priorities and actions follow this module's warning signs and the sirs-first-steps Job Aid; Quality and the clinical owner sign off the scene's variants in its own review.",
      },
      {
        kind: "scenario",
        id: "richard",
        title: "Your first priority?",
        context:
          "Richard, in his 70s with mild cognitive impairment, relies on his worker Shelley for errands. On a 40-degree day she leaves him in the car while she queues at the chemist for 25 minutes. Passers-by see him panting, sweating and distressed and call police. Shelley returns to find him much worse.",
        prompt: "What should Shelley do first?",
        choices: [
          {
            id: "a",
            text: "Reassure Richard and make sure he's safe, including getting medical treatment if he needs it",
            verdict: "best",
            feedback: "Yes. Richard needs help now. If he needs medical treatment, it's a Priority 1 incident.",
          },
          { id: "b", text: "Record the incident in the IMS", verdict: "acceptable", feedback: "Later. Richard comes first." },
          { id: "c", text: "Report it to the Commission", verdict: "acceptable", feedback: "The provider does this, after Richard is safe." },
          { id: "d", text: "Explain to the police why she left him", verdict: "risky", feedback: "No. Richard's health is the urgent issue." },
        ],
      },
      {
        kind: "callout",
        id: "treatment",
        style: "tip",
        label: "Medical or psychological treatment",
        body: "Anyone can give general first aid, but medical or psychological treatment is given by a medical practitioner, nurse practitioner, registered nurse, psychologist or social worker. If an incident needs that treatment, it's Priority 1.",
        verify: "Confirm the list of practitioners who provide medical or psychological treatment under the SIRS guidelines.",
      },
      { kind: "text", id: "next", title: "Your next steps", body: NEXT_STEPS },
      notifying("notify"),
    ],
    short: {
      brief:
        "Neglect is reportable when a provider, worker or responsible person has:\n\n- been reckless or intentionally negligent in delivering services\n- caused or contributed to a **significant failure** to deliver services, or a **repeated or ongoing pattern** of poor conduct\n- delivered inadequate or substandard services, or services that put the person at risk of serious injury or illness\n\nIt's **not** reportable when it results from the person's own choice, which they told the provider before the incident and the provider recorded in writing.\n\nWatch for weight loss, dehydration, poor hygiene and untreated wounds. Look after the person first, then escalate and record. **Priority 1** (within 24 hours) if it caused injury or discomfort needing medical or psychological treatment, or there are reasonable grounds to report it to police; otherwise **Priority 2** (within 30 calendar days).",
      confidence: "I can tell neglect apart from a person's own recorded choice.",
    },
    keyPoints: [
      "Neglect can be a single significant failure or a repeated pattern.",
      "A person's informed choice, told to the provider and recorded in writing beforehand, isn't reportable neglect.",
      "Watch for signs like weight loss, dehydration, poor hygiene and untreated wounds.",
      "Look after the person first, then escalate, record and report.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt:
          "Susan's speech pathologist told the provider she needs pureed food because of choking, but her plan was never updated. A new worker checks the plan, sees no restrictions, and serves steak. Susan chokes, and the worker clears it. Is this a reportable incident?",
        options: [
          opt("a", "Yes. It's neglect: the provider failed to update her plan after the assessment", "Correct.", true),
          opt("b", "No. The worker followed the plan", "No. The failure was the provider's, in not updating the plan."),
          opt("c", "No. Susan recovered quickly", "No. It could reasonably have been expected to cause harm."),
          opt("d", "Only if Susan needed hospital treatment", "No. Harm needing treatment affects the priority, not whether it's reportable."),
        ],
        explain:
          "The provider failed to update Susan's care and services plan after an allied health assessment, so her worker didn't know her needs. That's reportable neglect.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "You've identified neglect of an older person. Which response is NOT appropriate?",
        options: [
          opt(
            "a",
            "Ask the person to make their own complaint to the Commission",
            "Correct: this is not appropriate. The provider responds and reports.",
            true,
          ),
          opt("b", "Make sure the person is safe and well, including any treatment", "This is appropriate."),
          opt("c", "Record the incident in the IMS", "This is appropriate."),
          opt("d", "Decide whether it's Priority 1 or 2 and notify the Commission", "This is appropriate."),
        ],
        explain:
          "Support the person, arrange any treatment, notify police if there are reasonable grounds, record it in the IMS, decide its priority and notify the Commission, and practise open disclosure.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Susan wasn't injured and didn't need treatment. How is the incident classified?",
        options: [
          opt("a", "Priority 2", "Correct.", true),
          opt("b", "Priority 1", "No. No injury needing treatment, and no grounds to call police."),
          opt("c", "Not reportable: manage it in the IMS only", "No. It could reasonably have been expected to cause harm."),
          opt("d", "A near miss", "No. The neglect happened."),
        ],
        explain:
          "No injury or discomfort needing treatment occurred (perhaps only by luck), so it isn't Priority 1. But the neglect could reasonably have been expected to cause harm, so it's a Priority 2 reportable incident.",
      },
      {
        id: "q4",
        from: "knowledge check",
        prompt: "When must a Priority 2 reportable incident be notified to the Commission?",
        options: [
          opt("a", "Within 30 calendar days of becoming aware", "Correct.", true),
          opt("b", "Within 24 hours of becoming aware", "No. That's Priority 1."),
          opt("c", "Within 7 days", "No. It's 30 calendar days."),
          opt("d", "When the provider's investigation finishes", "No. The timeframe runs from becoming aware."),
        ],
        explain: "Priority 2 reportable incidents are notified within 30 calendar days of becoming aware.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "When is an incident that looks like neglect NOT reportable?",
        options: [
          opt(
            "a",
            "When it resulted from the person's own choice, which they told the provider before it happened and the provider recorded in writing",
            "Correct.",
            true,
          ),
          opt("b", "When the worker was very busy that day", "No. Workload doesn't change what's reportable."),
          opt("c", "When the person has cognitive impairment and may not notice", "No. Never let impairment sway whether it's reportable."),
          opt("d", "When the family doesn't want it reported", "No. The provider's obligation stands."),
        ],
        explain:
          "Neglect isn't reportable when it results from the person's choice about their services, communicated to the provider and recorded in writing before the incident.",
      },
    ],
  },
  {
    part: 3,
    n: 4,
    slug: "alis-p3-psychological-abuse",
    title: "SIRS in Home Services: Psychological or emotional abuse",
    summary: "What counts as psychological or emotional abuse, why repeated behaviour matters, the warning signs, and what to do.",
    outcome: "Recognise and respond to psychological or emotional abuse of an older person.",
    minutes: 15,
    sensitive: true,
    explore: ["conduct that is psychological or emotional abuse", "possible signs", "how to respond", "when and how it's reported"],
    blocks: [
      {
        kind: "reveal",
        id: "conduct",
        title: "What counts?",
        intro:
          "The Aged Care Rules 2025 define it as conduct that has caused, or could reasonably have been expected to cause, the person psychological or emotional distress. Open each kind of conduct.",
        items: [
          { title: "Taunting, bullying, harassment or intimidation", body: "Mocking, belittling, pressuring or frightening the person." },
          { title: "Threats of maltreatment", body: "Threatening to withhold care or treat the person badly." },
          { title: "Humiliation", body: "Embarrassing the person or making them feel ashamed." },
          { title: "Unreasonable refusal to interact", body: "Ignoring the person or refusing to acknowledge they're there." },
          { title: "Unreasonable restriction of social contact", body: "Stopping the person from seeing or talking with people." },
          {
            title: "Repetitive conduct",
            body: "Repeated conduct or contact (short of unreasonable force) that causes distress, or could reasonably be expected to.",
          },
        ],
        verify: "Confirm the six kinds of conduct against the Aged Care Rules 2025 (s16-5).",
      },
      {
        kind: "scenario",
        id: "albert",
        title: "Albert's trip home",
        context:
          "A worker drives Albert to and from his weekly cards and coffee at a local café. On the way home, Albert asks to stop for a toilet. The worker says to wait. Albert asks again; the worker, running late, shouts and swears at him, then says: 'If we have to stop now, you'll only get a takeaway next week.'",
        prompt: "Which part is psychological or emotional abuse?",
        choices: [
          {
            id: "a",
            text: "Shouting and swearing at Albert, and threatening to cut his café visit as punishment",
            verdict: "best",
            feedback: "Right. Shouting, swearing and a threat to restrict his service are abuse.",
          },
          { id: "b", text: "Albert asking to use the toilet", verdict: "risky", feedback: "No. That's a reasonable request." },
          { id: "c", text: "The worker running late", verdict: "risky", feedback: "No. Running late is a scheduling issue, not abuse in itself." },
        ],
      },
      {
        kind: "callout",
        id: "patterns",
        style: "tip",
        label: "Did you know?",
        body: "Repeated behaviour can become abuse. One comment may not cause distress, but repeated, the harm builds. The IMS must record every incident, including ones that aren't reportable at first, so a pattern can be seen and notified when it reaches the threshold.",
      },
      {
        kind: "flip",
        id: "signs",
        title: "Warning signs",
        intro: "Turn each card.",
        cards: [
          { front: "Tearful", back: "Crying, or more emotional than usual." },
          { front: "Hiding", back: "Being secretive, or hiding information or belongings." },
          { front: "Withdrawn", back: "Pulling away from people or activities they enjoy." },
          { front: "Speech changes", back: "New stammering or reluctance to speak." },
          { front: "Weight change", back: "Unexplained weight gain or loss." },
          { front: "Low mood", back: "Depression or hopelessness." },
          { front: "Self-harm", back: "Self-destructive behaviour, or talk of suicide." },
          { front: "Unusual sleep", back: "Sleeping much more or less than usual." },
          { front: "Overly compliant", back: "Going along with workers in a way that's out of character." },
        ],
        verify: "The source's sign cards are pictures only; confirm these nine signs with the clinical owner.",
      },
      {
        kind: "scenario",
        id: "adrian",
        title: "Your first priority?",
        context:
          "Adrian, a volunteer, helps Bethany with household jobs. He hears Bethany's personal care worker, from the same provider, raise her voice at Bethany and make disparaging comments about her cultural identity.",
        prompt: "If you were Adrian, what's your first priority?",
        choices: [
          {
            id: "a",
            text: "Make sure Bethany is safe and well, and tell your supervisor so they can arrange any treatment she needs",
            verdict: "best",
            feedback: "Yes. Bethany first, then your supervisor, who records, assesses and reports it.",
          },
          { id: "b", text: "Record it in the IMS yourself", verdict: "acceptable", feedback: "It must be recorded, but Bethany's safety comes first." },
          {
            id: "c",
            text: "Report it to the Commission yourself",
            verdict: "acceptable",
            feedback: "The provider notifies the Commission; your first job is Bethany.",
          },
          {
            id: "d",
            text: "Confront the worker in front of Bethany",
            verdict: "risky",
            feedback: "No. That could make things worse for Bethany. Escalate it.",
          },
        ],
      },
      {
        kind: "text",
        id: "next",
        title: "Your next steps",
        body: "Once the person is safe, tell your supervisor, manager or a responsible person. They should:\n\n- record the incident in the IMS\n- decide whether it's reportable and, if so, Priority 1 or Priority 2\n- notify police or other authorities if there are reasonable grounds\n\nKeep supporting the person and practise open disclosure.",
      },
      notifying("notify"),
    ],
    short: {
      brief:
        "Psychological or emotional abuse is conduct that has caused, or could reasonably have been expected to cause, the person psychological or emotional distress. It includes:\n\n- taunting, bullying, harassment or intimidation\n- threats of maltreatment, and humiliation\n- unreasonable refusal to interact, or restriction of social contact\n- repeated conduct that causes distress\n\nRaising your voice so someone with hearing loss can hear you isn't abuse. Repeated behaviour can become abuse, so record every incident in the IMS, even ones that aren't reportable at first.\n\nSigns include being withdrawn, tearful or overly compliant. Look after the person first, then tell your supervisor. **Priority 1** (within 24 hours) if it caused injury or discomfort needing medical or psychological treatment, or there are reasonable grounds to report it to police; otherwise **Priority 2** (within 30 calendar days).",
      confidence: "I can recognise psychological or emotional abuse of an older person.",
    },
    keyPoints: [
      "Abuse includes taunting, threats, humiliation, ignoring the person, cutting them off socially, and repeated distressing conduct.",
      "Raising your voice so someone with hearing loss can hear you isn't abuse.",
      "Record every incident so patterns of repeated conduct are seen.",
      "Look after the person first, then escalate.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt:
          "Mario uses hearing aids and turns them down while his cleaner Timothy vacuums. When he's finished, Timothy raises his voice to get Mario's attention and say goodbye. Is this psychological or emotional abuse?",
        options: [
          opt("a", "No. Raising your voice to be heard by someone with hearing loss isn't abuse", "Correct.", true),
          opt("b", "Yes. Any raised voice is abuse", "No. Context matters: Timothy was making himself heard."),
          opt("c", "Yes, if Mario was startled", "No. Being startled isn't distress from abusive conduct."),
          opt("d", "Only if it happens every visit", "No. It's not abusive conduct at all."),
        ],
        explain:
          "Psychological or emotional abuse doesn't include raising your voice to get the attention of, or speak with, someone with hearing difficulties.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt:
          "Ailene has incontinence. After an accident, her worker Emily greets her the next week by remarking how many accidents she's had and joking, in a harsh tone, about whether she'll make it to the toilet. Ailene cries for hours. Which shows abuse?",
        options: [
          opt("a", "Emily's remarks and joke about Ailene's incontinence", "Correct. That's humiliation.", true),
          opt("b", "Ailene sometimes not reaching the toilet in time", "No. That's a health condition."),
          opt("c", "Emily helping Ailene clean up after the accident", "No. That's appropriate care."),
          opt("d", "Nothing here is abuse", "No. Emily's comments caused distress."),
        ],
        explain:
          "Joking about Ailene's incontinence humiliated her and caused distress. Abuse includes humiliation, taunting, bullying, harassment, intimidation and threats of maltreatment.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Ailene doesn't need psychological treatment but asks for a new worker. When must the provider notify the Commission?",
        options: [
          opt("a", "Within 30 calendar days, as Priority 2", "Correct.", true),
          opt("b", "Within 24 hours, as Priority 1", "No. No Priority 1 criterion is met."),
          opt("c", "Within 7 days", "No. That isn't a SIRS timeframe."),
          opt("d", "It's only recorded in the IMS", "No. Psychological or emotional abuse is reportable."),
        ],
        explain:
          "She didn't need medical or psychological treatment, and there's nothing to suggest grounds to call police, so it's Priority 2: within 30 calendar days.",
      },
      {
        id: "q4",
        from: "knowledge check",
        prompt: "Which of these is psychological or emotional abuse?",
        options: [
          opt("a", "Unreasonably restricting a person's ability to see their friends", "Correct.", true),
          opt("b", "Organising a day trip with the person's friends", "No. That supports social connection."),
          opt("c", "Asking the person what they'd like for lunch", "No. That's respectful care."),
          opt("d", "Reminding the person of an appointment", "No. That's support."),
        ],
        explain:
          "Threats of or withholding care, unreasonably refusing to interact, and restricting a person's social contact are all psychological or emotional abuse.",
      },
      {
        id: "q5",
        from: "knowledge check",
        prompt: "Which could be a sign someone has experienced psychological or emotional abuse?",
        options: [
          opt("a", "Becoming withdrawn, or overly compliant with workers in a way that's out of character", "Correct.", true),
          opt("b", "Looking forward to their weekly outing", "No. That's a good sign."),
          opt("c", "Asking for help with a form", "No. That's an ordinary request."),
          opt("d", "Chatting with their worker about family", "No. That's a positive relationship."),
        ],
        explain:
          "Signs include withdrawal, crying, secrecy, speech changes, weight change, depression, self-harm and being overly compliant. If you see them, support the person and escalate.",
      },
    ],
  },
  {
    part: 3,
    n: 5,
    slug: "alis-p3-stealing-financial-coercion",
    title: "SIRS in Home Services: Stealing or financial coercion",
    summary: "What counts as stealing or financial coercion by a worker, when a missing item is reportable, and what to do.",
    outcome: "Recognise and respond to suspected stealing or financial coercion by a worker.",
    minutes: 15,
    sensitive: true,
    explore: ["conduct that is stealing or financial coercion by a worker", "possible signs", "how to respond", "when and how it's reported"],
    blocks: [
      {
        kind: "text",
        id: "definition",
        title: "What is reportable stealing or financial coercion?",
        body: "The Aged Care Rules 2025 (s16-5(9)) cover:\n\n- **stealing** from the person by a worker of the provider, and\n- a worker's conduct that is **coercive or deceptive** about the person's finances, or **unreasonably controls** them.\n\nIt's about workers. Concerns about family members are handled through safeguarding, not the SIRS.",
        verify: "Confirm the definition and section reference (s16-5(9)) against the Aged Care Rules 2025.",
      },
      {
        kind: "scenario",
        id: "gavin",
        title: "Gavin's coffee",
        context:
          "Gavin makes his own decisions and loves going out. Each Wednesday his worker Ayla takes him shopping. Today he decides to stop for coffee and offers to buy Ayla one too. She thanks him and accepts.",
        prompt: "Is this reportable stealing or financial coercion?",
        choices: [
          {
            id: "no",
            text: "No. Gavin freely chose to buy a small thank-you",
            verdict: "best",
            feedback: "Right. A small gift freely given isn't reportable. Ayla should still follow the provider's gifts policy.",
          },
          { id: "yes", text: "Yes. Ayla accepted something from a client", verdict: "risky", feedback: "No. Nothing coercive or deceptive happened." },
        ],
      },
      {
        kind: "callout",
        id: "coercion",
        style: "tip",
        label: "What financial coercion looks like",
        body: "Forced, deceptive or fraudulent control of someone's finances. For example, a worker:\n\n- encouraging the person to give them gifts or money\n- advising them to change their will\n- misusing a power of attorney\n- deceiving them for their own gain\n- pressuring, bullying or threatening them for financial benefit",
      },
      {
        kind: "text",
        id: "missing",
        title: "When a missing item is reportable",
        body: "Not every missing item needs reporting. If an item can't be found, the person believes a worker is responsible, and they're concerned or distressed, notify the Commission. If it's found later, update the Commission.\n\nThe value of the item doesn't decide whether it's reportable. Losing something sentimental, or used every day, can hurt more than losing something expensive.",
      },
      {
        kind: "scenario",
        id: "liane",
        title: "Liane's ring",
        context:
          "Liane has had the same cleaning and personal care workers for four years and gets on well with them. After her worker leaves, she can't find her diamond ring. Her daughter Annie remembers Liane took it off in the bathroom two days ago. Annie calls the provider to say it's missing and ask if the worker has seen it.",
        prompt: "Is this reportable stealing by a worker?",
        choices: [
          {
            id: "a",
            text: "Not yet. Nobody has alleged a worker took it; record it, and help look",
            verdict: "best",
            feedback: "Right. Without an allegation or suspicion of a worker, it isn't reportable. Record it and follow up.",
          },
          {
            id: "b",
            text: "Yes. Annie called the provider, so it's reportable",
            verdict: "risky",
            feedback: "No. A call about a missing item isn't an allegation against a worker.",
          },
          { id: "c", text: "No. A ring isn't worth reporting", verdict: "risky", feedback: "No. Value never decides it; the absence of an allegation does." },
        ],
      },
      {
        kind: "flip",
        id: "signs",
        title: "Warning signs",
        intro: "Turn each card.",
        cards: [
          { front: "Unexplained transactions", back: "Withdrawals, transfers or purchases the person can't explain." },
          { front: "Changing finances", back: "Sudden changes in their accounts or financial reports." },
          { front: "Phone and online", back: "A worker using the person's phone, cards or online banking." },
          { front: "New cards or accounts", back: "Cards or accounts the person didn't ask for." },
          { front: "Missing money", back: "An empty wallet, or cash going missing." },
          { front: "Will changes", back: "Sudden changes to a will or power of attorney." },
          { front: "Asked for money", back: "A worker asking for loans, gifts or money." },
          { front: "Bills unpaid", back: "Bills going unpaid when there should be money for them." },
          { front: "Unusual outings", back: "A worker taking the person places that benefit the worker." },
        ],
        verify: "The source's sign cards are pictures only; confirm these nine signs with the clinical owner.",
      },
      {
        kind: "scenario",
        id: "hailee",
        title: "Your first priority?",
        context:
          "Hailee's souvenirs from years of travel mean a lot to her. Her cleaner Dario admires one; after his clean, without asking, he borrows it to show his daughter. Next day Hailee notices it's gone, suspects Dario and complains. You're the manager.",
        prompt: "What's your first priority?",
        choices: [
          {
            id: "a",
            text: "Contact Hailee and make sure she's safe and well",
            verdict: "best",
            feedback: "Yes. Start with Hailee, then record, assess and report.",
          },
          { id: "b", text: "Search Hailee's house: she's probably moved it", verdict: "risky", feedback: "No. Don't dismiss her concern." },
          { id: "c", text: "Accuse Dario of stealing", verdict: "risky", feedback: "No. Follow your procedures fairly." },
          { id: "d", text: "Tell Hailee she should have locked her cabinet", verdict: "risky", feedback: "No. That blames the victim." },
        ],
      },
      {
        kind: "callout",
        id: "proof",
        style: "important",
        label: "Don't wait for proof",
        body: "Suspected worker involvement is enough to report. Don't hold off waiting for proof. Judge the impact on the person through their eyes: the value of the item is only one factor.",
      },
      { kind: "text", id: "next", title: "Your next steps", body: NEXT_STEPS },
      notifying("notify"),
    ],
    short: {
      brief:
        "Reportable stealing or financial coercion is about **workers**: stealing from the person, or conduct that is coercive or deceptive about their finances, or unreasonably controls them. Concerns about family go through safeguarding, not the SIRS.\n\nA missing item is reportable when it can't be found, the person believes a worker is responsible, and they're concerned or distressed. **Value doesn't decide it**: judge the impact through the person's eyes. Suspected worker involvement is enough to report; don't wait for proof.\n\nA small gift freely given isn't reportable, but the gifts policy still applies.\n\nLook after the person first, then escalate and record. **Priority 1** (within 24 hours) if there are reasonable grounds to report it to police, or it caused injury or discomfort needing medical or psychological treatment; otherwise **Priority 2** (within 30 calendar days).",
      confidence: "I can tell when a missing item or money concern is reportable.",
    },
    keyPoints: [
      "It covers stealing by a worker, and a worker's coercive, deceptive or controlling conduct about finances.",
      "A missing item is reportable when the person believes a worker is responsible and is concerned.",
      "Value doesn't decide whether it's reportable; impact is judged through the person's eyes.",
      "A small gift freely given isn't reportable, but the gifts policy still applies.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt:
          "Jemimah has mild dementia and an $80 budget for her monthly salon visit. Her worker Bonnie says there isn't enough for the foot massage she wants. Later her nephew finds no change in her purse and contacts the provider, believing Bonnie kept the money. Is this stealing or financial coercion?",
        options: [
          opt("a", "Yes. A worker is suspected of taking the remaining money, so it's reportable", "Correct.", true),
          opt("b", "No. Jemimah doesn't remember", "No. Never let cognitive impairment decide whether it's reportable."),
          opt("c", "No. It's a small amount", "No. Value doesn't decide it."),
          opt("d", "Only once there's proof", "No. Suspicion is enough to report."),
        ],
        explain:
          "Bonnie is suspected of keeping Jemimah's money, possibly relying on her dementia. It's reportable stealing or financial coercion, and the provider needs to manage it.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "When there's a concern about stealing or financial coercion, what's your first priority?",
        options: [
          opt("a", "The safety and wellbeing of everyone involved", "Correct.", true),
          opt("b", "Finding the missing money", "No. People come first."),
          opt("c", "Stopping the worker's pay", "No. That's not the first priority."),
          opt("d", "Recording it in the IMS", "Not first. Recording follows."),
        ],
        explain:
          "The health, safety and wellbeing of everyone involved is the first priority, considering the people involved, the level of harm and the circumstances. Then record, report and practise open disclosure.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "You've identified stealing by a worker and reported it to police. Is it Priority 1 or Priority 2?",
        options: [
          opt("a", "Priority 1, because there were reasonable grounds to report it to police", "Correct.", true),
          opt("b", "Priority 2, because nobody was physically hurt", "No. Reasonable grounds to call police make it Priority 1."),
          opt("c", "Priority 2, because the amount was small", "No. Value isn't the test."),
          opt("d", "Not reportable once police are involved", "No. It's still notified to the Commission."),
        ],
        explain: "Reasonable grounds to report an incident to police make it a Priority 1 reportable incident: notify the Commission within 24 hours.",
      },
      {
        id: "q4",
        from: "knowledge check",
        prompt: "When must a Priority 1 reportable incident be notified to the Commission?",
        options: [
          opt("a", "Within 24 hours of becoming aware", "Correct.", true),
          opt("b", "Within 30 days of becoming aware", "No. That's Priority 2."),
          opt("c", "Within 5 days", "No. Five days is for the remaining details."),
          opt("d", "After police have finished", "No. Don't wait for police."),
        ],
        explain: "Priority 1: within 24 hours, with outstanding details within 5 days. Priority 2: within 30 calendar days.",
      },
      {
        id: "q5",
        from: "knowledge check",
        prompt: "An older person with capacity freely buys their worker a small thank-you gift. What do you do?",
        options: [
          opt("a", "No notification is needed; make sure the worker follows the gifts policy", "Correct.", true),
          opt("b", "Notify the Commission within 24 hours", "No. A freely given small gift isn't stealing or coercion."),
          opt("c", "Notify the Commission within 30 days", "No. It isn't reportable."),
          opt("d", "Tell the person they can't give gifts", "No. It's their choice, within the policy."),
        ],
        explain:
          "A small gift freely given isn't reportable. Nor are items quickly found to be misplaced, or a person feeling financially pressured by family. Workers still follow the gifts policy.",
      },
    ],
  },
  {
    part: 3,
    n: 6,
    slug: "alis-p3-unexpected-death",
    title: "SIRS in Home Services: Unexpected death",
    summary: "When a death is reportable in a home or community setting, how to respond, and the timeframe for notifying.",
    outcome: "Recognise when a death is a reportable unexpected death at home, and respond appropriately.",
    minutes: 15,
    sensitive: true,
    explore: ["when and how an unexpected death is reported to the Commission", "responding to an alleged or suspected unexpected death"],
    blocks: [
      {
        kind: "text",
        id: "definition",
        title: "What is a reportable unexpected death at home?",
        body: "For services in a home or community setting, the Aged Care Rules 2025 (s16-5(8)(b)) cover a death that resulted from:\n\n- the services the provider delivered, or\n- the provider's failure to deliver services.\n\nThat means notifying any death where the provider (including its workers and the health professionals it engages):\n\n- made a mistake that resulted in the death\n- didn't deliver services in line with the person's assessed needs, resulting in the death\n- delivered poorly managed services, or services not in line with best practice, resulting in the death",
        verify: "This definition differs from residential care; confirm against the Aged Care Rules 2025 s16-5(8)(b).",
      },
      {
        kind: "callout",
        id: "visibility",
        style: "tip",
        label: "Why it's narrower at home",
        body: "At home, providers see much less of a person's life than in residential care. A death may come days after a service, you may not hear about it for some time, and families may choose not to share details.",
      },
      {
        kind: "scenario",
        id: "poppy",
        title: "Poppy",
        context:
          "Poppy has chronic lung disease and is in palliative care at home. On Wednesday her registered nurse Mahari notices redness on her buttocks; Poppy says it's nothing, and Mahari doesn't treat or record it. On Saturday the redness is a weeping pressure ulcer and Poppy is hot. In hospital she's diagnosed with sepsis and dies that afternoon.",
        prompt: "Poppy had a terminal illness. Is this a reportable unexpected death?",
        choices: [
          {
            id: "yes",
            text: "Yes. Mahari had a duty to treat or escalate the redness when she saw it",
            verdict: "best",
            feedback: "Right. A failure to deliver care in line with Poppy's needs contributed to her death.",
          },
          {
            id: "no",
            text: "No. She had a terminal illness and could have died at any time",
            verdict: "risky",
            feedback: "No. A terminal illness doesn't excuse a failure in care that led to death.",
          },
        ],
      },
      {
        kind: "reveal",
        id: "when",
        title: "When to notify",
        intro: "Open each.",
        items: [
          {
            title: "You must notify when",
            body: "The provider becomes aware of the death, and has reasonable grounds to believe it happened, or is alleged or suspected to have happened, because of the provider's action or inaction.",
          },
          {
            title: "You don't need to notify when",
            body: "The cause of death was unrelated to the services delivered; it wasn't due to a failure to deliver services; or the cause isn't yet known, unless there are reasonable grounds to think the provider's action or inaction caused it.",
          },
          {
            title: "If the cause comes later",
            body: "If the cause isn't clear, you needn't report straight away. If it's later found or suspected to be related to the services, report within 24 hours of becoming aware.",
          },
        ],
      },
      {
        kind: "scenario",
        id: "yelena",
        title: "Your first priority?",
        context:
          "Yelena lives alone and gets nightly help with insulin and morning personal care. Giovanna arrives to help her shower, can't get in, and calls Yelena's daughter Margie, who lets her in. They find Yelena unresponsive with no pulse. Giovanna calls an ambulance and notices last night's insulin untouched beside the bed.",
        prompt: "You suspect the insulin wasn't given, which may have caused Yelena's death. What's your first priority?",
        choices: [
          {
            id: "a",
            text: "Make sure everyone involved, including Margie, is safe and supported, and follow the paramedics' and police directions",
            verdict: "best",
            feedback:
              "Yes. Look after the people involved first. Then notify police or the coroner as required, record it, and the provider notifies the Commission within 24 hours.",
          },
          { id: "b", text: "Report it to the coroner", verdict: "acceptable", feedback: "This may be required, but the people involved come first." },
          {
            id: "c",
            text: "Report it to the Commission",
            verdict: "acceptable",
            feedback: "The provider must, within 24 hours, after the immediate needs are met.",
          },
          { id: "d", text: "Record it in the IMS", verdict: "acceptable", feedback: "It must be recorded, after the immediate needs are met." },
        ],
      },
      {
        kind: "text",
        id: "next",
        title: "Your next steps",
        body: "Once everyone involved is safe and supported:\n\n- notify police or other authorities, such as the coroner, as your state or territory requires\n- record the incident in the IMS\n- if it's a reportable unexpected death, the provider notifies the Commission within 24 hours\n- contact the next of kin, and provide open disclosure, support and information\n\nEach state and territory has its own rules for reporting deaths to the coroner. The coroner decides the date, place, circumstances and medical cause of death.",
      },
      notifying(
        "notify",
        "Every reportable unexpected death in a home or community setting is **Priority 1**, whether the death happens straight away or some time after the mistake or failure.",
      ),
    ],
    short: {
      brief:
        "At home or in the community, a death is a reportable unexpected death when it resulted from **the services the provider delivered**, or **the provider's failure to deliver services**. That includes a mistake, services not in line with the person's assessed needs, or poorly managed services.\n\nIt isn't reportable when the cause was unrelated to the services delivered. A terminal illness doesn't excuse a failure in care that led to death.\n\nEvery reportable unexpected death is **Priority 1**: notify the Commission **within 24 hours** of becoming aware. If the cause isn't clear at first and is later found or suspected to relate to the services, report within 24 hours of becoming aware of that.\n\nFirst make sure everyone involved is safe and supported, then notify police or the coroner as your state or territory requires, and record it.",
      confidence: "I can tell when a death at home is a reportable unexpected death.",
    },
    keyPoints: [
      "At home, a death is reportable when it resulted from the services delivered or a failure to deliver them.",
      "Every reportable unexpected death is Priority 1: notify within 24 hours of becoming aware.",
      "If the cause becomes clear later, report within 24 hours of becoming aware.",
      "Coroner reporting follows your state or territory's rules.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt:
          "Lawrence, 89, has a diagnosed heart condition and is in palliative care. Johnny checks his observations (all fine), makes breakfast and settles him in front of the TV. Twenty minutes later Lawrence has a heart attack and dies. Is this a reportable unexpected death?",
        options: [
          opt("a", "No. He died of an ongoing illness that was properly assessed, monitored and managed", "Correct.", true),
          opt("b", "Yes. Johnny was providing services when he died", "No. Dying during a service isn't the test; a mistake or failure is."),
          opt("c", "Yes. Every death during palliative care is reportable", "No. Only deaths resulting from services or a failure to deliver them."),
          opt("d", "Only if the family complains", "No. It isn't reportable either way."),
        ],
        explain: "Lawrence died of an ongoing illness that was appropriately assessed, monitored and managed. No mistake or lack of services caused his death.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "How are reportable unexpected deaths classified?",
        options: [
          opt("a", "Always Priority 1", "Correct.", true),
          opt("b", "Priority 2, unless police are involved", "No. They're always Priority 1."),
          opt("c", "Priority 1 only once the coroner confirms the cause", "No. Don't wait for the coroner."),
          opt("d", "It depends on the person's age", "No. Age isn't a factor."),
        ],
        explain:
          "Every reportable unexpected death related to service delivery is Priority 1, notified within 24 hours, even if a coroner hasn't yet decided the cause.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt:
          "Marco mustn't be left alone on the toilet. His worker Carrie leaves him after he grumbles about her help. He falls, the support rail comes off the wall, and he dies. Which step is NOT right?",
        options: [
          opt(
            "a",
            "Report it only to the police, because it's a criminal matter",
            "Correct: this is wrong. It's also recorded and notified to the Commission.",
            true,
          ),
          opt("b", "Contact Marco's next of kin and provide open disclosure and support", "This is a right step."),
          opt("c", "Record the incident in the IMS", "This is a right step."),
          opt("d", "Notify the Commission, and the coroner and police as your state requires", "These are right steps."),
        ],
        explain:
          "Every unexpected death is recorded in the IMS and reported to the Commission. Contact the next of kin with open disclosure and support, and notify the coroner and police as required.",
      },
      {
        id: "q4",
        from: "knowledge check",
        prompt: "You've identified a reportable unexpected death. When must the Commission be notified?",
        options: [
          opt("a", "Within 24 hours", "Correct.", true),
          opt("b", "Within 30 calendar days", "No. That's Priority 2."),
          opt("c", "There's no need: the person has already been pronounced dead", "No. It must be reported."),
          opt("d", "After the funeral", "No. The timeframe runs from becoming aware."),
        ],
        explain: "Reportable unexpected death is Priority 1 only. Notify the Commission within 24 hours.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "A client dies and the cause isn't clear. Weeks later you learn a missed medication may have contributed. What now?",
        options: [
          opt("a", "Notify the Commission within 24 hours of learning this", "Correct.", true),
          opt("b", "Nothing: the time to report has passed", "No. The timeframe runs from when you become aware."),
          opt("c", "Notify within 30 days, since it's late", "No. It's still Priority 1."),
          opt("d", "Leave it to the coroner", "No. The provider's obligation stands."),
        ],
        explain:
          "If the cause of death isn't apparent you needn't report straight away, but once it's found or suspected to relate to the services, report within 24 hours of becoming aware.",
      },
    ],
  },
  {
    part: 3,
    n: 7,
    slug: "alis-p3-sexual-contact-or-conduct",
    title: "SIRS in Home Services: Unlawful sexual contact or inappropriate sexual conduct",
    summary: "What's reportable, an older person's right to relationships of their choosing, capacity to consent, the warning signs, and what to do.",
    outcome: "Recognise and respond to unlawful sexual contact or inappropriate sexual conduct, while respecting relationships of choice.",
    minutes: 18,
    sensitive: true,
    explore: [
      "conduct that is reportable unlawful sexual contact or inappropriate sexual conduct",
      "capacity to consent, and the right to relationships",
      "possible signs",
      "how to respond, and when and how it's reported",
    ],
    blocks: [
      {
        kind: "text",
        id: "definition",
        title: "What is reportable?",
        body: "The Aged Care Rules 2025 (s16-5(4)) include:\n\n- **any** conduct or contact of a sexual nature by a worker, including sexual assault, an act of indecency, or sharing an intimate image of the person\n- touching the person's genital area, anal area or breast when it isn't needed to deliver care\n- **any non-consensual** sexual contact or conduct, including sexual assault, indecency or sharing intimate images\n- conduct intended to make it easier to engage the person in sexual contact or conduct (grooming)",
        verify: "Confirm the definition and section reference (s16-5(4)) against the Aged Care Rules 2025.",
      },
      {
        kind: "scenario",
        id: "lucy",
        title: "Lucy's massage",
        context:
          "Lucy can consent to sexual activity and enjoys her worker Declan's company. One afternoon she asks him for a neck massage, and he gives her one. She later tells a friend it stirred sexual feelings and she'd like more. Her friend complains to the provider, though Lucy doesn't want Declan in trouble.",
        prompt: "Must the provider report this to the Commission?",
        choices: [
          {
            id: "yes",
            text: "Yes. Any alleged or suspected sexual contact or conduct by a worker is reportable",
            verdict: "best",
            feedback: "Right. With a worker, the person's consent doesn't take it outside the scheme.",
          },
          {
            id: "no",
            text: "No. Lucy asked for it",
            verdict: "risky",
            feedback: "No. Sexual contact or conduct by a worker is reportable whether or not the person asked.",
          },
        ],
      },
      {
        kind: "reveal",
        id: "not-reportable",
        title: "What isn't reportable",
        intro: "Consensual contact between the person and someone who isn't a worker isn't reportable. Open each example.",
        items: [
          { title: "Affection", body: "Consensual greetings like a kiss on the cheek or a hug." },
          { title: "Relationships", body: "Consensual sexual relationships between two clients, or with someone not engaged by the provider." },
          { title: "Comfort", body: "Consensual comfort, like rubbing a back or patting a knee, in line with the person's preferences." },
          { title: "Personal care", body: "Helping someone wash and dry, including intimate areas, in line with professional standards and their plan." },
        ],
      },
      {
        kind: "text",
        id: "rights",
        title: "The right to relationships of choice",
        body: "Older people have the right to make choices about their personal and social lives, including sexual freedom and giving and receiving affection. You still have a duty of care to be confident the person can consent to intimate contact you become aware of, especially if they have a cognitive impairment.",
      },
      {
        kind: "scenario",
        id: "justin",
        title: "Justin's new relationship",
        context:
          "Justin makes his own decisions and lives at home. He's been seeing Derrick, a friend from his bowls club who has nothing to do with the provider. When Julia arrives to provide care, Justin's in a good mood and tells her about the relationship, and the hugs and kisses they've shared.",
        prompt: "Should Julia report the relationship to the Commission?",
        choices: [
          {
            id: "no",
            text: "No. It's a consensual relationship with someone who isn't a worker, and Justin can make his own decisions",
            verdict: "best",
            feedback: "Right. Respect Justin's choice. If you ever doubt someone's capacity to consent, raise it with your manager.",
          },
          {
            id: "yes",
            text: "Yes. Any intimate relationship of a client must be reported",
            verdict: "risky",
            feedback: "No. Relationships with people outside the provider aren't reportable when they're consensual.",
          },
        ],
        verify:
          "The source scenario's partner was a provider volunteer seeing the client outside volunteer hours; it's been changed to someone unconnected to the provider. Confirm Quality agrees.",
      },
      {
        kind: "tabs",
        id: "requirements",
        title: "Know your requirements",
        intro: "Open each tab.",
        tabs: [
          {
            label: "Statement of Rights",
            body: "Respect older people's right to make their own decisions, including about intimate and sexual relationships, and support them to. This applies equally to people with a cognitive impairment, unless a substitute decision-maker is legally appointed for decisions about their personal life.",
          },
          {
            label: "Quality Standards",
            body: "Support people to exercise choice, independence and quality of life (Outcome 1.3), and to make connections and keep relationships of their choosing, including intimate ones (Outcome 7.1.5).",
          },
        ],
        verify: "Confirm the Outcome numbers 1.3 and 7.1.5 against the strengthened Quality Standards.",
      },
      {
        kind: "text",
        id: "consent",
        title: "Capacity to consent",
        body: "Capacity can change over time. Ask whether the person can, right now:\n\n- consent to this particular activity\n- refuse to take part\n- agree to take part\n\nThe provider decides case by case whether a registered health practitioner should assess capacity. Check the person's plan for any capacity assessment, and if you think it no longer matches their actual capacity, tell your supervisor.\n\nBe aware of cultural sensitivities: some people are more comfortable with touch than others.",
      },
      {
        kind: "callout",
        id: "withdrawn",
        style: "important",
        label: "Consent can be withdrawn",
        body: "Consent given before doesn't mean consent now. If you doubt a person's capacity to consent to sexual contact connected with the services, notify the Commission.",
      },
      {
        kind: "flip",
        id: "signs",
        title: "Warning signs",
        intro: "Responses can be emotional, behavioural or physical, can look like PTSD or cognitive decline, or there may be none at all. Turn each card.",
        cards: [
          { front: "Avoiding someone", back: "Fear of, or avoiding, a particular person." },
          { front: "Unexplained injuries", back: "Bruising, pain or injuries, especially to private areas." },
          { front: "Anxious and tense", back: "New anxiety, agitation or distress." },
          { front: "Locking doors", back: "Suddenly wanting doors locked, or not wanting to be alone." },
          { front: "Bedding and clothes", back: "Torn, stained or bloody clothing or bedding." },
          { front: "Showering and toileting", back: "New reluctance or distress around personal care." },
          { front: "Saying no", back: "Pushing people away, or saying 'stop'." },
          { front: "Changed behaviour", back: "Unusual sexual behaviour or language." },
          { front: "Sleeping dressed", back: "Not wanting to undress, or sleeping in clothes." },
        ],
        verify: "The source's sign cards are pictures only; confirm these nine signs with the clinical owner.",
      },
      {
        kind: "scenario",
        id: "marley",
        title: "Your first priority?",
        context:
          "Kerry, a volunteer, drives Marley to a social night the provider runs. On arrival, another client, Arnold, hugs Marley and squeezes her bottom. Marley sits quietly, seems withdrawn all night, and shrugs off Kerry's question on the way home. Kerry suspects non-consensual sexual contact.",
        prompt: "What's Kerry's first priority?",
        choices: [
          {
            id: "a",
            text: "Make sure Marley is safe and well",
            verdict: "best",
            feedback: "Yes. Marley first; then Kerry escalates so it's recorded and reported.",
          },
          { id: "b", text: "Report it to the police", verdict: "acceptable", feedback: "Police are notified, but Marley's safety comes first." },
          { id: "c", text: "Report it to the Commission", verdict: "acceptable", feedback: "The provider reports it as Priority 1, after Marley is safe." },
          { id: "d", text: "Record it in the IMS", verdict: "acceptable", feedback: "Yes, but after Marley is safe." },
        ],
      },
      {
        kind: "text",
        id: "next",
        title: "Your next steps",
        body: "Once the person is safe:\n\n- arrange medical or psychological treatment if needed\n- notify police or other authorities\n- record the incident in the IMS\n- the provider reports it to the Commission as **Priority 1**\n\nKeep supporting the person and practise open disclosure.",
      },
      notifying(
        "notify",
        "Every reportable incident of unlawful sexual contact or inappropriate sexual conduct is **Priority 1**. Unlawful or possibly criminal incidents (sexual assault, for example) must also go to police within 24 hours. If you're unsure whether it's criminal, report it to police: they decide.",
      ),
    ],
    short: {
      brief:
        "Reportable unlawful sexual contact or inappropriate sexual conduct includes:\n\n- **any** conduct or contact of a sexual nature by a worker, even if the person asked for it\n- touching the person's genital area, anal area or breast when it isn't needed to deliver care\n- **any non-consensual** sexual contact or conduct\n- conduct intended to make it easier to engage the person in sexual contact or conduct (grooming)\n\nConsensual contact with someone who isn't a worker isn't reportable: older people have the right to relationships of their choosing. Capacity to consent can change, and consent can be withdrawn.\n\nMake sure the person is safe, then escalate. It's **always Priority 1**: the provider notifies the Commission **within 24 hours**. If it may be criminal, it goes to police within 24 hours too.",
      confidence: "I can tell when sexual contact or conduct must be reported.",
    },
    keyPoints: [
      "Any sexual contact or conduct by a worker is reportable, even if the person asked for it.",
      "Consensual relationships with people who aren't workers aren't reportable: respect people's right to relationships.",
      "Capacity to consent can change; consent can be withdrawn.",
      "Always Priority 1, and police within 24 hours if it may be criminal.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt:
          "Stefan has a hearing impairment. A volunteer gardener, Liliane, asks him whether he finds her sexy and what kind of women he likes. Stefan later says he turns his hearing aids off when she's around so he doesn't have to hear her questions. Is this reportable?",
        options: [
          opt("a", "Yes. Liliane's questions are inappropriate sexual conduct", "Correct.", true),
          opt("b", "No. Stefan can't always hear her", "No. His impairment doesn't change whether it's reportable."),
          opt("c", "No. She didn't touch him", "No. Sexual conduct includes language and innuendo."),
          opt("d", "Only if Stefan makes a complaint", "No. The provider must report it."),
        ],
        explain:
          "Using sexual innuendo and explicit language while delivering services is inappropriate sexual conduct. It's reportable whatever impairments the person has.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "You've decided Liliane's conduct is reportable. Which step is NOT right?",
        options: [
          opt("a", "Ask Stefan to complain to the Commission himself", "Correct: this is wrong. The provider responds and reports.", true),
          opt("b", "Make sure everyone involved is safe and well", "This is a right step."),
          opt("c", "Arrange medical or psychological treatment if needed", "This is a right step."),
          opt("d", "Record it in the IMS and report it to the Commission", "These are right steps."),
        ],
        explain:
          "Keep the person safe, arrange treatment if needed, notify police and other authorities if required, record it in the IMS, report to the Commission, and practise open disclosure.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "How are reportable incidents of unlawful sexual contact or inappropriate sexual conduct classified?",
        options: [
          opt("a", "Always Priority 1", "Correct.", true),
          opt("b", "Priority 2 unless the person was injured", "No. They're always Priority 1."),
          opt("c", "Priority 1 only if police are involved", "No. Always Priority 1."),
          opt("d", "It depends on what the person wants", "No. The classification is fixed."),
        ],
        explain: "All incidents of unlawful sexual contact or inappropriate sexual conduct are Priority 1 reportable incidents.",
      },
      {
        id: "q4",
        from: "knowledge check",
        prompt: "When must a Priority 1 reportable incident be notified to the Commission?",
        options: [
          opt("a", "Within 24 hours of becoming aware, with outstanding details within 5 days", "Correct.", true),
          opt("b", "Within 30 days", "No. That's Priority 2."),
          opt("c", "Within 5 days", "No. The first notice is due within 24 hours."),
          opt("d", "After police finish investigating", "No. Don't wait."),
        ],
        explain:
          "Priority 1: within 24 hours of becoming aware, with any outstanding details within 5 days, and significant new information as soon as reasonably practicable.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "A client with capacity is in a consensual relationship with a neighbour who has no connection to the provider. Is this reportable?",
        options: [
          opt("a", "No. Consensual contact with someone who isn't a worker isn't reportable", "Correct.", true),
          opt("b", "Yes. All intimate relationships of clients are reportable", "No. People have the right to relationships of their choosing."),
          opt("c", "Yes, as Priority 2", "No. It isn't reportable."),
          opt("d", "Only if the family disapproves", "No. Their disapproval isn't the test."),
        ],
        explain:
          "Consensual contact between the person and someone who isn't a worker of the provider isn't reportable. You still have a duty of care to be confident the person can consent.",
      },
    ],
  },
  {
    part: 3,
    n: 8,
    slug: "alis-p3-unreasonable-use-of-force",
    title: "SIRS in Home Services: Unreasonable use of force",
    summary: "What unreasonable use of force is (and isn't), the warning signs, and what to do.",
    outcome: "Recognise and respond to unreasonable use of force against an older person.",
    minutes: 15,
    sensitive: true,
    explore: ["conduct that is unreasonable use of force", "possible signs", "how to respond", "when and how it's reported"],
    blocks: [
      {
        kind: "text",
        id: "definition",
        title: "What is reportable unreasonable use of force?",
        body: "The Aged Care Rules 2025 (s16-5(2)) describe it as conduct ranging from a deliberate and violent physical attack to the use of unwarranted physical force: for example kicking, hitting, pushing, shoving and rough handling.\n\nIt doesn't include gently touching the person to deliver care, to get their attention, to guide them, or to comfort them when they're distressed.",
        verify: "Confirm the definition and section reference (s16-5(2)) against the Aged Care Rules 2025.",
      },
      {
        kind: "scenario",
        id: "howard",
        title: "Howard's day trip",
        context:
          "Howard, in his mid-70s, is unsteady on his feet. On weekly day trips his worker Gary gently holds his forearm to help him up the bus steps, guides him to his seat and buckles his seatbelt.",
        prompt: "Was unreasonable force used?",
        choices: [
          {
            id: "no",
            text: "No. Gary touched Howard gently to help and guide him",
            verdict: "best",
            feedback: "Right. Gentle touch to deliver care and guide someone isn't unreasonable force.",
          },
          { id: "yes", text: "Yes. Gary touched Howard's arm", verdict: "risky", feedback: "No. Touch isn't the problem; unwarranted force is." },
        ],
      },
      {
        kind: "reveal",
        id: "conduct",
        title: "What the SIRS guidelines count",
        intro: "Force can be unreasonable even without injury, bruising or a need for treatment. Open each.",
        items: [
          { title: "Unwarranted force", body: "Unjustified physical force, including rough handling while giving care." },
          {
            title: "Physical violence",
            body: "Hitting, punching, pushing, shoving, kicking, spitting, throwing things at the person, or threatening physical harm.",
          },
          { title: "Deliberate attacks", body: "Physical attacks or assaults." },
          { title: "Offences", body: "Any physical behaviour towards the person that's an offence under state or territory law." },
          { title: "Repeated contact", body: "Non-consensual contact that seems minor once, but harms or distresses over time." },
        ],
      },
      {
        kind: "scenario",
        id: "laila",
        title: "Laila's garden",
        context:
          "Laila likes to sit on her porch and watch her gardener work. A new gardener is rude to her, then shoves her back towards her front door, telling her to let him work. A neighbour rushes over; Laila isn't bruised and says she doesn't need treatment, but she's shaken. The neighbour complains.",
        prompt: "Was unreasonable force used?",
        choices: [
          {
            id: "yes",
            text: "Yes. Shoving Laila was unwarranted force, even without injury",
            verdict: "best",
            feedback: "Right. Force can be unreasonable with no visible harm.",
          },
          { id: "no", text: "No. Laila should have stayed inside", verdict: "risky", feedback: "No. Laila was entitled to sit on her own porch." },
        ],
      },
      {
        kind: "callout",
        id: "words",
        style: "tip",
        label: "Words first",
        body: "If someone can get up from a chair by themselves, ask and encourage them. If they need a hand, explain what you're doing and use the gentlest touch possible.",
      },
      {
        kind: "flip",
        id: "signs",
        title: "Warning signs",
        intro: "Turn each card.",
        cards: [
          { front: "Withdrawn", back: "Staying alone, or unusually sad, emotional or tearful." },
          { front: "Overly compliant", back: "Going along with workers in a way that's out of character." },
          { front: "Drowsy", back: "Frequent drowsiness, which can come with a head injury." },
          { front: "Out-of-character anger", back: "Aggression or frustration that's new." },
          { front: "Avoiding workers", back: "Cancelling services or asking for different workers." },
          { front: "Unexplained marks", back: "Bruises or injuries nobody can explain." },
        ],
        verify: "The source's sign cards are pictures only; confirm these six signs with the clinical owner.",
      },
      {
        kind: "scenario",
        id: "roger",
        title: "Your first priority?",
        context:
          "Roger loves telling jokes. His cleaner Carol often laughs and slaps his arm playfully, but lately it's started to hurt and bruise. Owen, another worker from the same provider, notices the bruise and Roger explains.",
        prompt: "What's Owen's first priority?",
        choices: [
          {
            id: "a",
            text: "Make sure Roger is OK, including arranging medical treatment if needed",
            verdict: "best",
            feedback: "Yes. Roger first, then escalate so it's recorded and assessed.",
          },
          { id: "b", text: "Record it in the IMS", verdict: "acceptable", feedback: "Later. Roger comes first." },
          { id: "c", text: "Report it to the Commission", verdict: "acceptable", feedback: "The provider does that, after Roger is safe." },
          { id: "d", text: "Report it to the police", verdict: "acceptable", feedback: "Possibly, if there are reasonable grounds, but Roger comes first." },
        ],
      },
      {
        kind: "text",
        id: "next",
        title: "Your next steps",
        body: `${NEXT_STEPS}\n\nReasonable grounds to call police include facts or allegations suggesting the incident is likely to be a crime under Commonwealth, state or territory law. If you're not sure, report it to police.`,
      },
      notifying("notify"),
    ],
    short: {
      brief:
        "Unreasonable use of force ranges from a deliberate and violent physical attack to the use of unwarranted physical force: for example kicking, hitting, pushing, shoving and rough handling. It can be unreasonable **even with no injury** or need for treatment.\n\nIt **doesn't** include gently touching the person to deliver care, to get their attention, to guide them, or to comfort them when they're distressed. Use words first, and the gentlest touch possible.\n\nWatch for unexplained bruises, avoiding workers, drowsiness or being overly compliant.\n\nLook after the person first, then escalate and record. If you're not sure whether it's a crime, report it to police. **Priority 1** (within 24 hours) if it caused injury or discomfort needing medical or psychological treatment, or there are reasonable grounds to report it to police; otherwise **Priority 2** (within 30 calendar days).",
      confidence: "I can tell unreasonable force apart from gentle, caring touch.",
    },
    keyPoints: [
      "Unreasonable force ranges from violent attacks to rough handling.",
      "It can be unreasonable even with no injury or need for treatment.",
      "Gentle touch to give care, get attention, guide or comfort isn't unreasonable force.",
      "Look after the person first; if you're unsure whether it's a crime, report it to police.",
    ],
    quiz: [
      {
        id: "q1",
        from: "knowledge check",
        prompt:
          "Colleen is tired and doesn't want her shower today, but didn't call ahead. Her worker Amy snaps at her and shoves her into the shower. Was unreasonable force used?",
        options: [
          opt("a", "Yes. Amy ignored Colleen's choice and rough handled and shoved her", "Correct.", true),
          opt("b", "No. Colleen should have called the provider first", "No. Not calling ahead never justifies force."),
          opt("c", "No. Amy was trying to deliver care", "No. Shoving is unwarranted force, whatever the aim."),
          opt("d", "Only if Colleen was injured", "No. Injury isn't required."),
        ],
        explain: "Shoving and rough handling are unreasonable use of force. People should feel safe when they receive services, and when they choose not to.",
      },
      {
        id: "q2",
        from: "knowledge check",
        prompt: "Colleen's daughter Petra notices a bruise and that Colleen is withdrawn, and complains. Which response is NOT appropriate?",
        options: [
          opt("a", "Write to Petra saying Colleen should have called to reschedule", "Correct: this is not appropriate. It blames Colleen.", true),
          opt("b", "Make sure Colleen is safe, arranging assessment or treatment if needed", "This is appropriate, and comes first."),
          opt("c", "Record the incident in the IMS", "This is appropriate."),
          opt("d", "Decide whether it's Priority 1 or Priority 2", "This is appropriate."),
        ],
        explain:
          "First ensure Colleen's safety and wellbeing, including any medical or psychological assessment or treatment. Then record it, decide the priority, and practise open disclosure.",
      },
      {
        id: "q3",
        from: "knowledge check",
        prompt: "Colleen has bruising, and psychological treatment is recommended because she's withdrawn and not herself. How is it classified?",
        options: [
          opt("a", "Priority 1, because it caused harm that needs treatment to resolve", "Correct.", true),
          opt("b", "Priority 2, because the bruise was minor", "No. Treatment is recommended, so it's Priority 1."),
          opt("c", "Priority 2, because Colleen didn't ask for treatment", "No. The need for treatment is what counts."),
          opt("d", "Not reportable", "No. Unreasonable use of force is reportable."),
        ],
        explain:
          "The incident caused injury or discomfort that needs medical or psychological treatment to resolve, so it's Priority 1: notify within 24 hours.",
      },
      {
        id: "q4",
        from: "knowledge check",
        prompt: "Which could be a sign of unreasonable use of force?",
        options: [
          opt("a", "Cancelling services or asking for different workers, or out-of-character aggression", "Correct.", true),
          opt("b", "Enjoying a chat with a worker", "No. That's a good sign."),
          opt("c", "Asking for help with the shopping", "No. That's an ordinary request."),
          opt("d", "Looking forward to a day trip", "No. That's a good sign."),
        ],
        explain:
          "Signs include cancelling services or asking for different workers, being overly compliant, drowsiness, out-of-character aggression, withdrawal, sadness, crying and depression.",
      },
      {
        id: "q5",
        from: "new",
        prompt: "Can force be unreasonable if it caused no injury and the person needed no treatment?",
        options: [
          opt("a", "Yes. Unwarranted force is unreasonable whether or not it causes injury", "Correct.", true),
          opt("b", "No. There must be a visible injury", "No. Bruising isn't required."),
          opt("c", "No. It must need medical treatment", "No. Treatment affects the priority, not whether it's reportable."),
          opt("d", "Only if it happens more than once", "No. One incident can be reportable."),
        ],
        explain: "Force can be unreasonable even if it doesn't cause injury or visible harm, and the person doesn't need medical or other treatment.",
      },
    ],
  },
  {
    part: 3,
    n: 9,
    slug: "alis-p3-sirs-in-practice",
    title: "SIRS in practice",
    summary: "Follow one incident through all six elements of an IMS, from a worker's first concern to closing the loop.",
    outcome: "Apply the six essential elements of an IMS, and the SIRS, to an incident from start to finish.",
    minutes: 15,
    sensitive: true,
    explore: [
      "connecting what you've learnt across the course",
      "applying the six essential elements of an IMS to an incident",
      "notifying the Commission about a reportable incident",
      "how the SIRS and your IMS work together",
    ],
    blocks: [
      {
        kind: "text",
        id: "element-1",
        title: "Element 1: Ensure leadership and a safety culture",
        body: "Incident management starts with leadership and a strong safety culture: good governance, and end-to-end policies and procedures that help workers understand and use the IMS. Workers and older people need to be confident incidents are taken seriously. Even with strong processes, incidents still happen, and good incident management moves the focus from blame to action.\n\nIn this module you'll follow Sidney and the workers who support him. Keep the best practice guidance for incident management systems handy.",
      },
      {
        kind: "scenario",
        id: "culture",
        title: "What a safety culture means",
        context: "Sidney's provider wants workers and older people to feel safe.",
        prompt: "A safety culture means workers and older people feel safe to:",
        choices: [
          {
            id: "a",
            text: "Talk about concerns and complaints, and about the services they give and receive",
            verdict: "best",
            feedback: "Yes. That openness is what lets incidents surface early.",
          },
          { id: "b", text: "Blame the people responsible", verdict: "risky", feedback: "No. A safety culture is about learning, not blame." },
        ],
      },
      {
        kind: "steps",
        id: "story",
        title: "Meet Sidney",
        intro: "Step through what happened.",
        steps: [
          { title: "Sidney", body: "Sidney lives at home and loves his weekly card game with friends. His provider's worker Jenny drives him there." },
          { title: "Comments", body: "For several weeks Jenny has mocked his friends and called the card game a waste of her time." },
          { title: "A threat", body: "Last week, when Sidney said he'd mention it to the office, Jenny said she'd stop taking him to cards." },
          { title: "Withdrawing", body: "Sidney stopped going. He's been low and anxious, and isn't sleeping." },
          { title: "Bessie visits", body: "Bessie, another worker from the provider, visits to help with meals. Sidney tells her what's been happening." },
          { title: "Treatment", body: "Sidney's GP says the distress needs follow-up and refers him to a psychologist." },
        ],
        verify:
          "The source's slides for this scenario aren't in the outline text; this storyline was written for the Hub to support a Priority 1 answer. Confirm with Quality.",
      },
      {
        kind: "scenario",
        id: "respond",
        title: "Element 2: Respond to the incident",
        context: "Sidney has just told Bessie about Jenny's comments and threat.",
        prompt: "What should Bessie do first?",
        choices: [
          {
            id: "a",
            text: "Check Sidney's safety and wellbeing, and involve him in what happens next",
            verdict: "best",
            feedback: "Yes. Respond to his immediate needs, and keep him part of the process now he's raised his concerns.",
          },
          {
            id: "b",
            text: "Apologise to Sidney and leave it there",
            verdict: "risky",
            feedback: "No. Apologising is part of open disclosure, but Sidney's wellbeing comes first and the incident must be escalated.",
          },
          {
            id: "c",
            text: "Report it before checking on Sidney",
            verdict: "acceptable",
            feedback: "Reporting matters, but Sidney's safety and wellbeing come first.",
          },
        ],
      },
      {
        kind: "scenario",
        id: "record",
        title: "Element 3: Record and report the incident",
        context: "Sidney is safe, and Bessie has listened to him.",
        prompt: "What does Bessie need to do next?",
        choices: [
          {
            id: "a",
            text: "Record all the relevant details in the IMS and tell her manager, Geoff",
            verdict: "best",
            feedback: "Yes. Every incident is recorded, and Geoff decides whether it's reportable and its priority.",
          },
          {
            id: "b",
            text: "Record it in the IMS, with no further action",
            verdict: "risky",
            feedback: "No. Her manager needs to know so it can be assessed and reported.",
          },
          { id: "c", text: "Tell Geoff, but not record it", verdict: "risky", feedback: "No. All incidents go in the IMS." },
        ],
      },
      {
        kind: "scenario",
        id: "analyse",
        title: "Element 4: Analyse the incident",
        context: "Geoff is analysing the incident.",
        prompt: "How can Geoff use the IMS to help?",
        choices: [
          {
            id: "a",
            text: "Look for similar past incidents involving Jenny or other workers",
            verdict: "best",
            feedback: "Yes. Patterns help find the root causes.",
          },
          {
            id: "b",
            text: "Contact other clients Jenny supports to tell them about Sidney",
            verdict: "risky",
            feedback: "No. That breaches Sidney's privacy.",
          },
        ],
      },
      {
        kind: "scenario",
        id: "implement",
        title: "Element 5: Implement actions",
        context: "Geoff has an investigation report with recommended actions.",
        prompt: "Should Geoff tell Sidney about the actions being taken?",
        choices: [
          {
            id: "a",
            text: "Yes. Open disclosure means keeping Sidney informed about what's changing",
            verdict: "best",
            feedback: "Right. Share what Sidney needs to know, while protecting other people's privacy.",
          },
          { id: "b", text: "No. Workplace actions are internal", verdict: "risky", feedback: "No. Sidney has a right to know what's being done in response." },
        ],
      },
      {
        kind: "flip",
        id: "improve",
        title: "Element 6: Close the loop",
        intro:
          "Geoff evaluates the outcome, identifies gaps, drives improvement and shares findings. Turn each card to see the four areas of continuous improvement.",
        cards: [
          { front: "Training", back: "Refresher training for workers on respectful communication and the IMS." },
          { front: "Policies and procedures", back: "Review how workers raise concerns, and how clients can report without fear." },
          { front: "Care planning", back: "Update Sidney's plan to protect his social connections, with a new worker for his outings." },
          { front: "Governance", back: "Report the outcome and trends to the governing body so it can monitor performance." },
        ],
        verify: "The source's four continuous improvement areas are pictures only; confirm these four areas with Quality.",
      },
      {
        kind: "case",
        id: "case-refused-check",
        title: "What would you do? A safety check refused after a fall",
        intro:
          "Now put the IMS into practice in a harder moment. Graham has slipped at home and won't accept a nurse visit or a GP review. As in Element 2, you start with his immediate safety and keep him part of what happens next. As in Element 3, you record the conversation, his choice and the follow-up. Supported choice, as you saw with Hazel in the neglect module, means respecting an informed decision without pressure while offering alternatives. An informed refusal isn't automatically a SIRS incident: whether the fall needs incident assessment is decided through the provider's incident process.",
        caseId: "refused-check",
        verify:
          "Confirm the intro's framing (an informed refusal isn't automatically a SIRS incident; the provider's incident process decides whether the fall needs assessment) matches the approved choice, supported risk and incident management policy.",
      },
      {
        kind: "match",
        id: "match-types",
        title: "The eight reportable incident types",
        intro: "You've met all eight reportable incident types in this chapter. Each example below comes from a home or community setting.",
        prompt: "Match each reportable incident type to its example.",
        pairs: [
          {
            left: "Inappropriate use of restrictive practice",
            right: "A worker hides a client's walking stick while vacuuming so she can't walk around, and leaves without giving it back",
          },
          {
            left: "Unexplained absence",
            right: "A client with diabetes goes missing during an outing with his worker, with no mobile and a blood sugar check due",
          },
          { left: "Neglect", right: "A worker sees a client's open wound, says she's only there to clean and cook, and leaves without telling anyone" },
          {
            left: "Psychological or emotional abuse",
            right: "A worker shouts and swears at a client, and threatens to cut his weekly café outing as punishment",
          },
          { left: "Stealing or financial coercion", right: "A client's change from her salon budget goes missing, and her family believes her worker kept it" },
          {
            left: "Unexpected death",
            right: "A client dies of sepsis after a nurse saw redness that became a pressure ulcer, and neither treated nor recorded it",
          },
          {
            left: "Unlawful sexual contact or inappropriate sexual conduct",
            right: "A volunteer gardener keeps asking a client sexual questions while she works",
          },
          { left: "Unreasonable use of force", right: "A gardener shoves a client back towards her front door so he can get on with his work" },
        ],
        feedback:
          "Each example comes from this chapter. Whatever the type, the first steps are the same: make sure the person is safe and well, tell your manager, and record it in the IMS. The provider then decides whether it's Priority 1 or Priority 2 and notifies the Commission within the timeframe.",
        verify:
          "Confirm the eight incident type names match the wording Quality wants against the Aged Care Rules 2025 (for example 'by a worker' for stealing or financial coercion), and that each example sits under the right type.",
      },
      {
        kind: "commit",
        id: "chapter-commit",
        title: "Your next step",
        intro:
          "That's the end of the course. You've seen all eight reportable incident types and followed one incident through the IMS. Choose one thing to put into practice. Only you see what you pick.",
        prompt: "What's one thing you'll do at work this week?",
        suggestions: [
          "Check I know how to reach the designated incident responder, from a client's home or on the phone",
          "Pick one reportable incident type I'm least sure of and reread its warning signs, so I'd notice them sooner",
          "Ask my manager how our team records choices a client makes about their services, so a recorded choice is never mistaken for neglect",
        ],
        timing: "This week",
      },
    ],
    short: {
      brief:
        "Every incident moves through the six essential elements of an IMS:\n\n1. **Ensure leadership and a safety culture**: people feel safe to raise concerns, and the focus moves from blame to action.\n2. **Respond to the incident**: the person's safety and wellbeing first, and involve them in what happens next.\n3. **Record and report the incident**: record every incident in the IMS and tell your manager, who decides whether it's reportable and its priority.\n4. **Analyse the incident**: look for patterns and root causes.\n5. **Implement actions**, and keep the person informed through open disclosure.\n6. **Close the loop**: evaluate the outcome, find gaps and share findings.\n\nThe provider notifies the Commission of a **Priority 1** reportable incident within 24 hours of becoming aware, and a **Priority 2** within 30 calendar days.",
      confidence: "I can follow an incident through all six elements of an IMS.",
    },
    keyPoints: [
      "Leadership and a safety culture come first: people must feel safe to raise concerns.",
      "Respond to the person, record every incident, and escalate so it can be assessed and reported.",
      "Use the IMS to find patterns, act on the causes, and keep the person informed.",
      "Closing the loop feeds improvement, and incident data keeps being reviewed.",
    ],
    quiz: [
      {
        id: "q1",
        from: "module activity",
        prompt: "Sidney's GP referred him to a psychologist because of the distress Jenny's conduct caused. How is the incident classified?",
        options: [
          opt("a", "Psychological or emotional abuse, Priority 1", "Correct. It caused distress that needs psychological treatment.", true),
          opt("b", "Psychological or emotional abuse, Priority 2", "No. The need for psychological treatment makes it Priority 1."),
          opt("c", "Not reportable, because there was no physical harm", "No. Emotional abuse doesn't need physical harm."),
          opt("d", "A near miss", "No. The abuse happened."),
        ],
        explain:
          "Threats, taunting and restricting Sidney's social contact are psychological or emotional abuse. Because it caused distress needing psychological treatment, it's Priority 1.",
      },
      {
        id: "q2",
        from: "module activity",
        prompt: "How soon must the provider notify the Commission of a Priority 1 reportable incident?",
        options: [
          opt("a", "Within 24 hours of becoming aware", "Correct.", true),
          opt("b", "Within 30 hours", "No. It's 24 hours."),
          opt("c", "Within 30 days", "No. That's Priority 2."),
          opt("d", "There's no set timeframe", "No. The timeframes are fixed."),
        ],
        explain: "Priority 1 reportable incidents are notified within 24 hours of becoming aware, with outstanding details within 5 days.",
      },
      {
        id: "q3",
        from: "module activity",
        prompt: "Sidney is OK now. Does Geoff still need to investigate?",
        options: [
          opt("a", "Yes. A worker's conduct, a pattern over weeks and harm needing treatment all call for an investigation", "Correct.", true),
          opt("b", "No. Sidney is OK", "No. His being OK now doesn't remove the causes."),
          opt("c", "Only if Sidney asks for one", "No. The provider decides based on the incident."),
          opt("d", "Only if the Commission requires one", "No. The provider's own IMS calls for it."),
        ],
        explain: "Severity, possible recurrence, worker conduct and a pattern of incidents all point to an investigation, even when the person is now safe.",
      },
      {
        id: "q4",
        from: "module activity",
        prompt: "What should Geoff's investigation report include?",
        options: [
          opt("a", "The causes of the incident and possible solutions", "Correct.", true),
          opt("b", "The names of the people at fault, for circulation", "No. The focus is causes and solutions, not blame."),
          opt("c", "Only a timeline of events", "No. It needs causes and solutions too."),
          opt("d", "Only the actions already taken", "No. It needs causes and possible solutions."),
        ],
        explain: "An investigation report sets out the causes of the incident and possible solutions, which then shape the actions.",
      },
      {
        id: "q5",
        from: "module activity",
        prompt: "What does closing the loop help a provider do?",
        options: [
          opt("a", "Identify gaps, inform continuous improvement and prevent incidents, as part of an ongoing cycle", "Correct.", true),
          opt("b", "Finish with the incident so the data never needs looking at again", "No. Incident data keeps being reviewed."),
          opt("c", "Close the record before actions are finished", "No. Actions are completed first."),
          opt("d", "Decide who to blame", "No. It's about learning and improvement."),
        ],
        explain:
          "Closing the loop identifies gaps, informs continuous improvement and helps prevent incidents. It isn't the end: incident data keeps being reviewed.",
      },
    ],
  },
];
