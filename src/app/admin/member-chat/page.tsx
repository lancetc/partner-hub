import type { Metadata } from "next";
import { MemberChatAdmin } from "@/components/admin/MemberChatAdmin";

export const metadata: Metadata = { title: "Digital Member chat" };

export default function Page() {
  return <MemberChatAdmin />;
}
