import type { Metadata } from "next";
import { ComplianceRegister } from "@/components/admin/ComplianceRegister";

export const metadata: Metadata = { title: "Compliance register" };

export default function AdminCompliancePage() {
  return <ComplianceRegister />;
}
