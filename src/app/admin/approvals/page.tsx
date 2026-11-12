import type { Metadata } from "next";
import { Approvals } from "@/components/admin/Approvals";

export const metadata: Metadata = { title: "Approvals" };

export default function AdminApprovalsPage() {
  return <Approvals />;
}
