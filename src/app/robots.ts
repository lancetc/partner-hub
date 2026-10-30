import type { MetadataRoute } from "next";

/*
  What search engines may look at: news, and the overview pages for topics, learning paths,
  webinars and resources. Administration, review links and everything personal stays out.
*/
export default function robots(): MetadataRoute.Robots {
  const base = (process.env.HUB_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      // Uploaded pictures are allowed, so share previews of news stories can show them.
      allow: ["/", "/api/uploads/"],
      disallow: [
        "/admin",
        "/api/",
        "/review/",
        "/settings",
        "/saved",
        "/onboarding",
        "/offline",
        "/unsubscribe",
        "/learning/s/",
        "/learning/follow-ups/",
        "/paths/*/certificate",
        "/*?preview=",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
