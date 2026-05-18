import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // picsum.photos supplies stable placeholder photos for the frontend-only
    // build. TODO: replace with the real image host once backend is wired.
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
  },
};

export default nextConfig;
