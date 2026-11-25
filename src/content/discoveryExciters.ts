/*
  Starting Discovery Exciter scripts for the Discovery Paths that existed when the Exciter arrived (Nov 2026), and their
  original short descriptions (docs/discovery-exciter.md). Used once by scripts/migrate-discovery-exciters.ts, which
  is safe to run again.

  Each Exciter was written by hand (no AI) from the spoken script the path's description had become on 24 Nov 2026,
  reshaped into the PRD's 70 to 130 word Discovery Exciter: a question or dilemma first, why it matters, what the
  learner will explore and gain. Every fact is the path's own (its topics, outcomes, structure and quiz); nothing new is
  claimed. They go in as drafts for an author to review and approve. The three SIRS paths' Exciters are
  ALIS_PARTS[].intro (content/alisCourse.ts), which the ALIS builder writes too.
*/

export const DISCOVERY_EXCITER_SEEDS: Record<string, string> = {
  "lp-aged-care-in-a-nutshell":
    "Margaret is eighty-two, and she wants to keep living in her own home. It sounds simple. So why can getting support feel so complicated? Who does what, where does she even start, and what happens when the choice she wants carries some risk? Over about thirty minutes, you’ll follow Margaret’s story to see why aged care exists, what went wrong, what changed, and who does what along the way. You’ll see how someone gets support at home, and where Trilogy Care fits in. You don’t need any experience. Just bring your curiosity, and keep one question in mind as you go: what would Margaret want?",
  "lp-care-coordination":
    "Your first clients are on their way. Who do you call when something doesn’t add up? How do you respect a client’s choice when it makes you a little nervous? And what does a good case note actually look like on a busy day? This Discovery Path gets you ready for those moments. You’ll meet the people behind you and make sense of the rules that are there to protect older people. Then you’ll practise what fills a coordinator’s week: budgets, case notes, weekly checks and incident reports. The topics are short, each one is built around a real situation, and in the role plays, you make the calls. Already coordinating? It’s a handy refresher on Support at Home. Either way, come back whenever you need it.",
  "lp-contractor-induction-final-check":
    "You’ve worked through all seven steps. Now, how much of it would you remember if a situation like these turned up on your very first shift? This final check is your chance to find out. The questions are drawn from across the whole induction, so expect to connect ideas rather than recall a single page. Read each one carefully and think about what you’d actually do. You’ll need eighty per cent to pass, and you have three tries. Once you’ve passed, you’re ready for your first shift.",
  "lp-delivering-support-at-home-services":
    "You’re halfway through a visit and the client asks for something extra. Just a quick job, they say. Is it part of your service? Do you need a qualification you don’t have? And how would you invoice it? This Discovery Path is for everyone delivering Support at Home services for Trilogy Care. In four short topics, you’ll get to know the six kinds of service and who’s allowed to deliver each one, learn the five rules that apply to every visit, and test yourself on what’s in and what’s out with ten quick calls. Then you’ll see how to invoice so you’re paid the first time. It’s practical, it’s quick, and it’ll save you headaches later.",
  "lp-dot-s-week":
    "Dot Wilson is eighty-four, new to Trilogy Care, and she knows her own mind. For the next five days, you’re her Care Partner. What matters most to her? What do you do when an invoice doesn’t look right, or when something at her place doesn’t feel right? And when Dot makes a choice that carries some risk, how do you support her without taking over? Each day is one short topic, and each one asks you to decide. By her first review, you’ll have pulled it all together, and you’ll see what it means to keep Dot in charge of her own care. Let’s see how your week goes.",
  "lp-getting-invoices-paid":
    "A supplier rings you, frustrated. Their invoice is on hold again, and they want to know why. Would you know where to look? Under Support at Home, invoicing is stricter than it used to be, and small details can stop a payment. In this Discovery Path, you’ll see why the rules changed, what needs to be set up before a service starts, and what a good invoice looks like, line by line, including travel and transport. And when an invoice is held or rejected, you’ll learn how to help the supplier put it right, completely, the first time. Each topic stands on its own, so start with whatever’s causing trouble right now.",
  "lp-partnering-with-trilogy-care":
    "A new client could be one referral away. But before the first visit, would everything be in place? Do you know how clients get their Support at Home funding, what Trilogy Care needs from a referral, and which agreements and qualifications have to be sorted first? This Discovery Path is for service partners working with Trilogy Care. Across eight short topics, you’ll follow the journey from funding and referrals to your first service, then into pricing, invoicing and getting paid in full and on time. You’ll also see how to talk about the partnership accurately, and what a day in the life of a service partner looks like. Go at your own pace.",
  "lp-ready-for-your-first-shift-trilogy-care":
    "Your first shift is coming up. You know how to support people, but do you know where you fit in self-managed care? What’s inside your scope, and what isn’t, especially around medication? And if something doesn’t feel right, who do you tell, and how quickly? This induction walks you through seven short steps: how self-managed care works, the person you’re supporting, the Code of Conduct, keeping people safe at home, speaking up when something goes wrong, staying compliant, and getting booked and paid. At the end there’s a knowledge check and a declaration, and then your certificate. Take your time. It’s all about you feeling ready on day one.",
  "lp-sirs-training":
    "Something you’ve just seen in a client’s home doesn’t sit right. Is it a reportable incident? How urgent is it? And is it yours to raise? This is your refresher on the Serious Incident Response Scheme. You’ll go back over the test for whether an incident is reportable, the eight types and where the lines between them sit, the difference between Priority 1 and Priority 2, and when the police need to be told. You’ll also be clear on your part, and on the fact that speaking up is protected. Then you’ll put it to work in an assessment built on real-world scenarios. You’ll need eighty per cent to pass, and you can retake it if you need to.",
  "lp-support-at-home-transport-billing":
    "You drive across town to a client, then take them to an appointment and wait. Which part of that can you bill, and how? Transport and travel can be tricky to get right on a Support at Home invoice, and a wrong guess can mean a rejected invoice. In this Discovery Path, you’ll see what you can’t charge for, how your travel costs fit into your service rates, how Direct Transport is billed per trip, and when travel is simply part of another service. Then you’ll work through eight everyday scenarios, from appointments to shopping and outings. By the end, your transport invoices should go through without a hitch.",
  "lp-support-at-home-in-practice":
    "A client tells you they can’t afford their contribution this month. Another needs some equipment at home, and the request has to be right the first time. And after an incident, a family wants an honest conversation. What do you do next? You’ve got the basics, and this is the second stage of care coordination training. You’ll handle money conversations with care and know who can speak up for clients, work alongside your Care Partner, find your way around the Trilogy Care Portal, and manage budgets through real quarters. You’ll also make requests the way Support at Home now needs them, and respond well when things go wrong. Each topic stands on its own, so start where you need it most.",
};

