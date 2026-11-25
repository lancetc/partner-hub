import type { Metadata } from "next";
import { LivesAdmin } from "@/components/admin/LivesAdmin";

export const metadata: Metadata = { title: "Lives in Progress" };

export default function Page() {
  return <LivesAdmin />;
}
