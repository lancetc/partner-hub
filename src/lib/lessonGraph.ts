import type { Card, Lesson } from "@/content/lessons";

/*
  The shape of a lesson: cards linked by `next`, with decisions that branch and rejoin.
  Used by the lesson editor to add and move cards without breaking the paths through a lesson.
*/

export const nextOf = (c: Card): string[] =>
  c.type === "decision" ? c.options.map((o) => o.next).filter((n): n is string => Boolean(n)) : "next" in c && c.next ? [c.next] : [];

/** Cards in reading order: follows the path from the start card, then anything unreachable. */
export function ordered(l: Lesson): Card[] {
  const seen: string[] = [];
  const walk = (id?: string) => {
    if (!id || seen.includes(id) || !l.nodes[id]) return;
    seen.push(id);
    nextOf(l.nodes[id]).forEach(walk);
  };
  walk(l.start);
  return [...seen, ...Object.keys(l.nodes).filter((id) => !seen.includes(id))].map((id) => l.nodes[id]).sort((a, b) => a.beat - b.beat);
}

export type Linked = Card & { next?: string };
/** A card in a straight run: it carries on to one next card (or ends), rather than branching or finishing. */
export const isLinear = (c: Card | undefined): c is Linked => Boolean(c) && c!.type !== "decision" && c!.type !== "summary";
/*
  Moving cards. A lesson is a graph (decisions branch and rejoin), so moves follow its main line:
  every card on the way from the first card to the end, where a decision with branches counts as
  one block that ends where its branches rejoin. A card can move past any block, including a whole
  decision and its consequences. Cards inside a branch stay with their decision.
*/

/** Where a card carries on to: its next card, or for a decision, the card where all its choices meet again. */
export function exitOf(l: Lesson, id: string, depth = 0): string | null {
  const c = l.nodes[id];
  if (!c || depth > 50) return null;
  if (isLinear(c)) return c.next || null;
  if (c.type !== "decision") return null;
  const targets = [...new Set(c.options.filter((o) => !o.stay && o.next).map((o) => o.next!))];
  if (!targets.length) return null;
  if (targets.length === 1) return targets[0];
  // Follow each branch. A branch that leads back to this decision (try again) doesn't carry on.
  const chain = (start: string) => {
    const seen: string[] = [];
    for (let cur: string | null = start; cur && !seen.includes(cur) && seen.length < 50; cur = exitOf(l, cur, depth + 1)) {
      if (cur === id) return null;
      seen.push(cur);
    }
    return seen;
  };
  const chains = targets.map(chain).filter((x): x is string[] => Boolean(x));
  if (!chains.length) return null;
  const [first, ...rest] = chains;
  // Where the branches meet again; with one onward branch, the first card past this step
  // (consequence cards share their decision's step).
  if (rest.length) return first.find((x) => rest.every((r) => r.includes(x))) ?? null;
  return first.find((x) => l.nodes[x].beat > c.beat) ?? null;
}

/** The cards from the first to the end, one per block. */
export function mainLine(l: Lesson) {
  const ids: string[] = [];
  for (let cur: string | null = l.start; cur && !ids.includes(cur); cur = exitOf(l, cur)) ids.push(cur);
  return ids;
}

/** A card that can move: a straight-run card, or a decision whose choices all lead to the same next card. */
export function movable(l: Lesson, id: string) {
  const c = l.nodes[id];
  if (!c || !mainLine(l).includes(id)) return false;
  if (isLinear(c)) return true;
  return c.type === "decision" && new Set(c.options.filter((o) => !o.stay && o.next).map((o) => o.next)).size <= 1;
}

/** Points everything that led to `from` at `to` instead (an empty `to` means the end). */
function redirect(d: Lesson, from: string, to: string, except?: string) {
  if (d.start === from && to) d.start = to;
  for (const n of Object.values(d.nodes)) {
    if (n.id === except) continue;
    if (isLinear(n) && n.next === from) n.next = to;
    if (n.type === "decision")
      for (const o of n.options)
        if (o.next === from) {
          o.next = to || undefined;
          if (!to) o.stay = true;
        }
  }
}

function setExit(d: Lesson, id: string, to: string) {
  const c = d.nodes[id];
  if (isLinear(c)) c.next = to;
  else if (c.type === "decision")
    for (const o of c.options)
      if (!o.stay || !o.next) {
        o.next = to || undefined;
        o.stay = !to;
      }
}

