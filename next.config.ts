import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
