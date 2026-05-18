import { createClient } from "@sanity/client";

/**
 * Sanity content client — reuses the mobile app's project (same project ID
 * and dataset).
 *
 * TODO: replace with real data — frontend-only build. No content is fetched
 * yet; the placeholder project ID keeps the client constructable until the
 * real env values are supplied.
 */
export const sanityClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "placeholder",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production",
  apiVersion: "2024-01-01",
  useCdn: true,
});
