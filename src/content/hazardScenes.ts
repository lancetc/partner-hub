import { blankReview, type HazardCategory, type HazardScanData, type ItemKey, type ObjectKind, type SceneObject, type Variant } from "@/lib/hazardScan";

/*
  The Spot the Hazard pilot scenes (docs/spot-the-hazard.md, PRD section 5). Three scene families, each a drawn room
  with two or three variants, every one IN REVIEW: no reviewer has checked them, and the block sign-off is empty.
  Hazards, priorities and actions are design examples, not Trilogy Care policy. Several items cite placeholder policy
  records (lib/hazardSources) on purpose: a variant can't be approved for learners until Quality replaces each with the
  current procedure.

  The people are recurring characters, keeping their established facts (content/digitalMembers.ts):

  - Mrs Pearce, 86, in her house of fifty years; the boxes in her hallway are her late sister's things, and she agreed
    to a clear path as long as she chooses what moves (content/balanceCases.ts). New here: she uses a walking stick.
  - Mr Okafor, in his early eighties, calm and dignified, who was found on the floor by his bed one morning. New here:
    since then he has a hired height-adjustable bed, a shower commode and a walking frame. The PRD's "residential
    bedroom before transfer" is set in his home instead, since Trilogy Care supports people at home.
  - Dot, who tends her roses, never misses bowls on Thursdays, has osteoarthritis in both hands and would rather wait
    for Lena, her regular cleaner.

  The PRD's oxygen-tube example isn't used: none of these characters is on home oxygen, and giving one a new health
  condition would change their story. A heater cord across the route teaches the same judgement.

  Each object sits in one of its room's approved positions (the comments name them), so tap regions never overlap.
*/

type Pos = [x: number, y: number, w: number, h: number, scale: number];
const obj = (
  id: string,
  concept: string,
  kind: ObjectKind,
  look: string,
  [x, y, w, h, scale]: Pos,
  area: string,
  label: string,
  description: string,
  key: ItemKey,
): SceneObject => ({ id, concept, kind, look, x, y, scale, hit: { w, h }, area, label, description, key });
const safe = (explain: string, source: string): ItemKey => ({
  hazard: false,
  category: "",
  priority: 0,
  critical: false,
  weight: 1,
  feature: "",
  explain,
  source,
});
const hazard = (
  category: HazardCategory,
  priority: 1 | 2 | 3,
  weight: 1 | 2 | 3,
  feature: string,
  explain: string,
  source: string,
  critical = false,
): ItemKey => ({
  hazard: true,
  category,
  priority,
  critical,
  weight,
  feature,
  explain,
  source,
});
const variant = (id: string, label: string, objects: SceneObject[], more: Partial<Variant> = {}): Variant => ({
  id,
  version: 1,
  label,
  roles: [],
  dim: false,
  status: "review",
  objects,
  review: blankReview(),
  ...more,
});
const blankApproval = { quality: "", policy: "", learning: "", approvedOn: "", reviewBy: "", releaseReviewed: "" };

// ---------------------------------------------------------------------------------------------
// 1. Mrs Pearce: from the bedroom to the bathroom (Support at Home)
// ---------------------------------------------------------------------------------------------

// Approved positions in the bedroom-hall room.
const P = {
  bedsideTop: [6, 55, 9, 12, 0.9],
  besideBed: [12, 72, 8, 20, 0.85],
  floorByBed: [10, 89, 10, 12, 0.85],
  walkway: [30, 86, 22, 13, 0.85],
  bedFoot: [39, 69, 8, 16, 0.85],
  byArmchair: [61, 69, 8, 22, 0.9],
  frontOfChair: [48, 78, 13, 34, 0.9],
  hallWall: [70, 66, 14, 16, 0.75],
  hallAlongWall: [76, 63, 13, 18, 0.95],
  hallMiddle: [78, 84, 14, 20, 1.05],
  bathDoor: [89, 68.5, 14, 12, 0.9],
  hallCeiling: [85, 9, 9, 13, 1],
} satisfies Record<string, Pos>;

const HOME = "acqsc-home-environment";
const HOME_TC = "tc-home-safety";

const pearcePhotos = obj(
  "photos",
  "photos",
  "photos",
  "frames",
  P.bedsideTop,
  "bed",
  "Framed photos",
  "Two framed family photos standing on the bedside table.",
  safe("Her photos are part of her home and sit on the bedside table, well clear of the way to the door. Nothing to change.", HOME),
);
const pearceStickNear = obj(
  "stick",
  "stick",
  "walking-stick",
  "leaning",
  P.besideBed,
  "bed",
  "Walking stick",
  "Her walking stick, leaning against the side of the bed near the pillow.",
  safe("Within reach of the bed, where she can get it before she stands. That’s where it’s meant to be.", HOME_TC),
);
const pearceStickFar = obj(
  "stick",
  "stick",
  "walking-stick",
  "leaning",
  P.byArmchair,
  "window",
  "Walking stick",
  "Her walking stick, leaning against the far side of the armchair, by the doorway.",
  hazard(
    "fall",
    2,
    2,
    "The walking stick leans against the armchair by the doorway, across the room from the bed.",
    "Her stick is across the room from the bed, so she’d take her first steps without it. Getting up is when a fall is most likely.",
    HOME_TC,
  ),
);
const pearceSlippers = obj(
  "slippers",
  "slippers",
  "slippers",
  "closed-back",
  P.floorByBed,
  "floor",
  "Slippers",
  "A pair of slippers with backs and soles, on the floor by the bed.",
  safe("Closed-back slippers with a sole are a sensible choice for walking at home.", HOME),
);
const pearceSlippersWorn = obj(
  "slippers",
  "slippers",
  "slippers",
  "backless-worn",
  P.floorByBed,
  "floor",
  "Slippers",
  "A pair of backless slippers with flattened, worn soles, on the floor by the bed.",
  hazard(
    "fall",
    1,
    1,
    "The slippers by the bed are backless, with flattened, worn soles.",
    "Backless, worn slippers can slip off or catch. Worth raising with her gently: they’re hers, and the choice of what to wear is too.",
    HOME_TC,
  ),
);
const pearceRugFlat = obj(
  "rug",
  "rug",
  "rug",
  "flat",
  P.walkway,
  "floor",
  "Rug",
  "A rug lying flat on the bedroom floor, in front of the bed.",
  safe("It’s lying flat with its edges down. A rug isn’t a hazard in itself.", HOME),
);
const pearceRugCurled = obj(
  "rug",
  "rug",
  "rug",
  "curled",
  P.walkway,
  "floor",
  "Rug",
  "A rug on the bedroom floor in front of the bed. Its right-hand corner is turned up.",
  hazard(
    "fall",
    2,
    2,
    "The right-hand corner of the rug in front of the bed is turned up.",
    "A turned-up corner on the way from the bed is easy to catch a foot on, especially with a stick. It’s a quick fix, with her agreement.",
    HOME_TC,
  ),
);
const pearcePlant = obj(
  "plant",
  "plant",
  "plant",
  "leafy",
  P.bedFoot,
  "window",
  "Pot plant",
  "A leafy pot plant on the floor between the foot of the bed and the armchair.",
  safe("It sits against the wall, out of the way to the door.", HOME),
);
const pearceCord = obj(
  "heater",
  "cord",
  "heater",
  "cord-across",
  P.frontOfChair,
  "floor",
  "Heater and its cord",
  "A portable heater in front of the armchair. Its cord runs across the floor towards you, to a power board.",
  hazard(
    "fall",
    3,
    3,
    "The heater’s cord runs across the floor from the heater to a power board, between the bed and the doorway.",
    "The cord crosses the way from her bed to the door, at ankle height, on the route she takes to the bathroom at night. Deal with it before you help her up.",
    HOME_TC,
  ),
);
const pearceHeaterSafe = obj(
  "heater",
  "cord",
  "heater",
  "cord-along-wall",
  P.hallWall,
  "hallway",
  "Heater and its cord",
  "A portable heater against the hallway wall. Its cord runs along the skirting board to the power point.",
  safe("The cord runs along the skirting, not across the floor. That’s how it should be.", HOME_TC),
);
const pearceBoxesWall = obj(
  "boxes",
  "boxes",
  "boxes",
  "stacked",
  P.hallAlongWall,
  "hallway",
  "Boxes",
  "Two stacked cardboard boxes against the hallway wall.",
  safe(
    "They’re her late sister’s things, against the wall where she agreed they’d go, leaving the path clear. Her belongings aren’t clutter to be cleared.",
    HOME,
  ),
);
const pearceBoxesPath = obj(
  "boxes",
  "boxes",
  "boxes",
  "stacked",
  P.hallMiddle,
  "hallway",
  "Boxes",
  "Two stacked cardboard boxes in the middle of the hallway floor.",
  hazard(
    "fall",
    3,
    3,
    "Two stacked boxes sit in the middle of the hallway, on the path to the bathroom.",
    "The boxes are in the clear path she agreed to keep to the bathroom. They’re her late sister’s things, so the conversation matters as much as the box: she chooses what moves.",
    HOME_TC,
  ),
);
const pearceMat = obj(
  "bath-mat",
  "bath-mat",
  "bath-mat",
  "flat",
  P.bathDoor,
  "bathroom",
  "Bath mat",
  "A rubber-backed bath mat lying flat at the bathroom door.",
  safe("Flat and rubber-backed, at the door where she’ll step out wet. Nothing to change.", HOME),
);
const pearceMatRucked = obj(
  "bath-mat",
  "bath-mat",
  "bath-mat",
  "rucked",
  P.bathDoor,
  "bathroom",
  "Bath mat",
  "The bath mat at the bathroom door is rucked up in folds.",
  hazard(
    "fall",
    2,
    2,
    "The bath mat at the bathroom door is rucked up in folds.",
    "Folds in a mat at the bathroom door are a trip on the way in and a slip on the way out. Straighten it, and check it grips.",
    HOME_TC,
  ),
);
const pearceLightOut = obj(
  "hall-light",
  "light",
  "ceiling-light",
  "out",
  P.hallCeiling,
  "hallway",
  "Hallway light",
  "The ceiling light in the hallway has no bulb in it, and the hallway is dim.",
  hazard(
    "fall",
    2,
    2,
    "The hallway pendant has no bulb, and the hallway is drawn dim.",
    "She walks this way to the bathroom, day and night. Without a working light, the way is hard to see.",
    HOME_TC,
  ),
);
const pearceLightOn = obj(
  "hall-light",
  "light",
  "ceiling-light",
  "on",
  P.hallCeiling,
  "hallway",
  "Hallway light",
  "The ceiling light in the hallway, switched on.",
  safe("The hallway is lit. Nothing to change.", HOME),
);

