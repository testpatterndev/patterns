# Backlog ticket: eu-vat-spacing — spaced presentations for eu-vat-number

- **Pattern:** `data/patterns/eu-vat-number.yaml`
- **Version:** 1.0.0 → 1.1.0
- **Date:** 2026-07-08
- **Scope:** accept the officially spaced VIES renderings for exactly the rows the VIES FAQ Q11
  format table prints with spaces — no other member state gains spacing.

## Research: which member states are OFFICIALLY rendered with spaces

The live VIES site (`https://ec.europa.eu/taxation_customs/vies/`) is a JavaScript app whose FAQ
table is not fetchable statically, so the Q11 format table was corroborated through independent
mirrors of that table, per the pattern's existing reference convention.

| Row | Official rendering (verbatim from mirrors) | Block structure | Evidence |
|-----|--------------------------------------------|-----------------|----------|
| DK  | `DK99 99 99 99` | 4 blocks of 2 digits | Marosa VAT ("DK99 99 99 99 — 4 blocks of 2 digits"); vatify.eu VIES mirror (same string); openapi.com/blog/european-vat-numbers ("divided into 4 blocks of 2 digits"). Matches the final-review example: VIES's own DK row renders `12 34 56 78`. |
| FR  | `FRXX 999999999` | 1 block of 2 characters + 1 block of 9 digits | Marosa VAT ("FRXX 999999999 — 1 block of 2 characters and 1 block of 9 digits"); vatify.eu VIES mirror (same string). Note: Wikipedia renders an example as `FR XX 999 999 999`, but the VIES table itself prints the SIREN as a single 9-digit block — the ticket instructs to follow VIES mirrors, so only the single key/SIREN space is accepted. |
| XI  | `XI999 9999 99`, `XI999 9999 99 999` | 3+4+2 digit blocks, optional trailing 3-digit branch-trader block | vatify.eu VIES mirror ("XI999 9999 99"); LookupTax NI TIN guide (both spaced forms verbatim, with block decomposition); inherited from the pre-Brexit GB row of the same EU table. `XIGD999`/`XIHA999` government/health forms are printed solid — left unchanged. |

**All other rows** (AT, BE, BG, CY, CZ, DE, EE, EL, ES, FI, HR, HU, IE, IT, LT, LU, LV, MT, NL,
PL, PT, RO, SE, SI, SK): every consulted mirror prints them as a single continuous block.
vatify.eu explicitly: "No other EU member state formats in the table contain spaces or
separators." Avalara's table (already a reference in the YAML) shows all formats solid and
confirms no additional spaced rows.

Sources consulted:
- https://marosavat.com/resources/vat-number-formats (VIES FAQ table mirror)
- https://www.vatify.eu/vat-number-eu.html (VIES FAQ table mirror)
- https://lookuptax.com/docs/tax-identification-number/northern-ireland-tax-id-guide (XI row)
- https://openapi.com/blog/european-vat-numbers (DK corroboration)
- https://www.avalara.com/us/en/vatlive/eu-vat-rules/eu-vat-number-registration/eu-vat-number-formats.html (negative corroboration — all solid)
- https://en.wikipedia.org/wiki/VAT_identification_number (FR example noted and deliberately NOT followed where it diverges from VIES)

## Regex changes (3 branches touched, 25 untouched)

Corpus convention check: sibling patterns use bounded literal-space classes `[ ]`
(au-marking-official/sensitive, in-passport-number), never free `\s{n}`. Followed.

| Branch | Before | After |
|--------|--------|-------|
| DK | `DK\d{8}` | `DK(?:\d{8}|\d{2}(?:[ ]\d{2}){3})` — solid OR fully blocked; mixed/partial spacing rejected |
| FR | `FR[A-HJ-NP-Z0-9]{2}\d{9}` | `FR[A-HJ-NP-Z0-9]{2}[ ]?\d{9}` — one optional space between key and SIREN |
| XI | `XI(?:\d{9}(?:\d{3})?\|GD[0-4]\d{2}\|HA[5-9]\d{2})` | `XI(?:\d{9}(?:\d{3})?\|\d{3}[ ]\d{4}[ ]\d{2}(?:[ ]\d{3})?\|GD[0-4]\d{2}\|HA[5-9]\d{2})` — solid OR fully blocked 3-4-2(-3) |

Both the top-level `pattern:` and the `purview.regexes[0].pattern` copy were updated and verified
byte-identical.

## Test cases added

should_match (+4): `DK12 34 56 78`, `FR40 303265045`, `XI123 4567 89`, `XI123 4567 89 012`.

should_not_match (+5): `DK12 3456 78` (mixed grouping), `DK12 34 56` (3 of 4 blocks),
`FRXX 123 456 789` (SIREN split into triplets — not the VIES rendering), `XI123 45 6789`
(3-2-4 wrong grouping), `DE12 345 678 9` (undocumented spacing on an untouched branch).
All negatives were chosen so no matching substring exists anywhere in the value, because the
harness uses `RegExp.test` (search semantics).

## Empirical verification

Node loop test (scratchpad `euvat-test.mjs`) run against both the old and new compiled regex:

- 42 solid positives covering every branch and sub-form (AT, BE×2, BG×2, CY, CZ×3, DE, DK, EE,
  EL, ES×3, FI, FR×2, HR, HU, IE×3, IT, LT×2, LU, LV, MT, NL, PL, PT, RO×2, SE, SI, SK, XI×4) —
  all match OLD and NEW (no solid-form regression).
- 31 solid negatives (length/prefix/structure violations incl. GR, GB, XIGD512, XIHA499) —
  rejected by OLD and NEW.
- 5 spaced positives — matched by NEW only.
- 7 spaced negatives (wrong/mixed/over-grouping + undocumented DE spacing) — rejected by NEW.
- Sentence-embedding and overlong-trailing-block boundary checks
  (`DK12 34 56 789`, `XI123 4567 890` correctly rejected).
- Result: `ALL PASS (73 solid, 12 spaced cases)`.
- Separate YAML-loaded check: all should_match/should_not_match in the shipped file pass against
  the shipped pattern string.

Known bounded limitation (shared with every alternation regex without lookaround): an over-long
*spaced* sequence such as `DK12 34 56 78 90` contains the valid 4-block substring and would fire
on the substring. Negative test values were therefore chosen as wrong-grouping forms with no
valid substring; adding trailing negative lookaheads was rejected as it would suppress
legitimate matches followed by unrelated numerics (e.g. `... 78 99 DKK`).

## Gates

- `npm run check` — 0 errors; no eu-vat-number warnings.
- `npm run check:quality` — Quality gate PASSED.
- `npm run compile` — Done: 1655 patterns compiled; `patterns.json` reverted before staging per
  workflow instructions.
