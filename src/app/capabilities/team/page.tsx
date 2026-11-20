import type { Metadata } from "next";
import { TeamCapabilities } from "@/components/capability/TeamCapabilities";

export const metadata: Metadata = { title: "My team’s capabilities", robots: { index: false, follow: false } };

/** A manager's page: the people who report to them, and the observations waiting for them. */
export default function TeamCapabilitiesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6 lg:pt-6">
      <h1 className="font-serif text-4xl font-semibold tracking-tight">My team’s capabilities</h1>
      <TeamCapabilities />
    </div>
  );
}
