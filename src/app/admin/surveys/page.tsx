import type { Metadata } from "next";
import { SurveyList } from "@/components/admin/Surveys";

export const metadata: Metadata = { title: "Surveys" };

export default function SurveysPage() {
  return <SurveyList />;
}
