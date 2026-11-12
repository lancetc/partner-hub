import type { Metadata } from "next";
import { JourneyMap } from "@/components/journey/JourneyMap";

export const metadata: Metadata = {
  title: "Client journey",
  description: "The Trilogy Care client journey from enquiry to exit: what the client does, what Trilogy Care does, and how each stage feels.",
  alternates: { canonical: "/journey" },
};

export default function JourneyPage() {
  return <JourneyMap />;
}
