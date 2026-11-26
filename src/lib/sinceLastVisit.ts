/*
  "Since your last visit": one plain sentence about what's new for this person, built from their Inbox,
  so there's a reason to come back without another email. Rules for now; an AI summary written from
  approved content and the person's role could replace it later.
*/

export type VisitItem = {
  kind: "action" | "update" | "activity";
  category: string;
  priority: "critical" | "high" | "normal";
  title: string;
  at: string;
  dueAt: string | null;
  done: boolean;
};

const n = (count: number, one: string, many: string) =>
  `${count === 1 ? "one" : count === 2 ? "two" : count === 3 ? "three" : count} ${count === 1 ? one : many}`;

/**
  The summary, or null when there's nothing to say. `last` null means a first visit: everything counts. Its `lead` says
  which it is (the owner, Nov 2026): "Since your last visit" only when something is new; "Coming up" when it's only
  something due soon; "Here's what's waiting" on a first visit. Starting courses (Getting started) are never in it: the
  homepage's "Your courses and training" carries them, without the pressure.
*/
export function sinceLastVisit(all: VisitItem[], last: string | null, now: Date): { lead: string; text: string } | null {
  const items = all.filter((i) => i.category !== "Getting started");
  const fresh = items.filter((i) => !last || i.at > last);
  const parts: string[] = [];

  const important = fresh.filter((i) => i.priority === "critical" || (i.kind === "action" && i.category.toLowerCase().includes("acknowledg")));
  if (important.length === 1) parts.push(`one important update, “${important[0].title}”`);
  else if (important.length > 1) parts.push(n(important.length, "important update", "important updates"));

  const community = fresh.filter((i) => i.category === "Community");
  if (community.length) parts.push(`${n(community.length, "new Community reply", "new Community replies")} for you`);

  const webinars = fresh.filter((i) => /webinar|event/i.test(i.category));
  if (webinars.length)
    parts.push(webinars.length === 1 ? `a webinar coming up, “${webinars[0].title}”` : n(webinars.length, "webinar update", "webinar updates"));

  const learning = fresh.filter((i) => /learning|news/i.test(i.category) && i.kind === "update");
  if (learning.length) parts.push(n(learning.length, "new thing to read or learn", "new things to read or learn"));

  // Something due within two weeks is worth saying even if it isn't new.
  const soon = items.find((i) => i.kind === "action" && !i.done && i.dueAt && Date.parse(i.dueAt) - now.getTime() < 14 * 86_400_000 && !important.includes(i));

  if (!parts.length && !soon) return null;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
  const due = soon ? `${soon.title.replace(/\s+due$/i, "")} is due soon.` : "";
  const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (!list) return { lead: last ? "Coming up" : "Here’s what’s waiting", text: due };
  return { lead: last ? "Since your last visit" : "Here’s what’s waiting", text: `${sentence(list)}.${due ? ` ${due}` : ""}` };
}
