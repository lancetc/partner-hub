import type { Metadata } from "next";
import { WebinarEditor } from "@/components/admin/WebinarsAdmin";

export const metadata: Metadata = { title: "Add a webinar" };

export default function NewWebinarPage() {
  return <WebinarEditor />;
}
