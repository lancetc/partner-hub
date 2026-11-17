import { describe, expect, it } from "vitest";
import { coordinatorsDay as content } from "@/content/coordinatorsDay";
import { allSlides, cardScript, choose, LEVELS, optionsFor, proceed, recap, shuffledFor, startRun, validateBoard, type Run } from "./coordinatorsDay";

/* The Coordinator's Day: the rules, against the authored day. */

const card = (run: Run) => (run.card.type === "scenario" ? content.scenarios[run.card.id] : null);
/** The first option with this outcome on the open card. */
const pick = (run: Run, outcome: string) => optionsFor(card(run)!, run.flags).find((o) => o.outcome === outcome)!;
/** Play the open card with a good option (climbing, or turning down well, on opportunities) and continue. */
const play = (run: Run, prefer: "climb" | "advance" = "climb") => {
  if (run.card.type === "event") return proceed(content, run);
  const opts = optionsFor(card(run)!, run.flags);
  const o = opts.find((x) => x.outcome === prefer) ?? opts.find((x) => x.outcome === "accept") ?? opts.find((x) => x.outcome === "advance")!;
  return proceed(content, choose(content, run, o.id));
};
const playToEnd = (run: Run, prefer: "climb" | "advance" = "climb") => {
  let r = run;
  for (let i = 0; i < 80 && r.phase !== "done"; i++) r = play(r, prefer);
  return r;
};
/** Play until this card is open. */
const playTo = (run: Run, id: string) => {
  let r = run;
  for (let i = 0; i < 80 && !(r.card.type === "scenario" && r.card.id === id && r.phase === "card"); i++) r = play(r);
  return r;
};

