import Link from "next/link";
import { Icon, type IconName } from "./Icon";

/*
  The site footer, matching trilogycare.com.au: the logo and contact details, the same link columns
  (plus the Partner Hub's own sections), the social accounts, the Acknowledgement of Country and the
  small print. Links to Trilogy Care's site and government sites open in the same window, as
  documents do across the hub.
*/

type FooterLink = { label: string; href: string };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Partner Hub",
    links: [
      { label: "News", href: "/" },
      { label: "Topics", href: "/learning" },
      { label: "Webinars", href: "/webinars" },
      { label: "Resources", href: "/resources" },
      { label: "Saved", href: "/saved" },
      { label: "Profile and settings", href: "/settings" },
    ],
  },
  {
    title: "My Aged Care resources",
    links: [
      { label: "What is Support at Home?", href: "https://www.health.gov.au/our-work/hcp/about" },
      { label: "My Aged Care", href: "https://www.myagedcare.gov.au/" },
      { label: "Eligibility checker", href: "https://www.myagedcare.gov.au/eligibility-checker" },
      { label: "Fee estimator", href: "https://www.myagedcare.gov.au/how-much-will-i-pay" },
      { label: "Apply for an assessment", href: "https://www.myagedcare.gov.au/assessment/apply-online" },
    ],
  },
  {
    title: "Existing Trilogy clients",
    links: [
      { label: "Clients", href: "https://trilogycare.com.au/care-recipients-and-supports-hub" },
      { label: "Care workers and service providers", href: "https://trilogycare.com.au/care-recipients-and-supports-hub" },
      { label: "Care coordinators", href: "https://trilogycare.com.au/care-recipients-and-supports-hub" },
      { label: "Share the care", href: "https://trilogycare.com.au/share-the-care" },
      { label: "Community Champions", href: "https://trilogycare.com.au/community-champions" },
    ],
  },
  {
    title: "More links",
    links: [
      { label: "Our premium suppliers", href: "https://trilogycare.com.au/trilogy-care-about-us/our-premium-suppliers" },
      { label: "Feedback and complaints", href: "https://trilogycare.com.au/feedback" },
      { label: "Privacy policy", href: "https://trilogycare.com.au/privacy" },
      { label: "Terms and conditions", href: "https://trilogycare.com.au/terms-and-conditions" },
      { label: "Whistleblower policy", href: "https://trilogycare.com.au/whistleblower" },
      { label: "Home Care Prices", href: "https://www.homecareprices.com.au/" },
    ],
  },
];

const SWITCHING: FooterLink[] = [{ label: "How switching works", href: "https://trilogycare.com.au/switch" }];

const SOCIAL: { label: string; href: string; path: React.ReactNode }[] = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/trilogycare/",
    path: (
      <path
        d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4a21 21 0 0 0-2.3-.1c-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z"
        fill="currentColor"
        stroke="none"
      />
    ),
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@trilogycare",
    path: (
      <>
        <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
        <path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/trilogycare/",
    path: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M7.5 10.5v6M7.5 7.6v.1M11 16.5v-6M11 13c0-1.6 1-2.6 2.4-2.6s2.1.9 2.1 2.6v3.5" />
      </>
    ),
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/trilogy.care/",
    path: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
      </>
    ),
  },
];

const linkClass = "text-[0.95rem] text-ink-muted underline-offset-4 hover:text-ink hover:underline";

function FooterAnchor({ link }: { link: FooterLink }) {
  return link.href.startsWith("/") ? (
    <Link href={link.href} className={linkClass}>
      {link.label}
    </Link>
  ) : (
    <a href={link.href} className={linkClass}>
      {link.label}
    </a>
  );
}

function ContactLine({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <span>{children}</span>
    </li>
  );
}

/** The Aboriginal flag: black over red, with a yellow circle. Decorative beside the Acknowledgement. */
function AboriginalFlag() {
  return (
    <svg aria-hidden viewBox="0 0 30 20" className="h-6 w-9 shrink-0 rounded-[2px] shadow-sm">
      <rect width="30" height="10" fill="#000" />
      <rect y="10" width="30" height="10" fill="#cc0000" />
      <circle cx="15" cy="10" r="5" fill="#ffd400" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-muted/60 pb-24 lg:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,15rem)_1fr]">
          <div>
            <Link href="/" aria-label="Trilogy Care Partner Hub home" className="inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/trilogy-logo.svg" alt="Trilogy Care" width={1789} height={576} className="h-9 w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/trilogy-logo-dark.svg" alt="Trilogy Care" width={1789} height={576} className="hidden h-9 w-auto dark:block" />
            </Link>
            <h2 className="mt-6 font-serif text-lg font-semibold">Contact</h2>
            <ul className="mt-3 flex flex-col gap-2.5 text-[0.95rem] text-ink-muted">
              <ContactLine icon="pin">
                Level 3, 2 King Street
                <br />
                Bowen Hills QLD 4006
              </ContactLine>
              <ContactLine icon="mail">
                <a href="mailto:info@trilogycare.com.au" className="hover:text-ink hover:underline">
                  info@trilogycare.com.au
                </a>
              </ContactLine>
              <ContactLine icon="phone">
                <a href="tel:1300459190" className="hover:text-ink hover:underline">
                  1300 459 190
                </a>
              </ContactLine>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 xl:grid-cols-5">
            {COLUMNS.map((c) => (
              <nav key={c.title} aria-label={c.title}>
                <h2 className="font-serif text-lg font-semibold leading-snug">{c.title}</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <FooterAnchor link={l} />
                    </li>
                  ))}
                </ul>
                {c.title === "More links" && (
                  <>
                    <h2 className="mt-6 font-serif text-lg font-semibold leading-snug">Switching providers</h2>
                    <ul className="mt-3 flex flex-col gap-2">
                      {SWITCHING.map((l) => (
                        <li key={l.label}>
                          <FooterAnchor link={l} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </nav>
            ))}
            <div>
              <h2 className="font-serif text-lg font-semibold leading-snug">Connect</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {SOCIAL.map((s) => (
                  <li key={s.label}>
                    <a
                      href={s.href}
                      aria-label={`Trilogy Care on ${s.label}`}
                      title={s.label}
                      className="grid size-10 place-items-center rounded-full border border-line-strong text-ink-muted hover:border-ink hover:text-ink"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="size-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {s.path}
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink-muted">Follow us for updates and health tips</p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-start gap-4 border-t border-line pt-6">
          <AboriginalFlag />
          <p className="text-[0.95rem] text-ink-muted">
            Trilogy Care acknowledges the Traditional Owners of Country throughout Australia and recognises their continuing connection to the land, waters and
            communities where we live, learn and work. We pay our respects to Australia’s First Peoples and their Elders past and present.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6 text-sm text-ink-muted">
          <p>
            Home Care Prices is a comparison site for Support at Home prices, operated by Trilogy Care, a registered Support at Home provider. It compares
            published prices only and does not rank providers or judge quality.
          </p>
          <p>© 2026 Trilogy Care. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
