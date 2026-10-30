import { Suspense } from "react";
import type { Metadata } from "next";
import { Unsubscribe } from "@/components/Unsubscribe";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false } };

/** Where the unsubscribe link in newsletters lands. Nothing changes until the person presses the button. */
export default function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <Suspense>
        <Token searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Token({ searchParams }: Pick<PageProps<"/unsubscribe">, "searchParams">) {
  const t = (await searchParams).t;
  return <Unsubscribe token={typeof t === "string" ? t : ""} />;
}