describe("The Coordinator's Day", () => {
  it("has three valid 20-square boards with ladders and slides up into the top rows", () => {
    for (const level of LEVELS) {
      expect(validateBoard(content, level)).toEqual([]);
      const b = content.boards[level];
      expect(b.squares).toHaveLength(20);
      expect(b.ladders.length).toBeGreaterThanOrEqual(4);
      expect(allSlides(b).length).toBeGreaterThanOrEqual(3);
      expect(b.checkpoints).toHaveLength(4);
      // The top two rows (squares 13 to 20) have ladders and slides of their own.
      expect(b.ladders.filter((l) => l.from >= 12).length).toBeGreaterThanOrEqual(2);
      expect(allSlides(b).filter((x) => x.from >= 12).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("loads each level's own scenarios", () => {
    expect(card(startRun(content, "new", 1))!.id).toBe("c-start");
    expect(card(startRun(content, "experienced", 1))!.id).toBe("x-call");
    expect(content.boards.practising.story.some((s) => s.card.startsWith("t-"))).toBe(true);
    expect(content.boards.new.story.some((s) => s.card.startsWith("t-"))).toBe(false);
  });

  it("moves on exactly once for an accepted answer, and stays put for a wrong one", () => {
    let r = startRun(content, "new", 1);
    r = choose(content, r, pick(r, "retry").id);
    expect(r.square).toBe(0);
    expect(r.move?.kind).toBe("stay");
    // Choosing again during feedback does nothing.
    expect(choose(content, r, pick({ ...r, phase: "card" }, "accept").id)).toBe(r);
    r = proceed(content, r);
    expect(r.phase).toBe("card");
    expect(card(r)!.id).toBe("c-start");
    r = choose(content, r, pick(r, "accept").id);
    expect(r.square).toBe(1);
    // A second continue doesn't move or skip again.
    r = proceed(content, r);
    expect(proceed(content, r)).toBe(r);
    expect(card(r)!.id).toBe("d-call");
  });

  it("draws one setback at the checkpoint, slides once down the marked slide, and keeps the time and what was decided", () => {
    let r = startRun(content, "new", 7);
    for (let i = 0; i < 5; i++) r = play(r);
    expect(r.card).toEqual({ type: "event", id: "lena-away" });
    expect(r.square).toBe(5);
    const { time, flags } = r;
    r = proceed(content, r);
    expect(r.move).toMatchObject({ kind: "slide", from: 5, to: 2 });
    expect(r.card).toEqual({ type: "scenario", id: "d-replan", recovery: true });
    expect(r.time).toBe(time);
    expect(r.flags).toEqual(flags);
    // Continuing on the recovery card does nothing until a choice is made: no second slide.
    expect(proceed(content, r)).toBe(r);
    r = play(r);
    expect(r.square).toBe(3);
    expect(r.events).toEqual([{ checkpoint: 0, event: "lena-away", recovered: true }]);
  });

  it("draws the same setback for the same run, and either can come up", () => {
    const reach = (seed: number) => {
      let r = startRun(content, "practising", seed);
      for (let i = 0; i < 7; i++) r = play(r);
      return r.card.type === "event" ? r.card.id : null;
    };
    const drawn = new Set<string | null>();
    for (let seed = 1; seed < 40; seed++) {
      expect(reach(seed)).toBe(reach(seed));
      drawn.add(reach(seed));
    }
    expect(drawn).toEqual(new Set(["lena-away", "tan-physio-away"]));
  });

  it("lets earlier choices decide which setbacks can happen, and never draws one twice", () => {
    for (let seed = 1; seed < 25; seed++) {
      const r = playToEnd(startRun(content, "experienced", seed));
      const ids = r.events.map((e) => e.event);
      expect(new Set(ids).size).toBe(ids.length);
      // Three during the day, and the late one if they're in the top rows by then.
      expect(ids.length).toBeGreaterThanOrEqual(3);
      expect(r.events.every((e) => e.recovered)).toBe(true);
      // The shopping setback matches how the shopping was sorted.
      if (ids.includes("delivery-fails")) expect(r.flags["dot.shopping"]).toBe("delivery");
      if (ids.includes("fiona-cant")) expect(r.flags["dot.shopping"]).toBe("fiona");
    }
  });

  it("climbs the ladder for an opportunity handled well, and moves on one for a good refusal", () => {
    const toBowls = () => playTo(startRun(content, "new", 3), "d-bowls");
    expect(toBowls().square).toBe(3);
    expect(choose(content, toBowls(), pick(toBowls(), "climb").id).move).toMatchObject({ kind: "ladder", from: 3, to: 7 });
    expect(choose(content, toBowls(), pick(toBowls(), "advance").id).move).toMatchObject({ kind: "step", from: 3, to: 4 });
    expect(choose(content, toBowls(), pick(toBowls(), "retry").id).square).toBe(3);
  });

  it("lets an earlier decision change a later card's options, the handover and the recap", () => {
    // A full note at 9.35 offers the planned call at 1.35; a short one doesn't.
    const withNote = (full: boolean) => {
      let r = playTo(startRun(content, "new", 3), "d-file");
      r = proceed(content, choose(content, r, full ? "full" : "short"));
      return playTo(r, "d-slot");
    };
    const ids = (r: Run) => optionsFor(card(r)!, r.flags).map((o) => o.id);
    expect(ids(withNote(true))).toContain("planned");
    expect(ids(withNote(false))).not.toContain("planned");
    expect(recap(content, playToEnd(withNote(true))).echoes.some((e) => /9\.35/.test(e))).toBe(true);
    // Noting Dot's bowls changes how Lena gets booked back.
    const bowls = playTo(startRun(content, "new", 3), "d-lena-back");
    expect(ids(bowls)).toContain("bowls");
    // Turning the slot down changes the handover offered.
    let waiting = withNote(true);
    waiting = proceed(content, choose(content, waiting, "decline"));
    while (card(waiting)?.kind !== "handover") waiting = play(waiting);
    expect(ids(waiting)).toContain("waiting");
    expect(ids(waiting)).not.toContain("agreed");
  });

  it("reaches Handover on every level, by the ladders or the long way, plays every required card, and never rewinds the clock", () => {
    for (const level of LEVELS)
      for (const prefer of ["climb", "advance"] as const) {
        let r = startRun(content, level, 11);
        let time = r.time;
        for (let i = 0; i < 80 && r.phase !== "done"; i++) {
          r = play(r, prefer);
          expect(r.time).toBeGreaterThanOrEqual(time);
          time = r.time;
        }
        expect(r.phase).toBe("done");
        expect(r.square).toBe(19);
        const required = content.boards[level].story.filter((x) => !x.optional).map((x) => x.card);
        expect(required.filter((c) => !r.shown.includes(c))).toEqual([]);
      }
  });

  it("resumes where it was: a saved run carries on without redrawing or repeating a move", () => {
    let r = startRun(content, "practising", 5);
    for (let i = 0; i < 7; i++) r = play(r);
    const saved = JSON.parse(JSON.stringify(r)) as Run;
    expect(saved.card.type).toBe("event");
    expect(proceed(content, saved)).toEqual(proceed(content, r));
    const recovering = proceed(content, saved);
    const fb = choose(content, recovering, pick(recovering, "accept").id);
    const reloaded = JSON.parse(JSON.stringify(fb)) as Run;
    expect(reloaded.phase).toBe("feedback");
    expect(reloaded.square).toBe(fb.square);
    expect(choose(content, reloaded, pick({ ...reloaded, phase: "card" }, "accept").id)).toBe(reloaded);
  });

  it("shuffles the answers per game, so the best one isn't always first, and keeps the order for that game", () => {
    const first = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const r = startRun(content, "new", seed);
      const order = shuffledFor(card(r)!, r).map((o) => o.id);
      expect(shuffledFor(card(r)!, r).map((o) => o.id)).toEqual(order);
      expect([...order].sort()).toEqual(optionsFor(card(r)!, r.flags).map((o) => o.id).sort());
      first.add(order[0]);
    }
    expect(first.size).toBeGreaterThan(1);
  });

  it("recaps what happened", () => {
    let r = startRun(content, "new", 2);
    r = proceed(content, choose(content, r, "inbox"));
    r = playToEnd(r);
    const sum = recap(content, r);
    expect(sum.setbacks.length).toBeGreaterThanOrEqual(3);
    expect(sum.setbacks.every((s) => s.recovered)).toBe(true);
    expect(sum.ladders).toBeGreaterThanOrEqual(2);
    expect(sum.firstTry).toBe(sum.cards - 1);
  });

  it("reads each card aloud: its title, what is said and the question, with each part findable in the script", () => {
    const s = cardScript(content, { type: "scenario", id: "d-call" })!;
    const d = content.scenarios["d-call"];
    expect(s.text).toBe(`${d.title}. ${d.prompt} ${d.question}`);
    expect(s.spans.map((p) => s.text.slice(p.from, p.to))).toEqual([d.title, d.prompt, d.question]);
    for (const id of Object.keys(content.scenarios)) expect(cardScript(content, { type: "scenario", id })).not.toBeNull();
    for (const id of Object.keys(content.events)) expect(cardScript(content, { type: "event", id })?.text).toContain(content.events[id].text);
    expect(cardScript(content, { type: "scenario", id: "nope" })).toBeNull();
  });
});
