import type { Metadata } from "next";
import { HiringRunwayAdmin } from "@/components/admin/HiringRunwayAdmin";

export const metadata: Metadata = { title: "Hiring Runway" };

export default function AdminHiringRunwayPage() {
  return <HiringRunwayAdmin />;
}
