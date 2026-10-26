import { Suspense } from "react";
import type { Metadata } from "next";
import { SurveyEditor } from "@/components/admin/Surveys";

export const metadata: Metadata = { title: "Survey" };

export default function SurveyPage({ params }: PageProps<"/admin/surveys/[id]">) {
  return (
    <Suspense>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/surveys/[id]">, "params">) {
  const { id } = await params;
  return <SurveyEditor id={id} />;
}