/** The 11 paths' original short descriptions, from before they were rewritten as spoken scripts on 24 Nov 2026. */
export const DISCOVERY_PATH_DESCRIPTIONS: Record<string, string> = {
  "lp-aged-care-in-a-nutshell":
    "A 30-minute introduction to aged care in Australia, told through Margaret, 82, who wants to keep living at home. Why aged care exists, what went wrong and what changed, who does what, how someone gets support, where Trilogy Care fits, and why the older person’s rights and choices come first.",
  "lp-care-coordination":
    "Everything you need to start coordinating care with Trilogy Care. Meet your team, learn the rules that protect older people, then practise the everyday work: case notes, budgets, weekly checks and incident reporting. Every topic is short and built around real situations, with role plays where you make the calls.",
  "lp-contractor-induction-final-check": "The final check for the Trilogy Care contractor induction.",
  "lp-delivering-support-at-home-services":
    "What you do when you deliver Support at Home services for Trilogy Care, from Trilogy’s supplier guide. The six kinds of service and who can deliver them, the five rules for every visit, what’s included and what isn’t, and how to invoice so you’re paid first time.",
  "lp-dot-s-week":
    "Five days with Dot Wilson, 84, a new Trilogy Care client who knows her own mind. As her Care Partner, you’ll put her goals first, sort out a tricky invoice, respond to a possible incident, support a risky choice, and bring it all together at her first review.",
  "lp-getting-invoices-paid":
    "Getting suppliers’ invoices approved and paid on time under Support at Home. Why invoicing is stricter than it was, what to set up before the service, what a good invoice looks like, and how to help a supplier fix a held or rejected invoice. Built from Trilogy’s supplier billing guides and the Confusion to Clarity series.",
  "lp-partnering-with-trilogy-care":
    "For service partners joining Trilogy Care. How clients get Support at Home funding, how to refer them, what to have in place before the first service, how pricing and payment work, and how to market the partnership. Includes three existing partner topics on services, invoicing and a day in the life.",
  "lp-ready-for-your-first-shift-trilogy-care":
    "The induction for independent contractors delivering Support at Home services with Trilogy Care: seven short steps, a capstone knowledge check and a declaration, with a certificate at the end.",
  "lp-sirs-training":
    "Mandatory training on the Serious Incident Response Scheme. A refresher on what makes an incident reportable, the eight types, Priority 1 and 2, and your part, then an assessment with real-world scenarios. 80% to pass, with retakes.",
  "lp-support-at-home-transport-billing":
    "How to bill transport and travel under Support at Home, from Trilogy’s supplier guide. What you can’t charge for, how Direct Transport is billed per trip, when travel is part of another service, and eight everyday scenarios to practise on.",
  "lp-support-at-home-in-practice":
    "The second stage of care coordination training. How to handle the money conversations, work with your Care Partner and the Trilogy Care Portal, manage budgets through real quarters, make requests that have changed under Support at Home, and respond well when things go wrong.",
};