export const PEARCE_BEDROOM: HazardScanData = {
  title: "Mrs Pearce: from the bedroom to the bathroom",
  intro: "A short look around before you help someone move. Notice what matters, decide what comes first, and respond within your role.",
  familyId: "pearce-bedroom-bathroom",
  release: "1",
  mode: "practice",
  roles: ["worker", "coordinator"],
  room: "bedroom-hall",
  objective:
    "Notice the risks on the route from the bed to the bathroom, put the most urgent first, and agree changes with Mrs Pearce rather than rearranging her home for her.",
  person: {
    name: "Mrs Pearce",
    about:
      "Mrs Pearce is 86 and has lived in her house for fifty years. The boxes in her hallway are her late sister’s things, and she’s sorting them slowly. She agreed to a clear path along one wall to the bathroom, laundry and back door, as long as she chooses what moves.",
  },
  carePlan:
    "Showering support twice a week and a fortnightly clean. She walks with a stick at home; keep it within her reach. Ask before moving her belongings.",
  task: "You’re visiting Mrs Pearce for her shower. Before you help her up from the bed and down the hallway to the bathroom, look around and decide what needs attention.",
  areas: [
    { id: "bed", label: "Bed and bedside table" },
    { id: "floor", label: "Bedroom floor, on the way to the door" },
    { id: "window", label: "Window and armchair" },
    { id: "hallway", label: "Doorway and hallway" },
    { id: "bathroom", label: "Bathroom door" },
  ],
  askReason: true,
  rules: { minHazards: 2, maxHazards: 4, minSafe: 3, minHigh: 1, decisions: 2 },
  variants: [
    variant(
      "pearce-a",
      "Heater cord, rug, dim hallway",
      [pearcePhotos, pearceStickNear, pearceSlippers, pearceRugCurled, pearcePlant, pearceCord, pearceBoxesWall, pearceMat, pearceLightOut],
      { dim: true },
    ),
    variant("pearce-b", "Boxes in the path, stick out of reach, worn slippers", [
      pearcePhotos,
      pearceSlippersWorn,
      pearceRugFlat,
      pearcePlant,
      pearceStickFar,
      pearceHeaterSafe,
      pearceBoxesPath,
      pearceMat,
      pearceLightOn,
    ]),
    variant("pearce-c", "Heater cord, stick out of reach, rucked bath mat", [
      pearcePhotos,
      pearceSlippers,
      pearceRugFlat,
      pearceCord,
      pearceStickFar,
      pearceBoxesWall,
      pearceMatRucked,
      pearceLightOn,
    ]),
  ],
  decisions: [
    {
      id: "cord",
      concept: "cord",
      prompt: "The heater cord runs across Mrs Pearce’s way from the bed to the door. What would you do next?",
      source: HOME_TC,
      options: [
        {
          id: "cord-ask",
          text: "Tell Mrs Pearce what you’ve noticed, and ask if you can run the cord along the wall for now. Note it, and let her coordinator know so a safer setup can be talked through with her.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback:
            "A safe adjustment made with her agreement deals with the risk today, and telling the coordinator means the setup can be sorted out with her for good.",
        },
        {
          id: "cord-remove",
          text: "Unplug the heater and put it away in the cupboard. It’s quicker than asking, and it’s safer.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["consent", "preference"],
          feedback:
            "It’s her heater and her home. Removing it without asking takes away her warmth and her say. Ask first, and make the smallest change that works.",
        },
        {
          id: "cord-leave",
          text: "Leave it. It’s her home and her choice.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["report"],
          feedback:
            "Respecting her choice starts with telling her what you’ve noticed. Dignity of risk is an informed choice: she can’t make one about a risk nobody raises. Say something, and let the coordinator know.",
        },
        {
          id: "cord-step",
          text: "Help her step around it today, and mention it to the coordinator after the visit.",
          roles: ["worker"],
          verdict: "acceptable",
          ignores: [],
          feedback: "Telling the coordinator is right. But she walks this way at night on her own: ask her now whether the cord can go along the wall.",
        },
        {
          id: "cord-call",
          text: "Call Mrs Pearce, talk through her way to the bathroom with her, agree what changes, record it in her care plan, and offer an occupational therapist’s home assessment.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback:
            "She decides, with the information in front of her, and what you agree is recorded so every worker knows. An OT can suggest options she may not have thought of.",
        },
        {
          id: "cord-instruct",
          text: "Ask her worker to take the heater and anything else off the floor before the next visit.",
          roles: ["coordinator"],
          verdict: "unsafe",
          ignores: ["consent", "preference"],
          feedback: "That decides for her. Talk with Mrs Pearce first; then the worker can act on what she agreed.",
        },
        {
          id: "cord-watch",
          text: "Email her worker to keep an eye on it.",
          roles: ["coordinator"],
          verdict: "acceptable",
          ignores: ["consent"],
          feedback: "Keeping the worker informed helps, but nobody has spoken with Mrs Pearce, and nothing is recorded in her plan.",
        },
      ],
    },
    {
      id: "boxes",
      concept: "boxes",
      prompt: "Her late sister’s boxes now sit in the middle of the hallway, in the clear path she agreed to. What would you do next?",
      source: HOME_TC,
      options: [
        {
          id: "boxes-ask",
          text: "Point it out and ask her where she’d like the boxes to go. Move them only with her OK. If she’d rather they stayed, don’t start the shower until there’s a safe way through, and tell the coordinator.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback: "She chooses what moves, as agreed, and nobody walks a blocked path: not her, and not you.",
        },
        {
          id: "boxes-move",
          text: "Move the boxes out of the way yourself. She won’t mind.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["consent", "preference"],
          feedback: "These are her late sister’s things, and the agreement is that she chooses what moves. Ask first.",
        },
        {
          id: "boxes-climb",
          text: "Climb over them and get on with the shower.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["careplan", "report"],
          feedback:
            "A blocked path is a fall risk for both of you, and the agreement says to stop before the shower. Raise it with her, and tell the coordinator.",
        },
        {
          id: "boxes-revisit",
          text: "Call Mrs Pearce, revisit the hallway agreement with her, record what she decides, and make sure her worker knows what to do if the path is blocked.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback: "The agreement is hers to revisit. Recording it means every worker handles a blocked path the same way.",
        },
        {
          id: "boxes-clear",
          text: "Arrange for the boxes to be cleared while she’s out at an appointment.",
          roles: ["coordinator"],
          verdict: "unsafe",
          ignores: ["consent", "preference"],
          feedback: "Clearing her sister’s belongings behind her back would break her trust and the agreement. Talk with her.",
        },
        {
          id: "boxes-remind",
          text: "Remind the worker about the agreement, and leave it there.",
          roles: ["coordinator"],
          verdict: "acceptable",
          ignores: ["consent"],
          feedback: "The worker needs to know, but the path has changed: check with Mrs Pearce whether the agreement still works for her.",
        },
      ],
    },
    {
      id: "stick",
      concept: "stick",
      prompt: "Her walking stick is across the room from the bed. What would you do next?",
      source: HOME_TC,
      options: [
        {
          id: "stick-ask",
          text: "Ask Mrs Pearce where she likes to keep it, and suggest it lives within reach of the bed. Put it there if she agrees.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback: "Her plan says to keep it within reach. Asking means she knows where it is, and she may have a reason for where it was.",
        },
        {
          id: "stick-move",
          text: "Move it to the bed without saying anything.",
          roles: ["worker"],
          verdict: "acceptable",
          ignores: ["consent"],
          feedback: "Probably welcome, but tell her: she’ll look for it where she left it.",
        },
        {
          id: "stick-leave",
          text: "Leave it. She knows where it is.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["careplan"],
          feedback: "Her care plan says to keep it within her reach, and getting up is when she needs it.",
        },
        {
          id: "stick-plan",
          text: "Ask Mrs Pearce and her worker how she gets up at night, and add where her stick lives to her care plan if she agrees.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback: "It starts with how she moves around, and what she agrees is written down for every worker.",
        },
        {
          id: "stick-tell",
          text: "Tell the worker to put it by the bed every visit.",
          roles: ["coordinator"],
          verdict: "acceptable",
          ignores: ["consent"],
          feedback: "Sensible, but check with Mrs Pearce: it’s her stick and her routine.",
        },
      ],
    },
    {
      id: "light",
      concept: "light",
      prompt: "The hallway light is out, and the way to the bathroom is dim. What would you do next?",
      source: HOME_TC,
      options: [
        {
          id: "light-ask",
          text: "Tell Mrs Pearce, and ask if she’d like the bulb replaced. Turn on another light for now. Change the bulb only if that’s within your role and safe to reach; otherwise report it so it can be arranged.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback: "Light now, a fix with her agreement, and nothing outside your role.",
        },
        {
          id: "light-chair",
          text: "Stand on a chair and change the bulb straight away.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["scope", "consent"],
          feedback: "Climbing on a chair is a fall risk for you, and may be outside your role. Ask her, and report it.",
        },
        {
          id: "light-leave",
          text: "Leave it. She knows the way.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["report"],
          feedback: "She walks this way at night. Raise it with her and report it.",
        },
        {
          id: "light-arrange",
          text: "Check with Mrs Pearce, arrange a maintenance visit if she wants one, and talk with her about a night light for the hallway.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback: "She decides, and the fix goes through the right route.",
        },
        {
          id: "light-worker",
          text: "Tell her worker to change the bulb on the next visit, whatever it takes.",
          roles: ["coordinator"],
          verdict: "unsafe",
          ignores: ["scope"],
          feedback: "That may push the worker beyond their role. Arrange maintenance through the right route, with her agreement.",
        },
      ],
    },
  ],
  jobAids: [{ snippetId: "ask-before-changing-the-plan", why: "Before you suggest a change to someone’s home, find out what matters to them." }],
  debrief:
    "Falls at home often start on the way to the bathroom: a cord, a corner of a rug, a dim hallway, a stick out of reach. Noticing is the first step. The next is talking with the person: it’s their home and their things, and what you agree together is what lasts. Make a safe change now only with their agreement and within your role, and pass on what needs more.",
  approval: blankApproval,
};

