import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // The opengraph-image route reads its font + logo binaries from app/_og-assets
  // at runtime via fs. Force the serverless bundle to include them — output file
  // tracing doesn't reliably follow process.cwd()-relative reads.
  outputFileTracingIncludes: {
    "/opengraph-image": ["./app/_og-assets/**"],
  },
  images: {
    // picsum.photos supplies stable placeholder photos for mock surfaces
    // (group member avatars, etc.). cdn.sanity.io serves lesson content images
    // (Portable Text `image` blocks). The remaining hosts serve the real
    // Community event cover photos and news article images, sourced from
    // external publishers / settlement agencies (Phase 18). News is DB-driven,
    // so rows from a new publisher will need their host added here.
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "cdn.sanity.io" },
      // Curated group cover photos (groups.cover_photo_url) — see
      // 20260619120000_group_covers_unsplash.sql.
      { protocol: "https", hostname: "images.unsplash.com" },
      // Community event cover photos
      { protocol: "https", hostname: "events.ubc.ca" },
      { protocol: "https", hostname: "img.freepik.com" },
      { protocol: "https", hostname: "cdn-az.allevents.in" },
      { protocol: "https", hostname: "mosaicbc.org" },
      { protocol: "https", hostname: "issbc.org" },
      { protocol: "https", hostname: "www.eventbrite.ca" },
      // events-crawler source orgs (The Events Calendar covers). mosaicbc.org is
      // already listed above; add the remaining Phase-1 hosts (apex + www).
      { protocol: "https", hostname: "successbc.ca" },
      { protocol: "https", hostname: "www.successbc.ca" },
      { protocol: "https", hostname: "burnabynh.ca" },
      { protocol: "https", hostname: "www.burnabynh.ca" },
      { protocol: "https", hostname: "centrecanada.org" },
      { protocol: "https", hostname: "www.centrecanada.org" },
      { protocol: "https", hostname: "pirs.bc.ca" },
      { protocol: "https", hostname: "www.pirs.bc.ca" },
      // Phase-2 crawler sources, staged disabled in events-crawler/index.ts. Allowlisted
      // ahead of activation so flipping `enabled` needs no web-side change.
      { protocol: "https", hostname: "westvanlibrary.ca" },
      { protocol: "https", hostname: "www.westvanlibrary.ca" },
      // BiblioCommons serves each library's event covers off its own tenant subdomain.
      { protocol: "https", hostname: "vpl.bibliocommons.com" },
      // SFU's LiveWhale calendar serves thumbnails off the calendar host itself.
      { protocol: "https", hostname: "events.sfu.ca" },
      // Communico (NVDPL) hosts event images in a public S3 bucket. Pinned to the exact
      // bucket host — never an *.amazonaws.com wildcard, which would allowlist all of S3.
      {
        protocol: "https",
        hostname: "events-calendar-public-us-east-2.s3.us-east-2.amazonaws.com",
      },
      // events-crawler tier-2 covers (Pexels stock photos for events with no source image)
      { protocol: "https", hostname: "images.pexels.com" },
      // News article images
      { protocol: "https", hostname: "media.canadianunderwriter.ca" },
      { protocol: "https", hostname: "www.bankrate.com" },
      { protocol: "https", hostname: "www.heritage.org" },
      { protocol: "https", hostname: "www.cicnews.com" },
      // Community group cover photos (seeded from the mobile DB; rendered by
      // GroupCover via next/image). img.freepik.com is already listed above.
      { protocol: "https", hostname: "d2nzy1qhita6w.cloudfront.net" },
      { protocol: "https", hostname: "wpvip.edutopia.org" },
      { protocol: "https", hostname: "www.fresnocountyca.gov" },
      { protocol: "https", hostname: "www.princeton.edu" },
      { protocol: "https", hostname: "dmandelbaum.com" },
      { protocol: "https", hostname: "immigration.ca" },
      { protocol: "https", hostname: "www.internations.org" },
      { protocol: "https", hostname: "www.spergel.ca" },
      { protocol: "https", hostname: "nyonyalicious.com.au" },
      { protocol: "https", hostname: "public-files.hoa-express.com" },
      { protocol: "https", hostname: "canadianfoodfocus.org" },
      { protocol: "https", hostname: "www.wondermind.com" },
      { protocol: "https", hostname: "encrypted-tbn0.gstatic.com" },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: "unify-kv",
  project: "unify-web",

  // Source-map upload token — read from .env.sentry-build-plugin / CI. Unset for
  // now, so builds skip upload with a warning (nothing breaks).
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload a wider set of client files for better stack-trace resolution.
  widenClientFileUpload: true,

  // Route Sentry traffic through a same-origin path to dodge ad-blockers. This
  // path is exempted from the proxy.ts auth gate (see its matcher).
  tunnelRoute: "/monitoring",

  // Quiet the build output except in CI. (Turbopack is in use, so the
  // webpack-only `webpack.treeshake` options are intentionally omitted.)
  silent: !process.env.CI,
});
