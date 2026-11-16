/*
  The Coordinator's Day: the rules, apart from the content (content/coordinatorsDay) and the screen
  (components/coordinatorsDay). A run is plain data, so it saves and resumes as it is, and every step is
  a pure function from one run to the next.

  The board and the story are separate. The story is a queue of cards in time order (calls, messages,
  changes); the board is where the learner's token stands.
  - An accepted decision moves the token on one square. A wrong one leaves it where it is, with
    feedback and another go.
  - At set points in the day a setback is drawn from the eligible events (seeded, so a run always
    draws the same one, and once only). The token slides down to a kind of work to redo, the clock
    keeps going, and a recovery card opens there.
  - An opportunity handled well climbs the ladder at the token's square. Turning down an unsuitable
    one well moves on one square.
  - The handover opens when the token reaches the last square (any cards left are optional ones that
    didn't come up), or when the day's cards run out (the token walks to Handover at 4.30).
  Each choice and each event resolves once: choosing again during feedback, or continuing twice, does
  nothing, so a double tap or a refresh never repeats a move or redraws a setback.
*/

export type Level = "new" | "practising" | "experienced";
export const LEVELS: Level[] = ["new", "practising", "experienced"];

export type Flags = Record<string, string | boolean>;
/** Every key must match; a flag that's not set counts as false. */
export type Condition = Record<string, string | boolean>;
export const matches = (flags: Flags, when?: Condition) => !when || Object.entries(when).every(([k, v]) => (flags[k] ?? false) === v);

/**
  accept: a decision done well, on one square. retry: stays put, try again.
  climb: an opportunity done well, up the ladder. advance: an opportunity turned down well, on one square.
*/
export type Outcome = "accept" | "retry" | "climb" | "advance";

export type Option = {
  id: string;
  text: string;
  outcome: Outcome;
  feedback: string;
  /** Something practical to take away. */
  tip?: string;
  /** What this choice records, for later cards. */
  set?: Flags;
  /** Only offered when the story so far matches. */
  when?: Condition;
};

export type Channel = "call" | "text" | "email" | "note" | "voicemail";

export type Scenario = {
  id: string;
  version: number;
  kind: "decision" | "opportunity" | "recovery" | "handover";
  client: "dot" | "tan" | "both";
  speaker: string;
  /** Who they are, under their name. */
  role: string;
  channel: Channel;
  /** Minutes after midnight. */
  time: number;
  title: string;
  prompt: string;
  question: string;
  /** What the learner knows from earlier, shown when the story so far matches. */
  context?: { when?: Condition; text: string }[];
  options: Option[];
  /** Recap lines: how an earlier choice shaped this card. */
  echo?: { when: Condition; text: string }[];
  /** Wording that depends on Trilogy Care policy, for content review before release. */
  review?: string;
};

export type GameEvent = {
  id: string;
  time: number;
  title: string;
  speaker: string;
  channel: Channel;
  text: string;
  recovery: string;
  eligible?: Condition;
};

export type StoryItem = { card: string; optional?: boolean };

export type Board = {
  level: Level;
  title: string;
  blurb: string;
  clients: string[];
  /** Each square is a kind of work; the first is the start, the last is Handover. */
  squares: string[];
  ladders: { from: number; to: number }[];
  story: StoryItem[];
  /** After the story card at index `after` is resolved, one of these may happen: a slide from `from` to `to`. */
  checkpoints: { after: number; events: { event: string; from: number; to: number }[] }[];
  handover: string;
};

export type Content = {
  version: string;
  scenarios: Record<string, Scenario>;
  events: Record<string, GameEvent>;
  boards: Record<Level, Board>;
};

export type Move = { from: number; to: number; kind: "step" | "stay" | "ladder" | "slide" | "walk"; n: number };

export type Run = {
  v: 1;
  content: string;
  level: Level;
  seed: number;
  square: number;
  /** Index of the next story card. */
  next: number;
  card: { type: "scenario"; id: string; recovery?: boolean } | { type: "event"; id: string };
  phase: "card" | "feedback" | "done";
  time: number;
  flags: Flags;
  attempt: number;
  log: { card: string; option: string; outcome: Outcome; attempt: number; time: number }[];
  events: { checkpoint: number; event: string; recovered: boolean }[];
  /** Story cards that came out (for the recap and validation). */
  shown: string[];
  feedback?: { option: string; outcome: Outcome };
  move?: Move;
  moves: number;
  climbed: number;
};

