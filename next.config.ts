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
    ],
  },
};

export default nextConfig;
