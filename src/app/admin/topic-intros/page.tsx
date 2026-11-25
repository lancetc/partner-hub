import type { Metadata } from "next";
import { TopicIntroManager } from "@/components/admin/TopicIntroManager";

export const metadata: Metadata = { title: "Topic introductions" };

export default function AdminTopicIntrosPage() {
  return <TopicIntroManager />;
}
