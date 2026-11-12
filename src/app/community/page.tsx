import type { Metadata } from "next";
import { Community } from "@/components/community/Community";

export const metadata: Metadata = {
  title: "Community",
  description: "Care Partners and coordinators across Australia learning from each other: posts, questions, events and people to ask.",
  alternates: { canonical: "/community" },
};

export default function CommunityPage() {
  return <Community />;
}
