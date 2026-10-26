import type { Metadata } from "next";
import { OutboxView } from "@/components/admin/OutboxView";

export const metadata: Metadata = { title: "Notifications" };

export default function OutboxPage() {
  return <OutboxView />;
}
