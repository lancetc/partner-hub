/*
  Which parts of the homepage each person gets (the owner, Nov 2026: one long page for everyone was too much). The page
  keeps what a role uses most; the rest is still a click away under "More on the Hub" at the bottom. Whatever is shown,
  its contents are already filtered to the person (their courses, their audience, their organisation).

  - Supplier (a partner's worker): what needs doing, practice, Favourites and the news.
  - Care Partner (a partner organisation's administrator): the same; the practice row carries their business tool.
  - Care Coordinator: those, plus the people they follow and Lives in Progress (the stories they train on).
  - Trilogy staff: what needs doing, practice, Favourites and the news.
  - Authors and administrators: everything, so they see the whole Hub they look after.
*/

export type HomePart = "practise" | "following" | "favourites" | "lives" | "news" | "community";
export type HomeViewer = { role: string; audience: string; canAuthor: boolean };

const ALL: HomePart[] = ["practise", "following", "favourites", "lives", "news", "community"];

export function homeParts(v: HomeViewer): HomePart[] {
  if (v.canAuthor) return ALL;
  if (v.audience === "coordinator") return ["practise", "following", "favourites", "lives", "news"];
  return ["practise", "favourites", "news"];
}

/** Where to find each part that isn't on someone's homepage. */
export const MORE_LINKS: Partial<Record<HomePart, { href: string; label: string; text: string }>> = {
  lives: { href: "/community/moments", label: "Lives in Progress", text: "Little moments from the people we support." },
  community: { href: "/community", label: "Community and challenges", text: "Questions, wins and friendly competition." },
};

/** The "More on the Hub" links for what this person's homepage leaves out, in page order. */
export const moreFor = (v: HomeViewer) => ALL.filter((p) => !homeParts(v).includes(p) && MORE_LINKS[p]).map((p) => ({ part: p, ...MORE_LINKS[p]! }));
