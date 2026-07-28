# Sanity content issues — Practice & Quiz (English source)

Found during the Practice/Quiz translation run on **2026-07-27** against Sanity
`fercgabp` / `production`. Every item below is in **published** English content and was
verified by direct GROQ query, not inferred.

**Status as of 2026-07-28.** The translation run itself left all English source documents
untouched. Since then, four defects have been corrected — **P0 #1, #3, #4 published**, and
**P1 #5 corrected but held as an unpublished draft** pending sign-off. Each is marked
inline below. Everything else here is still open, and **P0 #2 (`ecca3ca9`) is deliberately
untouched** — it needs IRCC-sourced wording plus re-translation in all 4 languages.

Every fix so far changed `.text` / `.right_item` only. Published-vs-draft comparison
confirmed that all `_key`s, all `options[].value`s, and all `is_correct` flags stayed
byte-identical, so saved learner progress and the 228 translations are unaffected.

## Rules for anyone fixing these

- **Never change a `_key`.** 228 translation drafts (57 docs × vi/es/hi/ar) were written
  with `_key`s byte-identical to their English source. `_key` is the grading key —
  `components/learn/practice/grade.ts` stores answers as option `_key`s in
  `user_submodule_practice_progress.answers`. Regenerating one mis-grades saved progress.
- **Never change `options[].value`** for the same reason — it identifies the option.
- Text-only edits inside `children[].text` are safe and will not disturb translations.
- Editing a published doc through the Sanity MCP creates a **draft**; it does not go live
  until published.

---

## P0 — Wrong or missing content, live to learners

### 1. ✅ FIXED + PUBLISHED (2026-07-28) — `2fe61c79-bd30-44b1-8cd6-1976d4b5e6f4` — "Looking for Rental Housing"

> Answer box now reads **`"Red Flags: A, B, C"`**, matching the grader. Live.

*Housing → Understanding Rental Agreements.* Question: **"Which of these are red flags
when searching for housing?"** (`multiple_choice_multiple`)

| | Option text | `is_correct` |
|---|---|---|
| A | Landlord asks for SIN before showing the unit. | `true` |
| B | Listing price is far below market average. | `true` |
| C | You're asked to pay a deposit before seeing the unit. | `true` |
| D | Landlord provides a written agreement with RTB form. | **`false`** |

Answer box currently reads: **`"Red Flags: A,B, D"`**

The **grader is correct and the feedback text is wrong**, and the error inverts safety
advice in a scam-awareness lesson:

- It tells newcomers that a landlord **providing a written RTB agreement is a red flag**.
  That is the opposite of true — a standard Residential Tenancy Branch agreement is the
  strongest signal a rental is legitimate.
- It **omits C** (deposit requested before viewing), one of the most common rental scams
  targeting newcomers.

A learner who answers correctly (A, B, C) is graded correct, then shown feedback
contradicting their correct answer.

**Fix:** answer box → `"Red Flags: A, B, C"`. Text-only; no `_key` or grading change.

> The vi/es/hi/ar translations already say **A, B, C**, matching the grader. Until the
> English is fixed, English learners see wrong feedback and translated learners see
> correct feedback.

### 2. ⛔ STILL OPEN — BLOCKED ON SOURCED WORDING — `ecca3ca9-7b4a-4d22-a88d-2efc10f7d843` — "Activity: Mina's Story"

> Deliberately not auto-fixed. This is immigration guidance shown to newcomers, so the
> replacement must be authored against current IRCC wording by a person, not inferred.
> It is also the only item requiring re-translation. Tracked in `BACKLOG.md`.

Answer box reads: **`"Permanent residents must stay bla bla"`** — unfinished placeholder
copy in published content, where the PR residency obligation belongs.

**Fix:** author the real clause (the obligation is 730 days of physical presence in Canada
in every 5-year period — confirm against current IRCC wording before publishing).

> The translator deliberately did **not** invent this text — it is immigration guidance —
> and carried `bla bla` through verbatim in all four languages. **After the English is
> fixed, re-translate this field in all 4 languages.** This is the only item requiring
> re-translation.

### 3. ✅ FIXED + PUBLISHED (2026-07-28) — `ad1aa163-9193-4cbc-86dd-b214dbacf66b` — "Rental Quiz"

> Both options now carry the `C) ` prefix. `value` (`c`) and `is_correct` untouched. Live.

Two options are missing the letter prefix every sibling has, while the answer box cites
that letter — so the feedback references an option the learner cannot identify:

- Q2 option `8e1d52223035` = `"It becomes a month-to-month tenancy"` (answer box says "C) …")
- Q3 option `0a5f10619cac` = `"Participatory Hearing"` (siblings are "A)" / "B)" / "D)")

