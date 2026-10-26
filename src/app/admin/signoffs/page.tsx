import type { Metadata } from "next";
import { Signoffs } from "@/components/admin/Signoffs";

export const metadata: Metadata = { title: "Sign-offs" };

export default function SignoffsPage() {
  return <Signoffs />;
}
