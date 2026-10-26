import type { Metadata } from "next";
import { WebinarIndex } from "@/components/Webinars";

export const metadata: Metadata = { title: "Webinars" };

export default function WebinarsPage() {
  return <WebinarIndex />;
}