// ---------------------------------------------------------------------------------------------
// 2. Mr Okafor: his bedroom before a transfer (care equipment at home)
// ---------------------------------------------------------------------------------------------

const O = {
  bed: [30, 67.5, 34, 28, 0.95],
  bedside: [5.8, 57, 9, 12, 1],
  sillRight: [25, 35.5, 9, 12, 0.9],
  sillLeft: [16, 36, 9, 12, 1],
  bedFront: [52, 82, 11, 20, 0.95],
  nearBed: [62, 72, 11, 24, 0.9],
  byWardrobe: [75, 77.5, 10, 24, 1],
  floorByBed: [14.5, 90, 10, 12, 0.85],
  bedsideMat: [31.7, 91, 20, 12, 0.8],
} satisfies Record<string, Pos>;
const EQUIP = "tc-equipment-transfers";

const okBed = (up: boolean) =>
  obj(
    "bed",
    "bed-brake",
    "care-bed",
    up ? "brake-up" : "brakes-down",
    O.bed,
    "bed",
    "Bed",
    up
      ? "His height-adjustable bed on four wheels. The pedal by the wheel at the foot end is raised; the one at the head end is pressed down."
      : "His height-adjustable bed on four wheels. The pedals by the wheels are pressed down.",
    up
      ? hazard(
          "equipment",
          3,
          3,
          "The brake pedal on the foot-end wheel is drawn raised (off); the head-end pedal is down.",
          "A bed that can roll is a fall waiting to happen during a transfer. Check every brake before he puts weight on it.",
          EQUIP,
          true,
        )
      : safe("The brakes are on. It’s ready for him to get up.", EQUIP),
  );
const okGlasses = obj(
  "glasses",
  "glasses",
  "glasses-book",
  "on-table",
  O.bedside,
  "bed",
  "Glasses and a book",
  "His reading glasses resting on a book on the bedside table.",
  safe("His glasses and book, within reach. Nothing to change.", HOME),
);
const okPhotos = obj(
  "photos",
  "photos",
  "photos",
  "frames",
  O.sillRight,
  "window",
  "Framed photos",
  "Two framed family photos on the windowsill.",
  safe("His family photos. Nothing to change.", HOME),
);
const okRadio = obj(
  "radio",
  "radio",
  "radio",
  "small",
  O.sillLeft,
  "window",
  "Radio",
  "A small radio on the windowsill.",
  safe("His radio, out of the way. Nothing to change.", HOME),
);
const okFrame = (missing: boolean) =>
  obj(
    "frame",
    "frame-tip",
    "walking-frame",
    missing ? "tip-missing" : "tips-on",
    O.bedFront,
    "beside",
    "Walking frame",
    missing
      ? "His walking frame in front of the bed. Three legs have rubber tips; the front right leg ends in bare metal."
      : "His walking frame in front of the bed, with rubber tips on all four legs.",
    missing
      ? hazard(
          "equipment",
          2,
          2,
          "The front right leg of the walking frame is drawn without its rubber tip.",
          "A leg without its rubber tip can skid, just when he leans on it. It needs replacing before he relies on the frame.",
          EQUIP,
        )
      : safe("All four tips are on, and it’s where he can reach it. Ready to use.", EQUIP),
  );