/**
  The descriptions as they were when the Exciter arrived (24 to 25 Nov 2026): spoken scripts, which Ava read aloud. The
  migration restores a path's original description only over one of these (or over the original itself), so a
  description an author has rewritten since is reported for a person to look at instead of being replaced. The SIRS
  paths' are by path name: the ALIS builder's `intro` before it was reshaped into an Exciter.
*/
export const SPOKEN_DESCRIPTIONS: Record<string, string> = {
  "lp-aged-care-in-a-nutshell":
    "New to aged care? Start here. In about 30 minutes, you’ll follow Margaret, who’s 82 and wants to keep living at home. Through her story, you’ll see why aged care exists, what went wrong and what changed, who does what, and how someone gets support. You’ll also see where Trilogy Care fits in, and why Margaret’s rights and choices come first. No experience needed. Just bring your curiosity.",
  "lp-care-coordination":
    "Welcome to care coordination with Trilogy Care. This path gets you ready for your first clients. You’ll meet your team, learn the rules that protect older people, then practise the everyday work: case notes, budgets, weekly checks and incident reporting. Every topic is short and built around real situations, and in the role plays, you make the calls. Take it at your own pace, and come back whenever you need a refresher.",
  "lp-contractor-induction-final-check":
    "You’ve made it to the last step of your induction. This final check brings together everything from the seven steps, with questions drawn from across the whole induction. You’ll need 80 percent to pass, and you have three tries, so read each question carefully. Once you pass, you’re ready for your first shift.",
  "lp-delivering-support-at-home-services":
    "Delivering Support at Home services for Trilogy Care? This path is a great place to start. In four short topics, you’ll learn the six kinds of service and who can deliver them, the five rules for every visit, what’s included and what isn’t, and how to invoice so you’re paid the first time. It’s practical, it’s quick, and it’ll save you headaches later.",
  "lp-dot-s-week":
    "Meet Dot Wilson. She’s 84, new to Trilogy Care, and she knows her own mind. Over five days, you’ll be her Care Partner. You’ll put her goals first, sort out a tricky invoice, respond to a possible incident, support a risky choice, and bring it all together at her first review. Each day is one short topic. Let’s see how your week with Dot goes.",
  "lp-getting-invoices-paid":
    "Want suppliers paid on time, every time? In this path, you’ll see why Support at Home invoicing is stricter than it used to be, what to set up before a service starts, and what a good invoice looks like. You’ll also learn how to help a supplier fix a held or rejected invoice, completely and the first time. Each topic stands on its own, so start with whatever you need most today.",
  "lp-partnering-with-trilogy-care":
    "Welcome, and thanks for partnering with Trilogy Care. This path covers what you need to work with us well. You’ll see how clients get Support at Home funding, how to refer them, and what to have in place before the first service. You’ll also learn how pricing and payment work, and how to talk about the partnership. Eight short topics, and you can go at your own pace.",
  "lp-ready-for-your-first-shift-trilogy-care":
    "Welcome to Trilogy Care. Before your first shift, this induction walks you through seven short steps: how self-managed care works, the person you support, working safely and within your scope, and speaking up when something’s not right. At the end, there’s a knowledge check and a declaration, and then your certificate. Take your time. It’s all about you feeling ready on day one.",
  "lp-sirs-training":
    "Every serious incident matters. This is your mandatory refresher on the Serious Incident Response Scheme. You’ll go over what makes an incident reportable, the eight types, and the difference between Priority 1 and Priority 2, and you’ll be clear on your part. Then there’s an assessment with real-world scenarios. You’ll need 80 percent to pass, and you can retake it if you need to.",
  "lp-support-at-home-transport-billing":
    "Transport and travel can be tricky to bill. This path makes it simple. You’ll see what you can’t charge for, how Direct Transport is billed per trip, and when travel is part of another service. Then you’ll work through eight everyday scenarios to practise on. By the end, your transport invoices should go through without a hitch.",
  "lp-support-at-home-in-practice":
    "You’ve got the basics. Now let’s go further. This is the second stage of care coordination training. You’ll handle money conversations with care, work with your Care Partner and the Trilogy Care Portal, and manage budgets through real quarters. You’ll also make requests the way Support at Home now needs them, and respond well when things go wrong. Each topic stands on its own, so start where you need it most.",
};
export const SPOKEN_SIRS_DESCRIPTIONS: Record<string, string> = {
  "SIRS 1: Building your incident management system":
    "Every incident is a chance to keep someone safer. In this path, you’ll learn what the Serious Incident Response Scheme is, and how an incident management system helps you notice, respond to and learn from what goes wrong. Five short topics take you from the SIRS itself to the four components and six elements of a good system, and how complaints fit in. Then a five-question quiz checks it’s all clicked. You’ll need all five right, so take your time.",
  "SIRS 2: Managing an incident from start to finish":
    "Something has happened. What now? In this path, you’ll follow one incident all the way through, from the first response to closing the loop. Across five short topics, you’ll see how to look after the person first, record what happened, work out why it happened, choose actions that stick, and share the outcome. Then a five-question quiz brings it together. You’ll need all five right to finish, and you can try again if you need to.",
  "SIRS 3: Recognising and reporting incidents in home care":
    "Would you know a reportable incident if you saw one in someone’s home? This path walks you through all eight types under the SIRS, as they show up in home and community care, from unexplained absence to neglect. For each one, you’ll see what to look for, what to do first, and whether it’s Priority 1 or Priority 2. Nine short topics, then a five-question quiz. You’ll need all five right, because getting this right really matters.",
};
