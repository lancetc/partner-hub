import type { Metadata } from "next";
import { CompletionsOverview } from "@/components/admin/Completions";

export const metadata: Metadata = { title: "Completions" };

export default function AdminCompletionsPage() {
  return <CompletionsOverview />;
}
