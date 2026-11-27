/*
  The feature guide (the owner, Nov 2026): every feature added to the Hub from the PRDs, at a high level, grouped by
  where it lives. For the owner, opened from the header beside Admin. Each one says what it is, who it's for and the
  problem it solves, with links to where it lives. The detail for each is in docs/ (the file named in `doc`).
*/

export type FeatureStatus = "live" | "draft" | "pilot" | "off" | "placeholder";
export const FEATURE_STATUS: Record<FeatureStatus, string> = {
  live: "Live",
  draft: "Built, awaiting sign-off",
  pilot: "Pilot, demo data",
  off: "Off until released",
  placeholder: "Placeholder",
};

export type Feature = {
  name: string;
  what: string;
  who: string;
  problem: string;
  links: { label: string; href: string }[];
  status?: FeatureStatus;
  /** Its note in docs/, for the detail. */
  doc?: string;
};

export type FeatureGroup = { id: string; title: string; intro: string; features: Feature[] };

/** The Magazine's practice blocks, in brief: the Block showcase courses have a page for each. */
export type BlockFamily = { title: string; blocks: { name: string; what: string }[] };

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "magazine",
    title: "Magazine: building courses",
    intro: "The Magazine is where long-form courses and guides are written. These are the tools for building them and the features readers get.",
    features: [
      {
        name: "Block showcase",
        what: "Two draft courses with a page for each of the 35 newer block types: who it's for, what it's for, the problem it solves, then the block to try.",
        who: "You and other authors choosing blocks.",
        problem: "With so many block types it's hard to know which one fits a learning problem without seeing them.",
        links: [{ label: "Admin: Magazine (Block showcase 1 and 2)", href: "/admin/magazine" }],
        status: "draft",
      },
      {
        name: "Voiced introductions",
        what: "A short script for each Magazine course and page, Topic and Discovery Path is turned into a recording in OpenAI's Alloy voice, approved, and introduces the page when the learner presses Listen.",
        who: "Every learner; authors write and approve the scripts.",
        problem: "Some people take in learning better by listening, and a short spoken welcome says why the page matters before they start.",
        links: [
          { label: "Admin: Magazine", href: "/admin/magazine" },
          { label: "Admin: Path introductions", href: "/admin/learning-paths/introductions" },
          { label: "Admin: Topics", href: "/admin/lessons" },
        ],
        status: "live",
        doc: "magazine-audio-guide.md",
      },
      {
        name: "Ava, the care coordinator on the road",
        what: "Ava is a fictional care coordinator on the western run, checking in on how learners are going and keeping them motivated. Her videos are made in ElevenLabs and uploaded by hand: on a course cover, on pages, in the Ava video block and in Field Notes from Ava, where she revisits people later on.",
        who: "Every learner; authors upload and approve her videos.",
        problem: "Long courses can feel lonely. A familiar, warm character who checks in keeps people going and connects the story between pages.",
        links: [
          { label: "Admin: Ava’s videos", href: "/admin/learning-guide" },
          { label: "Field Notes from Ava", href: "/field-notes" },
        ],
        status: "live",
        doc: "ai-learning-guide.md",
      },
      {
        name: "Ava Relay (text check-in)",
        what: "A “Check in with Ava… DIAL” bar on Magazine story pages where Ava replies in text from the road. Separate from her videos, and it has its own switch.",
        who: "Readers of story-led courses.",
        problem: "Lets a learner check in with Ava between her videos.",
        links: [{ label: "Admin: Ava Relay", href: "/admin/relay" }],
        status: "live",
        doc: "ava-relay.md",
      },
      {
        name: "Story Plans and recurring characters",
        what: "A canon of fictional people (Dot, Mrs Patel, Arthur and others) with their histories, voiced check-ins and AI story proposals, so the same people recur across training.",
        who: "Learning authors.",
        problem: "Made-up cases contradicted each other; a shared canon keeps characters consistent and familiar.",
        links: [{ label: "Admin: Characters and stories", href: "/admin/characters" }],
        status: "live",
        doc: "story-plans.md",
      },
      {
        name: "Character photos",
        what: "One portrait per fictional person. Name them in a scenario and their portrait appears automatically.",
        who: "Authors.",
        problem: "Nobody has to hunt the image library for the right face, and each person always looks the same.",
        links: [{ label: "Admin: Character photos", href: "/admin/images/characters" }],
        status: "live",
        doc: "character-photos.md",
      },
      {
        name: "Emphasise text",
        what: "An author marks a short phrase and a light teal marker sweeps behind it as the reader scrolls to it.",
        who: "Authors, for readers.",
        problem: "Draws the eye to the one phrase that matters without bold or capitals.",
        links: [{ label: "Admin: Magazine", href: "/admin/magazine" }],
        status: "live",
        doc: "emphasise-text.md",
      },
      {
        name: "Self-review (Test myself)",
        what: "A Test myself button on reading pages that quizzes the reader on this page or the course so far.",
        who: "Readers of long courses.",
        problem: "People think they've understood a page until they're asked; retrieval practice makes it stick.",
        links: [{ label: "Magazine", href: "/magazine" }],
        status: "live",
        doc: "magazine-self-review.md",
      },
      {
        name: "Reflect and Apply blocks and My Notes",
        what: "Private journal, compare perspectives, pulse check and action note blocks (Think, Compare, Try, Revisit), with notes kept in My Notes.",
        who: "Every reader.",
        problem: "Reading alone rarely changes practice; these ask people to connect it to their own work and come back to it.",
        links: [{ label: "Magazine", href: "/magazine" }],
        status: "live",
        doc: "magazine-reflect-apply.md",
      },
      {
        name: "Sign-off and demo sign-off",
        what: "Reviewed blocks can't be published until named reviewers sign them off. On a demo Hub, a superadmin can record a demo sign-off instead.",
        who: "Authors, reviewers and superadmins.",
        problem: "Practice blocks state rules, prices and procedures, so they need the right people's approval before learners see them.",
        links: [
          { label: "Admin: Sign-offs", href: "/admin/signoffs" },
          { label: "Admin: Approvals", href: "/admin/approvals" },
        ],
        status: "live",
        doc: "demo-sign-off.md",
      },
      {
        name: "Question Pool",
        what: "Every quiz and decision question across Topics, paths and the Magazine in one place, with quality checks and reuse.",
        who: "Learning authors.",
        problem: "Questions were scattered and unchecked; one pool makes them consistent and reviewable.",
        links: [{ label: "Admin: Questions", href: "/admin/questions" }],
        status: "live",
        doc: "question-pool.md",
      },
    ],
  },
  {
    id: "resources",
    title: "Resources and Work Tools",
    intro: "Tools people use at the point of work, not just in training. Most are reached from Resources, Work Tools or the Favourites control in the header.",
    features: [
      {
        name: "Job Aids and Work Tools",
        what: "Short, role-specific steps from an approved procedure, always at their current release and with a route to urgent help. They sit in Work Tools and can be placed in courses.",
        who: "Anyone following a procedure at work.",
        problem: "Procedures copied into training drift from the real one; a Job Aid always shows the approved version.",
        links: [
          { label: "Work Tools", href: "/tools" },
          { label: "Admin: Job Aids", href: "/admin/playbooks" },
        ],
        status: "draft",
        doc: "job-aids.md",
      },
      {
        name: "Favourites and highlights",
        what: "Highlight any words in a course or save a tool, and find them again in one private saved list.",
        who: "Everyone.",
        problem: "People couldn't find the useful line or tool again when they needed it.",
        links: [{ label: "Favourites", href: "/favourites" }],
        status: "live",
        doc: "job-aids.md",
      },
      {
        name: "Live Call Pocket Playbook (Companion Drawer)",
        what: "A drawer from the Favourites control with golden scripts, incident first steps and a co-contribution quick-calc for use during a live call.",
        who: "Care Partners and coordinators on the phone.",
        problem: "In the middle of a call there's no time to search a course for the right words or figure.",
        links: [
          { label: "Golden scripts", href: "/tools/golden-scripts" },
          { label: "Contribution quick-calc", href: "/tools/contribution-quick-calc" },
          { label: "Incident first steps", href: "/tools/incident-first-steps" },
        ],
        status: "pilot",
        doc: "pocket-playbook.md",
      },
      {
        name: "Myth vs Reality",
        what: "Questions participants and families often ask, each with a 30-second answer, the exception, what to check, the source and an approved email reply to copy.",
        who: "Anyone who answers client and family questions.",
        problem: "Staff repeat what they've heard; this gives one approved answer.",
        links: [
          { label: "Resources: Myth vs Reality", href: "/resources/myths" },
          { label: "Admin: Myth vs Reality", href: "/admin/myths" },
        ],
        status: "live",
        doc: "myth-vs-reality.md",
      },
      {
        name: "Pocket Deck",
        what: "The Notes to a Younger Me cards a person has kept, to read again.",
        who: "Newer staff and partners.",
        problem: "Keeps the peer advice that resonated close at hand.",
        links: [{ label: "Pocket Deck", href: "/pocket-deck" }],
        status: "live",
        doc: "notes-to-a-younger-me.md",
      },
      {
        name: "Caseload-to-Margin and Hiring Capacity Calculator",
        what: "A private planning tool for a Care Partner business: when to plan recruitment, which capacity option works, and what happens to service, operating result and cash.",
        who: "Care Partner business owners.",
        problem: "Owners hire too late or too early because they can't see capacity, margin and cash together.",
        links: [{ label: "Work Tool", href: "/tools/caseload-margin" }],
        status: "live",
        doc: "caseload-margin-calculator.md",
      },
      {
        name: "While You Wait live tool",
        what: "Works out interim support costs for a family waiting for funding during a live call, with a summary to send.",
        who: "Staff on live calls.",
        problem: "Families need a clear answer on what they can arrange and what it may cost while they wait.",
        links: [{ label: "Work Tool", href: "/tools/while-you-wait" }],
        status: "off",
        doc: "while-you-wait.md",
      },
      {
        name: "Local Referral Studio",
        what: "Practise a referral conversation with a fictional GP practice manager or social worker, and make an approved, co-branded one-pager.",
        who: "Care Partners and business owners.",
        problem: "Partners overpromise or use unapproved claims when they talk to referrers.",
        links: [
          { label: "Work Tool", href: "/tools/referral-studio" },
          { label: "Admin", href: "/admin/referral-studio" },
        ],
        status: "draft",
        doc: "local-referral-studio.md",
      },
      {
        name: "Contractor Network Builder",
        what: "A role-restricted tool for building local contractor cover, with a quality scorecard.",
        who: "Business owners and coordinators.",
        problem: "Unverified workers get counted as cover, and gaps show up as missed starts.",
        links: [{ label: "Work Tool", href: "/tools/network-builder" }],
        status: "pilot",
        doc: "network-builder.md",
      },
      {
        name: "First 100 Days",
        what: "A manager's tool for coaching a new coordinator through their first 100 days.",
        who: "Business owners and managers.",
        problem: "New coordinators get sent on more courses instead of being observed and coached.",
        links: [{ label: "Work Tool", href: "/tools/first-100-days" }],
        status: "pilot",
        doc: "shadow-and-coach.md",
      },
      {
        name: "28-Day Trust Check tool",
        what: "A check-in and action plan for recovering a service that has gone wrong, from Day 1 to Day 28.",
        who: "Coordinators and partners.",
        problem: "Service recovery gets closed without checking with the person.",
        links: [{ label: "Work Tool", href: "/tools/trust-check" }],
        status: "pilot",
        doc: "trust-check.md",
      },
      {
        name: "Activities directory",
        what: "Every interactive activity a person can open: the simulators, roleplays, calculators and Work Tools their role allows.",
        who: "Everyone.",
        problem: "Interactive practice was buried inside courses; this lists it in one place.",
        links: [
          { label: "Activities", href: "/activities" },
          { label: "Admin: Activity Catalogue", href: "/admin/activities" },
        ],
        status: "live",
        doc: "activity-catalogue-audit.md",
      },
    ],
  },
  {
    id: "community",
    title: "Community",
    intro: "Peer learning and the fictional people who carry the Hub's stories.",
    features: [
      {
        name: "Digital Members",
        what: "The fictional people learners meet in training, introduced in their own words before they appear in a scenario, each with a profile and a chat.",
        who: "Everyone.",
        problem: "Characters in scenarios felt like strangers; meeting them first makes the cases land.",
        links: [{ label: "Community", href: "/community" }],
        status: "live",
        doc: "digital-members.md",
      },
      {
        name: "Lives in Progress",
        what: "The Digital Members' lives carry on: a current episode, an audio diary, the story so far, and multi-week arcs that publish on a schedule.",
        who: "Everyone; authors run it.",
        problem: "Gives people a reason to come back, and shows situations unfold over time as they do in care.",
        links: [{ label: "Admin: Lives in Progress", href: "/admin/lives" }],
        status: "live",
        doc: "lives-in-progress.md",
      },
      {
        name: "Life Moments and the Living Calendar",
        what: "Short “Meanwhile, in their lives…” moments on the homepage, with voice messages, scheduled on a calendar with an AI Story Assistant to propose a fortnight.",
        who: "Everyone; authors schedule them.",
        problem: "Keeps the characters present between episodes without a lot of authoring each week.",
        links: [
          { label: "Moments", href: "/community/moments" },
          { label: "Admin: Lives in Progress", href: "/admin/lives" },
        ],
        status: "live",
        doc: "lives-in-progress.md",
      },
      {
        name: "What Would You Do? case threads",
        what: "A fictional dilemma: write a private first take, then read a Quality-reviewed case note and moderated responses from experienced coordinators.",
        who: "Coordinators.",
        problem: "Judgement grows from comparing approaches, which people rarely get to do safely.",
        links: [
          { label: "Community", href: "/community" },
          { label: "Admin: Case threads", href: "/admin/case-threads" },
        ],
        status: "draft",
        doc: "case-threads.md",
      },
      {
        name: "Care Partner Business Field Notes",
        what: "Honest business decisions from verified Care Partner principals: what they believed, tried, what failed and what they'd tell a newer principal.",
        who: "Care Partner business owners.",
        problem: "New principals learn business lessons the hard way; this passes on peers' experience.",
        links: [
          { label: "Business notes", href: "/business-notes" },
          { label: "Admin", href: "/admin/business-notes" },
        ],
        status: "live",
        doc: "business-field-notes.md",
      },
      {
        name: "Notes to a Younger Me",
        what: "Experienced colleagues' notes to their younger selves, dealt as cards in courses, with “Leave a note behind” to contribute one.",
        who: "Newer staff and partners; experienced ones contribute.",
        problem: "Passes on judgement that isn't in any procedure.",
        links: [{ label: "Admin: Mentor notes", href: "/admin/mentor-notes" }],
        status: "live",
        doc: "notes-to-a-younger-me.md",
      },
    ],
  },
  {
    id: "learning",
    title: "Topics, Discovery Paths and challenges",
    intro: "Short-form learning and the routes through it.",
    features: [
      {
        name: "My Discovery (learner-made paths)",
        what: "A learner says what they want to get better at and the Hub suggests a route of Topics; they can build their own and ask for missing topics.",
        who: "Everyone.",
        problem: "Fixed paths don't fit every goal; this lets people learn what they need.",
        links: [
          { label: "My Discovery", href: "/discovery" },
          { label: "Admin: Discovery gaps", href: "/admin/discovery" },
        ],
        status: "live",
        doc: "discovery-paths.md",
      },
      {
        name: "Topic video introductions",
        what: "Every Topic opens with an introduction card: a presenter, the title, a short description and Let's get started.",
        who: "Everyone.",
        problem: "Gives every Topic a human start. Synthesia credits are exhausted, so it shows a placeholder portrait for now.",
        links: [
          { label: "Topics", href: "/topics" },
          { label: "Admin: Topic intros", href: "/admin/topic-intros" },
        ],
        status: "placeholder",
        doc: "topic-video-introductions.md",
      },
      {
        name: "ALIS: incident management and SIRS",
        what: "Incident management and the Serious Incident Response Scheme, as Topics in three Discovery Paths and one long Magazine course in three chapters.",
        who: "Everyone who could witness or report an incident.",
        problem: "One source, two forms: quick Topics for refreshers and a full course for induction.",
        links: [
          { label: "Discovery Paths", href: "/paths" },
          { label: "Magazine", href: "/magazine" },
        ],
        status: "draft",
        doc: "alis-course.md",
      },
      {
        name: "Trilogy Challenges",
        what: "Multi-day challenges such as Dot's Week: a day opens at a time, with points and re-runs.",
        who: "Everyone.",
        problem: "A little every day builds a habit better than one long course.",
        links: [{ label: "Challenges", href: "/challenges" }],
        status: "live",
      },
      {
        name: "eLearning (SCORM)",
        what: "Imported SCORM courses, such as Articulate Rise and Storyline exports, played and tracked in the Hub.",
        who: "Authors bringing existing courses; every learner.",
        problem: "Existing eLearning can live in the Hub instead of a separate system.",
        links: [
          { label: "eLearning", href: "/elearning" },
          { label: "Admin: eLearning", href: "/admin/elearning" },
        ],
        status: "live",
        doc: "elearning.md",
      },
    ],
  },
  {
    id: "people",
    title: "People, onboarding and governance",
    intro: "Getting people set up, knowing what they can do, and keeping content governed.",
    features: [
      {
        name: "Onboarding: Your setup",
        what: "A returnable wizard and task list for new people, with a review queue, activation rules, a starting-point check and organisation-level tasks.",
        who: "Everyone new; People and Culture, Partner Operations and Quality review it.",
        problem: "New starters didn't know what they had to do first, and reviewers had no queue.",
        links: [
          { label: "Your setup", href: "/onboarding" },
          { label: "Admin: Onboarding", href: "/admin/onboarding" },
        ],
        status: "live",
        doc: "onboarding.md",
      },
      {
        name: "Role-based onboarding and Get to know you",
        what: "Onboarding courses chosen by a person's role, and a Get to know you step at the start.",
        who: "New starters in each role.",
        problem: "One onboarding for everyone gave people content that didn't apply to them.",
        links: [{ label: "Admin: Onboarding", href: "/admin/onboarding" }],
        status: "live",
      },
      {
        name: "Policy acknowledgements",
        what: "When a policy changes, the people it applies to get a “Read and acknowledge” action by a due date, and their confirmation is recorded with the version.",
        who: "Administrators send them; everyone it applies to confirms.",
        problem: "There was no record of who had read an updated policy.",
        links: [{ label: "Admin: Policies", href: "/admin/policies" }],
        status: "live",
      },
      {
        name: "Capability Intelligence",
        what: "A governed capability framework, each person's evidence profile and sign-offs, and an aggregate team heatmap.",
        who: "Learners, managers and leaders.",
        problem: "Completions don't show capability; this links evidence to what people can actually do.",
        links: [
          { label: "My Capabilities", href: "/capabilities" },
          { label: "My team", href: "/capabilities/team" },
          { label: "Admin", href: "/admin/capabilities" },
        ],
        status: "live",
        doc: "capability-intelligence.md",
      },
      {
        name: "Learning Designer: the Problem desk",
        what: "Turns a signal from the field into a diagnosed problem and a reasoned response, recommending only blocks that exist, and saying when training isn't the fix.",
        who: "Learning authors.",
        problem: "Training was the default answer to every problem, even process ones.",
        links: [{ label: "Admin: Problem desk", href: "/admin/problems" }],
        status: "live",
        doc: "learning-designer.md",
      },
      {
        name: "Living Cases and the Signal Room",
        what: "Signals from the field (repeat contacts, material changes) gathered and reviewed, feeding return episodes and the Problem desk.",
        who: "Authors and content owners.",
        problem: "What happened in real work wasn't reaching the people who write the training.",
        links: [{ label: "Admin: Signal Room", href: "/admin/signal-room" }],
        status: "live",
        doc: "living-cases.md",
      },
      {
        name: "Activity Catalogue",
        what: "One record for every activity on the Hub: what it is, where it can be used, who it's for and whether the AI builder may use it, and why.",
        who: "Authors and administrators.",
        problem: "Nobody had a single list of what the Hub can do, or rules for what the AI may build.",
        links: [{ label: "Admin: Activity Catalogue", href: "/admin/activities" }],
        status: "live",
        doc: "activity-catalogue-audit.md",
      },
    ],
  },
  {
    id: "ai",
    title: "AI content generation",
    intro:
      "How the Hub uses AI to make learning faster, and the checks that keep it accurate. A person reviews and approves everything before learners see it.",
    features: [
      {
        name: "Draft with AI: courses, Topics, Discovery Paths and challenges",
        what: "An author uploads the approved source (a procedure, a policy, a guide or an old eLearning course) and says who it's for and what they should be able to do. Claude drafts it: a Magazine course outline first, then each page; a Topic card by card through its seven steps; a Discovery Path from existing Topics; a challenge's week of missions. It's checked against the schema, and the author reviews and approves everything before it's published.",
        who: "Learning authors.",
        problem:
          "Writing a course by hand takes days or weeks. A first draft in minutes, from the source itself, means authors spend their time reviewing and improving rather than writing from scratch: learning ships faster and costs far less in people's time, with a person still accountable for every word.",
        links: [
          { label: "Admin: Magazine", href: "/admin/magazine" },
          { label: "Admin: Topics", href: "/admin/lessons" },
          { label: "Admin: Discovery Paths", href: "/admin/learning-paths" },
        ],
        status: "live",
        doc: "learning-designer.md",
      },
      {
        name: "Pictures with AI",
        what: "Generate with AI on any picture: a course cover, a page, a news poster or a card. The description starts from the page itself (“Start from this course”, “Start from this story”), the Hub's house style is applied, and named characters keep their faces. Every picture lands in the image library.",
        who: "Authors.",
        problem: "Finding or commissioning the right picture slowed every course down, and stock photos rarely show home care in Australia.",
        links: [{ label: "Admin: Image library", href: "/admin/images" }],
        status: "live",
      },
      {
        name: "Voiced introduction scripts",
        what: "Claude drafts each course, page, Topic and Discovery Path introduction from the content, at the length chosen. The author edits and approves the script, it's recorded in the Alloy voice, and the recording is approved again before learners hear it.",
        who: "Authors.",
        problem: "Writing and recording dozens of introductions by hand isn't practical; this makes them consistent and quick, with two human checks.",
        links: [{ label: "Admin: Magazine", href: "/admin/magazine" }],
        status: "live",
        doc: "magazine-audio-guide.md",
      },
      {
        name: "AI revise and AI review",
        what: "Ask the AI to revise a Magazine page with an instruction (shorter, plainer, more Australian), and see each change to accept or reject. When a course or Topic is submitted for review, an AI pre-review checks it against its sources and flags problems for the human reviewer.",
        who: "Authors and reviewers.",
        problem: "Editing for plain language and checking against the source take time; the AI does the first pass, and a person decides.",
        links: [{ label: "Admin: Magazine", href: "/admin/magazine" }],
        status: "live",
      },
      {
        name: "Describe with AI",
        what: "Suggests a description of any picture for people who can't see it, from the picture and where it sits, ready to read and edit.",
        who: "Authors.",
        problem: "Pictures went up without descriptions; this makes accessibility the easy path.",
        links: [{ label: "Admin: Image library", href: "/admin/images" }],
        status: "live",
      },
    ],
  },
];

