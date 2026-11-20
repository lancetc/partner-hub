import type { Metadata } from "next";
import { ProblemDesk } from "@/components/admin/problems/ProblemDesk";

export const metadata: Metadata = { title: "Problem desk" };

export default function AdminProblemsPage() {
  return <ProblemDesk />;
}
