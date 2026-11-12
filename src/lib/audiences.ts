/*
  Who a topic is written for, in the roles people use at Trilogy Care. A topic can have several.
  Separate from the topic's track (everyone, Care Partners, coordinators, policy briefing), which
  still decides recommendations and who a topic counts for in completion reports.
*/

export const AUDIENCES = [
  "New Care Coordinators",
  "Care Coordinators",
  "Care Coordinators and Care Partners",
  "Care Partner owners",
  "Established Care Coordinators",
  "Relationship Managers",
  "Partnership Managers",
] as const;

export type Audience = (typeof AUDIENCES)[number];

/** Only known audiences, each once, in the list's own order. */
export function cleanAudiences(value: unknown): Audience[] {
  const picked = new Set(Array.isArray(value) ? value : []);
  return AUDIENCES.filter((a) => picked.has(a));
}