const okCommode = (cracked: boolean) =>
  obj(
    "commode",
    "commode-defect",
    "commode",
    cracked ? "cracked" : "sound",
    O.nearBed,
    "beside",
    "Shower commode chair",
    cracked
      ? "A shower commode chair on wheels. The right armrest has a split in it, with a piece broken away."
      : "A shower commode chair on wheels, beside the bed.",
    cracked
      ? hazard(
          "equipment",
          3,
          3,
          "The right armrest of the shower commode is drawn split, with a piece missing.",
          "He’ll push on that armrest to sit and stand. Damaged equipment isn’t used until it’s repaired or replaced.",
          EQUIP,
        )
      : safe("In good order, beside the bed. Nothing to change.", EQUIP),
  );
const okChair = obj(
  "chair",
  "chair",
  "clothes-chair",
  "folded",
  O.byWardrobe,
  "wardrobe",
  "Chair with clothes",
  "A wooden chair in front of the wardrobe, with his clothes for the day folded on it.",
  safe("He lays his clothes out the night before. It’s his routine, and it’s out of the way.", HOME),
);
const okSlippers = obj(
  "slippers",
  "slippers",
  "slippers",
  "closed-back",
  O.floorByBed,
  "beside",
  "Slippers",
  "A pair of slippers with backs, on the floor by the bed.",
  safe("Closed-back slippers by the bed: a sensible choice.", HOME),
);
const okMat = obj(
  "mat",
  "rug",
  "rug",
  "curled",
  O.bedsideMat,
  "beside",
  "Bedside mat",
  "A mat on the floor beside the bed. Its right-hand corner is turned up.",
  hazard(
    "fall",
    2,
    2,
    "The right-hand corner of the bedside mat is turned up.",
    "He’ll step onto this mat as he stands. A turned-up corner is easy to catch.",
    HOME_TC,
  ),
);

export const OKAFOR_TRANSFER: HazardScanData = {
  title: "Mr Okafor: before he gets up",
  intro: "Equipment helps only when it’s in good order. Look before the transfer, not during it.",
  familyId: "okafor-bedroom-transfer",
  release: "1",
  mode: "practice",
  roles: ["worker"],
  room: "bedroom-care",
  objective: "Check the bed, mobility aid and commode before a transfer; stop and report when equipment isn’t safe to use.",
  person: {
    name: "Mr Okafor",
    about:
      "Mr Okafor is in his early eighties, calm and dignified. Some weeks ago he was found sitting on the floor by his bed, unable to stand. Since then he has a hired height-adjustable bed, a shower commode and a walking frame.",
  },
  carePlan:
    "Brakes on and checked before every transfer. One worker stands by while he moves from the bed to the chair with his walking frame. Report any equipment fault the same day.",
  task: "You’re here to help Mr Okafor get up and shower. Before he moves from the bed to the commode chair, look around and decide what needs attention.",
  areas: [
    { id: "bed", label: "Bed and bedside table" },
    { id: "beside", label: "Beside the bed" },
    { id: "window", label: "Window" },
    { id: "wardrobe", label: "Wardrobe" },
  ],
  askReason: true,
  rules: { minHazards: 2, maxHazards: 3, minSafe: 3, minHigh: 1, decisions: 2 },
  variants: [
    variant("okafor-a", "Bed brake off, frame tip missing", [okGlasses, okRadio, okPhotos, okBed(true), okFrame(true), okCommode(false), okChair, okSlippers]),
    variant("okafor-b", "Cracked commode, curled mat", [okGlasses, okPhotos, okBed(false), okFrame(false), okCommode(true), okChair, okSlippers, okMat]),
  ],
  decisions: [
    {
      id: "brake",
      concept: "bed-brake",
      prompt: "A brake on his bed is off, and you’re about to help Mr Okafor from the bed to the chair. What would you do next?",
      source: EQUIP,
      options: [
        {
          id: "brake-stop",
          text: "Stop before the transfer. Tell Mr Okafor why, put the brakes on and check every wheel holds. If one won’t lock, don’t transfer: make him comfortable and report the bed.",
          roles: [],
          verdict: "best",
          ignores: [],
          feedback: "Checking the brakes is part of every transfer in his plan. If the bed can’t be made safe, the transfer waits.",
        },
        {
          id: "brake-knee",
          text: "Go ahead, and hold the bed steady with your knee while he stands.",
          roles: [],
          verdict: "unsafe",
          ignores: ["careplan"],
          feedback: "Your knee won’t stop a rolling bed, and his plan says brakes on and checked first.",
        },
        {
          id: "brake-self",
          text: "Ask him to get himself up while you sort out the bed.",
          roles: [],
          verdict: "unsafe",
          ignores: ["careplan"],
          feedback: "He needs someone standing by, and the bed isn’t safe yet. Make it safe first.",
        },
        {
          id: "brake-call",
          text: "Wait with him and phone the coordinator to ask what to do.",
          roles: [],
          verdict: "acceptable",
          ignores: [],
          feedback: "Asking is never wrong, but putting the brakes on is a basic check within your role. Do that, and report it if one won’t hold.",
        },
      ],
    },
    {
      id: "commode",
      concept: "commode-defect",
      prompt: "The shower commode’s armrest is split. What would you do next?",
      source: EQUIP,
      options: [
        {
          id: "commode-stop",
          text: "Don’t use it. Tell Mr Okafor why, use the safe alternative his plan allows, label it not to be used if your procedure says so, and report it so it’s repaired or replaced.",
          roles: [],
          verdict: "best",
          ignores: [],
          feedback: "Damaged equipment comes out of use until it’s fixed, and he’s told what’s happening and why.",
        },
        {
          id: "commode-once",
          text: "Use it this once, carefully. He needs his shower.",
          roles: [],
          verdict: "unsafe",
          ignores: ["careplan", "report"],
          feedback: "That armrest takes his weight. Use the safe alternative and report the fault today.",
        },
        {
          id: "commode-tape",
          text: "Tape up the split so it holds for today.",
          roles: [],
          verdict: "unsafe",
          ignores: ["scope", "report"],
          feedback: "Repairing equipment isn’t part of the role, and tape won’t take his weight. Take it out of use and report it.",
        },
      ],
    },
    {
      id: "frame",
      concept: "frame-tip",
      prompt: "One leg of his walking frame has no rubber tip. What would you do next?",
      source: EQUIP,
      options: [
        {
          id: "frame-tell",
          text: "Tell Mr Okafor, and talk with him about what he’ll use until it’s fixed. Report it so the tip is replaced quickly.",
          roles: [],
          verdict: "best",
          ignores: [],
          feedback: "He knows, he has a safe option meanwhile, and the fault is on its way to being fixed.",
        },
        {
          id: "frame-later",
          text: "Report it after the visit, without mentioning it to him.",
          roles: [],
          verdict: "acceptable",
          ignores: ["consent"],
          feedback: "Reporting is right, but he relies on that frame between visits. Tell him.",
        },
        {
          id: "frame-wrap",
          text: "Wrap the leg in tape so it won’t slip.",
          roles: [],
          verdict: "unsafe",
          ignores: ["scope", "report"],
          feedback: "A home-made fix can fail without warning. Report it so the right part goes on.",
        },
      ],
    },
    {
      id: "mat",
      concept: "rug",
      prompt: "The mat beside his bed has a turned-up corner. What would you do next?",
      source: HOME_TC,
      options: [
        {
          id: "mat-ask",
          text: "Point it out to Mr Okafor and ask if you can flatten it or move it aside for now. Mention it to the coordinator so the mat can be talked about with him.",
          roles: [],
          verdict: "best",
          ignores: [],
          feedback: "A quick fix with his agreement, and the bigger question goes to the person who can follow it up with him.",
        },
        {
          id: "mat-bin",
          text: "Take the mat away and throw it out.",
          roles: [],
          verdict: "unsafe",
          ignores: ["consent", "preference"],
          feedback: "It’s his mat. Ask first; there may be a reason it’s there.",
        },
        {
          id: "mat-foot",
          text: "Flatten it with your foot and carry on.",
          roles: [],
          verdict: "acceptable",
          ignores: ["consent", "report"],
          feedback: "Fine for now, but it will curl again. Tell him, and let the coordinator know.",
        },
      ],
    },
  ],
  jobAids: [{ snippetId: "sirs-first-steps", why: "If he has fallen or been hurt, this comes first." }],
  debrief:
    "A transfer is only as safe as the equipment under it. Brakes, tips and frames are checked before anyone moves, every time, and a fault stops the transfer rather than being worked around. Tell the person what you’ve found, use the safe alternative in their plan, and report the fault the same day.",
  approval: blankApproval,
};

