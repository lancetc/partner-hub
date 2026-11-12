import type { Metadata } from "next";
import { WebinarIndex } from "@/components/Webinars";

export const metadata: Metadata = {
  title: "Webinars",
  description: "Recorded Trilogy Care webinars for Care Partners and care coordinators: Support at Home, care coordination and working with Trilogy.",
  alternates: { canonical: "/webinars" },
};

export default function WebinarsPage() {
  return <WebinarIndex />;
}
