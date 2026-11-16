import { describe, expect, it } from "vitest";
import { coordinatorsDay as content } from "@/content/coordinatorsDay";
import { choose, LEVELS, optionsFor, proceed, recap, startRun, validateBoard, type Run } from "./coordinatorsDay";

/* The Coordinator's Day: the rules, against the authored day. */

const card = (run: Run) => (run.card.type === "scenario" ? content.scenarios[run.card.id] : null);
/** The first option with this outcome on the open card. */
const pick = (run: Run, outcome: string) => optionsFor(card(run)!, run.flags).find((o) => o.outcome === outcome)!;
/** Play the open card with the first accepted (or climbing) option, and continue. */
const play = (run: Run, prefer: "climb" | "advance" = "climb") => {
  if (run.card.type === "event") return proceed(content, run);
  const s = card(run)!;
  const opts = optionsFor(s, run.flags);
  const o = opts.find((x) => x.outcome === prefer) ?? opts.find((x) => x.outcome === "accept") ?? opts.find((x) => x.outcome === "advance")!;
  return proceed(content, choose(content, run, o.id));
};
const playToEnd = (run: Run, prefer: "climb" | "advance" = "climb") => {
  let r = run;
  for (let i = 0; i < 60 && r.phase !== "done"; i++) r = play(r, prefer);
  return r;
};

