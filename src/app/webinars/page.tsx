import type { Metadata } from "next";
import { WebinarIndex } from "@/components/Webinars";

export const metadata: Metadata = {
  title: "Webinars",
  description: "Recorded Trilogy Care webinars for service partners and care coordinators: Support at Home, care coordination and working with Trilogy.",
  alternates: { canonical: "/webinars" },
};

export default function WebinarsPage() {
  return <WebinarIndex />;
}
