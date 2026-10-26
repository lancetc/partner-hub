import type { Metadata } from "next";
import { AdminHome } from "@/components/admin/AdminHome";

export const metadata: Metadata = { title: "Spaced schedules" };

export default function SchedulesPage() {
  return <AdminHome />;
}
