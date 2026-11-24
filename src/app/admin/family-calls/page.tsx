import type { Metadata } from "next";
import { FamilyCallsAdmin } from "@/components/admin/FamilyCallsAdmin";

export const metadata: Metadata = { title: "Tough Family Calls" };

export default function AdminFamilyCallsPage() {
  return <FamilyCallsAdmin />;
}
