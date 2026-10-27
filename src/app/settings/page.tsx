import type { Metadata } from "next";
import { ProfileSettings } from "@/components/ProfileSettings";

export const metadata: Metadata = { title: "Profile and settings" };

export default function SettingsPage() {
  return <ProfileSettings />;
}
