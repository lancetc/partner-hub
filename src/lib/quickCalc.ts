import { aud, CATEGORIES, isDate, share, times, type Category } from "./sahRules";
import type { ToolSource } from "./pocketPlaybook";

/*
  The Support at Home contribution Quick-Calc (docs/pocket-playbook.md, Tool A). It answers "what might this service
  cost the participant, from the facts we have?" and nothing more: it doesn't assess income or assets, set a rate or
  a price, make a claim or promise a bill.

  - The service-category map and the formula live in effective-dated, versioned rule sets (content/quickCalcRules),
    reviewed data rather than an `if` in the code. The category rows reuse the Hub's one dated table (lib/sahRules),
    so this and While You Wait can't disagree.
  - Every input is typed by the coordinator and labelled as such. The pilot has no approved record integration, so a
    complete calculation is an Estimate from entered values, never Confirmed. A missing or uncertain fact gives
    Needs verification and names the fact.
  - Interim funding and an interim contribution arrangement are separate ideas with separate views. Neither is a
    "bridging" number.
  - The inputs live only in the page's memory: never in storage, a URL, Favourites or an event.
*/

export type RuleSetStatus = "awaiting_finance" | "approved" | "withdrawn";
export const RULE_SET_STATUS: Record<RuleSetStatus, string> = {
  awaiting_finance: "Awaiting Finance approval",
  approved: "Finance approved",
  withdrawn: "Withdrawn",
};
export type CalcService = { id: string; label: string; unit: string; units: string; words: string[] };
export type CategoryRow = { service: string; category: Category; from: string; to: string | null };
/** A value Finance still has to confirm is marked, so the interface can say so wherever it's used. */
export type Placeholder<T> = { value: T; placeholder: boolean; note: string };

export type CalcRuleSet = {
  id: string;
  /** Increases with every published change; recorded with each use, so an error can be traced to its version. */
  number: number;
  programme: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: RuleSetStatus;
  approval: { finance: string; on: string };
  /** Line-level rounding of the participant amount, to the cent. */
  rounding: Placeholder<"line_half_up_cent">;
  /** The range a notified rate can fall in, per contribution category: an entered rate outside it needs checking. */
  rateBounds: Placeholder<Record<Exclude<Category, "clinical">, { min: number; max: number }>>;
  services: CalcService[];
  rows: CategoryRow[];
  sources: ToolSource[];
  reviewOn: string;
  /** Plain words for the two waiting states, reviewed with the numbers. */
  interimFunding: Placeholder<{ share: number }> & { say: string; check: string[] };
  interimContribution: { say: string; check: string[]; followUp: string };
};

export type RateStatus = "" | "confirmed" | "agreed_interim" | "pending" | "transitioned" | "needs_review";
export const RATE_STATUS: Record<Exclude<RateStatus, "">, string> = {
  confirmed: "Confirmed on a Services Australia notice",
  agreed_interim: "Agreed interim amount (rate not yet notified)",
  pending: "Pending: not yet notified",
  transitioned: "Transitioned from a Home Care Package (no-worse-off)",
  needs_review: "Needs review",
};
export type PriceStatus = "" | "agreed" | "quote" | "unsure";
export const PRICE_STATUS: Record<Exclude<PriceStatus, "">, string> = {
  agreed: "Agreed with the participant (service agreement or price list)",
  quote: "A quote or supplier cost, not yet agreed",
  unsure: "Not sure",
};
export type Special = "" | "none" | "hardship" | "exemption" | "cap" | "unsure";
export const SPECIAL: Record<Exclude<Special, "">, string> = {
  none: "None that I know of",
  hardship: "Financial hardship arrangement",
  exemption: "An exemption",
  cap: "Lifetime cap reached or near",
  unsure: "Not sure",
};

