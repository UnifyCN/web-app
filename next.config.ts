import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // picsum.photos supplies stable placeholder photos for the frontend-only
    // build. cdn.sanity.io serves lesson content images (Portable Text `image`
    // blocks). TODO: replace picsum with the real image host once backend wired.
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "cdn.sanity.io" },
    ],
  },
};

export default nextConfig;