// ---------------------------------------------------------------------------------------------
// 3. Dot: the kitchen and dining area (infection prevention)
// ---------------------------------------------------------------------------------------------

const K = {
  benchLeft: [7.5, 55.5, 12, 12, 0.85],
  benchSink: [17.5, 52.25, 8, 12, 1],
  benchRight: [43.3, 55, 9, 12, 0.95],
  table: [75, 55, 9, 12, 0.95],
  tableVase: [84.2, 48.75, 11, 18, 1],
  chairSeat: [94.2, 63.25, 9, 12, 1],
  floorSink: [27.5, 85, 15, 12, 1],
  floorFridge: [58.3, 82, 8, 16, 1],
  floorDoor: [75, 85, 11, 13, 1],
} satisfies Record<string, Pos>;
const IPC = "acqsc-ipc";
const IPC_TC = "tc-infection-control";

const dotSanitiser = obj(
  "sanitiser",
  "sanitiser",
  "sanitiser",
  "pump",
  K.benchSink,
  "bench",
  "Hand sanitiser",
  "A pump bottle of hand sanitiser on the bench beside the sink.",
  safe("Hand hygiene supplies where workers can reach them. That’s what you want to see.", IPC),
);
const dotBoard = (raw: boolean) =>
  obj(
    "board",
    "board",
    "chopping-board",
    raw ? "raw-and-ready" : "clean",
    K.benchLeft,
    "bench",
    "Chopping board",
    raw
      ? "A chopping board on the bench with raw chicken on one half and cut tomato and lettuce on the other."
      : "A clean chopping board on the bench, with a knife.",
    raw
      ? hazard(
          "infection",
          2,
          2,
          "Raw chicken and cut salad are drawn on the same chopping board.",
          "Salad that won’t be cooked is sharing a board with raw chicken. Keep them apart, and clean the board and your hands.",
          IPC_TC,
        )
      : safe("Clean and ready. Nothing to change.", IPC),
  );
const dotPpe = (onTable: boolean) =>
  obj(
    "gloves-mask",
    "used-ppe",
    "used-ppe",
    "crumpled",
    onTable ? K.table : K.benchRight,
    onTable ? "table" : "bench",
    "Gloves and a mask",
    onTable
      ? "A pair of crumpled blue disposable gloves and a face mask on the dining table."
      : "A pair of crumpled blue disposable gloves and a face mask on the bench beside the fridge.",
    hazard(
      "infection",
      3,
      3,
      `Used disposable gloves and a mask are drawn on the ${onTable ? "dining table, where Dot eats" : "kitchen bench, where food is prepared"}.`,
      "Used gloves and masks left where food is prepared or eaten can spread infection. They’re disposed of the way the procedure for this home says, straight away, and the surface is cleaned.",
      IPC_TC,
    ),
  );
const dotSpill = obj(
  "puddle",
  "spill",
  "spill",
  "water",
  K.floorSink,
  "floor",
  "Puddle",
  "A puddle of water on the floor in front of the sink.",
  hazard(
    "fall",
    2,
    2,
    "A puddle of water is drawn on the tiles in front of the sink.",
    "Water on tiles is slippery, right where Dot stands to wash up. Wipe it up and find out where it came from.",
    HOME_TC,
  ),
);
const dotGloves = (onBench: boolean) =>
  obj(
    "garden-gloves",
    "garden-gloves",
    "garden-gloves",
    "pair",
    onBench ? K.benchRight : K.chairSeat,
    onBench ? "bench" : "table",
    "Gardening gloves",
    onBench ? "A pair of floral gardening gloves on the bench." : "A pair of floral gardening gloves on the seat of a dining chair.",
    safe("Dot’s gardening gloves, from the roses. They’re her belongings, not used PPE. Nothing to change.", IPC),
  );
const dotRoses = obj(
  "roses",
  "roses",
  "roses-vase",
  "with-secateurs",
  K.tableVase,
  "table",
  "Roses and secateurs",
  "A vase of roses on the dining table, with a pair of secateurs beside it.",
  safe("Roses from her garden, and her secateurs. Hers, and part of what she loves. Nothing to change.", HOME),
);
const dotBin = obj(
  "bin",
  "bin",
  "bin",
  "lidded",
  K.floorFridge,
  "floor",
  "Kitchen bin",
  "A pedal bin with its lid closed, in front of the fridge.",
  safe("A lidded bin. Nothing to change.", IPC),
);
const dotBag = obj(
  "bowls-bag",
  "bowls-bag",
  "bowls-bag",
  "zipped",
  K.floorDoor,
  "door",
  "Bowls bag",
  "Her lawn bowls bag on the floor by the back door.",
  safe("Packed for bowls on Thursday, by the door and out of the way. Nothing to change.", HOME),
);

