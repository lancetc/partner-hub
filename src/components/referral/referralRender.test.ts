import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReferralStudioBlock } from "@/lib/magazine";
import { kitStatus, templateClaims } from "@/lib/referralKit";
import { KIT_TEMPLATE, LOCAL_REFERRAL_STUDIO_DATA, REFERRAL_CLAIMS, STUDIO_SCENARIOS } from "@/content/referralStudio";
import type { PracticeView, StudioHome } from "@/server/referralStudio";
import { ReferralPractice } from "./ReferralPractice";
import { OutreachKit } from "./OutreachKit";
import { localDriver } from "./practiceDriver";
import { ReferralStudioEdit } from "../admin/MagazineReferralStudioEdit";

/*
  The Local Referral Studio's screens, rendered as the server sends them at each stage (docs/local-referral-studio.md):
  every choice is a labelled field, the phone view leads with the referrer, the stage and a large reply box, critical
  claims come first in the debrief, the kit marks locked and editable text and never says "sent", and the editor shows
  its case check and sign-off list. (Interaction in the running app is checked in the browser; these pin the markup.)
*/

const HOSPITAL = STUDIO_SCENARIOS.find((x) => x.id === "hospital-discharge")!;
const render = (initial: PracticeView) =>
  renderToStaticMarkup(createElement(ReferralPractice, { driver: localDriver(STUDIO_SCENARIOS, REFERRAL_CLAIMS, ""), initial }));
/** Drives the same local engine the editor's preview uses, to each screen. */
async function viewAfter(steps: Record<string, unknown>[]) {
  const d = localDriver(STUDIO_SCENARIOS, REFERRAL_CLAIMS, "2026-11-24");
  let v = await d.load();
  for (const s of steps) v = await d.act(s);
  return v;
}
const start = { action: "start", scenarioId: HOSPITAL.id, stage: "unknown" };

describe("the practice screens", () => {
  it("choosing: the referrers, the stage with “unknown” offered, and the privacy notice", async () => {
    const html = render(await viewAfter([]));
    expect(html).toContain("Hospital social worker");
    expect(html).toContain("GP practice manager");
    expect(html).toMatch(/Unknown.{0,40}is a valid choice/);
    expect(html).toMatch(/Don’t enter a real person’s name, date of birth, Medicare number/);
    expect(html).toMatch(/Training mode/);
  });

  it("talking: the referrer, the stage and a large reply box first; evidence on its own tab; the timer is off until asked", async () => {
    const html = render(
      await viewAfter([start, { action: "turn", turnId: "t1", text: "Tomorrow is tight. Do you know if she’s had an aged care assessment?" }]),
    );
    const order = ["Hospital social worker", "Stage you chose", "Your reply", "Evidence"].map((w) => html.indexOf(w));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect(order[2]).toBeLessThan(html.indexOf("Approved wording (claim register)"));
    expect(html).toContain("Use a 60-second coaching timer");
    expect(html).not.toMatch(/s left/);
    expect(html).toMatch(/role="tab"/);
    expect(html).toContain("nobody’s seen a letter");
  });

  it("the debrief: critical claims first, with the exact words, the approved correction and its source; no “sent”, no promise of service", async () => {
    const html = render(
      await viewAfter([
        start,
        { action: "turn", turnId: "t1", text: "Yes, we offer same-day care, so we can have someone there tomorrow." },
        { action: "end", how: "end" },
        { action: "submit", note: { agreed: "Someone will be there", owner: "Me", nextContact: "Tomorrow morning", actions: [] } },
      ]),
    );
    const critical = html.indexOf("Critical claims, first");
    expect(critical).toBeGreaterThan(0);
    expect(critical).toBeLessThan(html.indexOf("The scorecard"));
    expect(html).toContain("Yes, we offer same-day care, so we can have someone there tomorrow.");
    expect(html).toContain("doesn’t mean services start within 24 hours");
    expect(html).toContain("https://trilogycare.com.au/same-day-sign-on");
    expect(html).toContain("Try again");
    expect(html).not.toMatch(/services? (?:is|are) confirmed|\bsent\b/i);
  });
});

describe("the outreach kit", () => {
  it("marks locked and editable text, shows the draft mark and the review checklist, and never says it was sent", () => {
    const home = {
      kit: {
        template: KIT_TEMPLATE,
        register: REFERRAL_CLAIMS,
        status: kitStatus(KIT_TEMPLATE, REFERRAL_CLAIMS, "2026-11-24"),
        dependsOn: templateClaims(KIT_TEMPLATE),
        businessName: "Demo Care",
        today: "2026-11-24",
      },
    } as unknown as Extract<StudioHome, { kit: unknown }>;
    const html = renderToStaticMarkup(createElement(OutreachKit, { home, initial: { stage: "assessment" }, onSaved: () => {} }));
    expect(html).toContain("Draft — review required");
    expect(html).toContain("Only these can change");
    expect(html).toContain("<mark");
    expect(html).toContain("Refer for an aged care assessment through My Aged Care first");
    expect(html).toContain("A public practice email address alone isn’t permission.");
    expect(html).toMatch(/Not sent\. Copying or downloading a draft doesn’t send it/);
    expect(html.match(/Copy this draft/g)).toHaveLength(3);
  });
});

describe("the editor", () => {
  it("shows the scenario check, the claims it depends on and the sign-off still to record", () => {
    const block = { id: "b1", type: "referralstudio", ...structuredClone(LOCAL_REFERRAL_STUDIO_DATA) } as ReferralStudioBlock;
    const html = renderToStaticMarkup(createElement(ReferralStudioEdit, { block, update: () => {} }));
    expect(html).toContain("The scenario check passes, fixtures included.");
    expect(html).toContain("Claims this block depends on");
    expect(html).toContain("Before it can be published");
    expect(html).toMatch(/record the content owner, the referral pathway owner/);
    expect(html).toContain("Test a line");
    expect(html).toMatch(/Suggest a persona or objection \(not available yet\)/);
  });
});
