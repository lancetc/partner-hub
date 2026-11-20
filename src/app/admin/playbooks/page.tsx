import type { Metadata } from "next";
import { PlaybooksAdmin } from "@/components/admin/PlaybooksAdmin";

export const metadata: Metadata = { title: "Job Aids" };

export default function AdminPlaybooksPage() {
  return <PlaybooksAdmin />;
}
