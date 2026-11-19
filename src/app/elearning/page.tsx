import { redirect } from "next/navigation";

/* The eLearning courses now live in Magazine; old links to eLearn land on them there. A course's player stays at /elearning/[id]. */
export default function ElearnPage() {
  redirect("/magazine?kind=elearning");
}
