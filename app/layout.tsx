import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import { cookies, headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "./providers";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  isSupportedLanguage,
  negotiateLanguage,
  type SupportedLanguage,
} from "@/lib/i18n/config";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

// Devanagari (Hindi) glyph coverage — Inter has none. Loaded as a fall-through
// font behind Inter in the --font-sans chain (see globals.css).
const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-noto-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
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

/**
 * Resolve the UI locale for this request: the persisted `unify_lang` cookie wins
 * (returning users), else negotiate from the browser's Accept-Language header
 * (first-ever visit), else English. Passing this to the client provider verbatim
 * keeps the first client render identical to the server HTML — no flash, no
 * hydration mismatch.
 */
async function resolveInitialLocale(): Promise<SupportedLanguage> {
  const cookieLang = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  if (isSupportedLanguage(cookieLang)) return cookieLang;
  return (
    negotiateLanguage((await headers()).get("accept-language")) ??
    DEFAULT_LANGUAGE
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialLocale = await resolveInitialLocale();

  return (
    <html
      lang={initialLocale}
      className={`${inter.variable} ${notoDevanagari.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col font-sans"
        suppressHydrationWarning
      >
        <PostHogProvider>
          <Providers initialLocale={initialLocale}>{children}</Providers>
        </PostHogProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
