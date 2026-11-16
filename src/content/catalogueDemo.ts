/*
  Demonstration figures for the Topics rows ("Recently added", "Popular with your colleagues"), so the
  prototype shows what they look like before there's real data. Real data always wins:
  - a topic's real publish date replaces its date here;
  - once the hub has enough real completions to rank by (server/catalogue, POPULAR_REAL_MIN), these
    counts aren't used at all.
  Topics not listed simply have no demo figures.
*/

export const demoAddedAt: Record<string, string> = {
  "extra-time-briefing": "2026-11-10T00:00:00.000Z",
  "noticing-a-change": "2026-10-28T00:00:00.000Z",
  "a-little-extra-time": "2026-10-14T00:00:00.000Z",
  "our-mission-and-model": "2026-09-02T00:00:00.000Z",
  "legislative-framework": "2026-07-21T00:00:00.000Z",
};

export const demoCompletions: Record<string, number> = {
  "legislative-framework": 142,
  "a-little-extra-time": 96,
  "noticing-a-change": 61,
  "our-mission-and-model": 38,
  "extra-time-briefing": 17,
};
