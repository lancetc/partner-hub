import { describe, expect, it } from "vitest";
import { lookSaysWho, peopleInText, suggestedLook, type TextPiece } from "./peopleInText";

/* The named people in free text: real people found, places, brands and ordinary words left out, and man or woman only from the content. */

const find = (texts: string[], opts: Parameters<typeof peopleInText>[2] = {}) =>
  peopleInText(
    texts.map((text): TextPiece => ({ text })),
    [],
    opts,
  );
const names = (texts: string[], opts?: Parameters<typeof peopleInText>[2]) => find(texts, opts).map((p) => p.name);
const one = (texts: string[], name: string) => find(texts).find((p) => p.name === name);

describe("finding the people a Topic names", () => {
  it("finds a person from a verb, a possessive, “is a” and a title", () => {
    expect(names(["The office is quiet today, and Bruce types the address carefully."])).toEqual(["Bruce"]);
    expect(names(["It’s late, and Bruce’s phone rings."])).toEqual(["Bruce"]);
    expect(names(["Bruce Harding is a Care Partner in Trilogy’s Bowen Hills office."])).toEqual(["Bruce Harding"]);
    expect(names(["You visit Mrs Kowalski on Tuesday."])).toEqual(["Mrs Kowalski"]);
    expect(names(["Mr. Tan rings at nine."])).toEqual(["Mr Tan"]);
    expect(names(["The call is with Dr Osei."])).toEqual(["Dr Osei"]);
  });

  it("finds a role-play speaker, a relationship, an age and a name used in two places", () => {
    expect(names(["Leila: Morning! How was the weekend?"])).toEqual(["Leila"]);
    expect(peopleInText([{ text: "Amira", speaker: true }]).map((p) => p.name)).toEqual(["Amira"]);
    expect(names(["You talk it through with her daughter Asha."])).toEqual(["Asha"]);
    expect(names(["Dot, 84, lives on her own."])).toEqual(["Dot"]);
    expect(names(["A message comes in from Josh about the roster.", "You reply to Josh straight away."])).toEqual(["Josh"]);
    // Once only, with nothing to say it's a person: not counted.
    expect(names(["A message comes in from Josh about the roster."])).toEqual([]);
  });

  it("leaves out places, months, days, brands, organisations and generic labels", () => {
    const text = [
      "The Bowen Hills office in Brisbane is open on Mondays. Bowen Hills has parking.",
      "In March, Microsoft Teams and Outlook replace the old system, and Medicare covers the rest.",
      "Call My Aged Care, or Services Australia, on Tuesday. Trilogy Care pays Brightway Home Services.",
      "Worker A visits Participant 3 in Toowoomba. Then Worker A visits Participant 4 in Toowoomba.",
      "Sunrise Allied Health sends an invoice. Sunrise Allied Health sends another.",
    ];
    const found = names(text);
    for (const n of [
      "Bowen",
      "Hills",
      "Bowen Hills",
      "Brisbane",
      "March",
      "Microsoft",
      "Teams",
      "Outlook",
      "Medicare",
      "Trilogy",
      "Toowoomba",
      "Worker",
      "Participant",
      "Sunrise",
    ])
      expect(found).not.toContain(n);
    expect(found).toEqual([]);
  });

  it("leaves out ordinary words that open sentences or headings, and real public figures", () => {
    expect(names(["Remember to check. Shouting is never okay.", "Shouting at someone is abuse.", "Check the plan, and check it again."])).toEqual([]);
    expect(names(["What Bruce Needs To Know About Phishing"])).toEqual([]);
    expect(names(["Anika Wells announced the new Act, and Anika Wells said it starts in July."])).toEqual([]);
    // The Hub's own users are real people too.
    expect(names(["Jordan Lee says the topic is ready. Jordan Lee publishes it."], { exclude: ["Jordan Lee"] })).toEqual([]);
  });

  it("counts “Bruce Harding” and “Bruce” in the same Topic as one person, under the fuller name", () => {
    const found = find([
      "Bruce Harding is a Care Partner in Trilogy’s Bowen Hills office.",
      "Bruce types the address and checks it twice.",
      "Bruce’s phone rings.",
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: "Bruce Harding", aliases: ["Bruce"], role: "coordinator", mentions: 3, places: 3 });
    expect(found[0].about).toMatch(/Care Partner in Trilogy’s Bowen Hills office/);
    expect(found[0].quote).toBe("Bruce Harding is a Care Partner in Trilogy’s Bowen Hills office.");
  });

  it("keeps Mr and Mrs with the same surname apart", () => {
    const found = names(["Mrs Patel is home today. Mr Patel answers the door."]);
    expect(found.sort()).toEqual(["Mr Patel", "Mrs Patel"]);
  });
});

describe("man or woman, only from the content", () => {
  it("reads it from a title, he or she near the name, or a relationship", () => {
    expect(one(["Bruce opens his laptop."], "Bruce")?.gender).toBe("man");
    expect(one(["Fiona said she would call back after lunch."], "Fiona")?.gender).toBe("woman");
    expect(one(["Mrs Kowalski asks about the invoice."], "Mrs Kowalski")?.gender).toBe("woman");
    expect(one(["Mr Tan asks about the invoice."], "Mr Tan")?.gender).toBe("man");
    expect(one(["Her son Daniel rings you."], "Daniel")?.gender).toBe("man");
    expect(one(["Margaret’s daughter, Kate Moore, asks for a copy."], "Kate Moore")?.gender).toBe("woman");
  });

  it("never guesses from the name itself, or from pronouns about someone else", () => {
    // Bruce is usually a man's name and Fiona a woman's, but nothing here says so.
    expect(one(["Bruce types the address.", "Bruce checks it twice."], "Bruce")?.gender).toBe("unknown");
    expect(one(["Fiona calls the office.", "Fiona waits."], "Fiona")?.gender).toBe("unknown");
    // "him" is Sidney; "his manager" is Bruce's.
    expect(one(["Bessie has listened to him carefully.", "Bessie writes it down."], "Bessie")?.gender).toBe("unknown");
    expect(one(["Michelle is his manager.", "Michelle rings at nine."], "Michelle")?.gender).toBe("unknown");
    // "her bank" is Mrs Kowalski's, not Bruce's.
    expect(one(["Bruce asks Mrs Kowalski about her bank.", "Bruce waits."], "Bruce")?.gender).toBe("unknown");
    // "Dr" doesn't say.
    expect(one(["Dr Osei rings back."], "Dr Osei")?.gender).toBe("unknown");
  });
});

describe("the suggested look", () => {
  it("says man or woman only when the content does, so a portrait is only made then", () => {
    const bruce = suggestedLook({ gender: "man", role: "coordinator", age: null, about: "Care Partner in Trilogy’s Bowen Hills office" });
    expect(bruce).toBe("man, a care coordinator. Care Partner in Trilogy’s Bowen Hills office.");
    expect(lookSaysWho(bruce)).toBe(true);
    const unknown = suggestedLook({ gender: "unknown", role: "participant", age: 84, about: "" });
    expect(unknown).toBe("84-year-old person");
    expect(lookSaysWho(unknown)).toBe(false);
    expect(lookSaysWho("Woman in her eighties, short white curly hair")).toBe(true);
    expect(lookSaysWho("older person. Lives with her son.")).toBe(false);
  });
});