**Fix:** add the `C) ` prefix to the option **text**. Leave `value` (`c`) and `is_correct`
untouched. Translations already include the prefix.

### 4. ✅ FIXED + PUBLISHED (2026-07-28) — `b29a34f2-cb58-41bd-b220-c426ff466202` — "Home Buying Quiz"

> Answer box now reads **`"5% of first $500,000 = $25,000"`**. Live.

Q1 answer box block 1 reads `"5% of first $500,000 = $25,"` — **truncated**. The next block
(`"$25,000 + $40,000 = $65,000"`) and `correct_answer.value` of `["$65,000"]` confirm it
should be `$25,000`.

**Fix:** `"5% of first $500,000 = $25,000"`. Translations already render the full figure.

---

## P1 — Factual error

### 5. ⏸️ CORRECTED, HELD AS DRAFT (2026-07-28) — `051870f8-3cab-4933-8130-0dcc31f61538`

> `drafts.051870f8-…` already reads `"Mix of stocks and bonds in a TFSA/RRSP"`. Not
> published — the publish request named only the three P0 docs. Publish the draft to
> take it live.

Matching pair `6c6e4189da1c` right_item reads `"Mix of stocks and bonds in a TSFA/RRSP"` —
the account is **TFSA**. Translations already use `TFSA/RRSP`.

---

## P2 — Typos (translations already render these correctly)

| Doc | Current | Should be |
|---|---|---|
| `130d9366` | "Wait times at the ER **may much longer**…" | "may **be** much longer" |
| `be556dbe` | "Scenario:Abdul's…" / "Question:What…" | space after the colon |
| `7b25712f` | "You need **atleast** 2 years (730 days)!" | "at least" |
| `d1a1308b` | "Match the **Situtation**!" / "**Its** important…" | "Situation" / "It's" |
| `7cb5729a` | "Good attempt! **however**, only Canadian Citizens…" | "However"; capitalization of "Citizens"/"Elections" is also inconsistent with the explanation directly below |
| `fdf8c9f0` | block `269d15598140` opens `“` closes `"` | matched curly quotes |
| `f86f142d` | "MSP stands for\_\_\_\_." | space before the blank; "Quick Check: Scam In-Action" also reads oddly |
| `8311cb36` | page 1 "Scenario 1" while pages 2–3 say "Scenario 2/3", "Scenario 3/3" | "Scenario 1/3" |

---

## P3 — Needs an editorial or structural decision

- **`3f35abf8`** — titled "Activity: Citizenship" with a citizenship-eligibility
  `description`, but its only page is about PR card / eCOPR / PRTD travel timing.
  Retitle, or move the content.
- **`8311cb36`** — page 3 has no input box, unlike pages 1 and 2, so the learner has
  nowhere to type an answer. Looks unintended.
- **`b29a34f2`** — the Q1 answer box never states where the `$40,000` comes from (10% of
  the remaining $400,000). No block was invented, so the explanation is incomplete in all
  five languages.
- **`699227c0`** — on page 5 an option's `explanation` block reuses the same `_key` pair
  (`d8511ddd24b1` / `ce13aab8ab1a`) as that page's `answer_box` block. Separately,
  `"Eligible "` (trailing space) is the `value` for both a **correct** and an **incorrect**
  option on different pages — `value` is meant to identify an option.
- **`fedb4058`** — in `answer_box.content`, span `_key` `fd45d8bc4c52` is reused across two
  blocks and `1a359447eeac` across three. Legal in Sanity (different parent arrays) but
  fragile. Reproduced verbatim in translations rather than regenerated.

---

## Translation-side notes (not source issues)

- **Standalone "Canada" in hi/ar — fixed during the run.** The existing 378
  lesson/checklist translations use native script (कनाडा / كندا) for a standalone country
  reference and Latin only for compound official names ("Service Canada", "Canada Child
  Benefit"). One batch diverged on `c56bfc62`; both drafts were patched and `_key` sets
  re-verified byte-identical.
- **Personal names in hi/ar — needs a ruling.** Four of five practice batches transliterate
  names (Sofia → सोफिया / صوفيا, Ali → अली / علي); one kept **"Abdul"** in Latin in
  `be556dbe`. Left as-is deliberately — the Arabic form of a bare "Abdul" is ambiguous and
  guessing at a person's name is worse than an inconsistency. Pick one convention.
- **"permanent resident" in Spanish** — kept in English inline in `f769d6cb` under the
  "status terms as they appear on official forms" rule. Reads stiff where *residente
  permanente* is standard. Easy to flip.