export const DOT_KITCHEN: HazardScanData = {
  title: "Dot’s kitchen at lunchtime",
  intro: "Infection prevention is mostly small, ordinary things, done every time. Look around before you start.",
  familyId: "dot-kitchen-infection",
  release: "1",
  mode: "practice",
  roles: ["worker", "coordinator"],
  room: "kitchen-dining",
  objective: "Notice infection and slip risks in a home kitchen, tell them apart from the person’s own belongings, and follow the setting’s procedure.",
  person: {
    name: "Dot",
    about:
      "Dot lives at home and tends her roses, and she never misses bowls on Thursday mornings. Osteoarthritis in both hands makes small jobs slow, and she’d rather do them herself. She likes her regular cleaner, Lena.",
  },
  carePlan:
    "Help with meal preparation on weekdays. Workers follow the infection prevention procedure for her home, including hand hygiene and disposing of used PPE.",
  task: "You’re visiting Dot at lunchtime, and she’d like a hand making a salad. Before you start, look around the kitchen and dining area and decide what needs attention.",
  areas: [
    { id: "bench", label: "Kitchen bench and sink" },
    { id: "floor", label: "Kitchen floor" },
    { id: "table", label: "Dining table and chairs" },
    { id: "door", label: "Back door" },
  ],
  askReason: true,
  rules: { minHazards: 2, maxHazards: 3, minSafe: 3, minHigh: 1, decisions: 2 },
  variants: [
    variant("dot-a", "Gloves and mask on the bench, puddle by the sink", [
      dotBoard(false),
      dotSanitiser,
      dotPpe(false),
      dotSpill,
      dotBin,
      dotRoses,
      dotGloves(false),
      dotBag,
    ]),
    variant("dot-b", "Gloves and mask on the table, shared chopping board", [
      dotBoard(true),
      dotSanitiser,
      dotGloves(true),
      dotBin,
      dotPpe(true),
      dotRoses,
      dotBag,
    ]),
  ],
  decisions: [
    {
      id: "ppe",
      concept: "used-ppe",
      prompt: "Used gloves and a mask from an earlier visit are where food is prepared or eaten. What would you do next?",
      source: IPC_TC,
      options: [
        {
          id: "ppe-procedure",
          text: "Dispose of them the way the infection prevention procedure for Dot’s home says, clean the surface, do hand hygiene, and let the coordinator know so whoever left them is reminded.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback: "Dealt with now, by the procedure for this setting, and passed on so it doesn’t happen again.",
        },
        {
          id: "ppe-bin",
          text: "Put them in the kitchen bin and wipe the bench.",
          roles: ["worker"],
          verdict: "acceptable",
          ignores: ["report"],
          feedback:
            "That deals with it today, if the procedure for this home allows it. Where used PPE goes depends on the setting’s procedure, so check it rather than assuming. And tell the coordinator: someone left them there.",
        },
        {
          id: "ppe-leave",
          text: "Leave them for Dot to throw out.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["scope", "report"],
          feedback: "Used PPE is the worker’s to dispose of, not Dot’s. Deal with it by the procedure, and report it.",
        },
        {
          id: "ppe-team",
          text: "Tell the provider or worker team what was found, check they know the infection prevention procedure for Dot’s home, and record it.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback: "The fix is with the people who do the work, and the record shows it was followed up.",
        },
        {
          id: "ppe-dot",
          text: "Ask Dot to keep an eye on what workers leave behind.",
          roles: ["coordinator"],
          verdict: "unsafe",
          ignores: ["scope"],
          feedback: "That hands the provider’s job to Dot. Follow it up with the workers.",
        },
      ],
    },
    {
      id: "spill",
      concept: "spill",
      prompt: "There’s water on the floor in front of the sink. What would you do next?",
      source: HOME_TC,
      options: [
        {
          id: "spill-wipe",
          text: "Tell Dot, wipe it up now, and check where it came from. A leaking tap or pipe gets reported.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback: "Safe now, and the cause found before it happens again.",
        },
        {
          id: "spill-lena",
          text: "Leave it for Lena to do on her next clean.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["report"],
          feedback: "Dot could slip long before then. Wipe it up and say something.",
        },
        {
          id: "spill-towel",
          text: "Drop a tea towel on it and carry on.",
          roles: ["worker"],
          verdict: "acceptable",
          ignores: ["report"],
          feedback: "Better than nothing, but wipe it properly and find out where the water came from.",
        },
        {
          id: "spill-arrange",
          text: "Ask Dot about it, and arrange a plumber or maintenance if something is leaking, with her agreement.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback: "The cause is fixed through the right route, with Dot deciding.",
        },
        {
          id: "spill-none",
          text: "Nothing. Cleaning isn’t the coordinator’s job.",
          roles: ["coordinator"],
          verdict: "unsafe",
          ignores: ["report"],
          feedback: "The puddle isn’t yours to mop, but a leak in a client’s home is worth following up.",
        },
      ],
    },
    {
      id: "board",
      concept: "board",
      prompt: "Raw chicken and cut salad are on the same chopping board. What would you do next?",
      source: IPC_TC,
      options: [
        {
          id: "board-separate",
          text: "Tell Dot what you’ve noticed and, with her OK, keep the salad away from the raw chicken: a clean board and knife, then wash the board and your hands.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback: "Safe food, and Dot in the loop: it’s her kitchen and her lunch.",
        },
        {
          id: "board-bin",
          text: "Throw the salad out without asking.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["consent", "preference"],
          feedback: "It’s her food. Ask first: she may want it washed, or the part that touched the board thrown out.",
        },
        {
          id: "board-rinse",
          text: "Rinse the board under the tap and carry on.",
          roles: ["worker"],
          verdict: "acceptable",
          ignores: ["consent"],
          feedback: "Cleaning helps, but the salad has already touched the board. Talk with Dot about it.",
        },
        {
          id: "board-training",
          text: "Mention food safety to Dot’s worker team, and check meal preparation is covered in their training and her care plan.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback: "The fix is with the people preparing her meals.",
        },
        {
          id: "board-leave",
          text: "Leave it to the worker.",
          roles: ["coordinator"],
          verdict: "acceptable",
          ignores: ["report"],
          feedback: "The worker deals with it today; you make sure it doesn’t keep happening.",
        },
      ],
    },
  ],
  jobAids: [],
  debrief:
    "Infection prevention in someone’s home is about the setting’s own procedure, followed every time: hand hygiene, clean surfaces, and used PPE disposed of the right way, straight away. The person’s own things, like gardening gloves or secateurs, aren’t hazards. A wet floor is a slip waiting to happen, and its cause is worth finding.",
  approval: blankApproval,
};

// ---------------------------------------------------------------------------------------------
// 4. Mrs Vella's unit: signs of possible neglect (ALIS module 3.3, SIRS in Home Services: Neglect)
// ---------------------------------------------------------------------------------------------

/*
  For ALIS 3.3 (slug alis-p3-neglect). Mrs Vella is new and fictional: not a library character, and not one of the
  module's people. The signs come from the module's warning signs and definition; the "not a hazard here" items are
  the person's own choices and lifestyle (its "choice, control and dignity of risk" point). The actions follow the
  module and the sirs-first-steps Job Aid: the person's safety first; escalate to the coordinator or the designated
  incident responder; record what was seen, not conclusions; never confront or investigate. A coordinator considers
  whether it may be reportable neglect and its priority, which depends on the facts (whether treatment is needed),
  so no option decides Priority 1 or 2 for the learner.
*/
const U = {
  benchLeft: [7.5, 54.5, 10, 12, 1],
  benchRight: [20.8, 54, 8, 12, 1],
  fridge: [30.8, 52.5, 11, 52, 0.85],
  tableLeft: [61.7, 55, 8, 12, 1],
  tableRight: [67.9, 55.5, 8, 12, 1],
  wall: [69, 37, 13, 24, 1],
  bed: [85, 65, 26, 24, 0.95],
  books: [38.5, 78, 10, 14, 1],
  cat: [22, 88, 16, 13, 0.9],
  frontOfTable: [59, 85, 11, 20, 0.95],
  sill: [52, 35, 9, 12, 0.85],
} satisfies Record<string, Pos>;
const SIRS = "acqsc-sirs-home";
const CHOICE = "aged-care-rules-neglect";
const INCIDENTS = "tc-incidents";

const vellaMeal = obj(
  "meal",
  "meal",
  "simple-meal",
  "plate",
  U.benchLeft,
  "kitchen",
  "Tea and toast",
  "A plate of toast and a cup of tea on the kitchen bench.",
  safe("Tea and toast is the simple lunch she likes. A simple meal she chooses isn’t a sign of neglect on its own.", CHOICE),
);
const vellaFridge = (empty: boolean) =>
  obj(
    "fridge",
    "fridge",
    "fridge",
    empty ? "near-empty" : "stocked",
    U.fridge,
    "kitchen",
    "Fridge",
    empty
      ? "The fridge with its door open: a little milk, a container with green spots on its contents, and a packet dated 2 November. Nothing else."
      : "The fridge with its door open: milk, eggs, a covered dish, vegetables and fruit.",
    empty
      ? hazard(
          "other",
          2,
          2,
          "The fridge is drawn almost empty: a little milk, a container with mould spots, and a packet dated 02/11.",
          "Her plan includes help with shopping and meals. An almost empty fridge and old food can mean that help hasn’t been happening, and she may not be eating well: a possible sign of neglect, and worth checking she’s had something to eat today.",
          SIRS,
        )
      : safe("Fresh food, in date. Her shopping help is happening.", SIRS),
  );
