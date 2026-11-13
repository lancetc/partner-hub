import { Suspense } from "react";
import type { Metadata } from "next";
import { Unsubscribe } from "@/components/Unsubscribe";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false } };

/** Where the link at the bottom of every email lands: stop that kind of email, or change every email choice. */
export default function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Suspense>
        <Token searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Token({ searchParams }: Pick<PageProps<"/unsubscribe">, "searchParams">) {
  const { t, topic } = await searchParams;
  return <Unsubscribe token={typeof t === "string" ? t : ""} topic={typeof topic === "string" ? topic : null} />;
}
