import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Mulish, Roboto_Flex, Roboto_Serif } from "next/font/google";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

const robotoFlex = Roboto_Flex({ variable: "--font-roboto-flex", subsets: ["latin"], display: "swap" });
const robotoSerif = Roboto_Serif({ variable: "--font-roboto-serif", subsets: ["latin"], display: "swap" });
const mulish = Mulish({ variable: "--font-mulish-face", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Partner Hub · Trilogy Care", template: "%s · Partner Hub" },
  description: "News, practical learning and onboarding for Trilogy Care service partners and care coordinators.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1a2e" },
  ],
};

// Runs before first paint: explicit choice wins, otherwise follow the system preference.
const themeScript = `(function(){try{var t=localStorage.getItem("tc-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-AU"
      data-theme="light"
      suppressHydrationWarning
      className={`${robotoFlex.variable} ${robotoSerif.variable} ${mulish.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-bg pb-20 text-ink md:pb-0">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-action px-4 py-2 text-on-action focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Suspense fallback={<div className="h-16 border-b border-line" />}>
          <Header />
        </Suspense>
        <main id="main" className="min-w-0">
          {children}
        </main>
        <footer className="mx-auto mt-16 max-w-7xl border-t border-line px-4 py-8 text-sm text-ink-muted sm:px-6">
          <p className="font-mulish">
            Prototype with demonstration content. Stories, people, rates and processes shown here are illustrative and
            not current Trilogy Care policy or pricing.
          </p>
        </footer>
        <Suspense>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
