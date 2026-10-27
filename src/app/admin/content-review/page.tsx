import type { Metadata } from "next";
import { ContentReview } from "@/components/admin/ContentReview";

export const metadata: Metadata = { title: "Content review" };

export default function AdminContentReviewPage() {
  return <ContentReview />;
}
