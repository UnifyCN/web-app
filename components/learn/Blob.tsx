import { cn } from "@/lib/utils";

export type BlobVariant = "default" | "blob-3" | "blob-8" | "blob-10";

const VARIANTS: Record<BlobVariant, { viewBox: string; d: string }> = {
  default: {
    viewBox: "0 0 200 200",
    d: "M152 38c22 14 38 40 32 68-6 28-30 44-58 52-30 9-66 6-86-14C20 124 18 88 38 60 58 32 96 18 122 22c12 2 22 9 30 16Z",
  },
  "blob-3": {
    viewBox: "0 0 225 242",
    d: "M135.149 235.645C106.859 250.239 72.9624 238.857 59.1004 210.109C40.6184 171.79 45.1936 133.596 20.3368 95.609C4.0756 70.7619 -14.3422 27.9691 17.2253 6.74592C36.8416 -6.44038 61.9714 -0.432577 97.6854 25.9801C122.505 44.3318 133.44 48.6892 162.073 51.6388C224.149 58.0258 243.324 87.293 205.293 138.178C183.217 167.717 169.17 218.103 135.149 235.645Z",
  },
  "blob-8": {
    viewBox: "0 0 175 247",
    d: "M115.426 122.674C89.776 110.283 89.098 90.947 103.842 77.652C116.667 66.087 130.319 56.587 130.319 38C130.319 20.2391 122.045 0 100.532 0C65.78 0 0 35.1087 0 122.674C0 210.239 62.057 247 103.014 247C143.972 247 175 223.043 175 186.283C175 149.522 141.076 135.065 115.426 122.674Z",
  },
  "blob-10": {
    viewBox: "0 0 261 229",
    d: "M151.143 115C173.121 115 189.349 96.429 186.426 75.024C181.643 40 163.143 13 193.143 13C225.325 13 253.145 54.2058 259.816 108.804C266.488 163.403 232.737 229 160.523 229C97.7293 229 34.6433 191 8.64331 108.804C-17.4227 26.4016 21.6433 0 44.3553 0C62.1433 0 92.6163 5.1501 101.643 51.5C110.67 97.85 129.165 115 151.143 115Z",
  },
};

interface BlobProps {
  color: string;
  opacity?: number;
  variant?: BlobVariant;
  className?: string;
}

/**
 * Decorative organic blob used as a background ornament on Learn surfaces.
 * Rendered as inline SVG so the fill can come from the module's colorTheme.
 * Variants mirror the mobile assets (Blob3/Blob8/Blob10).
 */
export function Blob({
  color,
  opacity = 0.3,
  variant = "default",
  className,
}: BlobProps) {
  const { viewBox, d } = VARIANTS[variant];
  return (
    <svg
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={cn("pointer-events-none", className)}
    >
      <path d={d} fill={color} fillOpacity={opacity} />
    </svg>
  );
}
