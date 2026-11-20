import type { Metadata } from "next";
import { DiscoveryGaps } from "@/components/admin/DiscoveryGaps";

export const metadata: Metadata = { title: "Discovery gaps" };

export default function AdminDiscoveryPage() {
  return <DiscoveryGaps />;
}
