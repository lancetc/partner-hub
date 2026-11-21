import { Suspense } from "react";
import type { Metadata } from "next";
import { SignalTheme } from "@/components/admin/signal/SignalTheme";

export const metadata: Metadata = { title: "Signal Room theme" };

export default function AdminSignalThemePage({ params }: PageProps<"/admin/signal-room/[id]">) {
  return (
    <Suspense>
      <Theme params={params} />
    </Suspense>
  );
}

async function Theme({ params }: Pick<PageProps<"/admin/signal-room/[id]">, "params">) {
  const { id } = await params;
  return <SignalTheme id={id} />;
}
