import { describe, expect, it } from "vitest";
import { QUICK_CALC_RULE_SETS } from "@/content/quickCalcRules";
import {
  blankInput,
  parseCents,
  parseRate,
  parseUnits,
  quickCalc,
  ruleSetFor,
  type CalcInput,
  type RateStatus,
  type PriceStatus,
  type Special,
} from "./quickCalc";
import { categoryOn, RULESET as SAH, type ServiceId } from "./sahRules";

/*
  Rule fixtures for the contribution Quick-Calc (docs/pocket-playbook.md): effective dates, the post-1 October 2026
  personal care change, pending and interim rates, interim funding kept apart, rounding, and that manual input is
  never "Confirmed".
*/

const sets = QUICK_CALC_RULE_SETS;
/** Dot's gardening: agreed $67.45 an hour, 1.5 hours, a notified Everyday Living rate of 17.5% (all fictional). */
const dot: CalcInput = {
  service: "gardening",
  date: "2026-11-24",
  unitPrice: "$67.45",
  units: "1.5",
  priceStatus: "agreed",
  rateStatus: "confirmed",
  rate: "17.5",
  special: "none",
};
const calc = (over: Partial<CalcInput> = {}) => quickCalc({ ...dot, ...over }, sets);

describe("the rule sets are reviewed, dated data", () => {
  it("covers dates without gaps or overlaps, oldest first, each awaiting Finance approval", () => {
    for (let i = 1; i < sets.length; i++) {
      const prev = sets[i - 1];
      expect(prev.effectiveTo, prev.id).not.toBeNull();
      const next = new Date(Date.parse(`${prev.effectiveTo}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      expect(sets[i].effectiveFrom).toBe(next);
      expect(sets[i].number).toBeGreaterThan(prev.number);
    }
    expect(sets[sets.length - 1].effectiveTo).toBeNull();
    for (const r of sets) {
      expect(r.status).toBe("awaiting_finance");
      expect(r.rounding.placeholder && r.rateBounds.placeholder && r.interimFunding.placeholder).toBe(true);
      expect(r.rounding.note).toMatch(/awaiting Finance approval/);
      expect(r.sources.length).toBeGreaterThan(0);
    }
  });

  it("agrees with the Hub's one dated category table (lib/sahRules) for every service both hold", () => {
    const shared = Object.keys({ domestic_assistance: 1, personal_care: 1, nursing: 1, social_support: 1, meals: 1 }) as ServiceId[];
    for (const service of shared)
      for (const date of ["2025-11-01", "2026-06-30", "2026-09-30", "2026-10-01", "2027-03-01"]) {
        const rs = ruleSetFor(sets, date)!;
        expect(rs.rows.find((r) => r.service === service && r.from <= date && (r.to === null || date <= r.to))?.category, `${service} ${date}`).toBe(
          categoryOn(service, date, SAH),
        );
      }
  });

  it("can't infer a category from free text: only a listed service", () => {
    const r = calc({ service: "mowing the lawn" });
    expect(r.state).toBe("needs_verification");
    expect(r.missing[0]).toMatch(/approved service/);
  });
});

describe("a complete manual calculation", () => {
  it("is an Estimate from entered values, with line-level rounding to the cent", () => {
    const r = calc();
    expect(r.state).toBe("estimate");
    expect(r.category).toBe("everyday");
    // $67.45 × 1.5 = $101.175 → 10118 cents (rounded once); × 17.5% = 1770.65 → 1771 cents.
    expect(r.grossCents).toBe(10118);
    expect(r.participantCents).toBe(1771);
    expect(r.governmentCents).toBe(10118 - 1771);
    expect(r.ruleSet).toMatchObject({ id: "sah-qc-2026-10", number: 2, status: "awaiting_finance" });
    // Every input says it was typed in, and every figure says how it was worked out.
    for (const l of r.lines.filter((x) => ["Service", "Service date", "Quantity", "Notified contribution rate"].includes(x.label)))
      expect(l.provenance, l.label).toMatch(/^Entered by you/);
    expect(r.lines.find((l) => l.label === "Participant contribution")?.provenance).toMatch(/rounded once/);
    expect(r.say).toContain("$17.71");
    // The copyable words carry placeholders, never the participant's figures.
    expect(r.sayTemplate).not.toMatch(/\$\d/);
    expect(r.sayTemplate).toContain("[amount]");
    expect(r.next.join(" ")).toMatch(/awaiting Finance approval/);
    expect(r.next.join(" ")).toMatch(/Not funding approval/);
  });

  it("rounds half up per line, and whole-dollar and fractional units alike", () => {
    // $50 × 1 h at 5% = $2.50 exactly.
    expect(calc({ service: "social_support", unitPrice: "50", units: "1", rate: "5" }).participantCents).toBe(250);
    // $33.33 × 0.25 h = 833.25 → 833 cents; × 17.5% = 145.775 → 146 cents.
    const r = calc({ unitPrice: "33.33", units: "0.25" });
    expect([r.grossCents, r.participantCents]).toEqual([833, 146]);
    // A rate with two decimals: $100 × 2 at 17.55% = 3510 cents.
    expect(calc({ unitPrice: "100", units: "2", rate: "17.55" }).participantCents).toBe(3510);
  });

  it("is never Confirmed, whatever is entered", () => {
    const rates: RateStatus[] = ["", "confirmed", "agreed_interim", "pending", "transitioned", "needs_review"];
    const prices: PriceStatus[] = ["", "agreed", "quote", "unsure"];
    const specials: Special[] = ["", "none", "hardship", "exemption", "cap", "unsure"];
    for (const service of ["gardening", "personal_care", "nursing", "social_support", "nonsense"])
      for (const rateStatus of rates)
        for (const priceStatus of prices)
          for (const special of specials)
            for (const date of ["2025-10-01", "2026-09-30", "2026-10-01"]) {
              const r = calc({ service, rateStatus, priceStatus, special, date });
              expect(r.state).not.toBe("confirmed");
              // A figure only ever comes with an estimate.
              if (r.state === "needs_verification") expect([r.participantCents, r.governmentCents]).toEqual([null, null]);
            }
    // Not even with fields a page might try to send.
    expect(quickCalc({ ...dot, ...({ provenance: "record", verified: true } as object) } as CalcInput, sets).state).toBe("estimate");
  });
});

describe("personal care and the 1 October 2026 change", () => {
  it("is Clinical Supports, with no contribution, for services from 1 October 2026", () => {
    const r = calc({ service: "personal_care", date: "2026-10-01", rate: "", rateStatus: "", special: "" });
    expect(r.state).toBe("estimate");
    expect(r.category).toBe("clinical");
    expect(r.participantCents).toBe(0);
    expect(r.governmentCents).toBe(10118);
    expect(r.say).toMatch(/no participant contribution/);
  });

  it("follows the earlier version for services before then", () => {
    const r = calc({ service: "personal_care", date: "2026-09-30", rate: "5" });
    expect(r.ruleSet?.number).toBe(1);
    expect(r.category).toBe("independence");
    expect(r.participantCents).toBe(506);
  });

  it("has no rule for a date before Support at Home: Finance decides, nothing is guessed", () => {
    const r = calc({ date: "2025-10-31" });
    expect(r.state).toBe("needs_verification");
    expect(r.missing).toContain("A reviewed rule set for that date.");
    expect(r.ruleSet).toBeNull();
  });
});

describe("rates that aren't confirmed", () => {
  it("a pending rate needs verification, names the fact, and points to the interim contribution view", () => {
    const r = calc({ rateStatus: "pending", rate: "" });
    expect(r.state).toBe("needs_verification");
    expect(r.missing).toEqual(["An assessed contribution rate: Services Australia hasn’t notified it yet."]);
    expect(r.next.join(" ")).toMatch(/Rate not yet notified/);
    expect(r.participantCents).toBeNull();
    expect(r.say).toMatch(/I need to check/);
  });

  it("an agreed interim amount is an estimate that says it may be reconciled, never the final rate", () => {
    const r = calc({ rateStatus: "agreed_interim" });
    expect(r.state).toBe("estimate");
    expect(r.interim).toBe(true);
    expect(r.lines.find((l) => l.label === "Agreed interim rate")).toBeTruthy();
    expect(r.say).toMatch(/may be adjusted later/);
    expect(r.next.join(" ")).toMatch(/reconciled/);
  });

  it("a transitioned, needs-review or special status goes to Finance instead of guessing", () => {
    expect(calc({ rateStatus: "transitioned" }).missing.join(" ")).toMatch(/no-worse-off/);
    expect(calc({ rateStatus: "needs_review" }).state).toBe("needs_verification");
    for (const special of ["hardship", "exemption", "cap", "unsure"] as Special[]) expect(calc({ special }).state, special).toBe("needs_verification");
  });

  it("a quote isn't the agreed price, and a rate outside the reviewed range is a typo to check", () => {
    expect(calc({ priceStatus: "quote" }).missing.join(" ")).toMatch(/agreed provider price/);
    expect(calc({ rate: "95" }).missing.join(" ")).toMatch(/reviewed range/);
    expect(calc({ unitPrice: "" }).missing.join(" ")).toMatch(/agreed price per hour/);
  });

  it("a blank form names every missing fact and no figure", () => {
    const r = quickCalc(blankInput(), sets);
    expect(r.state).toBe("needs_verification");
    expect(r.missing.length).toBeGreaterThanOrEqual(2);
    expect(r.participantCents).toBeNull();
  });
});

describe("interim funding is not an interim contribution", () => {
  it("keeps the two explanations, and their data, apart", () => {
    const rs = sets[sets.length - 1];
    // Interim funding: the notified allocation only, the rest not spendable now and not backdated. No contribution rate in it.
    expect(rs.interimFunding.value).toEqual({ share: 60 });
    expect(rs.interimFunding.say).toMatch(/isn’t backdated/);
    expect(rs.interimFunding.check.join(" ")).toMatch(/isn’t spendable now/);
    expect(rs.interimFunding.say).not.toMatch(/contribution rate/);
    // Interim contribution: the rate isn't notified yet; it may be backdated and reconciled. No funding figure in it.
    expect(rs.interimContribution.say).toMatch(/reconcile/);
    expect(rs.interimContribution.say).not.toMatch(/60|interim funding/);
    expect(JSON.stringify(rs)).not.toMatch(/bridging/i);
  });
});

describe("parsing what's typed", () => {
  it("reads prices, units and rates, and refuses anything else", () => {
    expect([parseCents("$1,200.5"), parseCents("67.45"), parseCents("-5"), parseCents("abc"), parseCents("0")]).toEqual([120050, 6745, null, null, null]);
    expect([parseUnits("1.5"), parseUnits("0"), parseUnits("1.555")]).toEqual([1.5, null, null]);
    expect([parseRate("17.5%"), parseRate("101"), parseRate("5")]).toEqual([1750, null, 500]);
  });
});