export const BLOCK_FAMILIES: BlockFamily[] = [
  {
    title: "Content and job aids",
    blocks: [
      { name: "Ava video", what: "One of Ava's videos from the road, with her words highlighted." },
      { name: "Hub diagram", what: "The client journey or a partner model's who-does-what, kept current." },
      { name: "Job Aid", what: "An approved procedure placed by reference." },
      { name: "Myth vs Reality tiles", what: "Common questions with approved answers." },
      { name: "Notes to a Younger Me deck", what: "Experienced colleagues' advice as cards." },
    ],
  },
  {
    title: "Judgement and conversations",
    blocks: [
      { name: "Peer benchmark poll", what: "Commit to a call, then see peers and a reviewed view." },
      { name: "What Would You Do? case thread", what: "A first take, then a reviewed case note and peers." },
      { name: "Where Is the Line?", what: "Request by request, inside or outside the role." },
      { name: "Expectation Reset timeline", what: "Rewrite what to say when timing disappoints." },
      { name: "Red Pen critique", what: "Mark up and rewrite a care plan goal or note." },
      { name: "Tough Phone Call / Family Call", what: "A difficult call with a fictional caller and a debrief." },
    ],
  },
  {
    title: "Safety and care practice",
    blocks: [
      { name: "Spot the Signal", what: "Find the concern hidden across routine updates." },
      { name: "Spot the Hazard", what: "Scan a drawn room for risks and choose what to do." },
      { name: "Dignity of Risk Balance Scale", what: "Weigh a choice against risk and agree a plan." },
      { name: "Pass the Baton relay", what: "Hand a case from role to role, closing the loop." },
      { name: "First 30 Days Mission Board", what: "Run a participant's first month in order." },
      { name: "The SaH Journey", what: "One journey seen from four people's side." },
      { name: "72-Hour Discharge Pivot", what: "Bring someone home from hospital safely." },
      { name: "28-Day Trust Check", what: "Recover a service that's gone wrong, with the person." },
    ],
  },
  {
    title: "Money and budgets",
    blocks: [
      { name: "Invoice X-Ray", what: "Read a quote or invoice line by line." },
      { name: "Contractor Vetting Card / Document Auditor", what: "Check a contractor pack against records." },
      { name: "Budget Sandbox", what: "Build a care plan and explain who pays what." },
      { name: "While You Wait calculator", what: "Cost interim support while someone waits." },
      { name: "Quarterly Budget Decision Lab", what: "Handle a sizeable balance at quarter end." },
    ],
  },
  {
    title: "Running a Care Partner business",
    blocks: [
      { name: "One Day, Five Perspectives", what: "A coordinator's day across five people's lanes." },
      { name: "Build Your Local Bench", what: "Find real contractor cover behind a misleading count." },
      { name: "Local Referral Studio", what: "Practise a truthful referral conversation." },
      { name: "Referral Journey Calculator", what: "Which referrals become active clients." },
      { name: "Local Coverage Comparison", what: "Is this suburb ready for growth." },
      { name: "Growth readiness", what: "Can we take on the next 10 clients." },
      { name: "Workload Lens", what: "Where a coordinator's week goes." },
      { name: "Service Reliability Calculator", what: "What a missed service really costs." },
      { name: "Hiring Runway Decision Lab", what: "When to hire, by capacity, result and cash." },
      { name: "90-Day Cash Bridge", what: "Can the business fund the next 90 days." },
      { name: "First 100 Days: Shadow & Coach", what: "Coach a new coordinator from real samples." },
    ],
  },
];

