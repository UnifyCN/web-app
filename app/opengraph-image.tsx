import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Default Open Graph / Twitter card for the whole app (Next auto-wires this file
 * to `og:image` + `twitter:image`). Mirrors the landing-page card
 * (`/Users/luis/Unify/landing-page/public/og-default.png`): white canvas, logo
 * lockup top-left, accent bar, big headline, gray subhead, domain bottom-left.
 * Per CLAUDE.md the layout follows the landing page but the accent uses the brand
 * orange (`#f68b26`) rather than the logo's locked red.
 *
 * Assets live in `app/_og-assets/` and are read with `fs` at render time. We
 * deliberately avoid the `fetch(new URL(..., import.meta.url))` pattern: Turbopack
 * rewrites it to a relative `/_next/static/media/...` path that `fetch` can't
 * parse server-side. Satori (the ImageResponse engine) also needs raw ttf/otf
 * buffers — not woff2 — so we ship Inter TTFs (the landing page's Aileron is
 * woff2 only). next.config.ts `outputFileTracingIncludes` bundles these for prod.
 */

export const runtime = "nodejs";
export const alt =
  "Unify — your newcomer support platform for settling in Canada";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const assets = join(process.cwd(), "app", "_og-assets");
  const [interRegular, interBold, lockupData] = await Promise.all([
    readFile(join(assets, "Inter-Regular.ttf")),
    readFile(join(assets, "Inter-Bold.ttf")),
    readFile(join(assets, "unify-lockup.png")),
  ]);
  const lockupSrc = `data:image/png;base64,${lockupData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#ffffff",
          padding: "80px",
        }}
      >
        <img
          src={lockupSrc}
          width={291}
          height={130}
          alt=""
          style={{ objectFit: "contain" }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              width: 80,
              height: 8,
              backgroundColor: "#f68b26",
              borderRadius: 4,
              marginBottom: 36,
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Inter",
              fontWeight: 700,
              fontSize: 80,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: "#171616",
            }}
          >
            <div style={{ display: "flex" }}>Settling in Canada,</div>
            <div style={{ display: "flex" }}>together</div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontFamily: "Inter",
              fontWeight: 400,
              fontSize: 34,
              color: "#575757",
            }}
          >
            Your newcomer support platform.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "Inter",
            fontWeight: 400,
            fontSize: 26,
            color: "#9F9D9D",
          }}
        >
          app.unifysocial.ca
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: interRegular, weight: 400, style: "normal" },
        { name: "Inter", data: interBold, weight: 700, style: "normal" },
      ],
    },
  );
}
