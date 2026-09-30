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
requests do not consume or overwrite it. Invalid/expired state is discarded.
Setup exceeding 30 minutes falls back to Home. State is per browser cookie jar;
concurrent setup tabs share the latest explicitly requested section.

Verification: `proxy.learningDestination.test.ts` uses real NextRequest and
NextResponse with mocked Supabase to exercise the interrupted journeys and
negative cases. It does not sign in a real user, create an account, or exercise
email delivery or Google's OAuth service.

Deploy this companion app change before enabling the marketing CTAs. The paired
marketing draft PR records source selection, exact mapping, analytics and
responsive checks. Neither draft PR authorizes a merge or deployment. Update
this allowlist and the marketing mapping together if published content IDs
change; unsupported routes continue using the existing Home flow.
