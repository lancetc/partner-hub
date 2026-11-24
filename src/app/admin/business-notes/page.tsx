import type { Metadata } from "next";
import { BusinessNotesAdmin } from "@/components/admin/BusinessNotesAdmin";

export const metadata: Metadata = { title: "Business Field Notes" };

/** The Business Field Notes library for editors (docs/business-field-notes.md). Authors only: the API checks. */
export default function AdminBusinessNotesPage() {
  return <BusinessNotesAdmin />;
}