const vellaMeds = (untouched: boolean) =>
  obj(
    "blister-pack",
    "meds",
    "blister-pack",
    untouched ? "untouched" : "in-use",
    U.tableLeft,
    "chair",
    "Blister pack",
    untouched
      ? "Her weekly medication blister pack on the side table. Every day’s doses are still sealed."
      : "Her weekly medication blister pack on the side table. The earlier days and this morning’s dose are open.",
    untouched
      ? hazard(
          "other",
          3,
          3,
          "Every pocket in the weekly blister pack is drawn still sealed, partway through the week.",
          "Her plan includes a medication prompt each morning, and days of doses haven’t been taken. That can make her unwell quickly, so check how she is first. Missed prompts are a possible sign of neglect.",
          SIRS,
        )
      : safe("This week’s doses are being taken, this morning’s included. Her prompts are happening.", SIRS),
  );
const vellaPendant = (dock: boolean) =>
  obj(
    "pendant",
    "pendant",
    "call-pendant",
    dock ? "dock-red" : "lanyard",
    dock ? U.benchRight : U.tableRight,
    dock ? "kitchen" : "chair",
    "Alarm pendant",
    dock
      ? "Her personal alarm pendant, sitting in its charging dock on the kitchen bench, with a red light showing. She’s in her armchair across the room."
      : "Her personal alarm pendant on its lanyard, on the side table beside her armchair.",
    dock
      ? hazard(
          "equipment",
          2,
          2,
          "The pendant is drawn in its dock on the bench, away from the armchair, with a red light and an empty battery mark.",
          "She can’t call for help with a pendant she can’t reach, and the light suggests it isn’t charged. If a fall went unnoticed, the gap in her support would matter.",
          SIRS,
        )
      : safe("Within reach, where she sits. Nothing to change.", SIRS),
  );
const vellaClimate = (cold: boolean) =>
  obj(
    "climate",
    "climate",
    "room-climate",
    cold ? "cold" : "hot",
    U.wall,
    "walls",
    cold ? "Thermometer and heater" : "Thermometer and fan",
    cold
      ? "A wall thermometer showing 12 degrees with a snowflake mark, and below it a panel heater with its plug hanging loose."
      : "A wall thermometer showing 35 degrees with a sun mark, and beside it a wall fan with its plug out.",
    hazard(
      "other",
      cold ? 2 : 3,
      cold ? 2 : 3,
      cold
        ? "The thermometer is drawn at 12°C with a snowflake; the panel heater’s plug hangs loose."
        : "The thermometer is drawn at 35°C with a sun; the fan’s plug is out.",
      cold
        ? "It’s cold inside and the heater isn’t on. Being dressed and housed wrongly for the weather is one of the warning signs, and older people get cold quickly."
        : "It’s 35 degrees inside and the fan isn’t on. Heat can make an older person seriously unwell fast: check how she is before anything else.",
      SIRS,
    ),
  );
const vellaBed = (soiled: boolean) =>
  obj(
    "bed",
    "bed",
    "single-bed",
    soiled ? "soiled" : "unmade",
    U.bed,
    "bed",
    "Bed",
    soiled
      ? "Her bed, with the quilt pulled half off and stains on the bottom sheet. Stained clothes lie on the floor beside it."
      : "Her bed, unmade, with the quilt pushed back and clean linen.",
    soiled
      ? hazard(
          "infection",
          2,
          2,
          "The bottom sheet is drawn with stains, the quilt half off, and stained clothes on the floor.",
          "Soiled bedding and clothes can mean her personal care or continence support hasn’t been delivered, and wet skin breaks down fast. A possible sign of neglect: look after her first.",
          SIRS,
        )
      : safe("An unmade bed with clean linen. How she keeps her bed is her choice.", CHOICE),
  );
const vellaBooks = obj(
  "books",
  "books",
  "books-papers",
  "piles",
  U.books,
  "floor",
  "Books and papers",
  "Stacks of books and papers on the floor beside the armchair.",
  safe(
    "Her books and papers, in the piles she keeps and knows her way around. Clutter she chooses isn’t neglect, and it’s clear of her way to the door.",
    CHOICE,
  ),
);
const vellaCat = obj(
  "cat",
  "cat",
  "cat-basket",
  "with-bowls",
  U.cat,
  "floor",
  "Cat",
  "Her cat, Pip, curled up in a basket on the floor, with food and water bowls.",
  safe("Pip, fed and with water. A pet is part of her life, not a problem to solve.", CHOICE),
);
const vellaPhotos = obj(
  "photos",
  "photos",
  "photos",
  "frames",
  U.sill,
  "walls",
  "Framed photos",
  "Two framed family photos on the windowsill.",
  safe("Her photos. Nothing to change.", CHOICE),
);
const vellaFrame = obj(
  "frame",
  "frame",
  "walking-frame",
  "tip-missing",
  U.frontOfTable,
  "chair",
  "Walking frame",
  "Her walking frame in front of the side table. Three legs have rubber tips; the front right leg ends in bare metal.",
  hazard(
    "equipment",
    2,
    2,
    "The front right leg of the walking frame is drawn without its rubber tip.",
    "A frame missing a tip can skid under her. A broken aid that isn’t replaced is one of the things to pass on.",
    SIRS,
  ),
);

