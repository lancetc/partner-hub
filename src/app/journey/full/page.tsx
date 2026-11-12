import type { Metadata } from "next";
import { JourneyFull } from "@/components/journey/JourneyMap";

export const metadata: Metadata = {
  title: "Client journey, full screen",
  description: "The Trilogy Care client journey from enquiry to exit, stage by stage, filling the window.",
  alternates: { canonical: "/journey" },
};

/** The journey road on its own, opened in a new tab from the Journey map's Full screen link. */
export default function JourneyFullPage() {
  return <JourneyFull />;
}
