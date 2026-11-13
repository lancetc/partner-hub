import type { Metadata } from "next";
import { Inbox } from "@/components/Inbox";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Inbox", robots: { index: false, follow: false } };

export default function InboxPage() {
  return <Inbox />;
}
