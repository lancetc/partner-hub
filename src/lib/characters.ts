/*
  The character photo library (docs/character-photos.md): the fictional people who recur in training scenarios,
  each with one portrait. A scenario names a person; the portrait is found by that name when it's read, so it
  never has to be searched for or copied into a course, and a new portrait shows everywhere at once.

  Matching is exact, after tidying case, spaces and punctuation: "Mrs Nguyen" is never "Mr Nguyen", and a first
  name alone matches only a character listed under that first name.
*/

export const CHARACTER_ROLES = {
  participant: "Participant",
  family: "Family member",
  coordinator: "Care coordinator",
  worker: "Care worker or supplier",
  other: "Other",
} as const;
export type CharacterRole = keyof typeof CHARACTER_ROLES;

export const PORTRAIT_STATUS = { none: "No portrait yet", generating: "Generating…", ready: "Ready", failed: "Didn’t generate" } as const;
export type PortraitStatus = keyof typeof PORTRAIT_STATUS;

export type Character = {
  id: string;
  name: string;
  /** Other ways scenarios write the same person, like "Mrs Alder" for Margaret Alder. */
  aliases: string[];
  role: CharacterRole;
  /** What they look like, for the portrait prompt. */
  look: string;
  /** The portrait's src in the image library, or "" for none yet. */
  portrait: string;
  alt: string;
  hidden: boolean;
  status: PortraitStatus;
  error: string;
  origin: "seed" | "publish" | "author";
};

/** What a learner's page needs: names and portraits, nothing else. */
export type PortraitEntry = { names: string[]; portrait: string; alt: string };

export const normaliseName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The roster entry for a name, if there is one. */
export function findCharacter<T extends { names: string[] } | { name: string; aliases: string[] }>(roster: T[], name: string): T | undefined {
  const n = normaliseName(name);
  if (!n) return undefined;
  return roster.find((c) => ("names" in c ? c.names : [c.name, ...c.aliases]).some((x) => normaliseName(x) === n));
}

/** Names a character should be found under: its name and aliases, tidied and without repeats. */
export const cleanAliases = (name: string, aliases: unknown) =>
  [
    ...new Set(
      (Array.isArray(aliases) ? aliases : [])
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().slice(0, 80))
        .filter((x) => x && normaliseName(x) !== normaliseName(name)),
    ),
  ].slice(0, 6);

/** The portrait prompt: one consistent head-and-shoulders style, so the roster looks like one set. */
export function portraitPrompt(c: Pick<Character, "look" | "role">) {
  return [
    `Head-and-shoulders portrait photograph of a fictional person for a training scenario: ${c.look.trim() || CHARACTER_ROLES[c.role].toLowerCase()}.`,
    "Natural soft daylight, eye level, relaxed and warm expression, looking near the camera.",
    "Softly blurred Australian home background. Realistic, respectful and dignified; everyday clothes.",
    "Square crop with the face centred. No text, words, logos, name tags or watermarks.",
  ].join(" ");
}

/** "Mr", "Mrs", "Ms" and "Miss" say something about how a person is described; a first name alone doesn't. */
export function lookFromName(name: string, age: number | null, about: string, role: CharacterRole) {
  const t = name.trim().split(/\s+/)[0]?.toLowerCase().replace(/\.$/, "");
  const who = t === "mr" ? "man" : ["mrs", "ms", "miss"].includes(t ?? "") ? "woman" : "person";
  const old = age ? `${age}-year-old` : role === "participant" ? "older" : role === "family" ? "middle-aged" : "";
  const base = `${old ? `${old} ` : ""}${who}${role === "family" ? ", a family member" : role === "worker" ? ", a care worker" : role === "coordinator" ? ", a care coordinator" : ""}`;
  return about ? `${base}. ${about}`.slice(0, 600) : base;
}

/**
  The named people in a block, with what the block says about them: participants, people, clients, family
  members and callers. Generic labels ("Trilogy Care Coordinator") aren't characters.
*/
export function charactersInBlock(b: Record<string, unknown>): { name: string; role: CharacterRole; age: number | null; about: string }[] {
  const out: { name: string; role: CharacterRole; age: number | null; about: string }[] = [];
  const add = (v: unknown, role: CharacterRole) => {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    const name = typeof v === "string" ? v : typeof o?.name === "string" ? o.name : "";
    if (!name.trim() || /\b(trilogy|provider|coordinator|care partner|supplier|the participant|the person)\b/i.test(name)) return;
    const age = o && Number.isInteger(o.age) ? (o.age as number) : null;
    const about = typeof o?.about === "string" ? o.about : typeof o?.relation === "string" ? `Their ${o.relation}.` : "";
    out.push({ name: name.trim().slice(0, 80), role, age, about: about.slice(0, 400) });
  };
  switch (b.type) {
    case "xray":
    case "mission":
      add(b.participant, "participant");
      break;
    case "balance":
    case "baton":
      add(b.person, "participant");
      break;
    case "reset":
      add(b.person, "participant");
      add(b.family, "family");
      break;
    case "bridge":
      add(b.person, "participant");
      add(b.caller, "family");
      break;
    case "journey": {
      const p = (b.personas ?? {}) as Record<string, unknown>;
      add(p.person, "participant");
      add(p.family, "family");
      break;
    }
    case "signal":
      add(b.client, "participant");
      break;
    case "conversation":
      add(b.person, "participant");
      break;
  }
  return out;
}
