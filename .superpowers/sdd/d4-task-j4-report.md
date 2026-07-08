# D4 Task J4 Report — Jurisdiction fill, Europe/Africa/Middle-East

Date: 2026-07-08 · Branch: worktree-wf_2084d11b-7fa-6 · Author: Coverage Wave D4 implementer

## Outcome

| Slug | Decision | Basis |
|---|---|---|
| ch-passport-number | SHIPPED | Letter (excl. O/I) + 7 digits, two independent credible sources |
| no-passport-number | SHIPPED | 2020-series prefixes + 9-char specimen from issuing authority's control guide; legacy 8-digit form from national specimen |
| za-passport-number | SHIPPED | Prefix letter (A/M/E/D/T) + 8 digits, SARS/OECD + Home Affairs FAQ + KYC identifier list |
| za-tax-number | SHIPPED | 10 digits, first digit 0/1/2/3/9, SARS modulus-10 check digit — OECD AEOI (SARS-authored) primary source |
| il-passport-number | SKIPPED | Format not corroborable from any credible source (see below) |
| no-drivers-license | SKIPPED | No standard national licence-number format; ID field duplicates existing SIT (see below) |
| ch-drivers-license | SKIPPED | FABER numbers cantonal, format not published (see below) |

## Format findings and sources

### ch-passport-number — `\b[A-HJ-NP-Z]\d{7}\b` (case-sensitive)
- Canton of Bern BE-Login identification-document guidance: passport number (Pass 2003/2006/2010) is an
  "eight-digit combination of letters and numbers: e.g. E1234567" (one letter + seven digits).
  https://www.belogin.directories.be.ch/emaillogin/gui/identificationdocumentexplanationpopup
- travelnews.ch citing fedpol: 2010-series numbers always begin with "X" followed by 7 digits; the letters
  O and I are never used (confusion with 0/1); the 2022 series has rules that "are not intended for the
  public" (no published fixed structure).
  https://www.travelnews.ch/english-corner/26038-how-can-you-distinguish-between-a-zero-and-an-o-in-a-passport.html
- Issuing authority: https://www.fedpol.admin.ch/de/pass-und-identitaetskarte
- Decision: match the documented letter+7-digit shape with O/I excluded; the 1985 paper series (numeric only)
  is long expired and deliberately not covered. 2022-series uncertainty documented in the pattern.

### no-passport-number — `\b(?:[CK][A-Z0-9]{2}\d{6}|F[GHJKL][A-Z0-9]\d{6}|\d{8})\b` (case-sensitive)
- PRIMARY: Norwegian Police "Control Guide for Norwegian Passports" (Oct 2020):
  https://www.politiet.no/globalassets/tjenester-admin/pass-og-id-kort/control-guide-norwegian-passports-oct-19-2020.pdf
  - Ordinary passports: document numbers start with C; emergency with K; "the following two characters can
    be letters or digits". Diplomatic FG, service FH, special FJ, travel document FK, foreigners FL; "the
    following character can be a letter or a digit".
  - Specimen bio page (page 6 of the guide, read as rendered PDF): document number **CCC002251** (9 chars),
    MRZ line `CCC0022514NOR…` (9-char number + check digit) — confirms 9-character total length.
