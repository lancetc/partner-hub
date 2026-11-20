import type { Metadata } from "next";
import { CapabilityInsights } from "@/components/admin/CapabilityInsights";

export const metadata: Metadata = { title: "Capability Insights" };

export default function AdminCapabilitiesPage() {
  return <CapabilityInsights />;
}
