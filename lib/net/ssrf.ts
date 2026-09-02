/**
 * SSRF guard for server-side outbound fetches of user-supplied URLs.
 *
 * This is a Node port of the canonical edge-function copy at
 * `supabase/functions/_shared/ssrf.ts` — kept byte-for-byte in sync with it
 * (that file is the source of truth; it's pure JS — `URL`/regex/`parseInt` only,
 * so this port is identical apart from dropping the `@ts-nocheck` Deno header).
 * The resume job-posting route (app/api/resume/job-posting) fetches arbitrary
 * third-party URLs, so a crafted link must never reach an internal host.
 *
 * Relies on WHATWG URL normalisation (`new URL(raw).hostname`), which is what
 * makes the checks tractable: IPv4 shorthand is canonicalised to a dotted quad
 * (`http://2130706433/` → `127.0.0.1`, `http://127.1/` → `127.0.0.1`) and IPv6
 * comes back bracketed, lowercase, compressed, hex-only.
 *
 * LIMITATION: this is a *hostname* guard. A DNS name that resolves to an
 * internal address (DNS rebinding) is not covered — closing that needs
 * resolve-then-validate-then-connect. Callers pair this with `redirect: 'manual'`
 * (re-validating each hop) so a validated host cannot 3xx the fetch somewhere
 * internal either.
 */

/**
 * Non-global IPv4. Shared by the dotted-quad path and by the IPv4-bearing IPv6
 * prefixes (v4-mapped / v4-compatible / NAT64), so the ranges are defined once.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- _c/_d keep the 4-octet shape (parity with _shared/ssrf.ts); only a/b gate the ranges.
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
 * Expand a bracketed, WHATWG-normalised IPv6 hostname (`[fd00::1]`) into its 8
 * 16-bit groups, resolving `::` compression. Returns null for anything that
 * isn't exactly that shape — callers treat null as "unrecognised, reject".
 */
export function parseIpv6Groups(host: string): number[] | null {
  if (!host.startsWith("[") || !host.endsWith("]")) return null;
  const body = host.slice(1, -1);

  const halves = body.split("::");
  if (halves.length > 2) return null; // '::' may appear at most once

  // The serialiser only ever emits 1-4 hex digits per group, so reject anything
  // else (including an embedded dotted quad, which parseInt would mis-read).
  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const token of part.split(":")) {
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
  // The embedded address does not always sit in the last two groups (6to4 carries
  // it at bits 16-47), so take the pair of groups to read it from.
  const embeddedIpv4 = (hi: number, lo: number) =>
    isBlockedIpv4(hi >> 8, hi & 0xff, lo >> 8, lo & 0xff);

  const topFiveZero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;

  if (topFiveZero && g[5] === 0) {
    // ::            unspecified
    // ::1           loopback
    // ::a.b.c.d     deprecated IPv4-compatible — judge the embedded address
    if (g[6] === 0 && g[7] === 0) return true;
    if (g[6] === 0 && g[7] === 1) return true;
    return embeddedIpv4(g[6], g[7]);
  }
  if (topFiveZero && g[5] === 0xffff) return embeddedIpv4(g[6], g[7]); // v4-mapped ::ffff:0:0/96
  if (g[0] === 0x64 && g[1] === 0xff9b) return embeddedIpv4(g[6], g[7]); // NAT64 64:ff9b::/96
  // Teredo 2001::/32 — deprecated, and the embedded IPv4 is obfuscated (XOR'd
  // with all-ones), so reject the prefix outright. Must be the /32, NOT 2001::/16:
  // 2001:4860::/32 is Google, 2001:db8::/32 is docs.
  if (g[0] === 0x2001 && g[1] === 0x0000) return true;
  // 6to4 2002::/16 — V4ADDR is bits 16-47 (RFC 3056), i.e. groups 1 and 2.
  if (g[0] === 0x2002) return embeddedIpv4(g[1], g[2]);

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
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;

  if (host.startsWith("[")) {
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
