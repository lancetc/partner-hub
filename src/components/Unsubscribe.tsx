"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { isEmailTopic, topicLabel, type TopicSetting } from "@/lib/emailTopics";
import { EmailSettings } from "./EmailSettings";
import { Icon } from "./Icon";

/*
  Where the link at the bottom of an email lands, without signing in (the link's code says who).
  With a topic (?topic=policy): one button to stop that kind of email, nothing changes until it's
  pressed. Then, or without a topic, every email choice for this person.
*/

export function Unsubscribe({ token, topic }: { token: string; topic: string | null }) {
  const known = isEmailTopic(topic) ? topic : null;
  const prefs = useApi<{ firstName: string; topics: TopicSetting[] }>(token ? `/api/unsubscribe?t=${encodeURIComponent(token)}` : null);
  const [stopped, setStopped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/unsubscribe", { body: { token, topic: known, subscribe: false } });
      setStopped(true);
      setKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token)
    return (
      <Card>
        <h1 className="font-serif text-3xl font-semibold">Email preferences</h1>
        <p className="mt-3 text-ink-muted">This link is missing its code. Use the link at the bottom of an email, or sign in and go to Profile and settings.</p>
      </Card>
    );
  if (prefs.error)
    return (
      <Card>
        <h1 className="font-serif text-3xl font-semibold">Email preferences</h1>
        <p className="mt-3 text-ink-muted">{prefs.error}</p>
      </Card>
    );

  const alreadyOff = known && prefs.data?.topics.find((t) => t.id === known)?.on === false;
  return (
    <div className="flex flex-col gap-5">
      {known && (
        <Card>
          <h1 className="font-serif text-3xl font-semibold">{prefs.data?.firstName ? `${prefs.data.firstName}, stop these emails?` : "Stop these emails?"}</h1>
          {stopped || alreadyOff ? (
            <p className="mt-3 flex items-start gap-2">
              <Icon name="check" className="mt-1 size-5 shrink-0 text-accent" /> You won’t get {topicLabel(known).toLowerCase()} by email any more. They’ll
              still be in your Inbox when you sign in.
            </p>
          ) : (
            <>
              <p className="mt-3">
                You’ll stop getting <strong>{topicLabel(known).toLowerCase()}</strong> by email. Everything else stays as it is.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={stop}
                className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full bg-action px-6 font-semibold text-on-action hover:bg-action-hover disabled:opacity-50"
              >
                {busy ? "Saving…" : "Unsubscribe"}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
        </Card>
      )}
      <Card>
        <h2 className="font-serif text-2xl font-semibold">{known ? "All your email choices" : "Email preferences"}</h2>
        <p className="mb-4 mt-1 text-ink-muted">Choose which emails you get from the Partner Hub. Changes save straight away.</p>
        <EmailSettings key={key} token={token} highlight={known} />
      </Card>
      <Link href="/" className="text-sm text-ink-muted underline-offset-4 hover:underline">
        Go to the Partner Hub
      </Link>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-line bg-surface p-6">{children}</div>;
}
