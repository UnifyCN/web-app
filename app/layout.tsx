import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unify — Settling in Canada",
  description:
    "Unify is a newcomer support platform for people settling in Canada.",
  // Unify ring mark (transparent, public/favicon.png) — replaces the default
  // create-next-app favicon.ico, which was removed so this is the only icon.
  icons: {
    icon: "/favicon.png",
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
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
