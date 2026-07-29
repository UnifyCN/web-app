# Sanity content issues — Practice & Quiz (English source)

Found during the Practice/Quiz translation run on **2026-07-27** against Sanity
`fercgabp` / `production`. Every item below is in **published** English content and was
verified by direct GROQ query, not inferred.

**Status as of 2026-07-28.** The translation run itself left all English source documents
untouched. Since then, **all five P0/P1 defects have been corrected and published** — the
English source is now clean of every P0/P1 issue found in the run. Each is marked inline
below. The P2 typos and P3 editorial items are still open.

The **228 translation drafts stay unpublished**, including `ecca3ca9`'s four — publishing
those remains a separate decision needing native review plus a Savar heads-up (mobile reads
the same dataset). Only English source documents were published.

Every fix changed `.text` / `.right_item` only. Published-vs-draft comparison confirmed that
all `_key`s, all `options[].value`s, and all `is_correct` flags stayed byte-identical, so the
228 translations are unaffected.

> **`.right_item` is not display-only — it is a grading value.** Unlike a `children[].text`
> edit, changing a matching pair's `right_item` *can* desync saved learner progress:
> `grade.ts` stores matching answers as `` `${pairKey}::${rightItem}` `` (`encodeMatch`) and
> re-grades them with `map.get(p._key) === p.right_item`, so a saved answer carrying the old
> string re-grades as wrong. Treat `right_item` like `options[].value`: check the saved-answer
> impact on the shared DB before publishing. (For #5 that check was run — see below.)

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

### 2. ✅ FIXED + PUBLISHED (2026-07-28) — `ecca3ca9-7b4a-4d22-a88d-2efc10f7d843` — "Activity: Mina's Story"

> English rewritten and **live**. The 4 translations were re-translated to match and stay
> as unpublished drafts (`drafts.ecca3ca9-…-{vi,es,hi,ar}`) with the other 224.

Answer box read: **`"Permanent residents must stay bla bla"`** — unfinished placeholder
copy in published content, where the PR residency obligation belongs. The activity asks
whether Mina (1 year in Canada, 4 years abroad over a 5-year period) keeps her PR; the
grader was correct, but the feedback explaining *why* was placeholder text.

**New English text:**

> Permanent residents must be in Canada for at least 730 days (2 years) in every 5-year
> period. The days do not need to be in a row, and some time abroad can count, such as
> living with a Canadian citizen spouse or working abroad for a Canadian business. Mina
> spent only 1 year in Canada, and time spent caring for family abroad does not count, so
> she does not meet the 730-day rule and can lose her PR status.

**Sourced against IRCC**, not written from memory — verified 2026-07-28:

- [How long must I stay in Canada to keep my permanent resident status?](https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=727&top=4)
  — "you must have been in Canada for at least **730 days** during the last five years.
  These 730 days don't need to be continuous. Some of your time abroad may count."
- [Can I lose my permanent resident status?](https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=1468&top=10)
  (date modified 2026-04-17) — same 730-day threshold.
- Searched for a 2026 change to the rule: none. 730-of-1,825 (IRPA s. 28) is current.

The wording deliberately reuses Lesson 2.1's (`b6faf6d6`) own phrasing — "730 days
(2 years) in every 5-year period", "do not need to be in a row" — in **all five
languages**, so the answer box reads as a callback to the lesson rather than new copy.

Structure untouched: one block, one span, `.text` only. `_key`s, `options[].value`
(`yes` / `no`) and `is_correct` verified byte-identical across all five documents.

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

### 5. ✅ FIXED + PUBLISHED (2026-07-28) — `051870f8-3cab-4933-8130-0dcc31f61538` — "Match the Goal to the Investment"

> Now reads `"Mix of stocks and bonds in a TFSA/RRSP"`. Live. (Corrected as a draft
> earlier the same day, then published once the saved-progress impact below was checked.)

A `quiz` doc (lesson `5d6a2fa5`) with one `matching` question: three goals matched to
investment types. Matching pair `6c6e4189da1c` right_item reads `"Mix of stocks and bonds
in a TSFA/RRSP"` — the account is **TFSA**. Translations already use `TFSA/RRSP` in all
four languages, so no re-translation is needed. Re-verified 2026-07-28: the draft differs
from published in that one string and nothing else; all `_key`s identical.

**Saved-progress impact — checked before publishing, and it is nil.** Per the `right_item`
caveat above, a rename can invalidate stored matching answers. Querying the shared DB:
`user_lesson_quiz_progress` has exactly **1 row** carrying the stale `TSFA` string (0 in
`user_submodule_practice_progress`). That row is already `is_completed: true` with
`score: 0/1` — the learner mismatched a different pair (`e924d3f0a245`), so the question
grades false before and after. **No stored score changes.** The only visible effect is that
on review, one previously-green pair renders red inside an answer already marked wrong.

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

- **Standalone "Canada" in hi/ar — needs a corpus-wide ruling, not per-doc patching.**
  This note previously read that the 378 lesson/checklist translations use native script
  (कनाडा / كندا) for a standalone country reference and Latin only for compound official
  names ("Service Canada", "Canada Child Benefit"), and that `c56bfc62` was patched to match.
  **That generalization does not hold.** Spot-checking the PR submodule (`8d642532`): Lesson
  2.1 (`b6faf6d6`) uses Latin `Canada` standalone in all four languages ("आपको Canada में
  रहना होगा", "يجب أن تعيش في Canada"), as does Lesson 2.2 (`a46b96d0`) and `ecca3ca9`'s own
  spans — while `c56bfc62`'s patched answer box and scattered lines in the same documents use
  कनाडा / كندا. The corpus is genuinely mixed, including *within single documents*.
  The `ecca3ca9` rewrite (P0 #2) therefore kept **Latin `Canada`**, matching the document it
  sits in and the lesson it paraphrases, rather than re-litigating the convention one doc at a
  time. Pick one rule and sweep it across all 606 translation drafts in a single pass.
- **Personal names in hi/ar — needs a ruling.** Four of five practice batches transliterate
  names (Sofia → सोफिया / صوفيا, Ali → अली / علي); one kept **"Abdul"** in Latin in
  `be556dbe`. Left as-is deliberately — the Arabic form of a bare "Abdul" is ambiguous and
  guessing at a person's name is worse than an inconsistency. Pick one convention.
- **"permanent resident" in Spanish** — kept in English inline in `f769d6cb` under the
  "status terms as they appear on official forms" rule. Reads stiff where *residente
  permanente* is standard. Easy to flip.
