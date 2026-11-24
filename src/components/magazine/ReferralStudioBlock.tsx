"use client";

import { useState } from "react";
import type { ReferralStudioBlock as Block } from "@/lib/magazine";
import type { StudioDebrief } from "@/lib/referralStudio";
import { REFERRAL_CLAIMS } from "@/content/referralStudio";
import { ReferralPractice } from "../referral/ReferralPractice";
import { localDriver, serverDriver, type Driver } from "../referral/practiceDriver";

/*
  A Local Referral Studio block (docs/local-referral-studio.md): the same practice as the Work Tool, on the course's own
  reviewed scenarios. The outreach kit stays in the Work Tool, linked from the debrief for people who may use it. In
  the editor's preview it runs on the author's copy, locally, on the reviewed script.
*/
export function ReferralStudioBlockView({
  block: b,
  guideId,
  preview,
  onFinished,
}: {
  block: Block;
  guideId: string;
  preview?: boolean;
  onFinished: (d: StudioDebrief) => void;
}) {
  const [driver] = useState<Driver>(() =>
    preview ? localDriver(b.scenarios, REFERRAL_CLAIMS, "") : serverDriver(`/api/magazine/${guideId}/referral-studio`, { blockId: b.id }),
  );
  return (
    <div className="mx-auto w-full max-w-[56rem] rounded-3xl bg-surface p-4 ring-1 ring-line sm:p-6">
      <p className="font-mulish text-sm font-extrabold uppercase tracking-[0.12em] text-accent">Local Referral Studio · practice</p>
      <h2 className="mt-1 font-serif text-2xl font-semibold">{b.title}</h2>
      {b.intro && <p className="mt-2">{b.intro}</p>}
      {b.ava.brief && <p className="mt-2 text-sm text-ink-muted">{b.ava.brief}</p>}
      {preview && <p className="mt-2 rounded-xl bg-muted p-3 text-sm">Preview: the reviewed script runs here, on your copy. Nothing is stored or sent.</p>}
      <div className="mt-4">
        <ReferralPractice driver={driver} onFinished={onFinished} preview={preview} />
      </div>
    </div>
  );
}
