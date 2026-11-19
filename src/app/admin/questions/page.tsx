import type { Metadata } from "next";
import { Suspense } from "react";
import { QuestionPool } from "@/components/admin/QuestionPool";

export const metadata: Metadata = { title: "Question Pool" };

export default function AdminQuestionsPage() {
  // The filters live in the address, so the table reads them once it's in the browser.
  return (
    <Suspense>
      <QuestionPool />
    </Suspense>
  );
}
