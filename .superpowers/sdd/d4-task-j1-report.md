# D4 Task J1 Report — Jurisdiction Fill: Gulf + Türkiye

Date: 2026-07-08
Worktree: `Z:\patterns\.claude\worktrees\wf_2084d11b-7fa-3` (branch `worktree-wf_2084d11b-7fa-3`)
Conventions followed: `Z:/patterns/.superpowers/sdd/d4-jurisdiction-conventions.md`

## Outcome summary

| Slug | Decision | Rationale (one line) |
| --- | --- | --- |
| tr-tax-number | **SHIPPED** | VKN format fully corroborated (OECD TIN portal + GİB + independent sources) |
| tr-passport-number | **SHIPPED** | U + 8 digits corroborated by multiple independent sources; caveats documented |
| qa-passport-number | **SKIPPED** | No credible source documents the Qatari passport number format |
| sa-passport-number | **SKIPPED** | Sources conflict (letter+6 vs letter+8 vs Z+8); no primary source |
| sa-drivers-license | **SKIPPED** | Licence records keyed to the 10-digit national ID/iqama number — duplicate surface of `sa-national-id`; no distinct standardized licence-number format publicly documented |
| ae-drivers-license | **SKIPPED** | Per-emirate issuance (RTA Dubai, other emirates' police/traffic departments); no national licence-number standard (expected outcome per task spec) |

Gates: `npm run check` 0 errors (only the two expected filter-dependent should_not_match
warnings for the repeated-digit test values); `npm run check:quality` PASSED;
`npm run compile` succeeds. `patterns.json` restored before staging. Every regex verified
empirically with node (String.raw + new RegExp mirroring ci-check's `toRe`) — 23/23 checks pass.

---

## 1. tr-tax-number (SHIPPED) — `data/patterns/tr-tax-number.yaml`

**Format (verified):** 10 digits: 3-digit alpha group code (001–999) + 6-digit sequence number
+ 1 check digit. Issued by the Turkish Revenue Administration (Gelir İdaresi Başkanlığı, GİB).
Check digit is computed over the first nine digits and is NOT expressible in regex — stated in
`operation`/`false_positives`; detection relies on structure + AllDigitsSameFilter + keyword
evidence per convention 5.

**Primary sources:**
- OECD AEOI TIN portal, "Türkiye - Information on Tax Identification Numbers":
  https://www.oecd.org/content/dam/oecd/en/topics/policy-issue-focus/aeoi/turkiye-tin.pdf —
  text extracted locally from the PDF; Section II Structure states: "National Identity Number
  consists of 11 digits different than the 10 digit TIN. Single Tax Identification Number:
  Alpha Group Code / Sequence Number / Control Number — 1230005284 ... Alpha Group Code ...
  between 001-999 ... Control Number: Check-digit of 9 characters".
- GİB potential TIN application for foreigners (issuing authority):
  https://dijital.gib.gov.tr/foreigners/kimlikNoBasvuru
- Corroboration: https://lookuptax.com/docs/tax-identification-number/turkey-tax-id-guide ;
  https://taxid.pro/docs/countries/turkey ; http://org-id.guide/list/TR-VKN ;
  https://www.fonoa.com/resources/country-tax-guides/turkiye ;
  https://github.com/mgulener/turkiye-regex-kaliplari (vergi numarası: `^[0-9]{10}$`).

**Relationship to tr-national-id (required by task spec):** Per the OECD document, since
1 July 2006 Turkish citizens use their 11-digit T.C. Kimlik Numarası as their tax number — that
surface is already covered by `tr-national-id` (`\b\d{11}\b` + Func_Turkish_National_Id). The
10-digit VKN remains the tax identifier for legal entities, ordinary partnerships, foreign legal
entities, and foreign nationals without a Foreign Identity Number. The two patterns are
structurally disjoint: 10 vs 11 digits, both `\b`-guarded, so no value can match both (an
11-digit TCKN cannot partially match `\b\d{10}\b` because there is no word boundary between
digits). Documented in the pattern's `description`/`operation` and encoded as a should_not_match
test (`12345678901`).

**Regex:** `\b(?:00[1-9]|0[1-9][0-9]|[1-9][0-9]{2})[0-9]{7}\b` — encodes the alpha-group
001–999 constraint (leading 000 never issued); 1 non-capturing group; no banned constructs.
Tiers: 85 (label-context regex + specific keywords + template exclusion), 75 recommended
workhorse (specific keywords + exclusion), 65 (domain keywords). No bare tier (convention 1).
AllDigitsSameFilter included (convention 2). `VKN`/`TIN` keyword terms are `case_sensitive: true`
(shortAcronyms rule). Collision surface documented: Turkish mobile numbers without leading zero,
Saudi 10-digit national IDs, order numbers.

## 2. tr-passport-number (SHIPPED) — `data/patterns/tr-passport-number.yaml`

**Format (corroborated, with documented caveat):** New-generation Turkish passports (issued by
NVİ since 2018) carry a nine-character number: series letter "U" + 8 digits (e.g. U14133624),
top-right of the data page. Case-fixed uppercase → `case_sensitive: true` (convention 6).

**Sources (no single-source authorship):**
- NVİ passport services (issuing authority; confirms NVİ issues passports; does not publish the
  number format): https://www.nvi.gov.tr/pasaport ; https://www.nvi.gov.tr/sss-pasaport-hizmetleri
- Turkish-language sources consistently documenting "starts with U + 8 digits, top-right corner":
  https://www.eksiduyuru.com/duyuru/1205493/pasaport-numarasi-hangisi-anlamadim
  ("Pasaport numarası u ıle baslar ve 8 hanelıdır sag ust kosede bulunur"; example U14133624);
  https://www.tercihiniyap.net/pasaport-numarasi-nedir-nerede-yazar-nereden-ogrenilir-h10567.html
- Existence of a standardized detectable format confirmed by commercial DLP vendors shipping a
  "Turkey Passport Number" identifier: Broadcom/Symantec DLP
  (https://techdocs.broadcom.com/us/en/symantec-security-software/information-security/data-loss-prevention/16-1/about-data-loss-prevention-policy-authoring/data-identifiers/system-defined-data-identifiers/personal-identity-data-identifiers.html)
  and Forcepoint ONE ("Turkey PII: Passport Number",
  https://help.forcepoint.com/fpone/fdlp/guid-c40bfcbf-0164-46a0-a33c-f294adbffe76.html).
- ICAO Doc 9303 TD3 constraint (document number ≤ 9 characters) consistent with U+8:
  https://www.icao.int/sites/default/files/publications/DocSeries/9303_p4_cons_en.pdf

**Caveats (documented in the YAML):** the issuing authority does not publish a number-format
specification; pre-2018 non-chip passports used different serials and are out of scope; no
public checksum for the printed number. Mitigation: no bare tier — every tier (85/75/65) is
evidence-gated; AllDigitsSameFilter; strict `\bU[0-9]{8}\b` boundaries. A dead-blog claim of
"three letters + 6 digits" (circulating via a US-embassy paraphrase in search summaries) could
not be traced to any live authoritative page and conflicts with all Turkish-language sources;
rejected.

**Adjudication note:** this ships at a weaker source tier than tr-tax-number. If the review
panel judges the sourcing below the bar, converting to a skip is a one-file revert; the
research trail above is complete.

## 3. qa-passport-number (SKIPPED — documented)

Searched: ICAO 9303 (defines only the ≤9-char MRZ field, not Qatar's national numbering),
PRADO (returns HTTP 403 to non-browser fetches; list page shows specimens only), Wikipedia
"Qatari passport" (no number format), Arabic-language search including Qatar's passport law
(Decree-Law No. 14 of 1993 at almeezan.qa — Art. on format says the passport form is set by
Minister of Interior decision, number format not published), Hukoomi service pages, uqudo KYC
docs (field exists, format unspecified), Microsoft Purview (only `sit-defn-qatari-id-card-number`
— the QID, an 11-digit resident ID, distinct from passports), Google Cloud DLP (no Qatar
passport infoType), Symantec/Forcepoint (no Qatar passport identifier), KYC vendor docs.
**No credible source states the Qatari passport number format.** Convention 3: a documented
skip beats a guessed regex. URLs consulted:
- https://www.almeezan.qa/LawView.aspx?LawID=3991 (Passports Law — no number format)
- https://en.wikipedia.org/wiki/Qatari_passport
- https://docs.uqudo.com/docs/kyc/uqudo-api/scan/passports/qat-qatar
- https://learn.microsoft.com/en-us/purview/sit-defn-qatari-id-card-number (QID ≠ passport)
- https://www.consilium.europa.eu/prado/en/prado-documents/qat/a/docs-per-category.html (403)

## 4. sa-passport-number (SKIPPED — documented)

Sources conflict and none is primary:
- Danske Bank national identifier list (MiFID-era): "X999999" = 1 letter + 6 digits
  (https://danskebank.fi/-/media/pdf/danske-bank/fi/en/national-identifier-list-final.pdf —
  PDF text not machine-extractable; format quoted from search index).
- Grokipedia (AI-generated, non-citable): letter "Z" + digits.
- Anecdotal traveller reports (Tripadvisor): 8-digit numbers.
- Checked with no result: English + Arabic Wikipedia "Saudi passport" (no format), GOV.UK HMPO
  Knowledge Base profile Saudi Arabia (no format), MOI/Absher/MOFA public pages (no format),
  Landinfo query response "Saudi Arabia: ID documents for foreign nationals" 16 Dec 2022
  (text extracted locally from the PDF: covers muqim card/iqama/border number, not passport
  number format), uqudo SAU passport doc (field only), Symantec lists a "Saudi Arabia Passport
  Number" identifier but publishes no format; Purview and Google DLP have none.
**Conflicting secondary claims + no issuing-authority source → skip** (convention 3). If the
General Directorate of Passports (Jawazat) ever publishes a spec, revisit.

## 5. sa-drivers-license (SKIPPED — documented, expected research outcome)

Findings: Saudi driving licences are issued by MOI/Muroor (General Traffic Department); public
services query licences by the holder's 10-digit National ID / iqama number
(https://my.gov.sa/en/services/538523 "Public Query Driving License Information");
the Landinfo report (https://landinfo.no/wp-content/uploads/2023/02/Query-response-Saudi-Arabia-ID-documents-for-foreign-nationals-16122022.pdf,
text extracted locally) describes licence records stored and transferred **linked to the iqama
number** ("the old license data is stored, linked to the (old) iqama number... possible to link
this to the same when returning"). No public source documents a distinct standardized
licence-number format; the practically detectable surface is the 10-digit `[12]\d{9}` national
ID/iqama number, which `sa-national-id` already covers (its keyword group includes إقامة).
Convention 4: pure duplicate of an existing SIT / no standard → SKIP.

## 6. ae-drivers-license (SKIPPED — documented, expected outcome per task spec)

Findings: UAE driving licences are issued per emirate — RTA in Dubai; police/traffic
departments in the other emirates (u.ae federal portal:
https://u.ae/en/information-and-services/transportation/get-a-driving-licence ; RTA:
https://www.rta.ae/wps/portal/rta/ae/home/rta-services/service-details?serviceId=121 ; MOI
licence info service: https://evg.ae/_layouts/evg/driverlicenseinfo.aspx?language=en). Licence
numbers vary by emirate and no national numbering standard is published; the federated Emirates
ID (`ae-emirates-id`) is the standardized personal identifier. Convention 4 → SKIP.

---

## Empirical regex verification

Script: `verify-j1-regexes.js` (scratchpad), mirroring ci-check's `toRe` (strips `(?i)` prefix,
honours top-level `case_sensitive`). 23/23 assertions pass, including: exact-length acceptance,
too-short/too-long rejection, lowercase rejection (tr-passport, case-fixed), wrong series
letter, alpha-group-000 rejection (tr-tax), 11-digit TCKN rejection, no partial match inside
longer digit runs (IBAN digits, 13-digit run), and repeated-digit filter cases (match regex,
suppressed by AllDigitsSameFilter downstream — surfaced as the two expected ci-check warnings).

## Purview-ban compliance

Both top-level patterns and all purview regexes: no free wildcards, no nested quantifiers, no
`^`/`$`, ≤1 (non-)capturing group, bounded quantifiers, `\b` boundary guards on both sides.
`npm run check` reports zero banned-construct errors.

## Gate transcript (this worktree)

- `npm install` — clean (fresh worktree)
- `npm run check` — `CI check: 0 error(s), 53 warning(s)` (warnings pre-existing except the two
  documented filter-case warnings for `U00000000` / `1111111111`)
- `npm run check:quality` — `Quality gate PASSED: 0 issue(s) in [shortAcronyms, nonCanonical,
  duplicateLevelsIdentical, weakHigh] outside the exclusion set`
- `npm run compile` — `Done: 1598 patterns, 18 collections, 128 keyword dictionaries`
- `git checkout -- patterns.json` before staging
