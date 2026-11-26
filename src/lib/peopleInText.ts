import { normaliseName, type CharacterRole } from "./characters";

/*
  The named fictional people in free text (docs/character-photos.md, "People in your content"): Topic cards and the
  prose of Magazine courses, where names aren't in a structured field. Precise rather than thorough: a capitalised word
  only counts as a person when the text treats it as one.

  - A title and a surname always count: "Mrs Kowalski", "Mr. Tan", "Dr Osei".
  - A first name, or a first and last name, counts when it's clearly a person: a verb follows ("Bruce types", "Bruce
    also asks"), it's possessive ("Bruce’s phone"), it's the subject of "is a …" or has an age ("Dot, 84,"), a
    relationship names it ("her daughter Asha", "Care Partner Bruce Harding"), it's a role-play speaker ("Bruce: Hi"),
    or it appears in two or more places in the same Topic or course.
  - Places, months, days, brands and organisations aren't people (Bowen Hills, Microsoft, Medicare, My Aged Care), nor
    are generic labels ("Worker A", "Participant 3"), real public figures, or the Hub's own users.

  "Bruce Harding" and "Bruce" in the same Topic are one person, listed under the fuller name. Whether someone is a man
  or a woman comes only from the content (a title, he or she near the name, "her daughter"), never from the name.
*/

export type Gender = "man" | "woman" | "unknown";
export type Evidence = "scenario" | "title" | "is-a" | "age" | "relation" | "speaker" | "verb" | "possessive" | "repeated";

/** One run of text to read. `speaker`: a field that holds a person (a role-play speaker, "from", "who"). */
export type TextPiece = { text: string; speaker?: boolean };
/** A person a structured block names for certain (lib/characters charactersInBlock), with what it says about them. */
export type NamedHint = { name: string; role: CharacterRole; age: number | null; about: string };

export type PersonInText = {
  /** The fullest way the text writes them: "Bruce Harding" rather than "Bruce". */
  name: string;
  /** Other ways the same text writes them. */
  aliases: string[];
  mentions: number;
  /** How many separate pieces of text name them. */
  places: number;
  /** A short quote that shows who they are. */
  quote: string;
  role: CharacterRole;
  /** Whether the content says what they are; otherwise `role` is a default (a participant for Mr or Mrs, else other). */
  roleSure: boolean;
  gender: Gender;
  age: number | null;
  /** What the content says they are, for a suggested look ("A Care Partner in Trilogy’s Bowen Hills office"). */
  about: string;
  evidence: Evidence[];
};

export type FindOptions = {
  /** Lower-case words seen anywhere in the content: a capitalised word that's also written in lower case is an ordinary word. */
  vocabulary?: Set<string>;
  /** Names that are known people (the character library), so an ordinary word that's also a name still counts there. */
  known?: string[];
  /** Real people to leave out: the Hub's own users. */
  exclude?: string[];
};

const TITLES = new Set(["Mr", "Mrs", "Ms", "Miss", "Dr"]);

/** Ordinary words that start sentences and headings. Also used to keep words like "Note" and "Remember" out. */
const COMMON = words(`
  A An The This That These Those It Its I Im Ive Id You Youre Youll Your Yours We Our Ours They Theyre Their Theirs He She His Her Hers Him Them Me My Mine Us
  What When Where Why How Who Whom Whose Which Whatever Whenever Wherever If But And Or Nor So Then Now Yet Also Still Just Only Even Here There
  Yes No Not Hi Hello Hey Dear Thanks Thank Okay Ok Great Well Good Sorry Please Welcome Goodbye Bye Cheers Wow Oh Ah Right Sure Fine Perfect Nice
  Remember Note Notes Tip Tips Step Steps Check Ask Tell Call Say Keep Make Take Give Get Let Use Try Find See Look Read Write Think Choose Pick Start Stop
  Open Close Save Send Share Add Remove Review Report Record Follow Write Book Plan Agree Explain Confirm Listen Watch Answer Continue Finish Done Next Back
  Before After During Until Since While Because Although Though Unless Once Every Each Both Either Neither All Any Some Most Many Much More Less Few Several
  Another Other Others Same Such Own Never Always Often Usually Sometimes Maybe Perhaps Already Again Instead Otherwise Meanwhile However Therefore Overall
  First Second Third Last Final Finally One Two Three Four Five Six Seven Eight Nine Ten Hundred Thousand Half Quarter Today Tomorrow Yesterday Tonight
  Morning Afternoon Evening Night Week Weekend Month Year Time Day Days Weeks Months Years Hour Hours Minute Minutes
  Is Are Was Were Be Been Being Do Does Did Have Has Had Can Could Will Would Should Shall May Might Must Need Needs Want Wants
  Said Told Went Came Saw Made Took Gave Found Knew Felt Left Kept Sent Rang Began Wrote Paid Met Sat Stood Lost Spent Brought Bought Ran Woke Spoke Hung
  Heard Withdrew Chose Drove Rode Ate Fell Forgot Got Held Led Meant Put Read Set Shut Sold Taught Thought Understood Won
  In On At By For From To Of With Without Within About Above Below Under Over Into Onto Out Off Up Down Through Across Around Near Between Among Against Per Via
  Everyone Everybody Everything Someone Somebody Something Anyone Anybody Anything Nobody Nothing None Noone
  New Old Big Small Quick Real True False Key Main Best Better Worse Worst Common Important Simple Clear Safe Ready Free Full
  Example Scenario Case Question Questions Answer Answers Option Options Choice Choices Summary Recap Introduction Intro Overview Outcome Goal Goals Action Actions
  Part Parts Module Topic Topics Card Cards Lesson Lessons Course Courses Page Pages Section Sections Chapter Quiz Test Practice Activity Story Stories Hub
  Correct Incorrect Wrong Yes Not Feedback Hint Result Results Score Pass Fail
`);

