import type { Metadata } from "next";
import { CampaignList } from "@/components/admin/EmailCampaigns";

export const metadata: Metadata = { title: "Email campaigns" };

export default function EmailPage() {
  return <CampaignList />;
}
