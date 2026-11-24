import type { Metadata } from "next";
import { ReferralStudioAdmin } from "@/components/admin/ReferralStudioAdmin";

export const metadata: Metadata = { title: "Local Referral Studio" };

export default function AdminReferralStudioPage() {
  return <ReferralStudioAdmin />;
}