/** What the coordinator types. Strings as typed: nothing is parsed until it's used, and nothing is kept. */
export type CalcInput = {
  service: string;
  date: string;
  unitPrice: string;
  units: string;
  priceStatus: PriceStatus;
  rateStatus: RateStatus;
  rate: string;
  special: Special;
};
export const blankInput = (): CalcInput => ({ service: "", date: "", unitPrice: "", units: "", priceStatus: "", rateStatus: "", rate: "", special: "" });

/**
  The three answer states. "confirmed" is reserved for a future approved, read-only record integration that verifies
  the service, agreed price, individual rate and dates: nothing in this build can produce it.
*/
export type CalcState = "confirmed" | "estimate" | "needs_verification";
export const CALC_STATE: Record<CalcState, string> = {
  confirmed: "Confirmed from authorised record",
  estimate: "Estimate from entered values",
  needs_verification: "Needs verification",
};
export const MANUAL = "Entered by you";

export type CalcResult = {
  state: CalcState;
  ruleSet: { id: string; number: number; status: RuleSetStatus } | null;
  service: CalcService | null;
  category: Category | null;
  grossCents: number | null;
  participantCents: number | null;
  governmentCents: number | null;
  basisPoints: number | null;
  /** The answer rests on an agreed interim amount: it may be reconciled when the assessed rate is notified. */
  interim: boolean;
  /** The exact facts still missing, in order. Empty for an estimate. */
  missing: string[];
  /** What to check next, before quoting anything as final. */
  next: string[];
  /** Each input and figure with where it came from. */
  lines: { label: string; value: string; provenance: string }[];
  /** What to say, filled in, for the screen only. */
  say: string;
  /** The same words with [placeholders]: what Copy puts on the clipboard. Never the participant's figures. */
  sayTemplate: string;
};

/** Dollars as typed ("$67.45", "1,200") to whole cents. Null if it isn't a price. */
export function parseCents(v: string): number | null {
  const t = v.replace(/[$,\s]/g, "");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents > 0 && cents <= 1_000_000 ? cents : null;
}
/** Units as typed: more than nothing, up to two decimals. */
export function parseUnits(v: string): number | null {
  const t = v.trim();
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 1000 ? n : null;
}
/** A percentage as typed ("17.5", "17.5%") to basis points (1750). Null if it isn't one. */
export function parseRate(v: string): number | null {
  const t = v.replace(/[%\s]/g, "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const bp = Math.round(Number(t) * 100);
  return bp >= 0 && bp <= 10000 ? bp : null;
}
const pct = (bp: number) => `${(bp / 100).toLocaleString("en-AU", { maximumFractionDigits: 2 })}%`;

/** The rule set in effect on a service date. A withdrawn one is returned, so the page can say so instead of falling back silently. */
export function ruleSetFor(sets: CalcRuleSet[], date: string): CalcRuleSet | null {
  if (!isDate(date)) return null;
  return sets.find((r) => r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo)) ?? null;
}
export function categoryFor(rs: CalcRuleSet, service: string, date: string): Category | null {
  return rs.rows.find((r) => r.service === service && r.from <= date && (r.to === null || date <= r.to))?.category ?? null;
}