- Pre-2020 series: Nasjonalt ID-senter specimen image (norsk-pass-spesimen-mrz.jpg, from
  https://www.nidsenter.no/aktuelt/nyhetsarkiv/2020/5/lar-om-maskinlesbar-tekst/) shows an 8-character
  all-numeric passport number field (`00000000`, MRZ `00000000<0NOR…` — 8 chars + 1 filler). Pre-2020
  booklets remain valid until October 2030, so the legacy 8-digit form is included but held to a stricter
  min-2-unique-evidence 75 tier only (bare 8-digit runs are ambiguous: dates, order numbers).
- ADJUDICATION: the 2020-series trailing block is taken as exactly 6 digits from the specimen and MRZ
  (prefix forms are 3-char C/K and F* variants + 6 digits = 9). No public checksum for the printed number.

### za-passport-number — `\b[ADEMT]\d{8}\b` (case-sensitive)
- OECD AEOI South Africa TIN document (SARS-authored), Appendix II: passport types and numbering — normal
  tourist passports start **A0**, maxi **M0**, official **E0**; issued under the SA Passports and Travel
  Documents Act 4 of 1994. https://www.oecd.org/content/dam/oecd/en/topics/policy-issue-focus/aeoi/south-africa-tin.pdf
- SA Home Affairs FAQ (US mission): prefix letter A (normal), M (maxi), D (diplomatic), T (travel), with
  eight digits. https://www.southafrica-usa.net/homeaffairs/faqs.htm
- Danske Bank national identifier list (KYC): "South African Passport Number — 9 digits: X99999999 or
  999999999". https://danskebank.fi/-/media/pdf/danske-bank/fi/en/national-identifier-list-final.pdf
- Decision: letter+8-digit form with the documented prefix set [ADEMT]. The all-numeric 9-digit variant in
  the Danske list is not corroborated by any SA-government source and collides with SSN-length digit runs,
  so it is not matched.

### za-tax-number — `\b[01239]\d{9}\b` + AllDigitsSameFilter (mandatory)
- PRIMARY: OECD AEOI South Africa TIN document (SARS-authored):
  https://www.oecd.org/content/dam/oecd/en/topics/policy-issue-focus/aeoi/south-africa-tin.pdf
  - Section II: "A South African Income Tax reference number is 10 numeric digits long. The tax reference
    number can only start with 0, 1, 2, 3 or 9 e.g. 0123456789."
  - Appendix I: modulus-10 validation — odd-position digits doubled (digit-sum if >9), summed with even
    positions; check digit = 10 − (total mod 10), or 0 when total mod 10 is 0. Worked example 0001339050.
  - Legal basis: s24 Tax Administration Act, 2011.
- Checksum is NOT expressible in regex — documented in `operation` and `false_positives`; structure +
  AllDigitsSameFilter + label evidence carry detection. All-zeros (0000000000) passes the SARS mod-10 and
  the leading-digit constraint, so AllDigitsSameFilter is load-bearing (included as a should_not_match
  filter case; ci-check reports it as the expected warning, not an error).
- Collision surface: SA phone numbers (10 digits starting 0) — documented, keyword-gated on every tier.

## Documented skips

### il-passport-number — SKIP (format not corroborable)
Searched: PRADO (both the ISR document pages and the "check document numbers" PDF return HTTP 403 to
non-browser clients), Microsoft Purview SIT catalogue (no Israel passport SIT), Trellix DLP classification
reference (Israeli ID number only), Forcepoint predefined classifiers (Israeli ID/bank/credit-card only),
Danske Bank KYC identifier list (Israel ID number only, no passport), Wikipedia (EN "Israeli passport" — no
number format; Hebrew search likewise), CBP Israel VWP carrier bulletin (no format), Wikimedia Commons
specimen images (data-page number redacted; other file is the cover). The only findable claim is the
"LP + 7 digits" laissez-passer serial from a private aliyah-services blog — not a passport and not a
credible source for the passport booklet number. Per D4 conventions rule 3 (non-negotiable): a format that
cannot be corroborated from credible sources must be skipped — a documented skip beats a guessed regex.
Revisit if PRADO access or an Israeli Population and Immigration Authority format publication becomes
available.

### no-drivers-license — SKIP (no standard national number; ID field duplicates existing SIT)
The official licence translation form (norway.no, forerkortskjema.doc) defines field 4d as "Reference
number (national ID-number)" — i.e. the 11-digit fødselsnummer, already covered by the existing
`no-identity-number` pattern — and field 5 as "Number of licence" with **no format specified**. Secondary
sources conflict on field 5 (a 4-digit card serial per norwayexpresskort.com; an 11-digit barcode
correspondence per the EC road-safety Norway N5 page), and neither Statens vegvesen nor the EC model pages
publish a structure. Either branch fails the quality bar: a 4-digit serial is undetectable as an
identifier, and the fødselsnummer branch is a pure duplicate of an existing SIT (conventions rule 4).
Sources: https://www.norway.no/contentassets/7600b70db112453398fb41a75b56545d/forerkortskjema.doc ·
https://road-safety.transport.ec.europa.eu/road-safety-member-states/driving-licence-member-states/driving-licence-models/norway-n5_en

### ch-drivers-license — SKIP (cantonal FABER, format not published)
Swiss driving entitlements are registered under a personal FABER number in the federal driver-authorisation
register, issued via the cantonal Strassenverkehrsämter. No official source publishes the FABER or
credit-card-licence (FAK field 5) number structure: the ASTRA FAK information sheet and driving-school
explainers (vkuambahnhof.ch, drive77.ch, fuehrerausweise.ch) describe where the number appears but not its
composition; formats observed in the wild vary by canton. Per conventions rule 4 this is the expected
documented skip for per-canton issuance. Sources:
https://www.astra.admin.ch/dam/astra/de/dokumente/abteilung_strassenverkehrallgemein/information-schweizer-fuehrerausweis.pdf.download.pdf/Information%20Schweizer%20F%C3%BChrerausweis.pdf ·
https://www.vkuambahnhof.ch/blog/4efb72dd9d-faber-nummer-lernfahrende-schweiz ·
https://fuehrerausweise.ch/informationen/fak/

## Conventions compliance

- All tiers on every shipped pattern are evidence-gated (no bare/value-only tier); recommended_confidence 75.
- AllDigitsSameFilter present on all four shipped patterns (mandatory for za-tax-number; guards the numeric
  blocks / legacy numeric form on the passports).
- Purview bans respected: no free wildcards, no nested quantifiers, no ^/$, 0 capturing groups, bounded
  quantifiers, \b boundaries so fixed-length numbers do not match inside longer digit runs (empirically
  verified: 9-digit run does not yield an 8-digit legacy match, 11-digit run does not yield a 10-digit TIN
  match).
- case_sensitive: true on the three passport patterns (uppercase-fixed formats); short-acronym keyword term
  TIN is case_sensitive.
- Every regex empirically verified with node (String.raw + new RegExp) against positive and negative cases
  before the gates (scratchpad j4-verify.mjs — ALL PASS).

## Gates

- npm install: OK (fresh worktree)
- npm run check: 0 errors (za-tax filter case reports the expected should_not_match warning only)
- npm run check:quality: PASSED
- npm run compile: succeeds
- patterns.json restored via `git checkout -- patterns.json` before staging
