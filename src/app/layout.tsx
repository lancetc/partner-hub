import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Mulish, Roboto_Flex, Roboto_Serif } from "next/font/google";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteTranslator } from "@/components/SiteTranslator";
import { SyncManager } from "@/components/SyncManager";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { ConfirmHost } from "@/components/ConfirmHost";
import "./globals.css";

const robotoFlex = Roboto_Flex({ variable: "--font-roboto-flex", subsets: ["latin"], display: "swap" });
const robotoSerif = Roboto_Serif({ variable: "--font-roboto-serif", subsets: ["latin"], display: "swap" });
const mulish = Mulish({ variable: "--font-mulish-face", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  // Full addresses for share images and canonical links: the hub's public address in production.
  metadataBase: new URL(process.env.HUB_PUBLIC_URL ?? "http://localhost:3000"),
  title: { default: "Partner Hub · Trilogy Care", template: "%s · Partner Hub" },
  description: "News, practical learning and onboarding for Trilogy Care’s Care Partners and care coordinators.",
  openGraph: { siteName: "Trilogy Care Partner Hub", locale: "en_AU", type: "website" },
  // Installed on an iPhone home screen, it opens full screen like an app.
  appleWebApp: { capable: true, title: "Partner Hub", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#2d4875" },
  ],
};

// Runs before first paint: explicit choice wins, otherwise follow the system preference.
const themeScript = `(function(){try{var t=localStorage.getItem("tc-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

/*
  Also before first paint: just after signing in (or with ?intro, to see it again), the homepage builds
  itself from the top down. data-build on <html> switches the entrance animations on (globals.css); it's
  taken off once they've played, so nothing animates on later visits. Never for people who prefer reduced motion.
*/
const buildScript = `(function(){try{var d=document.documentElement,s=sessionStorage;if(location.pathname!=="/")return;if(s.getItem("tc-build")!=="1"&&!/[?&]intro\\b/.test(location.search))return;s.removeItem("tc-build");if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;d.setAttribute("data-build","");setTimeout(function(){d.removeAttribute("data-build")},9000)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" data-theme="light" suppressHydrationWarning className={`${robotoFlex.variable} ${robotoSerif.variable} ${mulish.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: buildScript }} />
      </head>
      <body className="min-h-dvh bg-bg pb-20 text-ink lg:pb-0">
        <a href="#main" className="sr-only z-50 rounded-lg bg-action px-4 py-2 text-on-action focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>
        <Suspense fallback={<div className="h-16 border-b border-line" />}>
          <Header />
        </Suspense>
        <ConnectionBanner />
        <main id="main" className="min-w-0">
          {children}
        </main>
        <SiteFooter />
        <Suspense>
          <BottomNav />
        </Suspense>
        <SiteTranslator />
        <SyncManager />
        <ConfirmHost />
      </body>
    </html>
  );
}
