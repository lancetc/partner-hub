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

/**
  Where a portrait is set, written into the look as "Background: …" (for example "Background: a leafy street with a
  Queenslander behind her."). Without one, a portrait is set in an Australian home.
*/
export function lookSetting(look: string): { look: string; background: string | null } {
  const m = look.match(/\s*Background:\s*([^.]+)\.?/i);
  if (!m) return { look: look.trim(), background: null };
  return { look: look.replace(m[0], " ").replace(/\s+/g, " ").trim(), background: m[1].trim() };
}

/** The portrait prompt: one consistent head-and-shoulders style, so the roster looks like one set. */
export function portraitPrompt(c: Pick<Character, "look" | "role">) {
  const { look, background } = lookSetting(c.look);
  return [
    `Head-and-shoulders portrait photograph of a fictional person for a training scenario: ${look.replace(/\.$/, "") || CHARACTER_ROLES[c.role].toLowerCase()}.`,
    "Natural soft daylight, eye level, relaxed and warm expression, looking near the camera.",
    background
      ? `Photographed out in the real world, never a studio or plain backdrop: softly blurred background of ${background}, Australia.`
      : "Softly blurred Australian home background.",
    "Realistic, respectful and dignified; everyday clothes.",
    "Square crop with the face centred. No text, words, logos, name tags or watermarks.",
  ].join(" ");
}

/**
  How a character's portrait is named and described in the image library: "Maya, character portrait", and alt text
  from the look it was made from ("Portrait of Maya, a fictional character: a woman in her fifties…").
*/
export function portraitAbout(c: Pick<Character, "name" | "look" | "role">) {
  const { look: plain, background } = lookSetting(c.look);
  const look = plain
    .replace(/^(person|man|woman)\.\s*/i, "")
    .split(/(?<=\.)\s/)
    .slice(0, 2)
    .join(" ")
    .trim();
  const who = (look || CHARACTER_ROLES[c.role].toLowerCase()).replace(/\.$/, "");
  return {
    title: `${c.name}, character portrait`,
    alt: `Portrait of ${c.name}, a fictional character: ${who}${background ? `, with ${background} behind` : ""}.`.slice(0, 300),
  };
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
    case "sandbox":
      add(b.participant, "participant");
      break;
    case "hiring": {
      // The recurring business owner (Maya): kept in the library so a later chapter can return to her.
      const st = (b.story ?? {}) as Record<string, unknown>;
      add({ name: st.character, about: [st.role, st.situation].filter((x) => typeof x === "string" && x).join(". ") }, "other");
      break;
    }
    case "intake": {
      // The Care Partner principal in the story, kept in the library so later chapters can return to them.
      const st = (b.story ?? {}) as Record<string, unknown>;
      add({ name: st.character, about: [st.role, st.situation].filter((x) => typeof x === "string" && x).join(". ") }, "other");
      break;
    }
    case "workload": {
      // The recurring principal (Maya, returning from the Hiring Runway lab), as for "hiring". Her coordinator (Sam) isn't
      // added: a bare "Sam" already names a Trilogy Care team member in the library, so it would find the wrong person.
      const st = (b.story ?? {}) as Record<string, unknown>;
      add({ name: st.character, about: [st.role, st.situation].filter((x) => typeof x === "string" && x).join(". ") }, "other");
      break;
    }
    case "coverage": {
      // The recurring principal (Maya), as for "hiring" and "workload". Contractors and clients are anonymous labels
      // ("Worker A"), never library characters.
      const st = (b.story ?? {}) as Record<string, unknown>;
      add({ name: st.character, about: [st.role, st.situation].filter((x) => typeof x === "string" && x).join(". ") }, "other");
      break;
    }
    case "referral": {
      // The recurring principal (Maya), as for "coverage". The relationships are generic labels and every enquiry an
      // opaque id, never library characters; the older person at the handoff is anonymous.
      const st = (b.story ?? {}) as Record<string, unknown>;
      add({ name: st.character, about: [st.role, st.situation].filter((x) => typeof x === "string" && x).join(". ") }, "other");
      break;
    }
    case "reliability": {
      // The recurring principal (Maya), as for "referral", and the recurring participant (Mrs Patel) whose Tuesdays the
      // story follows. Other clients are opaque visit ids; workers and suppliers are anonymous; the coordinator isn't named.
      const st = (b.story ?? {}) as Record<string, unknown>;
      add({ name: st.character, about: [st.role, st.situation].filter((x) => typeof x === "string" && x).join(". ") }, "other");
      add({ name: st.participant, about: typeof st.tuesday === "string" ? st.tuesday : "" }, "participant");
      break;
    }
    case "cashbridge": {
      // The recurring principal (Maya), as for "reliability". Clients are "Start 1" to "Start 9", coordinators are roles
      // ("Current coordinator"), never library characters; the coordinator isn't named.
      const st = (b.story ?? {}) as Record<string, unknown>;
      add({ name: st.character, about: [st.role, st.situation].filter((x) => typeof x === "string" && x).join(". ") }, "other");
      break;
    }
    case "budgetlab": {
      // The recurring participant (Dot) whose quarter it is, and the family member whose request she weighs (Fiona).
      // Suppliers and workers are roles; Lena is named only in Dot's own words, as in her library introduction.
      const st = (b.story ?? {}) as Record<string, unknown>;
      add({ name: st.participant, about: typeof st.about === "string" ? st.about : "" }, "participant");
      const sup = (st.supporter ?? {}) as Record<string, unknown>;
      add(
        { name: sup.name, about: typeof sup.relation === "string" && typeof st.participant === "string" ? `${st.participant}’s ${sup.relation}` : "" },
        "family",
      );
      break;
    }
    case "discharge": {
      // The recurring participant (Dot) coming home, and the family member who asks (Fiona). The discharge planner, OT,
      // clinical lead, nursing provider and colleague are roles, never names, so publishing queues no new character.
      const pt = (b.participant ?? {}) as Record<string, unknown>;
      add({ name: pt.name, about: typeof pt.about === "string" ? pt.about : "" }, "participant");
      const sup = (b.supporter ?? {}) as Record<string, unknown>;
      add({ name: sup.name, about: typeof sup.relation === "string" && typeof pt.name === "string" ? `${pt.name}’s ${sup.relation}` : "" }, "family");
      break;
    }
    case "hazardscan":
      // The person whose room it is (Mrs Pearce, Mr Okafor, Dot): a recurring participant, drawn out of frame, so no
      // portrait is needed in the scene. Workers and coordinators are roles.
      add(b.person, "participant");
      break;
    case "casethread":
      // A "What Would You Do?" case is a text scene with first names only (docs/case-threads.md). Its people aren't
      // recurring library characters, so publishing one queues no portrait. Its seed voices are fictional and unnamed
      // beyond a first name, never characters.
      break;
    case "onedaymap": {
      // The day's cast in the clients and supporters lane: the recurring participants and their family.
      for (const a of Array.isArray(b.actors) ? (b.actors as Record<string, unknown>[]) : [])
        if (a?.lane === "clients") add({ name: a.name, about: a.about }, typeof a.badge === "string" && a.badge ? "family" : "participant");
      break;
    }
    case "phonecall":
      add(b.person, "family");
      add((b.phone as Record<string, unknown> | undefined)?.client, "participant");
      break;
  }
  return out;
}
