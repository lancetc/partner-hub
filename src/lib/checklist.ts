import type { Card } from "@/content/lessons";

/*
  Checklist cards: which items a learner has ticked (kept in their progress as a comma-separated
  list of item ids), and whether they can move on.
*/

type ChecklistCard = Extract<Card, { type: "checklist" }>;

export const tickedFrom = (value: unknown) =>
  String(value ?? "")
    .split(",")
    .filter(Boolean);

/** True once every item is ticked (ids no longer on the card don't count). */
export const allTicked = (card: Pick<ChecklistCard, "items">, ticked: string[]) => card.items.length > 0 && card.items.every((i) => ticked.includes(i.id));

/** Learners can continue unless the author asked for every item to be ticked. */
export const checklistDone = (card: Pick<ChecklistCard, "items" | "requireAll">, ticked: string[]) => !card.requireAll || allTicked(card, ticked);
