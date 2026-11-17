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
  - Reaching the last square early skips the optional cards still to come (they didn't come up), but any
    required ones are still played there before the handover opens. If the day's cards run out first,
    5.30 comes round and the token walks to Handover.
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
  /**
    After the story card at index `after` is resolved, one of `events` may happen. The token goes down the
    marked slide from the square it's on (there's one for each square it could be on by then).
    `minSquare`: a late setback that only catches the token from this square up (the top rows).
  */
  checkpoints: { after: number; events: string[]; slides: { from: number; to: number }[]; minSquare?: number }[];
  handover: string;
};

export type Content = {
  version: string;
  /** Pictures of the people on the cards, by speaker name. */
  avatars?: Record<string, string>;
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
  log: { card: string; option: string; outcome: Outcome; attempt: number; time: number; square?: number; clock?: number }[];
  /** The day clock (minutes) when the last answer was given. It only goes forward. */
  clock?: number;
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

/** The day clock on a square, in minutes: 9.00 am on Start to 5.30 pm on Handover, evenly between. */
export const dayTime = (square: number, squares: number) => 9 * 60 + (Math.max(0, Math.min(square, squares - 1)) / Math.max(1, squares - 1)) * (8.5 * 60);

/**
  Where the day clock goes after a move: forward by this move's share of what's left of the day (so it
  reaches 5.30 pm on Handover however the day has gone), and nowhere for a slide. Time never goes back.
*/
export function clockAfterMove(now: number, from: number, to: number, squares: number) {
  const last = squares - 1;
  const end = dayTime(last, squares);
  if (to <= from) return now;
  if (to >= last || from >= last) return Math.max(now, end);
  return now + (Math.max(0, end - now) * (to - from)) / (last - from);
}

/** The options this learner sees on a card, given what's happened. */
export const optionsFor = (s: Scenario, flags: Flags) => s.options.filter((o) => matches(flags, o.when));
/**
  The options in the order this learner sees them: shuffled once per run and card, so the best answer
  isn't always first, and the order stays put across a refresh.
*/
export function shuffledFor(s: Scenario, run: Pick<Run, "seed" | "flags">) {
  const opts = optionsFor(s, run.flags);
  let salt = 0;
  for (const ch of s.id) salt = (salt * 31 + ch.charCodeAt(0)) >>> 0;
  return opts
    .map((o, i) => ({ o, k: random(run.seed, salt + i) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.o);
}
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
    kind = to === run.square ? "stay" : "step";
  } else if (o.outcome === "climb") {
    // Near the end there's no room for a ladder, so a climb there just moves on one.
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
    log: [...run.log, { card: s.id, option: o.id, outcome: o.outcome, attempt, time: run.time, square: run.square }],
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
    const slide = slideFor(board, cp?.checkpoint ?? -1, run.square);
    const to = slide ? slide.to : Math.max(0, run.square - 3);
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
  // No setbacks once at Handover: the day's nearly done.
  if (
    cpIndex !== -1 &&
    !run.events.some((x) => x.checkpoint === cpIndex) &&
    !resolved?.recovery &&
    run.square < last(board) &&
    run.square >= (board.checkpoints[cpIndex].minSquare ?? 0)
  ) {
    const used = new Set(run.events.map((x) => x.event));
    const pool = board.checkpoints[cpIndex].events.filter((id) => !used.has(id) && matches(run.flags, content.events[id].eligible));
    if (pool.length) {
      const pick = pool[Math.floor(random(run.seed, cpIndex) * pool.length)];
      const e = content.events[pick];
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

  // At Handover already: optional cards are skipped, required ones still come up there, then the handover.
  const end = last(board);
  const handover = content.scenarios[board.handover];
  if (run.square >= end) {
    const due = board.story.findIndex((x, i) => i >= run.next && !x.optional);
    if (due !== -1) {
      const s = content.scenarios[board.story[due].card];
      return { ...base, phase: "card", card: { type: "scenario", id: s.id }, next: due + 1, time: Math.max(run.time, s.time), move: undefined, shown: [...run.shown, s.id] };
    }
    return { ...base, phase: "card", card: { type: "scenario", id: handover.id }, time: Math.max(run.time, handover.time), move: undefined, shown: [...run.shown, handover.id] };
  }
  // Out of cards: 5.30 comes round and the token walks to Handover.
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

/** The marked slide down from this square at a checkpoint, if there is one. */
export const slideFor = (board: Board, checkpoint: number, square: number) => board.checkpoints[checkpoint]?.slides.find((x) => x.from === square);
/** Every marked slide on the board, once each. */
export const allSlides = (board: Board) => [...new Map(board.checkpoints.flatMap((c) => c.slides).map((x) => [`${x.from}-${x.to}`, x])).values()];

/**
  What's read aloud when a card opens: its title, what's said, and the question (the choices are left to
  read on the card). The parts are returned with where each sits in the script, so the card can follow along.
*/
export function cardScript(content: Content, card: { type: "scenario" | "event"; id: string }) {
  const parts =
    card.type === "event"
      ? [content.events[card.id]?.title, content.events[card.id]?.text]
      : [content.scenarios[card.id]?.title, content.scenarios[card.id]?.prompt, content.scenarios[card.id]?.question];
  if (parts.some((p) => !p)) return null;
  return script(parts as string[]);
}

/** What an answer's outcome is called on the card. */
export function outcomeLabel(outcome: Outcome, handover = false) {
  if (handover && outcome === "accept") return "Handover accepted. That’s your day done.";
  return {
    accept: "Good call. You move forward one square.",
    climb: "Handled well. You climb the ladder.",
    advance: "A fair call. You move on one square.",
    retry: "Not quite. You stay on this square: try again.",
  }[outcome];
}

/**
  What's read aloud once an answer is chosen: how it went, why, and the tip to take away. Read as the
  learner sees it on the card, in the same parts so the card can follow along.
*/
export function answerScript(content: Content, scenario: string, option: string) {
  const s = content.scenarios[scenario];
  const o = s?.options.find((x) => x.id === option);
  if (!s || !o) return null;
  return script([outcomeLabel(o.outcome, s.kind === "handover"), o.feedback, ...(o.tip ? [`Try this: ${o.tip}`] : [])]);
}

/** Joins the parts of a script, noting where each sits; the first part gets a full stop so the voice pauses. */
function script(parts: string[]) {
  let text = "";
  const spans = parts.map((p, i) => {
    const sep = i === 0 ? "" : " ";
    const from = text.length + sep.length;
    text += sep + p + (i === 0 && !/[.!?]$/.test(p) ? "." : "");
    return { from, to: from + p.length };
  });
  return { text, spans };
}

/** The open card's time on the clock. */
export const now = (run: Run) => clock(run.time);

/*
  Checks a board against its content: every card and event exists, ladders go up and slides go down
  within the board, and on every route (each setback that could be drawn, each opportunity climbed or
  turned down) there's a marked slide wherever the token can be at a checkpoint and a ladder wherever
  an opportunity can be climbed, and the day reaches Handover with every required card played.
*/
export function validateBoard(content: Content, level: Level): string[] {
  const b = content.boards[level];
  const errors: string[] = [];
  const end = last(b);
  const need = (id: string, what: string) => {
    if (!content.scenarios[id]) errors.push(`${level}: ${what} "${id}" doesn't exist`);
  };
  b.story.forEach((x) => need(x.card, "card"));
  need(b.handover, "handover");
  b.checkpoints.forEach((c) => {
    c.events.forEach((id) => (content.events[id] ? need(content.events[id].recovery, "recovery") : errors.push(`${level}: event "${id}" doesn't exist`)));
    c.slides.forEach((x) => x.to >= x.from && errors.push(`${level}: the slide from ${x.from} doesn't go down`));
  });
  b.ladders.forEach((l) => (l.to <= l.from || l.to > end) && errors.push(`${level}: the ladder from ${l.from} doesn't go up within the board`));
  if (errors.length) return errors;

  const required = b.story.filter((x) => !x.optional).map((x) => x.card);
  type S = { square: number; next: number; used: string[]; drawn: number[]; shown: string[]; path: string[] };
  const walk = (s: S): void => {
    const cp = b.checkpoints.findIndex((c, i) => c.after === s.next - 1 && !s.drawn.includes(i));
    if (cp !== -1 && s.square < end && s.square >= (b.checkpoints[cp].minSquare ?? 0)) {
      const pool = b.checkpoints[cp].events.filter((id) => !s.used.includes(id));
      if (pool.length) {
        const slide = slideFor(b, cp, s.square);
        if (!slide) errors.push(`${level}: no slide from square ${s.square} at checkpoint ${cp} (${s.path.join(" > ")})`);
        for (const id of pool) walk({ ...s, square: Math.min(end, (slide?.to ?? s.square) + 1), used: [...s.used, id], drawn: [...s.drawn, cp], path: [...s.path, id] });
        return;
      }
    }
    if (s.next >= b.story.length) {
      const missing = required.filter((r) => !s.shown.includes(r));
      if (missing.length) errors.push(`${level}: the route ${s.path.join(" > ")} finishes without ${missing.join(", ")}`);
      return;
    }
    const item = b.story[s.next];
    // At Handover, optional cards are skipped.
    if (s.square >= end && item.optional) return walk({ ...s, next: s.next + 1 });
    const card = content.scenarios[item.card];
    const shown = [...s.shown, card.id];
    const outcomes = new Set(card.options.map((o) => o.outcome));
    const step = Math.min(end, s.square + 1);
    if (card.kind === "opportunity" && outcomes.has("climb")) {
      const ladder = b.ladders.find((l) => l.from === s.square);
      // Near the end there's no room for a ladder: a climb there just moves on one.
      if (!ladder && s.square + 4 <= end) errors.push(`${level}: "${card.id}" can be climbed but there's no ladder on square ${s.square} (${s.path.join(" > ")})`);
      walk({ ...s, square: ladder ? ladder.to : step, next: s.next + 1, shown, path: [...s.path, `${card.id}:climb`] });
      if (outcomes.has("advance")) walk({ ...s, square: step, next: s.next + 1, shown, path: [...s.path, `${card.id}:advance`] });
      return;
    }
    walk({ ...s, square: step, next: s.next + 1, shown, path: [...s.path, card.id] });
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
