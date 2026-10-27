/*
  Helpers for writing draft lessons as plain data. Each lesson file exports one lesson in the same
  format the editor saves (content/lessons.ts), so drafts open and edit like any other lesson.
*/

export const PHOTOS = {
  people: { src: "/images/people.png", width: 1536, height: 1024, position: "35% 30%" },
  daut: { src: "/images/daut.webp", width: 1042, height: 938, position: "35% 35%" },
  mum: { src: "/images/mum.webp", width: 1042, height: 938, position: "60% 35%" },
  bill: { src: "/images/bill.webp", width: 1042, height: 521, position: "55% center" },
  oldie: { src: "/images/oldie.jpg", width: 612, height: 408, position: "45% 30%" },
  cleaner: { src: "/images/cleaner.jpg", width: 1000, height: 667, position: "50% 30%" },
  mara: { src: "/images/mara.jpg", width: 541, height: 360, position: "center" },
  team: { src: "/images/team.jpeg", width: 640, height: 456, position: "center" },
  tcp: { src: "/images/tcp.png", width: 1200, height: 628, position: "center" },
};

/** A drawn illustration, optionally with a photo on top of the card. */
export const art = (variant, tone, icon, alt, photo) => ({ kind: "illustration", variant, tone, icon, alt, ...(photo ? { photo } : {}) });
/** A full-card background photo with the text over it. */
export const bg = (photo, alt, tone = "navy") => ({ kind: "illustration", variant: "petals", tone, icon: "heart", alt, photo, layout: "background" });
export const words = (list, tone, alt) => ({ kind: "words", words: list, tone, alt: alt ?? `Key words: ${list.join(", ")}` });
export const none = { kind: "none" };

export const tiles = (title, items, tip) => ({ title, style: "tiles", items: items.map(([text, icon]) => ({ text, icon })), ...(tip ? { tip } : {}) });
export const chips = (title, items) => ({ title, style: "chips", items: items.map((text) => ({ text })) });

/** A content card. */
export const text = (o) => ({ type: "image", body: "", visual: none, ...o });
/** A Role Play (decision) card. */
export const roleplay = (o) => ({ type: "decision", label: "Role play", body: "", visual: none, ...o });
/** A consequence of a poorer choice. */
export const consequence = (o) => ({ type: "image", emphasis: "consequence", label: "What happens", body: "", visual: none, ...o });
/** The result of putting things right, or of a strong choice. */
export const recovery = (o) => ({ type: "image", emphasis: "recovery", label: "What happens", body: "", visual: none, ...o });

