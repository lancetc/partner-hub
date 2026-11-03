import type { Metadata } from "next";
import { AllComments } from "@/components/admin/AllComments";

export const metadata: Metadata = { title: "Comments" };

export default function AdminCommentsPage() {
  return <AllComments />;
}
