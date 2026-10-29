/* Demonstration resources. Links point to the public Trilogy site until real documents exist. */

export type Resource = {
  id: string;
  title: string;
  kind: "Guide" | "Template" | "Process" | "Contact";
  description: string;
  audience: ("partner" | "coordinator")[];
  updated: string;
  points: string[];
};

export const resources: Resource[] = [
  {
    id: "hub-guide",
    title: "Getting around the Partner Hub",
    kind: "Guide",
    description: "Where to find news, topics, onboarding and saved items.",
    audience: ["partner", "coordinator"],
    updated: "2026-10-20",
    points: [
      "News shows the latest stories and policy updates",
      "Learning shows assigned topics and your progress",
      "My onboarding lists what is with you and what is with us",
    ],
  },
  {
    id: "change-request-guide",
    title: "Confirming a change to a visit",
    kind: "Process",
    description: "Steps to follow when a client asks for more time or a different task.",
    audience: ["partner", "coordinator"],
    updated: "2026-10-20",
    points: ["Say you’re happy to check", "Contact the coordinator before you agree", "Record what was confirmed in your visit note"],
  },
  {
    id: "visit-note-template",
    title: "Visit note template",
    kind: "Template",
    description: "A short structure for useful visit notes.",
    audience: ["partner"],
    updated: "2026-10-13",
    points: ["What you did", "What you noticed", "What someone else needs to know"],
  },
  {
    id: "escalation-guide",
    title: "When and how to escalate",
    kind: "Process",
    description: "For coordinators: signs that need prompt follow-up and who to contact.",
    audience: ["coordinator"],
    updated: "2026-10-17",
    points: ["Falls, sudden changes in health or behaviour, and safety concerns", "Follow up the same day", "Record the escalation and outcome"],
  },
  {
    id: "support-contacts",
    title: "Support contacts",
    kind: "Contact",
    description: "Who to contact about onboarding, payments or the hub itself.",
    audience: ["partner", "coordinator"],
    updated: "2026-10-20",
    points: [
      "Onboarding questions: your partner onboarding contact (demo)",
      "Visit changes: your care coordinator",
      "Hub feedback: use the feedback link in any topic",
    ],
  },
];