/** Shared facts (rates, dates and numbers) these lessons use as {{key}}, added to the facts library if missing. */
export const FACTS = [
  { key: "sah_start", label: "Support at Home start date", value: "1 November 2025", source: "https://www.health.gov.au/our-work/support-at-home", sourceTitle: "Support at Home program (Department of Health, Disability and Ageing)", checkBy: "2027-04-30", owner: "Quality and Compliance" },
  { key: "chsp_funded_until", label: "CHSP grant funding extended to", value: "30 June 2029", source: "https://www.health.gov.au/news/commonwealth-home-support-program-chsp-extended-to-30-june-2029", sourceTitle: "CHSP extended to 30 June 2029 (21 August 2026)", checkBy: "2027-03-31", owner: "Quality and Compliance", notes: "The Department was consulting on the future of CHSP from late 2026. Check for a confirmed move into Support at Home." },
  { key: "mac_phone", label: "My Aged Care phone number", value: "1800 200 422", source: "https://www.myagedcare.gov.au/contact-us", sourceTitle: "Contact My Aged Care", checkBy: "2027-10-31", owner: "Quality and Compliance" },
  { key: "mac_hours", label: "My Aged Care phone hours", value: "Monday to Friday 8am to 8pm, and Saturday 10am to 2pm", source: "https://www.myagedcare.gov.au/contact-us", sourceTitle: "Contact My Aged Care", checkBy: "2027-04-30", owner: "Quality and Compliance" },
  { key: "tis_phone", label: "Translating and Interpreting Service (TIS National)", value: "131 450", source: "https://www.myagedcare.gov.au/contact-us", sourceTitle: "Contact My Aged Care", checkBy: "2027-10-31", owner: "Quality and Compliance" },
  { key: "acso_phone", label: "Services Australia Aged Care Specialist Officer bookings", value: "1800 227 475", source: "https://www.myagedcare.gov.au/how-get-assessed", sourceTitle: "How to get assessed (My Aged Care)", checkBy: "2027-04-30", owner: "Quality and Compliance" },
  { key: "acqsc_phone", label: "Aged Care Quality and Safety Commission complaints line", value: "1800 951 822", source: "https://www.agedcarequality.gov.au/contact-us/complaints-feedback/how-raise-concern", sourceTitle: "How to raise a concern (Aged Care Quality and Safety Commission)", checkBy: "2027-10-31", owner: "Quality and Compliance" },
  { key: "sah_l1_quarterly", label: "Support at Home Level 1 quarterly budget", value: "$2,757.89", source: "https://www.myagedcare.gov.au/support-at-home-costs-and-contributions", sourceTitle: "Support at Home costs and contributions (My Aged Care)", checkBy: "2027-07-01", owner: "Finance", notes: "Indexed each 1 July. Includes 10% for care management." },
  { key: "sah_l8_quarterly", label: "Support at Home Level 8 quarterly budget", value: "$20,073.50", source: "https://www.myagedcare.gov.au/support-at-home-costs-and-contributions", sourceTitle: "Support at Home costs and contributions (My Aged Care)", checkBy: "2027-07-01", owner: "Finance", notes: "Indexed each 1 July. Includes 10% for care management." },
  { key: "sah_rollover", label: "Support at Home unspent funds carry-over", value: "up to $1,000 or 10% of the quarterly budget, whichever is greater", source: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home", sourceTitle: "Funding classifications for Support at Home", checkBy: "2027-07-01", owner: "Finance" },
  { key: "sah_care_management", label: "Support at Home care management share", value: "10%", source: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-for-support-at-home-care-management", sourceTitle: "Funding care management", checkBy: "2027-07-01", owner: "Finance" },
  { key: "athm_tiers", label: "AT-HM scheme funding tiers", value: "$500 (low), $2,000 (medium) or $15,000 (high)", source: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home", sourceTitle: "Funding classifications for Support at Home", checkBy: "2027-07-01", owner: "Finance" },
  { key: "restorative_funding", label: "Restorative Care Pathway funding", value: "around $6,000 for up to 16 weeks", source: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home", sourceTitle: "Funding classifications for Support at Home", checkBy: "2027-07-01", owner: "Finance" },
  { key: "eol_funding", label: "End-of-Life Pathway funding", value: "around $25,000 for 12 weeks (usable over up to 16 weeks)", source: "https://www.health.gov.au/our-work/support-at-home/funding-for-support-at-home/funding-classifications-for-support-at-home", sourceTitle: "Funding classifications for Support at Home", checkBy: "2027-03-31", owner: "Finance", notes: "A second round of funding for people who live beyond 12 weeks was due from early 2027." },
  { key: "contrib_full_pensioner", label: "Contribution rates for full pensioners", value: "5% for independence services and 17.5% for everyday living", source: "https://www.myagedcare.gov.au/support-at-home-costs-and-contributions", sourceTitle: "Support at Home costs and contributions (My Aged Care)", checkBy: "2027-07-01", owner: "Finance" },
  { key: "contrib_highest", label: "Highest contribution rates (self-funded, no CSHC)", value: "50% for independence services and 80% for everyday living", source: "https://www.myagedcare.gov.au/support-at-home-costs-and-contributions", sourceTitle: "Support at Home costs and contributions (My Aged Care)", checkBy: "2027-07-01", owner: "Finance" },
  { key: "personal_care_free_from", label: "Personal care fully funded from", value: "1 October 2026", source: "https://www.health.gov.au/our-work/support-at-home/charging-for-support-at-home-services", sourceTitle: "Charging for Support at Home services", checkBy: "2027-04-30", owner: "Finance" },
];

/*
  The opening presenter video. Every draft uses the same Synthesia video for now (the one from
  "Our Mission & Model"): replace `id` and `src` with that lesson's own video once it's made.
  `transcript` is the script to give Synthesia.
*/
export const PRESENTER_VIDEO = {
  provider: "synthesia",
  id: "d17ebdc9-8f64-4630-ad37-24747e308796",
  orientation: "portrait",
  src: "https://synthesia-ttv-data.s3-eu-west-1.amazonaws.com/video_data/d17ebdc9-8f64-4630-ad37-24747e308796/transfers/rendered_video.mp4",
  poster: "/images/presenter-intro.jpg",
};

/** About 2.5 words a second, the pace of a Synthesia presenter. */
export const presenter = ({ title, transcript, ...o }) => ({
  type: "presenter",
  visual: {
    kind: "presenter",
    name: "Ava",
    synthetic: true,
    tone: "teal",
    alt: "Presenter introduction poster",
    video: { ...PRESENTER_VIDEO, title: `Introduction: ${title}` },
  },
  transcript,
  durationSec: Math.round(transcript.split(/\s+/).length / 2.5),
  ...o,
});