export const last = (b: Board) => b.squares.length - 1;
export const clock = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}.${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

/** The options this learner sees on a card, given what's happened. */
export const optionsFor = (s: Scenario, flags: Flags) => s.options.filter((o) => matches(flags, o.when));
export const contextFor = (s: Scenario, flags: Flags) => (s.context ?? []).filter((c) => matches(flags, c.when)).map((c) => c.text);

/** A small seeded random number generator: the same seed and checkpoint always draw the same event. */
function random(seed: number, salt: number) {
  let t = (seed ^ Math.imul(salt + 1, 2654435761)) >>> 0;
  t += 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function startRun(content: Content, level: Level, seed: number): Run {
  const b = content.boards[level];
  const first = content.scenarios[b.story[0].card];
  return {
    v: 1,
    content: content.version,
    level,
    seed,
    square: 0,
    next: 1,
    card: { type: "scenario", id: first.id },
    phase: "card",
    time: first.time,
    flags: {},
    attempt: 0,
    log: [],
    events: [],
    shown: [first.id],
    moves: 0,
    climbed: 0,
  };
}

/** Choose an option on the open card. Does nothing unless a card is waiting for a choice. */
export function choose(content: Content, run: Run, optionId: string): Run {
  if (run.phase !== "card" || run.card.type !== "scenario") return run;
  const s = content.scenarios[run.card.id];
  const o = optionsFor(s, run.flags).find((x) => x.id === optionId);
  if (!o) return run;
  const b = content.boards[run.level];
  const attempt = run.attempt + 1;
  let to = run.square;
  let kind: Move["kind"] = "stay";
  let climbed = run.climbed;
  if (o.outcome === "accept" || o.outcome === "advance") {
    to = Math.min(last(b), run.square + 1);
    kind = "step";
  } else if (o.outcome === "climb") {
    const ladder = b.ladders.find((l) => l.from === run.square);
    to = ladder ? ladder.to : Math.min(last(b), run.square + 1);
    kind = ladder ? "ladder" : "step";
    if (ladder) climbed += 1;
  }
  return {
    ...run,
    phase: "feedback",
    attempt,
    flags: o.outcome === "retry" ? run.flags : { ...run.flags, ...o.set },
    log: [...run.log, { card: s.id, option: o.id, outcome: o.outcome, attempt, time: run.time }],
    feedback: { option: o.id, outcome: o.outcome },
    square: to,
    move: { from: run.square, to, kind, n: run.moves + 1 },
    moves: run.moves + 1,
    climbed,
  };
}

/**
  Move the day on: after feedback, to another go (a wrong choice) or the next card; on a setback
  card, down the slide to its recovery card. Does nothing at other times.
*/
export function proceed(content: Content, run: Run): Run {
  if (run.phase === "card" && run.card.type === "event") {
    const e = content.events[run.card.id];
    const cp = run.events.find((x) => x.event === e.id);
    const board = content.boards[run.level];
    const slide = board.checkpoints.flatMap((c) => c.events).find((x) => x.event === e.id && x.from === run.square);
    const to = slide ? slide.to : Math.max(0, run.square - 2);
    return {
      ...run,
      square: to,
      card: { type: "scenario", id: e.recovery, recovery: true },
      attempt: 0,
      events: run.events.map((x) => (x === cp ? { ...x, recovered: false } : x)),
      move: { from: run.square, to, kind: "slide", n: run.moves + 1 },
      moves: run.moves + 1,
    };
  }
  if (run.phase !== "feedback" || !run.feedback) return run;
  if (run.feedback.outcome === "retry") return { ...run, phase: "card", feedback: undefined, move: undefined };
  const board = content.boards[run.level];
  const resolved = run.card.type === "scenario" ? run.card : null;
  // A recovery card done: the setback is behind them.
  const events = resolved?.recovery ? run.events.map((x) => (content.events[x.event].recovery === resolved.id ? { ...x, recovered: true } : x)) : run.events;
  if (resolved?.id === board.handover) return { ...run, phase: "done", feedback: undefined, events };
  const base: Run = { ...run, feedback: undefined, attempt: 0, events };

  // A setback, if this is one of the day's checkpoints and one hasn't been drawn here yet.
  const resolvedIndex = run.next - 1;
  const cpIndex = board.checkpoints.findIndex((c) => c.after === resolvedIndex);
  if (cpIndex !== -1 && !run.events.some((x) => x.checkpoint === cpIndex) && !resolved?.recovery) {
    const used = new Set(run.events.map((x) => x.event));
    const pool = board.checkpoints[cpIndex].events.filter((x) => !used.has(x.event) && matches(run.flags, content.events[x.event].eligible));
    if (pool.length) {
      const pick = pool[Math.floor(random(run.seed, cpIndex) * pool.length)];
      const e = content.events[pick.event];
      return {
        ...base,
        phase: "card",
        card: { type: "event", id: e.id },
        time: Math.max(run.time, e.time),
        events: [...events, { checkpoint: cpIndex, event: e.id, recovered: false }],
        move: undefined,
      };
    }
  }

  // At Handover already: the cards left were optional, and the day wraps up.
  const end = last(board);
  const handover = content.scenarios[board.handover];
  if (run.square >= end) {
    return { ...base, phase: "card", card: { type: "scenario", id: handover.id }, time: Math.max(run.time, handover.time), move: undefined, shown: [...run.shown, handover.id] };
  }
  // Out of cards: 4.30 comes round and the token walks to Handover.
  if (run.next >= board.story.length) {
    return {
      ...base,
      phase: "card",
      card: { type: "scenario", id: handover.id },
      time: Math.max(run.time, handover.time),
      square: end,
      move: { from: run.square, to: end, kind: "walk", n: run.moves + 1 },
      moves: run.moves + 1,
      shown: [...run.shown, handover.id],
    };
  }
  const s = content.scenarios[board.story[run.next].card];
  return { ...base, phase: "card", card: { type: "scenario", id: s.id }, next: run.next + 1, time: Math.max(run.time, s.time), move: undefined, shown: [...run.shown, s.id] };
}

/** The open card's time on the clock. */
export const now = (run: Run) => clock(run.time);

/*
  Checks a board against its content: every card and event exists, every slide starts where the
  token will be when its checkpoint comes, every climb has a ladder, and on every route (each
  setback that could be drawn, each opportunity climbed or turned down) every required card comes
  out before the token reaches Handover.
*/
export function validateBoard(content: Content, level: Level): string[] {
  const b = content.boards[level];
  const errors: string[] = [];
  const need = (id: string, what: string) => {
    if (!content.scenarios[id]) errors.push(`${level}: ${what} "${id}" doesn't exist`);
  };
  b.story.forEach((x) => need(x.card, "card"));
  need(b.handover, "handover");
  b.checkpoints.forEach((c) =>
    c.events.forEach((x) => {
      if (!content.events[x.event]) errors.push(`${level}: event "${x.event}" doesn't exist`);
      else need(content.events[x.event].recovery, "recovery");
      if (x.to >= x.from) errors.push(`${level}: the slide for "${x.event}" doesn't go down`);
    }),
  );
  b.ladders.forEach((l) => l.to <= l.from && errors.push(`${level}: the ladder from ${l.from} doesn't go up`));
  if (errors.length) return errors;

  const end = last(b);
  const required = b.story.filter((x) => !x.optional).map((x) => x.card);
  const routes = new Set<string>();
  type S = { square: number; next: number; used: string[]; drawn: number[]; shown: string[]; path: string[] };
  const walk = (s: S): void => {
    // After the card at s.next - 1: a checkpoint?
    const cp = b.checkpoints.findIndex((c, i) => c.after === s.next - 1 && !s.drawn.includes(i));
    if (cp !== -1) {
      const pool = b.checkpoints[cp].events.filter((x) => !s.used.includes(x.event));
      if (pool.length) {
        for (const x of pool) {
          if (x.from !== s.square) errors.push(`${level}: "${x.event}" slides from ${x.from} but the token is on ${s.square} (${s.path.join(" > ")})`);
          // The recovery card moves on one.
          walk({ ...s, square: Math.min(end, x.to + 1), used: [...s.used, x.event], drawn: [...s.drawn, cp], path: [...s.path, x.event] });
        }
        return;
      }
    }
    if (s.square >= end || s.next >= b.story.length) {
      const missing = required.filter((r) => !s.shown.includes(r));
      if (missing.length) errors.push(`${level}: the route ${s.path.join(" > ")} reaches Handover without ${missing.join(", ")}`);
      routes.add(s.path.join(" > "));
      return;
    }
    const card = content.scenarios[b.story[s.next].card];
    const shown = [...s.shown, card.id];
    const outcomes = new Set(card.options.map((o) => o.outcome));
    if (card.kind === "opportunity" && outcomes.has("climb")) {
      const ladder = b.ladders.find((l) => l.from === s.square);
      if (!ladder) errors.push(`${level}: "${card.id}" can be climbed but there's no ladder on square ${s.square} (${s.path.join(" > ")})`);
      else walk({ ...s, square: ladder.to, next: s.next + 1, shown, path: [...s.path, `${card.id}:climb`] });
      if (outcomes.has("advance")) walk({ ...s, square: s.square + 1, next: s.next + 1, shown, path: [...s.path, `${card.id}:advance`] });
      return;
    }
    walk({ ...s, square: s.square + 1, next: s.next + 1, shown, path: [...s.path, card.id] });
  };
  walk({ square: 1, next: 1, used: [], drawn: [], shown: [b.story[0].card], path: [b.story[0].card] });
  return [...new Set(errors)];
}

/** The end-of-day recap: how it went, and how earlier choices played out. */
export function recap(content: Content, run: Run) {
  const firstTry = new Set<string>();
  const tries = new Map<string, number>();
  for (const l of run.log) tries.set(l.card, (tries.get(l.card) ?? 0) + 1);
  for (const l of run.log) if (l.attempt === 1 && l.outcome !== "retry") firstTry.add(l.card);
  const decided = [...tries.keys()];
  const echoes = decided.flatMap((id) => (content.scenarios[id].echo ?? []).filter((e) => matches(run.flags, e.when)).map((e) => e.text));
  return {
    cards: decided.length,
    firstTry: decided.filter((id) => firstTry.has(id)).length,
    setbacks: run.events.map((x) => ({ title: content.events[x.event].title, recovered: x.recovered })),
    ladders: run.climbed,
    echoes,
  };
}
