import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "./providers";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Resolves relative metadata URLs (incl. the auto-injected opengraph-image
  // route) to absolute https://app.unifysocial.ca/... links for crawlers.
  metadataBase: new URL("https://app.unifysocial.ca"),
  title: "Unify — Settling in Canada",
  description:
    "Unify is a newcomer support platform for people settling in Canada.",
  // Unify ring mark (transparent, public/favicon.png) — replaces the default
  // create-next-app favicon.ico, which was removed so this is the only icon.
  icons: {
    icon: "/favicon.png",
  },
  // og:image + twitter:image are auto-generated from app/opengraph-image.tsx.
  openGraph: {
    type: "website",
    siteName: "Unify Social",
    title: "Unify — Settling in Canada",
    description:
      "Unify is a newcomer support platform for people settling in Canada.",
    url: "https://app.unifysocial.ca",
    locale: "en_CA",
  },
  twitter: {
    card: "summary_large_image",
    title: "Unify — Settling in Canada",
    description:
      "Unify is a newcomer support platform for people settling in Canada.",
  },
};

// `viewportFit: "cover"` is required for `env(safe-area-inset-*)` to resolve to
// non-zero on notched / home-indicator devices (used by the mobile bottom nav
// and the auth screens). Without it iOS reports all insets as 0.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body
        className="min-h-full flex flex-col font-sans"
        suppressHydrationWarning
      >
        <PostHogProvider>
          <Providers>{children}</Providers>
        </PostHogProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