/** Trilogy Care's own words, government and sector bodies, brands, places, months and days: never people. */
const NOT_PEOPLE = words(`
  Trilogy Care Partner Partners Coordinator Coordinators Support Supports Home Homes Aged Act Acts Quality Standard Standards Commission Commissioner Government
  Department Health Australia Australian Australians Medicare Centrelink Services Service Provider Providers Supplier Suppliers Worker Workers Participant
  Participants Client Clients Family Families Carer Carers Caller Manager Managers Team Teams Staff Office Portal Policy Policies Procedure Procedures Form Forms
  Plan Plans Budget Budgets Assessment Assessments Agreement Agreements Statement Rights Principles Charter Code Conduct Incident Incidents Serious Response
  Scheme Schemes Management System Systems Program Programme Programs Fund Funding Funded Clinical Nursing Nurse Nurses Allied Personal Domestic Assistance
  Transport Meals Wheels Respite Dementia Alzheimer Alzheimers Parkinson Parkinsons Assistive Technology Modifications Restorative Reablement End Life Palliative
  Commonwealth State Territory Federal Council Shire Royal Minister Ministry Officer Board Committee Network Networks Association Foundation Institute University
  College School Hospital Hospitals Clinic Clinics Pharmacy Chemist Centre Center Group Company Business Businesses Pty Ltd Inc Limited Unit Units Ward
  Microsoft Teams Outlook Excel Word Words PowerPoint SharePoint OneDrive Windows Office Google Gmail Chrome Apple Mac Android Zoom Xero Facebook LinkedIn Instagram
  WhatsApp Messenger Twitter YouTube TikTok Uber Taxi Cabcharge Bunnings Coles Woolworths Aldi Officeworks Telstra Optus Vodafone Westpac Commbank CommBank
  Bank Banks Visa Mastercard PayPal Amazon Netflix Spotify Kmart Target Myer Chemist Warehouse Synthesia ElevenLabs OpenAI Claude Anthropic Copilot
  Brisbane Sydney Melbourne Perth Adelaide Hobart Darwin Canberra Queensland Victoria Victorian Tasmania Tasmanian Wales Northern Southern Western Eastern
  Gold Coast Sunshine Toowoomba Cairns Townsville Ipswich Logan Mackay Rockhampton Bundaberg Geelong Ballarat Bendigo Newcastle Wollongong Launceston Albury
  Bowen Hills Fortitude Valley Paddington Spring Chermside Carindale Indooroopilly Redcliffe Caboolture Strathpine Fremantle Parramatta Penrith Blacktown
  Aboriginal Torres Strait Islander Islanders Indigenous First Nations Nation English Italian Greek Vietnamese Chinese Mandarin Cantonese Arabic Hindi Punjabi
  Spanish Tagalog Filipino Korean Japanese Samoan Tongan Maori Polish German French Dutch Croatian Serbian Macedonian Lebanese Turkish Indian Muslim Christian
  Catholic Anglican Jewish Buddhist Hindu Sikh Islam Ramadan Eid Diwali Lunar
  January February March April May June July August September October November December
  Monday Tuesday Wednesday Thursday Friday Saturday Sunday Mon Tue Tues Wed Thu Thur Thurs Fri Sat Sun Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec
  Christmas Easter Anzac Australia New Year Years Eve Boxing Labour Queens Kings Birthday Melbourne Cup Spring Summer Autumn Winter
  God Lord Jesus Christ Sir Madam Lady Gentleman Mum Mom Dad Nan Nana Pop Grandma Grandpa Mother Father Sister Brother Aunt Uncle
  Inbox Email Emails Phone Text SMS Note Notes File Files Folder Spreadsheet Document Documents Invoice Invoices Receipt Quote Quotes Item Items Line Lines
  Level Levels Tier Classification Category Categories Stage Stages Phase Phases Sprint Pathway Pathways Journey Map Lab Studio Bench Runway Board Scale
  Red Pen Signal Mission Baton Bridge Reset Balance Sandbox Myth Myths Reality Lens Window Cash Coverage Reliability Thread Threads Atlas Calendar Lives Moments
  Check In Out Pulse Wall Insight Poll Rating Hotspot Widget Presenter Avatar Voice Video Audio Podcast Picture Photo Image Images Library Gallery
  Senior Seniors Elder Elders Older Person People Persons Patient Patients Resident Residents Neighbour Neighbours Friend Friends Volunteer Volunteers
  Physio Physiotherapist Occupational Therapist Therapy Doctor Doctors Dentist Podiatrist Pharmacist Psychologist Counsellor Social Gardener Cleaner Driver
  Contractor Contractors Tradie Plumber Electrician Handyman Electrical Plumbing Gardening Cleaning Lawn Mowing Shopping Laundry Showering Personal
  Advocate Advocates Advocacy OPAN Ombudsman Tribunal Court Police Ambulance Emergency Fire Triple Zero Lifeline Beyond Blue Dementia Australia
  Safe Safety Work Workplace Cyber Security Privacy Breach Fraud Scam Scams Phishing Password Passwords Authenticator
  Alis ALIS Auslan Ahpra Compass Gateway Sunrise Brightway Orange Door Island Country Division Deaf Connect Inspector General Inspector-General Link-Up
  Bulletin Shadow Builder Lookup Vetting Job Aid Hypothesis Bookmark Pilates Slide Trial Refresh Presume Valued Spectacles Housework Self Managed Swap
  Lights Faulty Cautious Deafblind Dedication Sympathy Sometimes Rs Medibank Bupa Ndis Myagedcare Healthdirect Carer Gateway Services Australia
  Finance Payroll Accounts Accounting Reception Compliance Legal Intake Rostering Billing Onboarding Operations Marketing Sales Admin Administration Helpdesk
`);