/** Places `id` just before `beforeId` on the main line (or at the very end when there's no `beforeId`). */
function placeBefore(d: Lesson, id: string, beforeId: string | null, lastId?: string) {
  if (beforeId) {
    redirect(d, beforeId, id, id);
    setExit(d, id, beforeId);
  } else if (lastId) {
    const last = d.nodes[lastId];
    if (isLinear(last)) last.next = id;
    else if (last.type === "decision") setExit(d, lastId, id);
    setExit(d, id, "");
  }
}

/** Moves a main-line card one block earlier (-1) or later (1). Returns why not, if it can't. */
export function moveBlock(d: Lesson, id: string, dir: -1 | 1): string | null {
  if (!movable(d, id)) return d.nodes[id]?.type === "summary" ? "The summary stays at the end." : "Cards inside a branch move with their decision.";
  const line = mainLine(d);
  const i = line.indexOf(id);
  const neighbour = line[i + dir];
  if (!neighbour) return dir === 1 ? "Already at the end." : "Already first.";
  if (dir === 1 && d.nodes[neighbour].type === "summary") return "The summary stays at the end.";
  const after = exitOf(d, id);
  // Take the card out: whatever led to it now leads to whatever came after it.
  redirect(d, id, after ?? "", id);
  if (d.start === id) d.start = after ?? id;
  if (dir === 1) {
    const before = exitOf(d, neighbour);
    placeBefore(d, id, before, neighbour);
    // Past a decision, take the step of the card it now sits in front of, so it isn't mistaken for a branch.
    d.nodes[id].beat = d.nodes[neighbour].type === "decision" && before ? d.nodes[before].beat : d.nodes[neighbour].beat;
  } else {
    placeBefore(d, id, neighbour);
    d.nodes[id].beat = d.nodes[neighbour].beat;
  }
  return null;
}

/**
  Moves a main-line card to position `to` on the main line, one checked step at a time (the same
  steps as the arrow buttons). Returns why not if a step isn't allowed; `d` may then be part-moved,
  so try it on a copy first.
*/
export function moveToPosition(d: Lesson, id: string, to: number): string | null {
  let i = mainLine(d).indexOf(id);
  if (i < 0) return "Cards inside a branch move with their decision.";
  while (i !== to) {
    const why = moveBlock(d, id, to > i ? 1 : -1);
    if (why) return why;
    const next = mainLine(d).indexOf(id);
    if (next === i) return "That card can’t move there.";
    i = next;
  }
  return null;
}

/**
  Where a card can be dropped when dragged: each gap on the main line it can reach, named by the
  card it would sit in front of (`before`, or null for the very end) and the position it ends up at.
*/
export function dropTargets(l: Lesson, id: string): { before: string | null; to: number }[] {
  if (!movable(l, id)) return [];
  const line = mainLine(l);
  const from = line.indexOf(id);
  const out: { before: string | null; to: number }[] = [];
  for (let gap = 0; gap <= line.length; gap++) {
    // The gaps either side of the card itself would leave it where it is.
    if (gap === from || gap === from + 1) continue;
    const to = gap > from ? gap - 1 : gap;
    const trial = structuredClone(l);
    if (moveToPosition(trial, id, to) === null && mainLine(trial).indexOf(id) === to) out.push({ before: line[gap] ?? null, to });
  }
  return out;
}

/** Where a new card goes after the selected one: before whatever comes next on the main line. Never after the summary. */
export function insertAfterCard(d: Lesson, fresh: Card, afterId: string | undefined) {
  d.nodes[fresh.id] = fresh;
  const line = mainLine(d);
  const picked = afterId ? d.nodes[afterId] : undefined;
  // Inside a branch: slot it straight after the selected card, staying in that branch.
  if (picked && !line.includes(picked.id) && isLinear(picked)) {
    setExit(d, fresh.id, picked.next ?? "");
    picked.next = fresh.id;
    fresh.beat = picked.beat;
    return;
  }
  let anchor = afterId && line.includes(afterId) ? afterId : line.at(-1);
  if (anchor && d.nodes[anchor].type === "summary") anchor = line[line.indexOf(anchor) - 1];
  if (!anchor) {
    setExit(d, fresh.id, d.start);
    d.start = fresh.id;
    return;
  }
  const before = exitOf(d, anchor) ?? (d.nodes[line.at(-1)!].type === "summary" && anchor !== line.at(-1) ? line.at(-1)! : null);
  placeBefore(d, fresh.id, before, anchor);
  fresh.beat = d.nodes[anchor].type === "decision" && before ? d.nodes[before].beat : d.nodes[anchor].beat;
}
