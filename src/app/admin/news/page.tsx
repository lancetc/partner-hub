import type { Metadata } from "next";
import { NewsList } from "@/components/admin/NewsAdmin";

export const metadata: Metadata = { title: "News" };

export default function AdminNewsPage() {
  return <NewsList />;
}
