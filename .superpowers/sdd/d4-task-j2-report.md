# D4 Task j2-asia — Report

Date: 2026-07-08 · Branch: worktree-wf_2084d11b-7fa-4 (isolated worktree of feat/coverage-waves-d4)
Author: implementer agent, Coverage Wave D4

## Summary

Shipped 3 patterns, documented 3 skips.

| Slug | Outcome |
|---|---|
| hk-passport-number | SHIPPED |
| th-passport-number | SHIPPED |
| my-tax-number | SHIPPED |
| my-drivers-license | SKIP (no separate licence number; identifier is the NRIC — duplicate of my-identity-card) |
| th-drivers-license | SKIP (no publicly corroborated licence-number format) |
| hk-drivers-license | SKIP (licence number is the HKID — pure duplicate of hk-identity-card) |

All patterns follow the D1 identifier conventions: no bare/value-only tier — every tier (85/75/65)
requires positive keyword evidence; recommended_confidence = 75 (evidence-gated workhorse tier);
tier structure mirrors the panel-approved Track B wave-1 exemplars (85 = evidence min_count 2 unique +
template exclusion, 75 = evidence + template exclusion, 65 = evidence). Regexes are Purview-safe
(no free wildcards, no anchors, no captures, bounded quantifiers, boundary-guarded).

AllDigitsSameFilter note: the D4 conventions require the filter for fixed-length *numeric* identifiers.
All three shipped formats are letter-prefixed (H/K/KJ, 1-2 letters, IG/OG/SG), matching the corpus
convention that letter-prefixed identifiers (my-passport-number, sg-drivers-license) do not carry the
filter; the my-tax-number digit run is also variable length (9-11), so the filter is not applicable.
Documented in each pattern's false_positives/operation where relevant.

## Shipped patterns

### 1. hk-passport-number — HKSAR Passport Number

Format (verified): nine characters total. Current series **H + 8 digits**; earlier biometric series
**K + 8 digits**; **KJ + 7 digits** for 48-page "jumbo" booklets (J = JUMBO).

Regex: `\b(?:H|K)\d{8}\b|\bKJ\d{7}\b`

Sources:
- https://en.wikipedia.org/wiki/Hong_Kong_Special_Administrative_Region_passport — "A valid Hong Kong
  passport number consists of nine characters: one or two uppercase letters, followed by six digits,
  and ending with one or two letters or digits."
- https://zh.wikipedia.org/zh-hk/中華人民共和國香港特別行政區護照 — Chinese-language corroboration of series.
- https://en.namu.wiki/w/홍콩%20여권 — "passport numbers used to start with H, K or KJ, but now it only
  starts with H."
- https://www.hk01.com/政情/268775/... — HK01 analysis of HKSAR passport numbering: K/KJ series issued
  since the 2007 biometric passport; KJ's "J" denotes the 48-page JUMBO booklet.
- https://www.immd.gov.hk/eng/residents/immigration/traveldoc/hksarpassport/characteristics.html —
  Immigration Department e-passport physical features (issuing-authority reference; does not publish
  the numbering scheme itself).
- https://www.elegislation.gov.hk/hk/cap539 — HKSAR Passports Ordinance (Cap. 539), cited regulation.

PRADO (consilium.europa.eu) returned HTTP 403 in this environment and could not be consulted; the
format rests on four mutually corroborating secondary sources including the two independent wiki
communities and a Hong Kong news analysis. Judged sufficient: all sources agree on 9 characters and
the H/K/KJ series.

Collision surface: H/K + 8 digits overlaps my-passport-number (`\b[AHK]\d{8}\b`); different
jurisdiction/keywords disambiguate — documented in false_positives.

Test verification: node script (String.raw + RegExp), 6 positive / 7 negative cases — all pass.

### 2. th-passport-number — Thailand Passport Number

Format (verified): **A123456** (1 letter + 6 digits, older series), **AA123456** (2 letters + 6 digits),
**AA1234567** (2 letters + 7 digits, current e-passport series — 9 characters, matching the MRZ
document-number field length).

Regex: `\b(?:[A-Z]\d{6}|[A-Z]{2}\d{6,7})\b`

Sources:
- https://th.wikipedia.org/wiki/หนังสือเดินทางไทย — "หนังสือเดินทางเลขที่ (Passport No.): มีรูปแบบเป็น A123456
  หรือ AA123456 หรือ AA1234567" (explicit format statement).
- https://trustdochub.com/en/product/thai-passport-validity/ — MRZ document number: 9 alphanumeric
  characters (consistent with the AA1234567 current form).
- https://en.wikipedia.org/wiki/Thai_passport — issuing authority context (Department of Consular
  Affairs, MFA); no explicit number format.
- https://mfa.go.th/en/page/electronic-passport — MFA e-passport page (issuing authority reference).

Collision surface: deliberately narrow digit counts (6-7); 1-letter form overlaps unbracketed HKID
prefixes (A123456) — documented in false_positives with keyword-gating mitigation. All tiers
evidence-gated; Thai-script keywords included.

