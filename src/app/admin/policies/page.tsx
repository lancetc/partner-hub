import type { Metadata } from "next";
import { PolicyAcksAdmin } from "@/components/admin/PolicyAcksAdmin";

export const metadata: Metadata = { title: "Policy acknowledgements" };

export default function PolicyAcknowledgementsPage() {
  return <PolicyAcksAdmin />;
}
