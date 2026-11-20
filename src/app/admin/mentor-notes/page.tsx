import type { Metadata } from "next";
import { MentorNotesAdmin } from "@/components/admin/MentorNotesAdmin";

export const metadata: Metadata = { title: "Mentor notes" };

export default function AdminMentorNotesPage() {
  return <MentorNotesAdmin />;
}
