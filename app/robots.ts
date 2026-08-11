import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // API routes return JSON, not pages — no crawl value, and they're
        // metered, so keep bots off them.
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://prometheonengine.com/sitemap.xml",
    host: "https://prometheonengine.com",
  };
}
