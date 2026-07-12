# Art-9 / Protected-Attribute Reference Patterns — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into a task-by-task implementation plan before writing any pattern files.

**Goal:** Fill the coverage gap logged in `.superpowers/sdd/c3-deprecation-report.md` — no dedicated reference patterns exist for sexual orientation, religious/philosophical beliefs, racial/ethnic origin, or nationality, after the old top500 attribute-value patterns were deprecated as un-expressible (`needs-EDM/ML`) in the C3 wave.

**Architecture:** 8 new pattern YAML files (4 topics × au/global pairs), each following the "honest low-precision concept" template already established by `global-political-opinion` and `global-trade-union-membership` — a single phrase-level regex plus a matching `keywords` array, `pattern_class: concept`, `confidence: low` declared by design, no `purview:` tier complexity. These are topic classifiers, not structured-token detectors — the whole point is to detect *disclosure/record context* of a protected attribute, not bare topic words, so bare "orientation"/"origin"/"national"/"belief" never match alone.

**Tech Stack:** YAML pattern files under `data/patterns/`, validated by `scripts/ci-check.mjs`, `scripts/verify-catalog-quality.mjs`, `scripts/verify-pattern-testcases.mjs`, compiled by `scripts/compile.js` into `patterns.json`.

## Global Constraints

