import type { Metadata } from "next";
import { CareConversations } from "@/components/conversations/CareConversations";

export const metadata: Metadata = {
  title: "Care Conversations",
  description: "A conversation card game for Care Partners and coordinators: draw a card, reflect, talk it over as a team and learn from each other.",
  alternates: { canonical: "/play/conversations" },
};

export default function CareConversationsPage() {
  return <CareConversations />;
}