/** A last word that makes a run a place or an organisation: "Bowen Hills", "Paperbark Rise", "Brightway Home Services". */
const PLACE_ENDINGS = words(`
  Hills Hill Street St Road Rd Rise Heights Bay Beach Creek Valley Grove Gardens Garden Lodge House Centre Center Hospital Clinic Services Service Health Group
  Council Shire Point Springs Waters Downs Plains Ridge Vale Lakes Lake Island Harbour Avenue Ave Drive Lane Court Place Way Terrace Parade Highway Square Mall
  Plaza Station Village Town City North South East West Central Park Reserve Estate Manor Court Care Homes Pharmacy Chemist Medical Practice Partners Solutions
  Pty Ltd Co Inc Club Church Library School College University Institute Foundation Association Network Trust Fund Bank Insurance Mutual Cooperative Agency
`);

/** Real public figures who can be named in content but are never characters. */
const PUBLIC_FIGURES = [
  "Anthony Albanese",
  "Albanese",
  "Anika Wells",
  "Mark Butler",
  "Sam Rae",
  "Janet Anderson",
  "Liz Hefren-Webb",
  "Tony Pagone",
  "Lynelle Briggs",
  "Ian Yates",
  "Patricia Sparrow",
  "Ken Wyatt",
  "Scott Morrison",
  "Peter Dutton",
  "Malcolm Turnbull",
  "Kevin Rudd",
  "Julia Gillard",
  "John Howard",
  "King Charles",
  "Queen Elizabeth",
];

const RELATIONS_F = "daughter|wife|mother|mum|sister|niece|granddaughter|aunt|grandmother|stepdaughter|daughter-in-law|widow|girlfriend";
const RELATIONS_M = "son|husband|father|dad|brother|nephew|grandson|uncle|grandfather|stepson|son-in-law|widower|boyfriend";
const RELATIONS_ANY = "partner|spouse|neighbour|friend|carer|grandchild|child|sibling|cousin";
const ROLE_NOUNS =
  "client|participant|coordinator|care partner|support worker|care worker|worker|supplier|gardener|cleaner|nurse|physio|physiotherapist|therapist|driver|manager|colleague|principal|contractor|caller|advocate|planner";
const RELATION_BEFORE = new RegExp(
  `(?:\\b(?:her|his|their|my|your|our|a|the|new|older)|\\p{L}+['’]s)\\s+(?:[a-z-]+\\s+)?(${RELATIONS_F}|${RELATIONS_M}|${RELATIONS_ANY}|${ROLE_NOUNS}),?\\s*$`,
  "iu",
);
const RELATION_AFTER = new RegExp(
  `^\\s*,\\s+(?:her|his|their|the|a|an)\\s+(?:[\\w’'-]+\\s+){0,2}?(${RELATIONS_F}|${RELATIONS_M}|${RELATIONS_ANY}|${ROLE_NOUNS})\\b`,
  "i",
);
const ROLE_RUN_WORDS = new Set([
  "Partner",
  "Coordinator",
  "Worker",
  "Nurse",
  "Manager",
  "Principal",
  "Supplier",
  "Gardener",
  "Cleaner",
  "Physio",
  "Client",
  "Participant",
]);

/** Helping verbs and verbs that often follow a name, as they're written after it ("Bruce types", "Bruce said"). */
const AUX = words(`
  is was has had does did can could will would should may might must isnt wasnt hasnt hadnt doesnt didnt cant couldnt wont wouldnt shouldnt
  says said tells told asks asked gets got goes went comes came sees saw makes made takes took gives gave finds found knows knew thinks thought feels felt
  leaves left keeps kept sends sent rings rang begins began writes wrote reads hears heard pays paid meets met sits sat stands stood loses lost spends spent
  puts sets brings brought buys bought runs ran wakes woke sleeps slept speaks spoke hangs hung lives lived dies died tries tried replies replied worries worried
  hurries hurried carries carried copies copied
`);
/** Verb stems: a word after a name that's one of these plus -s, -es, -ed or -d is a verb ("Bruce types", "Fiona called"). */
const VERB_STEMS = words(`
  ask answer arrive call check click type open close read write send forward reply email text phone ring visit help need want like love hate prefer explain
  agree decide choose pick start stop finish wait walk drive move return notice spot see look listen hear say tell talk speak sign log update record note book
  cancel change confirm follow pause pull push put raise report request review save scroll share smile laugh nod sigh frown worry hope wish plan manage work
  live stay keep mention admit insist suggest offer refuse accept receive collect deliver arrange organise schedule invoice charge pay quote approve reject
  flag escalate document describe repeat remember forget learn realise realize recognise wonder hesitate struggle cope fall trip slip lift carry clean cook
  shower dress wash garden mow fix install hover tap delete download upload attach copy paste print scan lock unlock leave enter join turn hand bring
  head point grab hold use try ring knock greet welcome thank apologise apologize argue complain question doubt trust feel think believe know understand
  expect assume guess suspect worry care support assist visit phone message
`);
const ADVERBS = words(
  "also then now just still quickly quietly slowly already never always often usually finally suddenly immediately carefully politely calmly gently firmly simply",
);

