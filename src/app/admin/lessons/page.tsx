import type { Metadata } from "next";
import { LessonsAdmin } from "@/components/admin/LessonsAdmin";

export const metadata: Metadata = { title: "Lessons" };

export default function AdminLessonsPage() {
  return <LessonsAdmin />;
}
