import type { Metadata } from "next";
import { WebinarList } from "@/components/admin/WebinarsAdmin";

export const metadata: Metadata = { title: "Webinars" };

export default function AdminWebinarsPage() {
  return <WebinarList />;
}
