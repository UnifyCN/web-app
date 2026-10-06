import type { MetadataRoute } from "next";
import { DISALLOWED_PREFIXES, PUBLIC_PAGES, SITE_URL } from "@/lib/seo/routes";

/** Served at /robots.txt (exempt from proxy.ts, so crawlers are not redirected). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [...PUBLIC_PAGES],
      disallow: [...DISALLOWED_PREFIXES],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
