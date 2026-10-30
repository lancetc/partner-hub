import type { Metadata } from "next";
import { ProfileSettings } from "@/components/ProfileSettings";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Profile and settings", robots: { index: false, follow: false } };

export default function SettingsPage() {
  return <ProfileSettings />;
}