describe("The Coordinator's Day", () => {
  it("has three valid boards: every route reaches Handover with every required card", () => {
    for (const level of LEVELS) expect(validateBoard(content, level)).toEqual([]);
    expect(content.boards.new.squares.length).toBeLessThan(content.boards.practising.squares.length);
    expect(content.boards.practising.squares.length).toBeLessThan(content.boards.experienced.squares.length);
  });

  it("loads each level's own scenarios", () => {
    expect(card(startRun(content, "new", 1))!.id).toBe("d-call");
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
    expect(card(r)!.id).toBe("d-call");
    r = choose(content, r, pick(r, "accept").id);
    expect(r.square).toBe(1);
    // A second continue, or a second tap, doesn't move again.
    const twice = choose(content, r, "wait");
    expect(twice.square).toBe(1);
    r = proceed(content, r);
    expect(proceed(content, r)).toBe(r);
    expect(card(r)!.id).toBe("d-file");
  });

  it("draws one setback at the checkpoint, slides once, and keeps the time and what was decided", () => {
    let r = startRun(content, "new", 7);
    for (let i = 0; i < 4; i++) r = play(r);
    expect(r.card).toEqual({ type: "event", id: "lena-away" });
    expect(r.square).toBe(4);
    const time = r.time;
    const flags = r.flags;
    r = proceed(content, r);
    expect(r.square).toBe(2);
    expect(r.move).toMatchObject({ kind: "slide", from: 4, to: 2 });
    expect(r.card).toEqual({ type: "scenario", id: "d-replan", recovery: true });
    expect(r.time).toBe(time);
    expect(r.flags).toEqual(flags);
    // Continuing on the recovery card does nothing until a choice is made: no second slide.
    expect(proceed(content, r)).toBe(r);
    r = play(r);
    expect(r.square).toBe(3);
    expect(r.events).toEqual([{ checkpoint: 0, event: "lena-away", recovered: true }]);
  });

  it("draws the same setback for the same run, and can be steered to a particular one", () => {
    const reach = (seed: number) => {
      let r = startRun(content, "practising", seed);
      for (let i = 0; i < 5; i++) r = play(r);
      return r.card.type === "event" ? r.card.id : null;
    };
    const drawn = new Set<string | null>();
    for (let seed = 1; seed < 40; seed++) {
      expect(reach(seed)).toBe(reach(seed));
      drawn.add(reach(seed));
    }
    expect(drawn).toEqual(new Set(["lena-away", "tan-physio-away"]));
  });

  it("never draws the same setback twice in a run", () => {
    for (let seed = 1; seed < 20; seed++) {
      const r = playToEnd(startRun(content, "experienced", seed));
      expect(r.events.map((e) => e.event).sort()).toEqual(["lena-away", "tan-physio-away"]);
      expect(r.events.every((e) => e.recovered)).toBe(true);
    }
  });

  it("climbs the ladder for an opportunity handled well, and moves on one for a good refusal", () => {
    const toSlot = () => {
      let r = startRun(content, "new", 3);
      for (let i = 0; i < 6; i++) r = play(r);
      expect(card(r)!.id).toBe("d-slot");
      return r;
    };
    const up = choose(content, toSlot(), pick(toSlot(), "climb").id);
    expect(up.move).toMatchObject({ kind: "ladder", from: 3, to: 6 });
    const on = choose(content, toSlot(), pick(toSlot(), "advance").id);
    expect(on.move).toMatchObject({ kind: "step", from: 3, to: 4 });
    const no = choose(content, toSlot(), pick(toSlot(), "retry").id);
    expect(no.square).toBe(3);
  });

  it("lets an earlier decision change a later card's options and the recap", () => {
    // A full note at 9.35 offers the planned call at 1.35; a short one doesn't.
    const withNote = (full: boolean) => {
      let r = startRun(content, "new", 3);
      r = play(r);
      r = proceed(content, choose(content, r, full ? "full" : "short"));
      for (let i = 0; i < 4; i++) r = play(r);
      expect(card(r)!.id).toBe("d-slot");
      return r;
    };
    expect(optionsFor(card(withNote(true))!, withNote(true).flags).map((o) => o.id)).toContain("planned");
    expect(optionsFor(card(withNote(false))!, withNote(false).flags).map((o) => o.id)).not.toContain("planned");
    const done = playToEnd(withNote(true));
    expect(recap(content, done).echoes[0]).toMatch(/9\.35/);
    // And the handover offered reflects what was decided at 1.35.
    let waiting = withNote(true);
    waiting = proceed(content, choose(content, waiting, "decline"));
    while (card(waiting)?.kind !== "handover") waiting = play(waiting);
    expect(optionsFor(card(waiting)!, waiting.flags).map((o) => o.id)).toContain("waiting");
    expect(optionsFor(card(waiting)!, waiting.flags).map((o) => o.id)).not.toContain("agreed");
  });

  it("reaches Handover on every level, by the ladders or the long way, and never rewinds the clock", () => {
    for (const level of LEVELS)
      for (const prefer of ["climb", "advance"] as const) {
        let r = startRun(content, level, 11);
        let time = r.time;
        for (let i = 0; i < 60 && r.phase !== "done"; i++) {
          r = play(r, prefer);
          expect(r.time).toBeGreaterThanOrEqual(time);
          time = r.time;
        }
        expect(r.phase).toBe("done");
        expect(r.square).toBe(content.boards[level].squares.length - 1);
      }
  });

  it("resumes where it was: a saved run carries on without redrawing or repeating a move", () => {
    let r = startRun(content, "practising", 5);
    for (let i = 0; i < 5; i++) r = play(r);
    const saved = JSON.parse(JSON.stringify(r)) as Run;
    expect(saved.card.type).toBe("event");
    expect(proceed(content, saved)).toEqual(proceed(content, r));
    const fb = choose(content, play(saved), pick(play(saved), "accept").id);
    const reloaded = JSON.parse(JSON.stringify(fb)) as Run;
    expect(reloaded.phase).toBe("feedback");
    expect(reloaded.square).toBe(fb.square);
  });

  it("recaps what happened", () => {
    let r = startRun(content, "new", 2);
    r = proceed(content, choose(content, r, "replace"));
    r = playToEnd(r);
    const sum = recap(content, r);
    expect(sum.setbacks).toEqual([{ title: "Your backup plan falls through", recovered: true }]);
    expect(sum.ladders).toBe(1);
    expect(sum.firstTry).toBe(sum.cards - 1);
  });
});
