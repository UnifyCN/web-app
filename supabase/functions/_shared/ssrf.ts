// @ts-nocheck Deno runtime — Supabase Edge Functions
/**
 * Shared SSRF guard for crawler image probes.
 *
 * The crawlers run server-side with the service role and HEAD arbitrary URLs pulled
 * from third-party feeds, so a crafted image URL must never reach an internal host.
 * This rejects non-http(s) schemes and every non-global destination on both address
 * families.
 *
 * Relies on WHATWG URL normalisation (`new URL(raw).hostname`), which is what makes
 * the checks tractable: IPv4 shorthand is canonicalised to a dotted quad
 * (`http://2130706433/` → `127.0.0.1`, `http://127.1/` → `127.0.0.1`) and IPv6 comes
 * back bracketed, lowercase, compressed, hex-only — never dotted-quad-inside-brackets
 * (`[::ffff:127.0.0.1]` → `[::ffff:7f00:1]`).
 *
 * LIMITATION: this is a *hostname* guard. A DNS name that resolves to an internal
 * address (DNS rebinding) is not covered — closing that needs
 * resolve-then-validate-then-connect, which Deno's `fetch` does not expose. Callers
 * pair this with `redirect: 'manual'` so a validated host cannot 3xx the probe
 * somewhere internal either.
 */

/**
 * Non-global IPv4. Shared by the dotted-quad path and by the IPv4-bearing IPv6
 * prefixes (v4-mapped / v4-compatible / NAT64), so the ranges are defined once.
 */
export function isBlockedIpv4(a: number, b: number, _c: number, _d: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8 ("this network"; loopback-equivalent bypass)
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // private 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16.0.0/12
  if (a === 192 && b === 168) return true; // private 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224 && a <= 239) return true; // multicast 224.0.0.0/4
  if (a >= 240) return true; // reserved 240.0.0.0/4 + broadcast 255.255.255.255
  return false;
}

/**
 * Expand a bracketed, WHATWG-normalised IPv6 hostname (`[fd00::1]`) into its 8 16-bit
 * groups, resolving `::` compression. Returns null for anything that isn't exactly
 * that shape — callers treat null as "unrecognised, reject".
 */
export function parseIpv6Groups(host: string): number[] | null {
  if (!host.startsWith('[') || !host.endsWith(']')) return null;
  const body = host.slice(1, -1);

  const halves = body.split('::');
  if (halves.length > 2) return null; // '::' may appear at most once

  // The serialiser only ever emits 1-4 hex digits per group, so reject anything else
  // (including an embedded dotted quad, which parseInt would silently mis-read).
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const token of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(token)) return null;
      out.push(parseInt(token, 16));
    }
    return out;
  };

  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (head === null || tail === null) return null;

  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null; // '::' must stand for at least one zero group
    groups = [...head, ...Array(fill).fill(0), ...tail];
  } else {
    groups = head;
  }
  return groups.length === 8 ? groups : null;
}

/** Non-global IPv6, including the prefixes that carry an IPv4 address inside. */
export function isBlockedIpv6(g: number[]): boolean {
  const embeddedIpv4 = () =>
    isBlockedIpv4(g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff);

  const topFiveZero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;

  if (topFiveZero && g[5] === 0) {
    // ::            unspecified
    // ::1           loopback
    // ::a.b.c.d     deprecated IPv4-compatible — judge the embedded address
    if (g[6] === 0 && g[7] === 0) return true;
    if (g[6] === 0 && g[7] === 1) return true;
    return embeddedIpv4();
  }
  if (topFiveZero && g[5] === 0xffff) return embeddedIpv4(); // ::ffff:0:0/96 v4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b) return embeddedIpv4(); // 64:ff9b::/96 NAT64

  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7 (incl. fd00::/8)
  if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return true; // deprecated site-local fec0::/10
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  return false;
}

/** Only public http(s) URLs are safe to fetch server-side. Fails closed. */
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;

  if (host.startsWith('[')) {
    const groups = parseIpv6Groups(host);
    if (groups === null) return false; // unrecognised literal ⇒ reject
    return !isBlockedIpv6(groups);
  }

  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    return !isBlockedIpv4(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]));
  }

  return true; // a DNS name — see the DNS-rebinding limitation in the module header
}