function words(s: string) {
  return new Set(s.split(/\s+/).filter(Boolean));
}

/** Names that end like ordinary words: "Alfred", "Sterling". */
const NAMES_LIKE_WORDS = words(
  "Alfred Winifred Mildred Manfred Siegfried Ahmed Mohammed Muhammed Hamed Javed Saeed Fareed Waleed Khaled Sterling Irving Manning Fleming Browning Ewing Channing Harding Golding Hastings",
);
/** Words shaped like verbs and abstract nouns ("Shouting", "Apologised", "Enablement") aren't names. */
const notAName = (w: string) => w.length >= 6 && /(?:ing|ed|tion|sion|ment|ness|ship|ism|ous|able|ible|ful|less|ology)$/.test(w) && !NAMES_LIKE_WORDS.has(w);
/** "Tuesdays", "Packages": a plural of something that isn't a person. */
const notPeopleSingular = (w: string) => /[^su]s$/.test(w) && (NOT_PEOPLE.has(w.slice(0, -1)) || COMMON.has(w.slice(0, -1)));
/** A word that's also written in lower case, as it is or as one of a plural ("Lights" for "light"). */
const ordinaryForm = (w: string, vocab: Set<string>) => {
  const l = w.toLowerCase();
  return vocab.has(l) || (/[^su]s$/.test(l) && (vocab.has(l.slice(0, -1)) || (/es$/.test(l) && vocab.has(l.slice(0, -2)))));
};

/** Text without markup: HTML tags, Markdown links, emphasis and headings. */
export function plainProse(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>|]+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ");
}

