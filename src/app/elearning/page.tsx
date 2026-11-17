import type { Metadata } from "next";
import { ElearningIndex } from "@/components/elearning/ElearningIndex";

export const metadata: Metadata = {
  title: "eLearning",
  description: "eLearning courses built in Articulate Rise and Storyline, tracked alongside your other learning in the Partner Hub.",
};

export default function ElearningPage() {
  return <ElearningIndex />;
}