/*
  How Topics and Discovery Paths work (the owner, Nov 2026): the formats themselves, not every one of them. What each is,
  why it's built that way, and how it runs. A Topic's stages come from lib/buildSequence (BUILD_STAGES), the order every
  drafted Topic is built in, so this can't drift from what the Hub makes.
*/
export type FormatGuide = {
  id: "magazine" | "topics" | "paths" | "community" | "resources" | "ai" | "people";
  /** The feature group it introduces. */
  group: "magazine" | "learning" | "community" | "resources" | "ai" | "people";
  title: string;
  what: string;
  why: string[];
  /** How it runs, step by step (Topics take theirs from BUILD_STAGES). */
  steps?: { label: string; purpose: string }[];
  /** What else sits around the steps: other cards, follow-ups, ways in. */
  also: { label: string; text: string }[];
  links: { label: string; href: string }[];
};

export const FORMAT_GUIDES: FormatGuide[] = [
  {
    id: "people",
    group: "people",
    title: "People, onboarding and governance",
    what: "Everything that gets people ready and keeps the Hub's learning trustworthy: onboarding for each role, required training and policy acknowledgements with due dates, a record of what people can do rather than just what they've finished, and the governance behind every piece of content.",
    why: [
      "New starters know what to do first, and what Trilogy Care is still checking, so nobody starts work unprepared.",
      "Requirements are tracked with dates and versions, so there's a record of who read which policy, and when.",
      "Capability, not attendance: evidence of what people can do, and where a team needs support.",
      "Governance keeps content honest: problems from the field are diagnosed before training is written, every block's use is decided and recorded, and reviewers sign off what learners see.",
    ],
    steps: [
      {
        label: "Join",
        purpose: "Your setup: a returnable checklist of what you do and what we check, reviewed by People and Culture, Partner Operations and Quality.",
      },
      { label: "Get started", purpose: "Onboarding courses chosen for your role, opening with a short Get to know you." },
      { label: "Stay current", purpose: "Required training and policy acknowledgements, each with a due date, in the Inbox and on Topics." },
      { label: "Show capability", purpose: "Paths, practice and sign-offs build each person's capability profile, and managers see their team's." },
      { label: "Keep improving", purpose: "Signals from the field go to the Signal Room and the Problem desk, which decide whether training is even the fix." },
    ],
    also: [
      {
        label: "For managers",
        text: "Assign a Discovery Path with a due date, and see completions and the compliance register for the people you look after.",
      },
      {
        label: "A clear record",
        text: "A policy confirmation records the version and the date. Withdrawing a policy closes what's still waiting; confirmations already given stay on record.",
      },
      {
        label: "Quality behind the content",
        text: "The Activity Catalogue records what each activity is for and what the AI may do with it; the Question Pool keeps every quiz question checked and sourced.",
      },
      { label: "Privacy", text: "Team capability shows as an aggregate heatmap, and learners' reflections and journals stay private to them." },
    ],
    links: [
      { label: "Your setup", href: "/onboarding" },
      { label: "Admin: Onboarding", href: "/admin/onboarding" },
      { label: "Admin: Policies", href: "/admin/policies" },
      { label: "My Capabilities", href: "/capabilities" },
    ],
  },
  {
    id: "ai",
    group: "ai",
    title: "AI content generation",
    what: "Claude drafts Magazine courses, Topics, Discovery Paths, challenges, voiced introduction scripts and pictures from the approved source material, in the Hub's own patterns. People review, correct and sign off everything before it's published.",
    why: [
      "Speed: a first draft in minutes rather than weeks, so authors spend their time improving content, not writing it from scratch. Learning reaches people sooner and costs far less in staff time.",
      "Accuracy: the source is the truth. The AI is told not to add any policy, number or process the source doesn't contain, and anything it can't confirm is flagged for a person to check.",
      "Consistency: every draft follows the Hub's patterns (a Topic's seven steps, a course's teaching patterns) and can only use blocks the Hub has.",
      "Accountability: a named person reviews and signs off. The AI never publishes anything.",
    ],
    steps: [
      {
        label: "Source and draft",
        purpose: "The author uploads the approved documents; Claude drafts from them only (a course outline first, then each page).",
      },
      { label: "Author edits", purpose: "The author reads and rewrites, with automatic checks on structure, reading time, pictures, descriptions and flags." },
      { label: "Submit for review", purpose: "The author names a subject-matter expert or reviewer, and says whether it's compliance-sensitive." },
      {
        label: "AI pre-review",
        purpose:
          "Claude checks the submitted draft against its sources and flags claims with no source, outdated details and weak quiz answers. It never approves or changes anything.",
      },
      {
        label: "Human review",
        purpose: "The reviewer signs off each statement flagged to verify, saying what they confirmed, then approves or asks for changes.",
      },
      { label: "Compliance", purpose: "Compliance-sensitive content also needs Compliance to approve." },
      { label: "Publish and monitor", purpose: "The Hub owner publishes the approved draft as a new edition, and progress and drop-off show in the editor." },
    ],
    also: [
      { label: "Exactly what was approved", text: "An approval is for the exact draft submitted: edit it afterwards and it goes back for review." },
      {
        label: "Flags",
        text: "“Verify” marks a statement a reviewer must confirm against the source; “Illustrative” marks made-up figures. Reviewed practice blocks always need their named sign-off before publishing.",
      },
      {
        label: "What the AI may build",
        text: "The Activity Catalogue records, for every block, whether the AI may configure it, may only recommend it, or must leave it to a specialist, and why.",
      },
      {
        label: "Voices and pictures",
        text: "Scripts are approved before they're recorded, and recordings again before learners hear them. AI-made media is labelled as AI.",
      },
      {
        label: "While review is optional",
        text: "On this demo Hub an author can publish without review, and “Publish anyway” can pass open verify flags. The history records it. Switching review to required closes that door.",
      },
      { label: "Cost and control", text: "Generation only runs when an author asks; recordings are logged with their cost and capped each hour." },
    ],
    links: [
      { label: "Admin: Activity Catalogue", href: "/admin/activities" },
      { label: "Admin: Sign-offs", href: "/admin/signoffs" },
      { label: "Admin: Approvals", href: "/admin/approvals" },
    ],
  },
  {
    id: "resources",
    group: "resources",
    title: "Resources and Work Tools",
    what: "The Hub's reference shelf and toolbox for the working day: approved Job Aids, scripts and quick calculators for live calls, answers to the questions clients ask, the glossary, the client journey map, recorded webinars and the business planning tools. Things you use while you work, not courses you complete.",
    why: [
      "Most questions come up mid-task: on a call, in a client's kitchen, at the end of a visit. The answer needs to be a tap away, not inside a course.",
      "Job Aids always show the current approved procedure, so what people do at work matches the policy.",
      "Saving and highlighting means the line that helped once is easy to find again.",
      "Learning and doing connect: a course points to the Job Aid, and a Job Aid back to the course that explains it.",
    ],
    steps: [
      { label: "Find it", purpose: "Resources on a phone, Work Tools on a computer, or search. Everything is shown for your role." },
      { label: "Use it live", purpose: "Open a Job Aid, golden script or quick-calc from the Favourites drawer without leaving the page you're on." },
      { label: "Save it", purpose: "Save a tool or highlight a line, and it's in Favourites next time." },
      { label: "Trust it", purpose: "Every Job Aid and answer names its source and approved release, with a route to urgent help." },
      { label: "Go deeper", purpose: "Linked Topics and Magazine courses explain the why when there's time." },
    ],
    also: [
      { label: "Approved and current", text: "A Job Aid shows only its approved release; when the procedure changes, every place that uses it changes too." },
      {
        label: "For business owners",
        text: "Private planning tools for Care Partner principals: caseload and hiring, the Contractor Network Builder, the Local Referral Studio and First 100 Days.",
      },
      { label: "Live-call tools", text: "Some are pilots on demo data, and the While You Wait live tool stays off until it's released with its approvals." },
      { label: "Nothing is sent", text: "Tools help people prepare and explain; they never send a message, book a service or change a record by themselves." },
    ],
    links: [
      { label: "Resources", href: "/resources" },
      { label: "Work Tools", href: "/tools" },
      { label: "Favourites", href: "/favourites" },
    ],
  },
  {
    id: "community",
    group: "community",
    title: "Why a Community",
    what: "The Hub's shared space, and the centre of its learning: case threads where coordinators compare how they'd handle a dilemma, the Digital Members whose lives carry on between courses, moments and events on the homepage, and Business Field Notes for Care Partner principals.",
    why: [
      "People learn most from each other. Seeing how an experienced coordinator handled the same dilemma builds judgement no single course can.",
      "It gives people a reason to come back. Characters' lives move on, new threads and moments appear, so learning becomes a habit rather than an event.",
      "Much of this work is done alone, on the road. The Community turns that into a network: ask a question, share a win, find someone who's been there.",
      "What people discuss shows the learning team what's hard in practice, and feeds the next course.",
    ],
    steps: [
      { label: "Meet", purpose: "Digital Members introduce themselves in their own words before they turn up in training." },
      { label: "Follow", purpose: "Their lives carry on: episodes, audio diaries and moments on the homepage, on a schedule." },
      { label: "Think first", purpose: "In a case thread, write your own private first take before you see anyone else's." },
      { label: "Compare", purpose: "Read a Quality-reviewed case note and how experienced coordinators responded, and mark what helped." },
      { label: "Share", purpose: "Post your own response, ask a question or join an event. Everything shared is moderated." },
      { label: "Return", purpose: "Ava's Field Notes revisit people later, and what's discussed comes back in new courses." },
    ],
    also: [
      { label: "In courses too", text: "The same case threads and peer polls sit inside Magazine courses, so practice and discussion meet in one place." },
      { label: "Safe by design", text: "Every case and character is fictional, never a real client's story, and posts are moderated before they're shared." },
      { label: "For principals", text: "Business Field Notes: honest business decisions from verified Care Partner principals, with a discussion on each." },
      { label: "Engagement", text: "Characters, moments and threads bring people back between courses, and every return is another chance to learn." },
    ],
    links: [
      { label: "Community", href: "/community" },
      { label: "Admin: Lives in Progress", href: "/admin/lives" },
      { label: "Admin: Case threads", href: "/admin/case-threads" },
    ],
  },
  {
    id: "magazine",
    group: "magazine",
    title: "Magazine courses",
    what: "Long-form, story-led courses and one-page guides for when there's time at a desk: from a single page to an hour or more, built from blocks, with practice built in.",
    why: [
      "Some things need more than ten minutes: a whole case, a process from start to finish, or a skill that needs real practice.",
      "Stories with recurring characters make learning feel like the job, and stick.",
      "Practice blocks (simulators, roleplays and calculators) let people make real decisions safely, on fictional cases, with feedback.",
      "Anything that states a rule, price or procedure is signed off by named reviewers before learners see it.",
    ],
    steps: [
      { label: "Cover", purpose: "Title, summary and picture, with a voiced introduction or a video from Ava." },
      { label: "Pages", purpose: "Each with a purpose, a picture and its own voiced introduction, grouped into chapters in a long course." },
      { label: "Read and explore", purpose: "Text, pictures, tabs, timelines and diagrams, with the key phrases emphasised." },
      { label: "Practise", purpose: "Decisions, roleplays, simulators and calculators on fictional cases, with feedback." },
      { label: "Reflect and apply", purpose: "A private journal, other perspectives, and an action to take back to work." },
      { label: "Check", purpose: "Test myself on any page, and a quiz page where the course has one." },
      { label: "Finish", purpose: "Completed by reading, confirming, making a decision or passing an assessment, as the author sets." },
    ],
    also: [
      {
        label: "Teaching patterns",
        text: "Each page can start from a pattern: story and decision, field guide, worked example, change briefing or conversation practice.",
      },
      {
        label: "Building one",
        text: "Draft with AI from the source documents (an outline first, then each page), or build by hand. The Block showcase courses show every practice block.",
      },
      { label: "Ava", text: "Ava, the care coordinator on the road, can check in on the cover, on pages and in Field Notes." },
      { label: "Publishing", text: "Versions are kept, readers stay on the version they started, and reviewed blocks need their sign-off first." },
    ],
    links: [
      { label: "Magazine", href: "/magazine" },
      { label: "Admin: Magazine", href: "/admin/magazine" },
    ],
  },
  {
    id: "topics",
    group: "learning",
    title: "Topics",
    what: "Short-form microlearning: about ten minutes of cards, one idea at a time, on a phone between visits or at a desk. Your place is saved, so you can stop and pick it up later.",
    why: [
      "Care work leaves little time for long courses. A Topic fits the gaps in a working day.",
      "Every Topic is built around a realistic situation and a decision, so it practises judgement, not just facts.",
      "Short on screen (15 to 40 words a card), with the explaining in narration you can listen to, so it works for different readers.",
      "Small and self-contained, so a Topic is quick to update when a rule changes.",
    ],
    also: [
      { label: "Introduction card", text: "Every Topic opens with a presenter, its title and “Let’s get started”." },
      {
        label: "Other cards authors can add",
        text: "Checklists, polls, insight walls, hotspots, calculators, audio, resources, written answers and acknowledgements.",
      },
      {
        label: "Roleplay",
        text: "Topics practise with a decision and a written “Your turn”. Full roleplays live in the Magazine (Tough Phone Call, the conversation simulator) and in Play’s Care Conversations.",
      },
      {
        label: "Finishing",
        text: "A Topic is complete when its quick check is answered. With spaced learning on, short follow-ups come back days later to check it stuck.",
      },
      {
        label: "Building one",
        text: "Draft with AI from a brief and a source document: Claude writes the cards through the seven steps, checks them, and the author reviews and approves.",
      },
    ],
    links: [
      { label: "Topics", href: "/topics" },
      { label: "Admin: Topics", href: "/admin/lessons" },
    ],
  },
  {
    id: "paths",
    group: "learning",
    title: "Discovery Paths",
    what: "A route through Topics in order, grouped into chapters, for a role or a goal. Each says who it's for and what learners will be able to do by the end.",
    why: [
      "Single Topics don't add up to a capability on their own. A path gives them an order, a reason and a finish line.",
      "Managers and administrators can assign a path with a due date, and see who's finished.",
      "The quiz and certificate at the end show it's done, not just opened.",
      "Learners can also build their own in My Discovery, from what they want to get better at.",
    ],
    also: [
      { label: "Order", text: "Most paths let people take the topics in any order; a few ask for them in sequence." },
      {
        label: "Building one",
        text: "Draft with AI works through who it’s for, its outcomes, then chapters and topics, using existing Topics first and naming any that need writing.",
      },
    ],
    links: [
      { label: "Discovery Paths", href: "/paths" },
      { label: "My Discovery", href: "/discovery" },
      { label: "Admin: Discovery Paths", href: "/admin/learning-paths" },
    ],
  },
];

/** A path's steps, as a learner meets them. */
export const PATH_FLOW = [
  { label: "Introduction", purpose: "A short voiced introduction: why this path matters to you." },
  { label: "Topics, in chapters", purpose: "Each Topic in turn, grouped into chapters, with your progress kept." },
  { label: "Path quiz", purpose: "Where the path has one: questions across the whole path, to check it’s come together." },
  { label: "Certificate", purpose: "A certificate once the topics (and any quiz) are done." },
] as const;
