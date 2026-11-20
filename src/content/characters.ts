import type { Character } from "@/lib/characters";

/*
  The recurring fictional people in the Hub's training scenarios (docs/character-photos.md). Each look is written
  from what their cases say about them, for the portrait prompt; editors can change it and regenerate.

  Coordinator's Day keeps its own illustrated avatars and isn't matched here: its first-name characters (Dot, Joan)
  share names with different people in other courses.
*/

type Seed = Pick<Character, "id" | "name" | "aliases" | "role" | "look"> & { portrait?: string; alt?: string };

export const SEED_CHARACTERS: Seed[] = [
  // Invoice X-Ray
  {
    id: "mrs-patel",
    name: "Mrs Patel",
    aliases: [],
    role: "participant",
    look: "woman in her late seventies of Indian heritage, grey hair in a low bun, reading glasses on a chain, soft cardigan, kind and slightly wry smile",
  },
  {
    id: "mr-brennan",
    name: "Mr Brennan",
    aliases: [],
    role: "participant",
    look: "man in his early eighties who lives alone, thinning white hair, weathered face, checked flannel shirt, practical and good-humoured",
  },
  {
    id: "mrs-wong",
    name: "Mrs Wong",
    aliases: [],
    role: "participant",
    look: "woman in her eighties of Chinese heritage, short neat silver hair, pale blue blouse, calm patient expression",
  },
  // Mission Board
  {
    id: "mrs-lin",
    name: "Mrs Lin",
    aliases: [],
    role: "participant",
    look: "83-year-old woman of East Asian heritage who lives alone and likes to run her own affairs, short dark-grey hair, smart knitted vest, confident direct gaze",
  },
  {
    id: "mr-haddad",
    name: "Mr Haddad",
    aliases: [],
    role: "participant",
    look: "78-year-old man of Lebanese heritage, close-cropped grey hair and neat moustache, collared shirt, dignified and a little reserved",
  },
  // Balance Scale
  {
    id: "mrs-alvarez",
    name: "Mrs Alvarez",
    aliases: [],
    role: "participant",
    look: "82-year-old woman of Spanish heritage who loves her rose garden, silver hair pinned back, gardening shirt, sun-touched skin, bright determined smile",
  },
  {
    id: "mr-okoro",
    name: "Mr Okoro",
    aliases: [],
    role: "participant",
    look: "79-year-old man of Nigerian heritage, proud of his garden of forty years, short white hair, broad-brimmed hat in hand, warm steady expression",
  },
  {
    id: "mrs-pearce",
    name: "Mrs Pearce",
    aliases: [],
    role: "participant",
    look: "86-year-old woman who has lived in her house for fifty years, fine white hair, floral blouse, gentle but firm expression",
  },
  // Pass the Baton
  {
    id: "mr-nguyen",
    name: "Mr Nguyen",
    aliases: [],
    role: "participant",
    look: "79-year-old man of Vietnamese heritage who lives alone and enjoys a weekly social outing, short grey hair, button-up shirt, friendly hopeful expression",
  },
  // The SaH Journey, Expectation Reset, While You Wait
  {
    id: "arthur",
    name: "Arthur",
    aliases: [],
    role: "participant",
    look: "82-year-old man who wants to keep making his own decisions, white hair, cardigan over a collared shirt, thoughtful and slightly wary expression",
  },
  {
    id: "chloe",
    name: "Chloe",
    aliases: [],
    role: "family",
    look: "woman in her early fifties, Arthur's daughter, works full-time, shoulder-length brown hair, smart casual work clothes, caring but busy expression",
  },
  // Spot the Signal
  {
    id: "margaret-alder",
    name: "Margaret Alder",
    aliases: ["Mrs Alder"],
    role: "participant",
    look: "woman in her mid-eighties, soft curled white hair, pearl earrings, knitted jumper, a gentle but tired expression",
  },
  {
    id: "tom-reyes",
    name: "Tom Reyes",
    aliases: ["Mr Reyes"],
    role: "participant",
    look: "man in his late seventies of Filipino heritage, short grey hair, polo shirt, easy-going expression",
  },
  {
    id: "helen-park",
    name: "Helen Park",
    aliases: ["Mrs Park"],
    role: "participant",
    look: "woman in her early eighties of Korean heritage, short silver bob, light scarf, composed and quietly observant expression",
  },
  // Red Pen and the community examples
  {
    id: "mrs-nguyen",
    name: "Mrs Nguyen",
    aliases: [],
    role: "participant",
    look: "woman in her mid-eighties of Vietnamese heritage, grey hair tied back, soft cardigan, gentle expression",
  },
  {
    id: "mr-okafor",
    name: "Mr Okafor",
    aliases: [],
    role: "participant",
    look: "man in his early eighties of Nigerian heritage, short white hair and beard, knitted vest over a shirt, calm and dignified",
  },
  // The Magazine starter course
  {
    id: "mr-brooks",
    name: "Mr Brooks",
    aliases: [],
    role: "participant",
    look: "man in his late seventies, thinning grey hair, reading glasses, checked shirt, thoughtful expression",
  },
];