export const NEGLECT_SIGNS: HazardScanData = {
  title: "Mrs Vella’s unit: what are you seeing?",
  intro: "Neglect often shows as small things that add up. So does a person’s own way of living. Look carefully, and tell them apart.",
  familyId: "home-neglect-signs",
  release: "1",
  mode: "practice",
  roles: ["worker", "coordinator"],
  room: "unit-living",
  objective:
    "Notice possible signs of neglect in a home visit, tell them apart from the person’s own choices and lifestyle, and respond in the right order: the person’s safety first, then escalate and record what you saw.",
  person: {
    name: "Mrs Vella",
    about:
      "Mrs Vella is 84 and lives alone in a small unit with her cat, Pip. She likes her books, keeps her papers in piles she knows her way around, and has tea and toast for lunch most days. Her memory isn’t what it was.",
  },
  carePlan:
    "Personal care three mornings a week. A medication prompt each morning from her weekly blister pack. Help with shopping and meals twice a week. On very hot or cold days, check her heater or fan is on. She wears her alarm pendant by day and charges it overnight.",
  task: "You’re visiting Mrs Vella this morning. Other workers have covered her last few visits. Look around as you come in, and decide what needs attention.",
  areas: [
    { id: "kitchen", label: "Kitchenette and fridge" },
    { id: "chair", label: "Armchair and side table" },
    { id: "walls", label: "Walls and window" },
    { id: "bed", label: "Bed" },
    { id: "floor", label: "Floor" },
  ],
  askReason: true,
  rules: { minHazards: 3, maxHazards: 4, minSafe: 4, minHigh: 1, decisions: 2 },
  variants: [
    variant("vella-winter", "Winter: sealed blister pack, cold room, empty fridge, pendant out of reach", [
      vellaMeal,
      vellaPendant(true),
      vellaFridge(true),
      vellaMeds(true),
      vellaClimate(true),
      vellaBed(false),
      vellaBooks,
      vellaCat,
      vellaPhotos,
    ]),
    variant("vella-summer", "Summer: hot room, soiled bed, walking frame missing a tip", [
      vellaMeal,
      vellaFridge(false),
      vellaMeds(false),
      vellaPendant(false),
      vellaClimate(false),
      vellaBed(true),
      vellaFrame,
      vellaBooks,
      vellaCat,
      vellaPhotos,
    ]),
  ],
  decisions: [
    {
      id: "meds",
      concept: "meds",
      prompt: "Days of Mrs Vella’s doses are still sealed in her blister pack. What would you do next?",
      source: INCIDENTS,
      options: [
        {
          id: "meds-check",
          text: "Check how Mrs Vella is now, and get medical help if she seems unwell, confused or very drowsy. Tell your coordinator or the designated incident responder straight away, and record exactly what you saw: which days are still sealed.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback: "Her wellbeing first, then the people who can act on it, with a record of what you saw rather than what you think happened.",
        },
        {
          id: "meds-catchup",
          text: "Give her the missed tablets now so she catches up.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["scope", "careplan"],
          feedback: "Doubling up doses can be dangerous, and that’s a decision for a prescriber or pharmacist. Check how she is and escalate.",
        },
        {
          id: "meds-ring",
          text: "Ring the worker who covered last week and ask why they didn’t prompt her.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["scope", "safety"],
          feedback: "Don’t confront anyone or investigate yourself. Look after Mrs Vella, then escalate: the provider follows it up.",
        },
        {
          id: "meds-note",
          text: "Write in her notes that the last worker neglected her.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["facts"],
          feedback: "Record what you saw (which days are sealed, how she seems), not a conclusion about who did what.",
        },
        {
          id: "meds-today",
          text: "Prompt today’s dose, and mention the pack at the next team meeting.",
          roles: ["worker"],
          verdict: "acceptable",
          ignores: ["report", "safety"],
          feedback: "Today’s prompt is right, but days of missed doses can’t wait for a meeting. Check how she is and escalate now.",
        },
        {
          id: "meds-respond",
          text: "Make sure Mrs Vella is safe and gets a medical review today if she needs one. Record the facts in the IMS, escalate to the designated incident responder, and work out from the facts whether it may be reportable neglect, and its priority.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback:
            "Her safety first, then the facts recorded and escalated. Missed prompts may be reportable neglect; whether it’s Priority 1 depends on whether she needs medical treatment, which the facts will show.",
        },
        {
          id: "meds-p1",
          text: "Notify the Commission that it’s Priority 1 straight away, then check on her.",
          roles: ["coordinator"],
          verdict: "unsafe",
          ignores: ["safety"],
          feedback: "Mrs Vella comes first, and the priority depends on the facts, such as whether she needs treatment. The provider notifies once she’s safe.",
        },
        {
          id: "meds-question",
          text: "Call the workers who covered last week and question them yourself before telling anyone.",
          roles: ["coordinator"],
          verdict: "unsafe",
          ignores: ["scope", "report"],
          feedback: "Escalate first, and let the provider’s process follow it up. Questioning workers yourself can get in the way.",
        },
        {
          id: "meds-review",
          text: "Book a pharmacist medication review for next month.",
          roles: ["coordinator"],
          verdict: "acceptable",
          ignores: ["safety", "report"],
          feedback: "A review may help later, but she may need checking today, and this needs escalating now.",
        },
      ],
    },
    {
      id: "climate",
      concept: "climate",
      prompt: "The room isn’t a safe temperature for the season, and the heater or fan isn’t plugged in. What would you do next?",
      source: INCIDENTS,
      options: [
        {
          id: "climate-comfort",
          text: "With her OK, warm her up or cool her down now, check how she is, and get medical help if she’s unwell. Tell the coordinator, and record what you saw: the temperature, and the heater or fan unplugged.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback: "Comfortable and safe now, then passed on with the facts.",
        },
        {
          id: "climate-leave",
          text: "Leave it. She’s used to it.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["safety", "report"],
          feedback: "Her plan says to check it on very hot or cold days, and the temperature can make her unwell. Act on it, and pass it on.",
        },
        {
          id: "climate-plug",
          text: "Plug the heater or fan in and carry on.",
          roles: ["worker"],
          verdict: "acceptable",
          ignores: ["report"],
          feedback: "Good for today. Check how she is, and tell the coordinator: the plan’s checks may have been missed on other visits.",
        },
        {
          id: "climate-arrange",
          text: "Check she’s safe today and the heater or fan works, with her agreement. Record the facts, and talk with the designated incident responder about whether the plan’s temperature checks were missed, and whether that may be reportable.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback: "Safe now, the facts recorded, and the question of a pattern taken to the right person.",
        },
        {
          id: "climate-later",
          text: "Add it to her review in three months.",
          roles: ["coordinator"],
          verdict: "unsafe",
          ignores: ["safety", "report"],
          feedback: "A temperature like this can harm her today. It needs acting on and escalating now.",
        },
      ],
    },
    {
      id: "bed",
      concept: "bed",
      prompt: "Her bedding and some clothes are soiled. What would you do next?",
      source: INCIDENTS,
      options: [
        {
          id: "bed-care",
          text: "Check whether she’s sore, wet or unwell, and help her get clean and comfortable with her agreement, then change the bed. Tell the coordinator, and record what you saw without guessing who’s to blame.",
          roles: ["worker"],
          verdict: "best",
          ignores: [],
          feedback: "Her comfort and dignity first, then the facts passed on.",
        },
        {
          id: "bed-ask",
          text: "Ask her why she let the bed get like this.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["safety", "report"],
          feedback: "That puts it on her, and may shame her. Look after her first, and pass it on.",
        },
        {
          id: "bed-quiet",
          text: "Strip the bed and say nothing. It’s not your place.",
          roles: ["worker"],
          verdict: "unsafe",
          ignores: ["report"],
          feedback: "Changing the bed helps, but this may mean her care isn’t being delivered. It needs passing on.",
        },
        {
          id: "bed-note",
          text: "Change the bed, and leave a note for the next worker.",
          roles: ["worker"],
          verdict: "acceptable",
          ignores: ["report"],
          feedback: "A note helps the next visit, but the coordinator needs to know today.",
        },
        {
          id: "bed-review",
          text: "Make sure her skin is checked today, review whether her personal care and continence support were delivered as planned, record the facts, and talk with the designated incident responder about whether this may be reportable.",
          roles: ["coordinator"],
          verdict: "best",
          ignores: [],
          feedback: "Her health first, then the facts, and whether there’s a pattern that may be reportable neglect.",
        },
        {
          id: "bed-laundry",
          text: "Arrange an extra laundry service, and leave it there.",
          roles: ["coordinator"],
          verdict: "unsafe",
          ignores: ["safety", "report"],
          feedback: "Laundry won’t tell you whether she’s been cared for. Check on her, and escalate.",
        },
      ],
    },
  ],
  jobAids: [{ snippetId: "sirs-first-steps", why: "When something may be a reportable incident, these are the first steps." }],
  debrief:
    "Neglect often shows as small things that add up: doses not taken, an empty fridge, a cold or hot house, an alarm out of reach, care not done. A person’s own way of living isn’t neglect: their books and papers, their pet, the simple meals they like, an unmade bed. When you see signs, look after the person first. Then escalate to your coordinator or the designated incident responder, and record what you saw, not what you think happened. Don’t confront anyone or investigate yourself: the provider decides whether it’s a reportable incident, and its priority, from the facts.",
  approval: blankApproval,
};

export const HAZARD_SCENES: { id: string; label: string; data: HazardScanData }[] = [
  { id: "pearce", label: "Mrs Pearce: from the bedroom to the bathroom", data: PEARCE_BEDROOM },
  { id: "okafor", label: "Mr Okafor: before he gets up", data: OKAFOR_TRANSFER },
  { id: "dot", label: "Dot’s kitchen at lunchtime", data: DOT_KITCHEN },
  { id: "neglect", label: "Mrs Vella’s unit: signs of possible neglect", data: NEGLECT_SIGNS },
];
