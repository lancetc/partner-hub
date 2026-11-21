import type { Metadata } from "next";
import { ReturnList } from "@/components/admin/living/ReturnList";

export const metadata: Metadata = { title: "Return episodes" };

export default function Page() {
  return <ReturnList />;
}
