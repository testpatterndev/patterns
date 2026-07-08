# D4 Task j5 — East Asia + matrix remainder (jurisdiction fill)

Implementer report. Worktree: `Z:\patterns\.claude\worktrees\wf_2084d11b-7fa-7`, branch `worktree-wf_2084d11b-7fa-7`.

## Shipped (2 patterns)

### 1. ph-tin — Philippine Taxpayer Identification Number (TIN)

**Format verified (task said "9 or 12 digit — verify"; verification found a third, 14-digit form):**

- Base TIN: 9 digits, written `XXX-XXX-XXX`; 9th digit is a BIR check digit (algorithm not public).
- Branch code suffix: historically 3 digits (`000` head office → 12 digits total).
- **Since eBIRForms v7.9.6.0 (RMC No. 036-2026, released 2026-04-28) the branch code field is 5 digits → 14 digits total.** The regex therefore accepts 9, 9+3 and 9+5 digit forms with optional dash/space separators:
  `\b\d{3}[- ]?\d{3}[- ]?\d{3}(?:[- ]?(?:\d{5}|\d{3}))?\b`

**Sources:**
- BIR eFPS help (issuing authority): TIN = 9 digits + 3-digit branch code, default 000 — https://efps.bir.gov.ph/efps-war/EFPSWeb_war/help/help_03e.html (surfaced via site:bir.gov.ph search; page body confirmed in search index, direct fetch blocked by certificate error)
- BIR RMO No. 23-91 (legal basis for the TIN structure) — https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/10/49676
- RMC No. 036-2026 branch-code expansion 3→5 digits — https://taxify.ph/blog/tin-branch-code-5-digits-large-business-guide/
- Structure corroboration (classification prefix, sequential body, check digit, branch code): https://orus.ph/tin-format/ and https://lookuptax.com/docs/tax-identification-number/philippines-tax-id-guide

**Design decisions:**
- D1 rule 1: bare 9/12/14-digit runs are ambiguous → NO value-only tier. Tiers: 85 (label-context regex + specific keywords + template exclusion), 75 (specific keywords + exclusion), 65 (domain keywords + exclusion). recommended_confidence 75.
- Check digit not regex-expressible → documented in operation/false_positives; AllDigitsSameFilter applied (D1 rule 2).
- `TIN`, `BIR`, `RDO` keywords are case_sensitive (short-acronym quality rule).
- Collision surface documented: unseparated PhilSys 12-digit numbers, US SSN 9-digit runs, PH mobile numbers (tested non-matching: `0917-123-4567`), partial match of 9-digit core inside `123-456-789-0001`.
- Empirical node verification: 15/15 structural cases pass (9/12/14-digit dashed/spaced/unseparated match; 8, 10, 11, 13, 15, 16-digit runs do not match — boundary behaviour confirmed against credit-card and neighbouring-country runs).

### 2. ua-tax-number — Ukrainian Individual Tax Number (RNOKPP/RNTRC)

**Format verified:** ten-digit numerical code, no letters/hyphens/symbols; structure `XXXXXNNNNK` (5-digit birth-date registration sequence, 4-digit account-card sequence, control digit). Regex: `\b\d{10}\b`.

**Sources (primary):**
- OECD AEOI — Ukraine Information on Tax Identification Numbers (PDF read in full): "RNOKPP is the ten-digit numerical code (without use of letters, hyphens, or other symbols). The structure of RNOKPP is as follows: XXXXXNNNNK" — https://www.oecd.org/content/dam/oecd/en/topics/policy-issue-focus/aeoi/ukraine-tin.pdf
- State Tax Service of Ukraine (cited in pattern; direct fetch returned HTTP 403 but the OECD document names it as the contact/authority) — https://tax.gov.ua/en/individuals/obtaining-registration-number-of-the-taxpayers-account-card/what-is-the-taxpayers-account-card-number/
- Legal basis: Tax Code of Ukraine Art. 63 §63.6; MinFin Order No. 822 of 29.09.2017 — https://zakon.rada.gov.ua/laws/show/z1306-17#Text

**Design decisions:**
- A bare 10-digit run is maximally ambiguous (UA mobile numbers `0XXXXXXXXX`, US phone numbers) → NO value-only tier; all three tiers keyword/label-gated (85/75/65), recommended_confidence 75. Phone collision explicitly documented in false_positives.
- Weighted mod-11 control digit not regex-expressible → documented; AllDigitsSameFilter applied.
- Cyrillic label-context regex terms (РНОКПП, ІПН, ідентифікаційний номер) follow corpus precedent (tw-national-id embeds CJK in label regex). Note: JS `\b` is ASCII-only so Cyrillic alternatives don't fire in the node harness; all should_match test values also match the primary numeric regex, so ci-check passes regardless. Boost.Regex (Purview) treats Cyrillic as word characters.
- Deliberately scoped to individuals: the 8-digit EDRPOU entity code and the 9-digit STS-assigned entity number (`77/88` prefix) are distinct identifiers and are NOT covered (should_not_match includes an EDRPOU case).

