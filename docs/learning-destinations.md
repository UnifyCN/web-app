# Resume learning after account setup

The marketing site's five highest-click desktop content pages (GSC Web,
September 1–28, 2026) link to these publicly published Sanity sections:

| Topic | Route |
| --- | --- |
| PR → Pathways at a Glance | `/learn/9717e260-bdeb-4ee4-8d39-4159a48eb627/3d5abe49-8616-48f8-a857-b80317ddeb35` |
| Finance → Understanding Taxes in Canada | `/learn/4c79ebb5-b03a-47aa-862e-6d0853eba7d4/b7988f8b-6105-4a26-ade1-6df5864f8ee6` |
| Healthcare → Getting Care in BC’s Healthcare System | `/learn/1f43061d-0062-4ea5-bd82-6b25e8ee5a55/9882f55c-6191-4c4f-85f3-8cf4e1873355` |

`lib/learningDestination.ts` is an exact allowlist, not a general `next` redirect.
A requested section is saved only when auth, recovery, consent or onboarding
interrupts its navigation. State is a 30-minute httpOnly cookie, Secure in
production and SameSite=Lax; it contains only the allowlisted internal path and
expiry. It carries no account details, user input, or marketing query strings.

All existing auth, recovery, consent and onboarding gates still run. Once they
pass and the flow finishes at `/home`, the proxy resumes the original section
and consumes the cookie. A fully set-up signed-in reader opens the section
directly. New app entries (`/`) and other features cancel abandoned intent;
back/forward inside auth retains it, and a fresh CTA replaces it. API and prefetch
requests do not consume or overwrite it. Invalid/expired state is discarded on
document navigation and never acknowledged by the status endpoint.
Setup exceeding 30 minutes falls back to Home. State is per browser cookie jar;
concurrent setup tabs share the latest explicitly requested section.

Verification: `proxy.learningDestination.test.ts` uses real NextRequest and
NextResponse with mocked Supabase to exercise the interrupted journeys and
negative cases. It does not sign in a real user, create an account, or exercise
email delivery or Google's OAuth service.

## Prefetch normalization and committed navigation

Next 16.2.6 strips Flight/prefetch headers and `_rsc` before Proxy. On the earlier
head `a56468b`, an isolated production Next build/start fixture reproduced both
failures in Chromium: a background tab's `/community` prefetch deleted another
tab's pending CTA cookie (200), and `/home` consumed it (307). Requests sent
`rsc: 1` and `next-router-prefetch: 1` without `Purpose`. Raw Proxy mocks alone
did not reveal this normalization.

Only GET document navigations (`Sec-Fetch-Mode: navigate`,
`Sec-Fetch-Dest: document`) now save, cancel or resume intent. All other requests
still run every existing authentication/recovery/consent/onboarding gate.
URL normalization remains enabled. Fetch Metadata controls UX state only.

`LearningDestinationNavigation` acknowledges actually mounted client routes in
the persistent root shell, excluding auth/setup paths. A fresh authenticated,
read-only `/api/learning-destination` call
returns a stable opaque token for valid state, with `private, no-store`; no
destination or cookie value is exposed. If present, the helper replaces the
current URL with a document navigation, where Proxy owns all state changes.
Initial document hydration skips acknowledgement, so an old tab does not clear
new state created elsewhere. The tracker persists through auth/main route-group
changes, including a client return to the document's original `/home` path.
Aborted/stale responses cannot redirect a changed
page. Per-tab acknowledgement state prevents repeats; failed status/storage
calls leave intent untouched for a subsequent document navigation.

Cost: one status request (including authentication verification) per main-shell
client route change, and one extra document navigation when completing or
cancelling pending intent. A client transition can briefly render Home or the
chosen feature before the document navigation. Status/storage failures leave
the current page open; reload resumes/cancels as usual. Browsers without Fetch
Metadata cannot commit this UX state. Concurrent tabs share the latest requested
section; there is no claim of separate per-tab setup destinations.

Run `npx playwright install chromium`, then `npm run test:learning-navigation`.
The script builds/starts a temporary Next production fixture with the real
Proxy, status route and client helper, while replacing Supabase with fake
cookie-driven accounts and using small navigation controls. It covers both
background prefetch targets, stale cached payloads, cross-tab state, deliberate
client cancellation, consent/onboarding/session loss/reauthentication, status
failure, gate-query outage and fresh entry. It exercises real framework/browser
behavior, not real account forms, OAuth/email services or production backend
access. Vitest also runs requests through the pinned Next adapter and tests
status authentication, opacity, expiry, no-store and absence of state mutation.

Deploy this companion app change before enabling the marketing CTAs. The paired
marketing draft PR records source selection, exact mapping, analytics and
responsive checks. Neither draft PR authorizes a merge or deployment. Update
this allowlist and the marketing mapping together if published content IDs
change; unsupported routes continue using the existing Home flow.
