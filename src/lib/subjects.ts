import type { IconName } from "@/components/Icon";

/** What topics are about, for browsing the Learning page. Each topic has one; authors set it in the topic's Details tab. */
export const SUBJECTS = [
  { id: "getting-started", label: "Getting started", icon: "spark" },
  { id: "trilogy", label: "About Trilogy Care", icon: "building" },
  { id: "sector", label: "The aged care system", icon: "landmark" },
  { id: "rights", label: "Rights and choice", icon: "heart" },
  { id: "incidents", label: "Incidents and safety", icon: "shield" },
  { id: "coordination", label: "Care coordination", icon: "clipboard" },
  { id: "funding", label: "Funding and budgets", icon: "money" },
  { id: "compliance", label: "Compliance and quality", icon: "checklist" },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

export type SubjectId = (typeof SUBJECTS)[number]["id"];
export const isSubject = (v: unknown): v is SubjectId => SUBJECTS.some((s) => s.id === v);
export const subjectLabel = (id?: string | null) => SUBJECTS.find((s) => s.id === id)?.label ?? "Other";