## Documented skips (3)

### cn-drivers-license — SKIP (pure duplicate of cn-resident-id)

Research confirmed the PRC motor-vehicle driving licence number (证号) IS the holder's 18-digit resident identity card number: one ID card = one licence, and the licence number adopts the citizen ID number (公民身份号码) per MPS practice (MPS Order No. 162 governs issuance; licence displays the identity document number as the licence number). The corpus already ships `cn-resident-id` with pattern `\b[1-9]\d{5}(19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b`, which fully covers the value space. A separate SIT would double-fire on every Chinese ID number. The licence also carries a separate 12-digit file number (档案编号/档案号), but it is structurally a generic 12-digit run with no publicly documented national format standard — not authorable under the quality bar.
Sources:
- https://www.gov.cn/gongbao/content/2022/content_5679696.htm (MPS Order No. 162, 机动车驾驶证申领和使用规定)
- https://www.icauto.com.cn/baike/65/655597.html and https://www.autohome.com.cn/ask/1415586.html (licence number = ID number; only divergence is legacy 15-digit IDs not yet renewed)
- https://en.wikipedia.org/wiki/Resident_Identity_Card (18-digit citizen ID structure)

### tw-drivers-license — SKIP (pure duplicate of tw-national-id)

The number on a Taiwan driver's licence is the holder's national ID number: "The number on a license is the same as the ID number of the license holder's household registration in Taiwan" (Wikipedia, corroborated by Taipei City Motor Vehicles Office guidance that a changed UI No. propagates to the licence). The corpus already ships `tw-national-id` (`\b[A-Z][12]\d{8}\b`). The licence's separate 管轄編號 (control/management number, e.g. 13-digit `8000000000000` in specimen images) has no verifiable public format specification from the Highway Bureau/MOTC — a guessed regex would violate the quality bar.
Sources:
- https://en.wikipedia.org/wiki/Driver%27s_license_in_Taiwan
- https://tpcmv.thb.gov.tw/en/cp.aspx?n=10290 (Taipei City Motor Vehicles Office)
- https://www.thb.gov.tw/en/cp.aspx?n=616 (Highway Bureau, MOTC)

### mx-drivers-license — SKIP (no national standard; expected outcome per task spec)

Mexican driver's licences are issued by the 31 states plus Mexico City with no federal standardisation — at least 32 distinct layouts and numbering systems; some states prefix a state abbreviation (e.g. `SON9876543`), others use CURP-derived or purely numeric schemes. No single regex can represent this without unacceptable false-positive surface, and no issuing-authority format specification exists at the national level. The federal Licencia Federal de Conductor (commercial drivers only) post-2021 uses an "LFD" prefix, but its numbering format is not publicly specified by SICT to the standard the quality bar requires — too narrow and under-documented to ship.
Sources:
- https://idscan.net/blog/how-to-verify-mexican-drivers-licenses-en/ ("issued at the state level with no federal standardization... at least 32 unique formats")
- https://regulaforensics.com/blog/mexican-id-processing/ (each jurisdiction uses its own layout/fields)
- https://www.fmcsa.dot.gov/international-programs/recording-correct-commercial-motor-vehicle-drivers-license-number-drivers (state abbreviation prefixes; LFD for federal licences after 2021-04-01)
- https://en.wikipedia.org/wiki/Driving_licence_in_Mexico

## Gates

- `npm install`: clean (fresh worktree).
- `npm run check`: **0 errors**, 53 warnings — the only 2 warnings attributable to this task are the intentional filter-dependent negatives (`ph-tin` `000-000-000-000`, `ua-tax-number` `5555555555`), which ci-check explicitly classifies as expected downstream-filter cases.
- `npm run check:quality`: **PASSED** (0 issues in fail-on categories outside the exclusion set).
- `npm run compile`: succeeds — 1598 patterns (1596 baseline + 2 new); `patterns.json` reverted via `git checkout -- patterns.json` before staging.
- Empirical regex verification: node script (String.raw + new RegExp) — all 24 assertions pass for the shipped regexes (3 Cyrillic label-regex assertions fail only under JS ASCII `\b`, documented above; not load-bearing for ci-check or Purview).

## Adjudications / concerns

- **ph-tin 14-digit form**: task spec said "9 or 12 digit — verify"; verification surfaced the 2026 branch-code expansion to 5 digits (RMC No. 036-2026). Shipped with all three lengths — omitting the 14-digit form would miss every post-April-2026 corporate TIN.
- **ph-tin vs ph-national-id overlap**: an unseparated 12-digit TIN and an unseparated PhilSys number are both 12-digit runs; both SITs are keyword-gated on disjoint vocabularies (BIR/TIN vs PhilSys/PSA), so cross-firing requires both vocabularies in proximity. Documented in false_positives.
- **ua-tax-number leading digit**: secondary sources describe the first 5 digits as days-since-1899-12-31 (implying realistic values start 1-4), but the OECD primary source only says "sequence number of registration of birth date", so the regex was not over-constrained beyond `\d{10}`.