/** Lower-case words in some text, for `vocabulary`. */
export function lowerWords(texts: Iterable<string>, into = new Set<string>()) {
  for (const t of texts)
    // Email and web addresses aren't words: "bruce@…" doesn't make Bruce an ordinary word.
    for (const m of t
      .replace(/\S+@\S+|\b(?:https?:\/\/|www\.)\S+|\b[\w-]+(?:\.[\w-]+)+\.(?:au|com|org|net|gov|edu)\S*/gi, " ")
      .matchAll(/(?<![\p{L}'’-])\p{Ll}[\p{Ll}'’-]*/gu))
      into.add(m[0].replace(/['’]s$/, ""));
  return into;
}

const CAP = /^(?:Mc|Mac|O['’]|D['’])?\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?$/u;
const strip = (w: string) => w.replace(/[’']/g, "");

type Token = { word: string; base: string; start: number; end: number; possessive: boolean };
type Mention = {
  name: string;
  titled: boolean;
  evidence: Evidence[];
  heading: boolean;
  piece: number;
  sentence: string;
  he: number;
  she: number;
  relation: "man" | "woman" | null;
  roleHint: CharacterRole | null;
  age: number | null;
  about: string;
  /** Written with an ordinary word ("Bill", "Dot", "Will"): only a person where the sentence itself says so, never by repetition. */
  ordinaryWord: boolean;
  /** Opens its sentence, where any word has a capital. */
  atStart: boolean;
  /** A doing word follows the name ("Bruce types"), not just "is" or "has". */
  action: boolean;
};

function tokens(sentence: string): Token[] {
  const out: Token[] = [];
  for (const m of sentence.matchAll(/[\p{L}][\p{L}'’-]*/gu)) {
    let word = m[0].replace(/-+$/, "");
    let possessive = false;
    if (/['’]s$/.test(word)) {
      word = word.slice(0, -2);
      possessive = true;
    } else if (/s['’]$/.test(word)) {
      word = word.slice(0, -1);
      possessive = true;
    } else word = word.replace(/['’]$/, "");
    out.push({ word: m[0], base: word, start: m.index!, end: m.index! + m[0].length, possessive });
  }
  return out;
}

/** Sentences: split at full stops, question and exclamation marks, and line breaks. */
const sentences = (text: string) =>
  plainProse(text)
    .split(/(?<!\b(?:Mr|Mrs|Ms|Dr|St)\.)(?<=[.!?…])["”’)]*\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** A heading in Title Case ("What Bruce Needs To Know"): its capitals say nothing about who's a person. */
function titleCase(text: string) {
  const ws = text.match(/[\p{L}]{4,}/gu) ?? [];
  // A sentence full of names ("Bruce Harding is a Care Partner in Trilogy’s Bowen Hills office.") ends like one.
  if (ws.length < 3 || /[.!?]["”’)]*$/.test(text.trim()) || text.split(/\s+/).length > 14) return false;
  return ws.filter((w) => /^\p{Lu}/u.test(w)).length / ws.length >= 0.7;
}

const AGE_AFTER = /^\s*(?:,\s*(?:aged\s+)?|\(\s*(?:aged\s+)?|\s+(?:is|was|turns|turned)\s+|\s+aged\s+)(\d{2,3})\b/i;
const AGE_BEFORE = /\b(\d{2,3})-year-old\s+(?:\w+\s+)?$/i;
const IS_A = /^\s+(?:is|was|has been|works as|is now|was once)\s+(?:a|an|the|now a|now an|one of)\s+([^.;!?]{3,140})/i;
const APPOSITIVE = /^\s*,\s+(?:a|an)\s+([^,.;!?]{3,100})/i;

function pronouns(s: string) {
  return { he: (s.match(/\b(?:he|him|his|himself)\b/gi) ?? []).length, she: (s.match(/\b(?:she|her|hers|herself)\b/gi) ?? []).length };
}

function roleFrom(s: string): CharacterRole | null {
  const t = s.toLowerCase();
  if (/\b(?:care partner|coordinator|case manager|care manager)\b/.test(t)) return "coordinator";
  if (
    /\b(?:support worker|care worker|cleaner|gardener|contractor|nurse|physio|physiotherapist|therapist|supplier|handyman|driver|tradie|plumber|electrician|worker)\b/.test(
      t,
    )
  )
    return "worker";
  if (new RegExp(`\\b(?:${RELATIONS_F}|${RELATIONS_M}|family member|spouse)\\b`).test(t)) return "family";
  if (/\b(?:client|participant|older (?:man|woman|person)|lives (?:alone|at home|on her own|on his own)|retired|widow|widower|pensioner)\b/.test(t))
    return "participant";
  if (/\b(?:principal|business owner|runs a|manager|owner)\b/.test(t)) return "other";
  return null;
}

function relationGender(rel: string): "man" | "woman" | null {
  const r = rel.toLowerCase();
  if (new RegExp(`^(?:${RELATIONS_F})$`).test(r)) return "woman";
  if (new RegExp(`^(?:${RELATIONS_M})$`).test(r)) return "man";
  return null;
}

/** Is the word after a name (skipping one adverb) a verb? */
const HELPING = words(
  "is was has had does did can could will would should may might must isnt wasnt hasnt hadnt doesnt didnt cant couldnt wont wouldnt shouldnt",
);

/** Is the word after a name (skipping one adverb) a verb? "action" for a doing word ("types"), "helping" for "is" or "has". */
function verbAfter(after: string): "action" | "helping" | null {
  const m = /^\s+([a-z][a-z’']*)(?:\s+([a-z][a-z’']*))?/.exec(after);
  if (!m) return null;
  const kind = (w: string | undefined) => {
    if (!w) return null;
    const x = strip(w);
    if (HELPING.has(x)) return "helping";
    if (AUX.has(x)) return "action";
    for (const stem of [x.replace(/ies$/, "y"), x.replace(/ied$/, "y"), x.replace(/es$/, ""), x.replace(/s$/, ""), x.replace(/ed$/, ""), x.replace(/d$/, "")])
      if (stem !== x && VERB_STEMS.has(stem)) return "action";
    return null;
  };
  return kind(m[1]) ?? (ADVERBS.has(m[1]) || /ly$/.test(m[1]) ? kind(m[2]) : null);
}

/**
  The people named in some pieces of text (one Topic or one course), most-mentioned first. `hints` are people a
  structured block names for certain; they're always included, with the role the block gives them.
*/
export function peopleInText(pieces: TextPiece[], hints: NamedHint[] = [], opts: FindOptions = {}): PersonInText[] {
  const vocab = opts.vocabulary ?? lowerWords(pieces.map((p) => plainProse(p.text)));
  const known = new Set((opts.known ?? []).map(normaliseName));
  const excluded = new Set([...PUBLIC_FIGURES, ...(opts.exclude ?? [])].map(normaliseName));
  const mentions: Mention[] = [];

  pieces.forEach((piece, pi) => {
    const heading = titleCase(piece.text);
    const sents = sentences(piece.text);
    sents.forEach((sentence, si) => {
      const toks = tokens(sentence);
      // Runs of capitalised words, joined only by spaces (or "Mr. "), ended by a possessive.
      const runs: Token[][] = [];
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        if (!CAP.test(t.base) && !TITLES.has(t.base)) continue;
        const prev = runs.at(-1)?.at(-1);
        const gap = prev ? sentence.slice(prev.end, t.start) : null;
        if (prev && !prev.possessive && toks[i - 1] === prev && (gap === " " || (TITLES.has(prev.base) && /^\.?\s$/.test(gap ?? "")))) runs.at(-1)!.push(t);
        else runs.push([t]);
      }
      for (const run of runs) {
        // Split the run into names: a title and the word after it, or one or two words that aren't ordinary words or places.
        const startsSentence = (t: Token) => /^[\s"“‘(\-–—•:;]*$/.test(sentence.slice(0, t.start));
        const segs: { toks: Token[]; titled: boolean; roleBefore: boolean }[] = [];
        let cur: Token[] = [];
        let roleBefore = false;
        // Next to an organisation's or a programme's word, a capitalised word is part of its name: "Home Care Packages",
        // "Deafblind Australia", "Brightway Home Services". A role is different: "Care Partner Bruce Harding".
        const orgWord = (t: Token | undefined) => Boolean(t && NOT_PEOPLE.has(t.base) && !ROLE_RUN_WORDS.has(t.base) && !TITLES.has(t.base));
        const flush = () => {
          if (cur.length) {
            const from = run.indexOf(cur[0]);
            const to = run.indexOf(cur.at(-1)!);
            const isKnown = (ts: Token[]) => known.has(normaliseName(ts.map((t) => t.base).join(" ")));
            if (!isKnown(cur) && (orgWord(run[from - 1]) || (!cur.at(-1)!.possessive && orgWord(run[to + 1])))) cur = [];
            // "Fiona Dot" is two people, when each is a character on their own.
            else if (cur.length === 2 && !isKnown(cur) && isKnown([cur[1]])) {
              segs.push({ toks: [cur[0]], titled: false, roleBefore });
              segs.push({ toks: [cur[1]], titled: false, roleBefore: false });
            } else segs.push({ toks: cur, titled: false, roleBefore });
          }
          cur = [];
        };
        for (let i = 0; i < run.length; i++) {
          const t = run[i];
          if (TITLES.has(t.base)) {
            flush();
            const next = run[i + 1];
            if (next && !NOT_PEOPLE.has(next.base) && !COMMON.has(next.base)) {
              segs.push({ toks: [t, next], titled: true, roleBefore: false });
              i++;
            }
            roleBefore = false;
            continue;
          }
          // An ordinary word at the start of a sentence ("Check", "Remember") isn't a name, unless it's a known character's.
          const isKnown = known.has(normaliseName(t.base));
          const ordinary =
            NOT_PEOPLE.has(t.base) ||
            COMMON.has(t.base) ||
            (!isKnown && (t.base.length < 3 || notAName(t.base) || notPeopleSingular(t.base))) ||
            (ordinaryForm(t.base, vocab) && (startsSentence(t) || heading) && !isKnown);
          if (ordinary) {
            flush();
            roleBefore = ROLE_RUN_WORDS.has(t.base);
            continue;
          }
          cur.push(t);
          if (t.possessive) flush();
        }
        flush();
        for (const seg of segs) {
          if (!seg.titled && seg.toks.length > 2) continue;
          const last = seg.toks.at(-1)!;
          if (!seg.titled && seg.toks.length === 2 && PLACE_ENDINGS.has(last.base)) continue;
          const name = seg.toks.map((t) => t.base).join(" ");
          if (excluded.has(normaliseName(name))) continue;
          const first = seg.toks[0];
          const before = sentence.slice(0, first.start);
          const after = sentence.slice(last.end);
          // "in Brisbane", "on Teams", "via Xero": a place or a product, unless it has a title.
          if (!seg.titled && /\b(?:in|near|around|across|throughout|within|via|on|at)\s+$/i.test(before) && !last.possessive) continue;
          // "her cat, Pip": a pet, not a person.
          if (!seg.titled && /\b(?:cat|dog|pet|kitten|puppy|budgie|bird|horse|parrot)\s*,?\s*$/i.test(before)) continue;
          const ev: Evidence[] = [];
          let relation: "man" | "woman" | null = null;
          let roleHint: CharacterRole | null = null;
          let age: number | null = null;
          let about = "";
          if (seg.titled) ev.push("title");
          const isA = IS_A.exec(after) ?? APPOSITIVE.exec(after);
          if (isA) {
            ev.push("is-a");
            about = isA[1].trim();
            roleHint = roleFrom(about);
          }
          const ageM = AGE_AFTER.exec(after) ?? AGE_BEFORE.exec(before);
          if (ageM && Number(ageM[1]) >= 18 && Number(ageM[1]) <= 110) {
            ev.push("age");
            age = Number(ageM[1]);
          }
          const relB = RELATION_BEFORE.exec(before);
          const relA = RELATION_AFTER.exec(after);
          const rel = relB?.[1] ?? relA?.[1];
          if (rel) {
            ev.push("relation");
            relation = relationGender(rel);
            roleHint ??= roleFrom(rel);
          } else if (seg.roleBefore) {
            ev.push("relation");
            roleHint ??= roleFrom(run.map((t) => t.base).join(" "));
          }
          if (startsSentence(first) && /^\s*:\s+\S/.test(after) && !last.possessive) ev.push("speaker");
          if (last.possessive && /^\s+\p{Ll}/u.test(after)) ev.push("possessive");
          const verb = last.possessive ? null : verbAfter(after);
          if (verb && !last.possessive) ev.push("verb");
          if (piece.speaker && /^[\s"“]*$/.test(before) && /^\s*(?:$|[,(–—-])/.test(after)) ev.push("speaker");
          // He or she, only where it can only be them: "Bruce opens his laptop" (his or her within three words, before
          // another name or quoted speech), "Bruce … himself", or the next sentence opening with He or She when the
          // name began this one. Never "him" or "her" as an object ("Bessie has listened to him" is about someone else).
          const p = { he: 0, she: 0 };
          const nextName = toks.find(
            (t) => t.start >= last.end && (TITLES.has(t.base) || (CAP.test(t.base) && !NOT_PEOPLE.has(t.base) && !COMMON.has(t.base))),
          );
          const rest = (nextName ? sentence.slice(last.end, nextName.start) : after).split(
            /[“"‘:;]|\b(?:but|while|whereas|who|whom|whose|tells|asks|says)\b/,
          )[0];
          // ("Michelle is his manager": after "is", his or her is someone else's.)
          // ("Jenny has mocked his friends" can be anyone's friends, so his or her after a verb counts for less than
          // "Jenny said she'd stop" or "… herself".)
          const own = /^\s+(?!(?:is|was|are|were|becomes|became|remains|isn’t|wasn’t)\s)(?:[a-z’']+\s+){1,2}(his|her)\b/.exec(rest)?.[1];
          if (own === "his") p.he += 1;
          if (own === "her") p.she += 1;
          const self = /\b(himself|herself)\b/.exec(rest)?.[1];
          const says =
            /^\s+(?:[a-z]+ly\s+)?(?:said|says|thinks|thought|knows|knew|feels|felt|explains|explained|admits|admitted|realises|realised|hopes|hoped|worries|worried|decides|decided)\s+(?:that\s+)?(he|she)\b/.exec(
              after,
            )?.[1];
          if (self === "himself" || says === "he") p.he += 2;
          if (self === "herself" || says === "she") p.she += 2;
          const next = sents[si + 1] ?? "";
          if (!before.trim() && !last.possessive && !nextName) {
            if (/^He\b/.test(next)) p.he += 2;
            if (/^She\b/.test(next)) p.she += 2;
          }
          const ordinaryWord = !seg.titled && seg.toks.some((t) => ordinaryForm(t.base, vocab));
          mentions.push({
            name,
            titled: seg.titled,
            evidence: heading && !seg.titled ? [] : ev,
            heading,
            piece: pi,
            sentence,
            ...p,
            relation,
            roleHint,
            age,
            about,
            ordinaryWord,
            atStart: startsSentence(first),
            action: verb === "action",
          });
        }
      }
    });
  });

  // Group by name, then fold a first name (or a title and surname) into the one fuller name it belongs to.
  const groups = new Map<string, Mention[]>();
  for (const m of mentions) {
    const k = normaliseName(m.name);
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  for (const h of hints) {
    const k = normaliseName(h.name);
    if (!k || excluded.has(k)) continue;
    groups.set(k, [
      ...(groups.get(k) ?? []),
      {
        name: h.name.trim(),
        titled: TITLES.has(h.name.trim().split(/\s+/)[0]?.replace(/\.$/, "") ?? ""),
        evidence: ["scenario"],
        heading: false,
        piece: -1,
        sentence: h.about,
        ...pronouns(h.about),
        // "Mrs Patel’s daughter", "Their son.": what the block says they are to someone.
        relation: relationGender(
          new RegExp(`^\\s*(?:[\\p{L} ]+['’]s\\s+|(?:a|the|her|his|their)\\s+)?(${RELATIONS_F}|${RELATIONS_M})\\b`, "iu").exec(h.about)?.[1] ?? "",
        ),
        roleHint: h.role,
        age: h.age,
        about: h.about,
        ordinaryWord: false,
        atStart: false,
        action: false,
      },
    ]);
  }
  const fullNames = [...groups.keys()].filter((k) => k.split(" ").length === 2 && !TITLES.has(groups.get(k)![0].name.split(" ")[0]));
  const aliasOf = new Map<string, string>();
  for (const k of groups.keys()) {
    const parts = k.split(" ");
    const titled = groups.get(k)!.some((m) => m.titled);
    // "Mrs Kowalski" joins "Agnes Kowalski" only when she's the one Kowalski with a title: never Mr and Mrs together.
    if (titled && [...groups.keys()].filter((g) => g !== k && groups.get(g)!.some((m) => m.titled) && g.split(" ")[1] === parts[1]).length) continue;
    const into = fullNames.filter(
      (f) => f !== k && (titled ? f.split(" ")[1] === parts[1] : parts.length === 1 && (f.split(" ")[0] === k || f.split(" ")[1] === k)),
    );
    // A surname alone ("Novak") belongs to the one titled name that has it ("Mrs Novak").
    const titledInto = [...groups.keys()].filter((g) => g !== k && groups.get(g)!.some((m) => m.titled) && g.split(" ")[1] === k);
    if (into.length === 1) aliasOf.set(k, into[0]);
    else if (!into.length && parts.length === 1 && titledInto.length === 1) aliasOf.set(k, titledInto[0]);
  }
  const people = new Map<string, Mention[]>();
  for (const [k, ms] of groups) {
    const to = aliasOf.get(k) ?? k;
    people.set(to, [...(people.get(to) ?? []), ...ms]);
  }

  const out: PersonInText[] = [];
  for (const [k, ms] of people) {
    const strong = ms.flatMap((m) => m.evidence);
    const places = new Set(ms.filter((m) => !m.heading && m.piece >= 0).map((m) => m.piece)).size;
    // Repetition alone only counts for a word that's never written in lower case: "Bruce" twice, not "Daily Living" twice.
    const repeated = new Set(ms.filter((m) => !m.heading && m.piece >= 0 && !m.ordinaryWord).map((m) => m.piece)).size >= 2;
    let evidence = [...new Set<Evidence>([...strong, ...(repeated ? (["repeated"] as const) : [])])];
    // A name written with ordinary words ("Daily Living", "Will") needs the text to say who they are, not just a verb after it.
    if (
      ms.every((m) => m.ordinaryWord) &&
      !known.has(k) &&
      !evidence.some((e) => e === "title" || e === "is-a" || e === "age" || e === "scenario" || e === "speaker")
    )
      evidence = [];
    // A single word only ever seen opening a sentence needs an action after it ("Bruce types"), not just "is" or
    // "has" ("Sympathy is fine"), or something else that says it's a person.
    if (
      !k.includes(" ") &&
      ms.every((m) => m.atStart && !m.titled) &&
      !known.has(k) &&
      !ms.some((m) => m.action) &&
      !evidence.some((e) => e === "is-a" || e === "age" || e === "relation" || e === "scenario" || e === "speaker" || e === "possessive")
    )
      evidence = [];
    if (!evidence.length) continue;
    const main = ms.find((m) => normaliseName(m.name) === k) ?? ms[0];
    const name = main.name;
    const aliases = [...new Set(ms.map((m) => m.name).filter((n) => normaliseName(n) !== k))];
    // Man or woman: a title, a relationship ("her daughter"), and he or she near the name. Never the name itself.
    let man = 0;
    let woman = 0;
    for (const m of ms) {
      const t = m.name.split(" ")[0];
      if (m.titled) {
        if (t === "Mr") man += 10;
        else if (t !== "Dr") woman += 10;
      }
      if (m.relation === "man") man += 5;
      if (m.relation === "woman") woman += 5;
      man += m.he;
      woman += m.she;
    }
    const gender: Gender = man > 0 && man >= 3 * woman ? "man" : woman > 0 && woman >= 3 * man ? "woman" : "unknown";
    const scenario = ms.find((m) => m.evidence.includes("scenario"));
    const isA = ms.find((m) => m.evidence.includes("is-a"));
    // The role: what a scenario, "is a …" or a relationship says ("her daughter Asha"); failing that, a guess from the
    // words in the sentences that name them (not counted as sure); and failing that, a participant for Mr or Mrs.
    const tally = (pick: (m: Mention) => CharacterRole | null) => {
      const votes = new Map<CharacterRole, number>();
      for (const m of ms) {
        const r = pick(m);
        if (r) votes.set(r, (votes.get(r) ?? 0) + 1);
      }
      return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    };
    const stated = tally((m) => m.roleHint);
    const guessed = tally((m) => (m.heading ? null : roleFrom(m.sentence)));
    const sure = scenario?.roleHint ?? isA?.roleHint ?? stated;
    const role: CharacterRole = sure ?? (ms.some((m) => m.titled) ? "participant" : (guessed ?? "other"));
    const rank: Evidence[] = ["scenario", "is-a", "relation", "age", "verb", "title", "possessive", "speaker", "repeated"];
    const best = [...ms]
      .filter((m) => !m.heading && m.piece >= 0)
      .sort((a, b) => Math.min(...a.evidence.map((e) => rank.indexOf(e)), 99) - Math.min(...b.evidence.map((e) => rank.indexOf(e)), 99))[0];
    out.push({
      name,
      aliases,
      mentions: ms.filter((m) => m.piece >= 0).length,
      places,
      quote: quoteAround(best?.sentence ?? main.sentence, best?.name ?? name),
      role,
      roleSure: Boolean(sure),
      gender,
      age: ms.find((m) => m.age)?.age ?? null,
      about: scenario?.about || isA?.about || "",
      evidence,
    });
  }
  return out.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
}

/** A sentence trimmed to about 160 characters around the name. */
export function quoteAround(sentence: string, name: string, max = 160) {
  const s = sentence.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const at = Math.max(0, s.indexOf(name));
  const from = Math.max(0, Math.min(at - 50, s.length - max));
  return `${from > 0 ? "…" : ""}${s.slice(from, from + max).trim()}${from + max < s.length ? "…" : ""}`;
}

/**
  A look for the portrait, written only from what the content says: "man" or "woman" only when it says so, otherwise
  "person" (and no portrait is made until an author describes them). Like lib/characters lookFromName.
*/
export function suggestedLook(p: Pick<PersonInText, "gender" | "role" | "age" | "about">) {
  const who = p.gender === "unknown" ? "person" : p.gender;
  const old = p.age ? `${p.age}-year-old` : p.role === "participant" ? "older" : p.role === "family" ? "middle-aged" : "";
  const as = p.role === "family" ? ", a family member" : p.role === "worker" ? ", a care worker" : p.role === "coordinator" ? ", a care coordinator" : "";
  const base = `${old ? `${old} ` : ""}${who}${as}`;
  const about = p.about.trim().replace(/\.$/, "");
  return (about ? `${base}. ${about.charAt(0).toUpperCase()}${about.slice(1)}.` : base).slice(0, 600);
}

/** Whether a look says who to draw: a portrait is only made for a man or a woman (the first sentence doesn't say "person"). */
export const lookSaysWho = (look: string) => /\b(?:man|woman)\b/i.test(look.split(".")[0]) && !/\bperson\b/i.test(look.split(".")[0]);