/**
  The calculation. Deterministic and pure: the same input gives the same answer. Manual input can reach an Estimate
  at most; whatever is missing or uncertain is named and the state is Needs verification.
*/
export function quickCalc(input: CalcInput, sets: CalcRuleSet[]): CalcResult {
  const missing: string[] = [];
  const next: string[] = [];
  const lines: CalcResult["lines"] = [];
  const allServices = sets.flatMap((r) => r.services);
  const service = allServices.find((s) => s.id === input.service) ?? null;
  if (!service) missing.push("The approved service. Choose it from the list: a category can’t be worked out from a free-text name.");
  else lines.push({ label: "Service", value: service.label, provenance: MANUAL });

  let rs: CalcRuleSet | null = null;
  if (!isDate(input.date)) missing.push("The service date.");
  else {
    lines.push({ label: "Service date", value: input.date, provenance: MANUAL });
    rs = ruleSetFor(sets, input.date);
    if (!rs) {
      missing.push("A reviewed rule set for that date.");
      next.push("Ask Finance which contribution arrangement applied on that date. The Quick-Calc only holds reviewed rules.");
    } else if (rs.status === "withdrawn") {
      missing.push(`A current rule set: version ${rs.number} has been withdrawn.`);
      next.push("Don’t use an older figure. Ask Finance for the current rule.");
      rs = null;
    }
  }

  const category = rs && service ? categoryFor(rs, service.id, input.date) : null;
  if (rs && service && !category) missing.push(`The category for ${service.label.toLowerCase()} on that date (it isn’t in rule set ${rs.number}).`);
  if (category) lines.push({ label: "Category", value: CATEGORIES[category].label, provenance: rs ? `Rule set ${rs.number} (${rs.id})` : "" });

  const unitCents = parseCents(input.unitPrice);
  const units = parseUnits(input.units);
  const clinical = category === "clinical";
  if (input.priceStatus && input.priceStatus !== "agreed")
    missing.push("The agreed provider price. A quote or supplier cost isn’t the participant’s agreed price.");
  else if (!input.priceStatus && !clinical) missing.push("Whether the price is the participant’s agreed price.");
  if (unitCents === null) {
    if (!clinical) missing.push(`The agreed price per ${service?.unit ?? "unit"}.`);
  } else
    lines.push({
      label: `Agreed price per ${service?.unit ?? "unit"}`,
      value: aud(unitCents),
      provenance: `${MANUAL}${input.priceStatus === "agreed" ? ", from the agreement" : ""}`,
    });
  if (units === null) {
    if (!clinical) missing.push(`How many ${service?.units ?? "units"}.`);
  } else lines.push({ label: "Quantity", value: `${units} ${units === 1 ? (service?.unit ?? "unit") : (service?.units ?? "units")}`, provenance: MANUAL });
  const grossCents = unitCents !== null && units !== null ? times(unitCents, units) : null;
  if (grossCents !== null) lines.push({ label: "Price for this line", value: aud(grossCents), provenance: "Calculated: units × unit price, to the cent" });

  let basisPoints: number | null = null;
  let interim = false;
  if (clinical) {
    basisPoints = 0;
    lines.push({ label: "Contribution rate", value: "No contribution: Clinical Supports", provenance: rs ? `Rule set ${rs.number}` : "" });
  } else if (category) {
    const bounds = rs!.rateBounds.value[category];
    switch (input.rateStatus) {
      case "":
        missing.push(`The participant’s contribution rate for ${CATEGORIES[category].label}, and whether it’s confirmed.`);
        break;
      case "pending":
        missing.push("An assessed contribution rate: Services Australia hasn’t notified it yet.");
        next.push("Open “Rate not yet notified” to explain the interim arrangement and the later reconciliation.");
        break;
      case "needs_review":
        missing.push("Finance’s review of the rate on record.");
        break;
      case "transitioned":
        missing.push("The transitioned (no-worse-off) arrangement, from Finance’s record. Don’t work it out from age or pension status.");
        break;
      default: {
        const bp = parseRate(input.rate);
        if (bp === null) missing.push(`The ${input.rateStatus === "agreed_interim" ? "agreed interim" : "notified"} rate. Enter it as a percentage.`);
        else if (bp < bounds.min * 100 || bp > bounds.max * 100)
          missing.push(`A rate within the reviewed range for ${CATEGORIES[category].label}. Check the figure on the notice.`);
        else {
          basisPoints = bp;
          interim = input.rateStatus === "agreed_interim";
          lines.push({
            label: interim ? "Agreed interim rate" : "Notified contribution rate",
            value: pct(bp),
            provenance: `${MANUAL}${interim ? ", from the interim agreement" : ", from the Services Australia notice"}`,
          });
        }
      }
    }
  }
  if (input.special && input.special !== "none" && !clinical)
    missing.push(`Finance’s review of the ${input.special === "unsure" ? "participant’s special status" : SPECIAL[input.special].toLowerCase()}.`);
  else if (!input.special && !clinical && category) missing.push("Whether a hardship, exemption or lifetime-cap status applies.");

  // A figure only when nothing is missing: a part-worked amount beside "Needs verification" would read as an answer.
  const complete = missing.length === 0;
  const participantCents = complete && basisPoints !== null && (grossCents !== null || clinical) ? (clinical ? 0 : share(grossCents!, basisPoints)) : null;
  const governmentCents = grossCents !== null && participantCents !== null ? grossCents - participantCents : null;
  if (participantCents !== null)
    lines.push({ label: "Participant contribution", value: aud(participantCents), provenance: "Calculated: line price × rate, rounded once to the cent" });
  if (governmentCents !== null)
    lines.push({ label: "Paid from Support at Home funding", value: aud(governmentCents), provenance: "Calculated: line price − contribution" });

  const state: CalcState = complete ? "estimate" : "needs_verification";
  // The first missing fact, short enough to say aloud: "the approved service", "an assessed contribution rate".
  const firstMissing = (missing[0] ?? "").split(/[.:]/)[0].replace(/^[A-Z]/, (c) => c.toLowerCase());
  if (state === "needs_verification") next.unshift(`Confirm ${firstMissing} from the participant’s record, or ask Finance support.`);
  if (state === "estimate") next.push("Check the figures against the participant’s notice and agreement before you quote the amount as final.");
  if (interim) next.push("Say that the interim amount may be reconciled once Services Australia notifies the assessed rate.");
  if (rs && rs.status !== "approved") next.push(`Rule set ${rs.number} is awaiting Finance approval: it’s for the pilot, not for quoting.`);
  next.push("Not funding approval: a contribution figure doesn’t show the service is approved or that budget is available.");

  const svc = service?.label.toLowerCase() ?? "this service";
  let say: string;
  let sayTemplate: string;
  if (state === "needs_verification") {
    sayTemplate = "I want to give you the right figure, so I need to check [what’s missing] first. I’ll come back to you by [agreed time].";
    say = sayTemplate.replace("[what’s missing]", firstMissing);
  } else if (clinical) {
    sayTemplate =
      "[Service] is a Clinical Support, so there’s no participant contribution for it under the current rules. I’ll check that against your statement.";
    say = sayTemplate.replace("[Service]", service!.label);
  } else {
    sayTemplate =
      "Your [service] is [quantity] at the agreed price of [price per unit], so [line price] in total. It’s in the [category] category, and your [rate type] for that is [rate]. That makes your contribution about [amount]; the rest is paid from your Support at Home funding. I’ll check this against your statement before we treat it as final.";
    say = sayTemplate
      .replace("[service]", svc)
      .replace("[quantity]", `${units} ${units === 1 ? service!.unit : service!.units}`)
      .replace("[price per unit]", `${aud(unitCents!)} per ${service!.unit}`)
      .replace("[line price]", aud(grossCents!))
      .replace("[category]", CATEGORIES[category!].label)
      .replace("[rate type]", interim ? "agreed interim rate" : "notified rate")
      .replace("[rate]", pct(basisPoints!))
      .replace("[amount]", aud(participantCents!));
    if (interim) {
      const extra = " This uses the interim amount we agreed while your rate is finalised, so it may be adjusted later.";
      say += extra;
      sayTemplate += extra;
    }
  }

  return {
    state,
    ruleSet: rs ? { id: rs.id, number: rs.number, status: rs.status } : null,
    service,
    category,
    grossCents,
    participantCents: state === "estimate" ? participantCents : null,
    governmentCents: state === "estimate" ? governmentCents : null,
    basisPoints,
    interim,
    missing,
    next,
    lines,
    say,
    sayTemplate,
  };
}
