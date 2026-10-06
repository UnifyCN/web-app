import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/seo/routes";

/** Served at /sitemap.xml: the public entry pages only. */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "/welcome" ? 1 : 0.5,
  }));
}