Test verification: 6 positive / 6 negative cases — all pass (incl. 3-letter prefix, 5-digit and
8-digit near-misses).

### 3. my-tax-number — Malaysia Tax Identification Number (LHDN TIN)

Format (verified): individual TIN = prefix **IG** (current, since 2 Jan 2023) or legacy **SG / OG**
followed by **9-11 digits** (11-13 characters total). Entity TINs (C, CS, D, E, F, FA, PT, TA, TC, TN,
TR, TP, J, LE + digits, always ending 0 since 2023) are deliberately OUT of scope: they are not
personal data and single-letter prefixes over digit runs are heavily collision-prone. Scope decision
documented in the pattern description and false_positives.

Regex: `\b(?:IG|OG|SG)\s?\d{9,11}\b`

Sources:
- https://www.hasil.gov.my/media/1iblexbc/malaysia-tin.pdf — LHDN's OECD AEOI TIN information sheet
  (primary; PDF body not extractable in this environment but is the authoritative reference).
- https://sdk.myinvois.hasil.gov.my/faq/ — LHDN MyInvois SDK FAQ (primary): "The new prefix for
  individual TIN is now 'IG' (replacing 'OG' or 'SG')"; TIN maximum length 14 characters including
  prefix; entity prefixes C, CS, D, F, FA, PT, TA, TC, TN, TR, TP, J & LE; entity TIN always ends 0.
- https://lookuptax.com/docs/tax-identification-number/malaysia-tax-id-guide — "Individual TINs begin
  with the prefix IG followed by 9-11 numeric digits, giving a total length of 11-13 characters"
  (examples IG115002000, IG4040080091, IG56003500070).
- https://www.cleartax.com/my/en/tin-malaysia — "A 9-11-digit unique identifier follows the 'IG'
  prefix"; prefix change effective 2 Jan 2023 from SG/OG.

Digit-range adjudication: lookuptax and ClearTax agree on 9-11 digits (11-13 chars); the MyInvois FAQ's
"max 14 characters" is an input-field bound, not a format statement, so 9-11 was used. `TIN` and `LHDN`
keyword terms are case-sensitive per the shortAcronyms quality gate convention.

Test verification: 4 positive / 6 negative cases — all pass (8-digit too-short, 12-digit too-long,
entity C prefix, wrong prefix, embedded run).

## Documented skips

### my-drivers-license — SKIP

Research finding: current Malaysian PDL/CDL licences carry **no separate licence number**. The card
displays the holder's NRIC ("No. Pengenalan / Identity No.") and JPJ systems (mySIKAP, MyJPJ, the
malaysia.gov.my licence-status check) key licence records to the IC number.

- https://driving-school.com.my/driving-license/number/ — "the new Probationary Driving License (PDL)
  and Competent Driving License (CDL) both have no numbers … our driving license number is linked to
  our identity card number."
- https://www.malaysia.gov.my/en/digital-services/driving-license-check — licence status check via JPJ
  portal login (IC-number keyed).
- https://en.wikipedia.org/wiki/Driving_licence_in_Malaysia — no separate licence-number field documented.

A my-drivers-license pattern would regex-duplicate my-identity-card (`\b\d{6}-?\d{2}-?\d{4}\b`), which
the conventions (rule 4) call out as the expected skip case: "reuse the national ID as the licence
number … if a pure duplicate of an existing SIT, SKIP with rationale."

### th-drivers-license — SKIP

Research finding: no credible public specification of the Thai DLT driving-licence number format was
found. Checked: Wikipedia "Driving licence in Thailand" (no number format), ID Analyzer's Thailand
supported-documents page (fields listed, no format), DLT guides and expat documentation (application
process only). Without an issuing-authority or corroborated format spec, any regex would be guessed —
documented skip per conventions rule 3 ("a documented skip beats a guessed regex").

- https://en.wikipedia.org/wiki/Driving_licence_in_Thailand
- https://www.idanalyzer.com/solutions/supported-documents/th.html

### hk-drivers-license — SKIP

Research finding: the Hong Kong driving licence number **is** the holder's HKID number (or travel
document number, with a C/P/Y classification letter for non-HKID holders). This is a pure duplicate of
hk-identity-card (`\b[A-Z]{1,2}\d{6}\s?\(?[0-9A]\)?(?![A-Za-z0-9])`), the outcome the task brief
anticipated.

- https://en.wikipedia.org/wiki/Driving_licence_in_Hong_Kong — "Driving license number, same with the
  holder's Hong Kong Identity Card number or travel document number."
- https://www.td.gov.hk/en/public_services/licences_and_permits/driving_licences/index.html — Transport
  Department licensing services (issuing authority).

## Gates (run in this worktree after `npm install`)

- `npm run check` — **0 errors** (51 pre-existing warnings on other files; none for the 3 new patterns)
- `npm run check:quality` — **Quality gate PASSED** (0 issues in fail-on categories outside exclusion set)
- `npm run compile` — **succeeds** (1599 patterns compiled); `git checkout -- patterns.json` applied before staging
- Empirical regex verification: node script, all 16 positive / 19 negative checks pass
