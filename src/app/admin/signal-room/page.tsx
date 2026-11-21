import type { Metadata } from "next";
import { SignalRoom } from "@/components/admin/signal/SignalRoom";

export const metadata: Metadata = { title: "Signal Room" };

export default function Page() {
  return <SignalRoom />;
}
