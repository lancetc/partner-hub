import type { Metadata } from "next";
import { PlaybooksAdmin } from "@/components/admin/PlaybooksAdmin";

export const metadata: Metadata = { title: "Playbooks" };

export default function AdminPlaybooksPage() {
  return <PlaybooksAdmin />;
}