- Follow the exact field shape of `global-political-opinion.yaml` / `global-trade-union-membership.yaml` (both already in `data/patterns/` — read them as the literal template before writing each new file).
- `pattern_class: concept`, `confidence: low`, `type: keyword_list`, `engine: universal`. No `purview:` block (these two precedents don't have one).
- `created: '2026-07-12'`, `updated: '2026-07-12'`.
- `author: testpattern-community`, `license: MIT`, `exports: [purview_xml, yaml, regex_copy]`, `scope: broad`.
- Every regex must be a **phrase-level** match (multi-word phrases), never a bare single topic word, so it doesn't fire on ordinary prose use of that word.
- Every file gets 3-4 `should_match` (real disclosure-context phrases) and 3 `should_not_match` (near-miss confusable terms using the same root word in an unrelated sense) test cases.
- `sensitivity_labels` block: reuse the identical values from `global-political-opinion.yaml` (pspf: "OFFICIAL: Sensitive", qgiscf: SENSITIVE, qgiscf_dlm: "SENSITIVE Personal-Privacy", us_gov: CUI Basic, uk_gov: OFFICIAL-SENSITIVE, nz_gov: RESTRICTED, ca_gov: Protected B) for all 8 files — same risk tier as the two precedents.
- After all 8 files are written: `npm run check`, `npm run check:quality`, `node scripts/verify-pattern-testcases.mjs <8 slugs>` must all be clean before `npm run compile`.

## Files

### 1. `data/patterns/global-sexual-orientation.yaml`
- **Legal basis:** GDPR Art 9 "sex life or sexual orientation". Reference: `https://gdpr-info.eu/art-9-gdpr/`.
- **jurisdictions:** `[global, eu]`. **regulations:** `[GDPR]`.
- **Phrases (regex + keywords, both must match exactly):** sexual orientation, LGBTQ+ status, identifies as gay, identifies as lesbian, identifies as bisexual, identifies as transgender, same-sex partner, same-sex spouse, gender identity disclosure, coming out as.
- **Corroborative evidence keywords:** LGBTQ, gay, lesbian, bisexual, transgender, queer, partner, pride.
- **should_match examples:** "HR file notes the employee's sexual orientation as part of the diversity survey.", "The profile lists LGBTQ+ status alongside other demographic fields.", "He mentioned coming out as gay to his manager last year."
- **should_not_match (near-miss):** "The new employee orientation begins Monday morning." (bare "orientation", no "sexual"), "The building's orientation faces north for solar efficiency." (unrelated "orientation"), "The team celebrated Pride month with a company-wide event." (topical mention, no personal disclosure).

### 2. `data/patterns/au-sexual-orientation.yaml`
- Same phrase/keyword content as #1 (English-language phrasing doesn't change by jurisdiction).
- **Legal basis:** Sex Discrimination Act 1984 (Cth) — sexual orientation is a protected attribute. **jurisdictions:** `[au]`. **regulations:** `[Sex Discrimination Act 1984 (Cth), Privacy Act 1988 (Cth), NDB Scheme (Cth)]`.
- **references:** link to Sex Discrimination Act 1984 on legislation.gov.au (or AHRC protected-attributes page if a stabler URL) instead of gdpr-info.eu.
- description/operation text reframed around AU anti-discrimination law rather than GDPR Art 9.

### 3. `data/patterns/global-religious-beliefs.yaml`
- **Legal basis:** GDPR Art 9 "religious or philosophical beliefs". Reference: `https://gdpr-info.eu/art-9-gdpr/`.
- **jurisdictions:** `[global, eu]`. **regulations:** `[GDPR]`.
- **Phrases:** religious beliefs, religious affiliation, philosophical beliefs, belief system, faith tradition, religious observance, place of worship, religious denomination, religious conversion record.
- **Corroborative evidence keywords:** faith, congregation, worship, clergy, denomination, doctrine, spiritual, religion.
- **should_match examples:** "The intake form records religious affiliation under section 4.", "Profile notes his faith tradition and place of worship.", "HR file documents a religious conversion record from the chaplaincy referral."
- **should_not_match (near-miss):** "We believe in transparent pricing for all customers." (generic corporate "believe", not a belief-system disclosure), "The museum exhibit covered world religions through history." (topical/educational mention, no personal record), "Religious studies 101 is a required elective this semester." (academic course listing).
- Do NOT reuse the deprecated `global-top500-016`'s generic corroborative terms ("personal", "identity", "demographics") — those were the documented cause of its imprecision.

### 4. `data/patterns/au-religious-beliefs.yaml`
- Same phrase/keyword content as #3.
- **Legal basis:** Fair Work Act 2009 (Cth) s.351 — religion is a protected attribute against adverse action; also Racial and Religious Tolerance Act analogues at state level. **jurisdictions:** `[au]`. **regulations:** `[Fair Work Act 2009 (Cth), Privacy Act 1988 (Cth), NDB Scheme (Cth)]`.
- **references:** Fair Work Act s.351 or AHRC religious-discrimination guidance.

### 5. `data/patterns/global-racial-ethnic-origin.yaml`
- **Legal basis:** GDPR Art 9 "racial or ethnic origin". Reference: `https://gdpr-info.eu/art-9-gdpr/`.
- **jurisdictions:** `[global, eu]`. **regulations:** `[GDPR]`.
- **Phrases:** racial origin, ethnic origin, race and ethnicity, ethnic background, ethnicity demographic field, racial identity, ethnic identity, race/ethnicity data field.
- **Corroborative evidence keywords:** race, ethnicity, ethnic, ancestry, heritage, diversity survey.
- **should_match examples:** "The diversity survey asks employees to record ethnic origin voluntarily.", "Profile field captures racial identity alongside other equity data.", "The intake form lists ethnic background under demographic information."
- **should_not_match (near-miss):** "Country of origin: Australia, per the customs declaration." (shipping/customs "origin", not ethnic origin), "The original document was notarized by a public official." ("original" root-word near-miss, must not fire), "The restaurant offers a variety of ethnic cuisines." (topical mention, no personal data).

### 6. `data/patterns/au-racial-ethnic-origin.yaml`
- Same phrase/keyword content as #5.
- **Legal basis:** Racial Discrimination Act 1975 (Cth). **jurisdictions:** `[au]`. **regulations:** `[Racial Discrimination Act 1975 (Cth), Privacy Act 1988 (Cth), NDB Scheme (Cth)]`.
- **references:** Racial Discrimination Act 1975 on legislation.gov.au or AHRC race-discrimination guidance.

### 7. `data/patterns/global-nationality-origin.yaml`
- **Legal basis:** NOT GDPR Art 9 (nationality isn't a listed special category). Frame as general sensitive-PII tied to immigration-status/national-origin discrimination risk, processed under GDPR's ordinary Art 6 lawful-basis regime rather than Art 9's special-category regime. Reference: `https://gdpr-info.eu/art-6-gdpr/` (lawfulness of processing), not the Art 9 page.
- **jurisdictions:** `[global]`. **regulations:** `[GDPR]`.
- **Phrases:** nationality field, national origin, citizenship status, immigration status, visa status, country of citizenship, dual citizenship, naturalization status, non-citizen status.
- **Corroborative evidence keywords:** citizenship, visa, immigration, passport, naturalized, permanent resident, foreign national.
- **should_match examples:** "The onboarding form records nationality and citizenship status.", "File notes his current visa status and immigration category.", "HR record documents naturalization status for payroll tax purposes."
- **should_not_match (near-miss):** "National Bank of Australia reported quarterly earnings." (proper-noun "National"), "She received a nationally recognized award for her research." ("nationally" adverb, not "nationality"), "The office is closed for the national holiday on Monday." (unrelated "national").
- **description must explicitly note** this is NOT a GDPR Art 9 special category — it's grouped here because it was bundled with the other 3 in the deprecation/gap analysis, not because it shares Art 9's legal status.

### 8. `data/patterns/au-nationality-origin.yaml`
- Same phrase/keyword content as #7.
- **Legal basis:** Migration Act 1958 (Cth) context (visa/citizenship status) plus Racial Discrimination Act 1975 (Cth)'s "national origin" limb (distinct from its "race/ethnicity" limb used in #6). **jurisdictions:** `[au]`. **regulations:** `[Migration Act 1958 (Cth), Racial Discrimination Act 1975 (Cth), Privacy Act 1988 (Cth), NDB Scheme (Cth)]`.
- description must likewise note this isn't an Art 9-style category for AU either — framed purely on discrimination/immigration-status risk.

## Verification

- `npm run check` — 0 errors.
- `npm run check:quality` — gate passes (no new shortAcronyms/nonCanonical/duplicateLevelsIdentical/weakHigh outside the existing exclusion set).
- `node scripts/verify-pattern-testcases.mjs global-sexual-orientation au-sexual-orientation global-religious-beliefs au-religious-beliefs global-racial-ethnic-origin au-racial-ethnic-origin global-nationality-origin au-nationality-origin` — all test_cases pass.
- `npm run compile` — patterns.json regenerates with 1,663 patterns (1,655 + 8), no errors.
- Commit + push to `main` (no PR infrastructure needed for a small additive wave, matching how the last two sessions' pattern fixes went straight to main).

## Out of scope

- Not touching the 8 deprecated top500 patterns (they stay deprecated-in-place per C3's no-silent-removal rule; no cross-linking needed since `deprecation_reason` on those already points to this replacement path).
- Not adding a `purview:` tier block — the precedent patterns don't have one and this pattern class doesn't need Purview-specific tier gating.
- Not attempting per-ethnicity/per-religion keyword enumeration (e.g. listing every religion or ethnicity name) — that reintroduces the deprecated patterns' genericity/precision problem. Detection targets the *disclosure/record structure*, not the attribute value itself.
