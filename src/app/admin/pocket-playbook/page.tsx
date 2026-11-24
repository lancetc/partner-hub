import type { Metadata } from "next";
import { PocketPlaybookAdmin } from "@/components/admin/PocketPlaybookAdmin";

export const metadata: Metadata = { title: "Live Call Pocket Playbook" };

export default function AdminPocketPlaybookPage() {
  return <PocketPlaybookAdmin />;
}
