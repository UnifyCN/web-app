import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { preconnect } from "react-dom";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "./providers";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { LearningDestinationNavigation } from "@/components/layout/LearningDestinationNavigation";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  dirForLanguage,
  isLanguageEnabled,
  isSupportedLanguage,
  negotiateLanguage,
  type SupportedLanguage,
} from "@/lib/i18n/config";
import { motionCssVars } from "@/lib/motion";
import { preloadFonts } from "./fonts/preload";
// Self-hosted Inter + Noto script faces (see app/fonts/README.md). Before
// globals.css so its --font-sans chain finds the variables already defined.
import "./fonts/fonts.css";
import "./globals.css";

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
  if (isSupportedLanguage(cookieLang) && isLanguageEnabled(cookieLang)) {
    return cookieLang;
  }
  return (
    negotiateLanguage((await headers()).get("accept-language")) ??
    DEFAULT_LANGUAGE
  );
}

/**
 * Opens the connections the first data requests will use while the page's
 * scripts are still loading, so those requests do not start with DNS and TLS.
 * Both hosts are called from the browser without cookies, hence "anonymous".
 */
function preconnectDataHosts() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      preconnect(new URL(supabaseUrl).origin, { crossOrigin: "anonymous" });
    } catch {
      // Malformed env value: skip the hint, nothing depends on it.
    }
  }
  const sanityProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  if (sanityProjectId && sanityProjectId !== "placeholder") {
    preconnect(`https://${sanityProjectId}.apicdn.sanity.io`, {
      crossOrigin: "anonymous",
    });
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialLocale = await resolveInitialLocale();
  preconnectDataHosts();
  preloadFonts();

  return (
    <html
      lang={initialLocale}
      dir={dirForLanguage(initialLocale)}
      className="h-full antialiased"
      // Motion tokens for CSS, from the same config Framer Motion reads.
      style={motionCssVars}
    >
      <body
        className="min-h-full flex flex-col font-sans"
        suppressHydrationWarning
      >
        <PostHogProvider>
          <Providers initialLocale={initialLocale}>
            <LearningDestinationNavigation />
            {children}
          </Providers>
        </PostHogProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
