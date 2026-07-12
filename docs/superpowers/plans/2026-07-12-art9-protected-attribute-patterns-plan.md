# Art-9 / Protected-Attribute Reference Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 new pattern YAML files (4 topics × au/global pairs) filling the coverage gap logged in `.superpowers/sdd/c3-deprecation-report.md`, following the design in `docs/superpowers/specs/2026-07-12-art9-protected-attribute-patterns-design.md`.

**Architecture:** Each file is an independent, self-contained YAML pattern following the `type: keyword_list` / `pattern_class: concept` template established by `data/patterns/global-political-opinion.yaml`. No shared code, no compiler changes — this is pure data-file authoring, verified by the existing `scripts/ci-check.mjs`, `scripts/verify-catalog-quality.mjs`, and `scripts/verify-pattern-testcases.mjs` harnesses.

**Tech Stack:** YAML (testpattern/v1 schema), Node.js verification scripts (already exist, no changes needed), `scripts/compile.js` to regenerate `patterns.json`.

## Global Constraints

- Every file: `schema: testpattern/v1`, `version: 1.0.0`, `type: keyword_list`, `pattern_class: concept`, `engine: universal`, `confidence: low`, `created: '2026-07-12'`, `updated: '2026-07-12'`, `author: testpattern-community`, `license: MIT`, `exports: [purview_xml, yaml, regex_copy]`, `scope: broad`.
- No `purview:` block on any of these 8 files (matches the precedent).
- All regexes are case-insensitive `(?i)`, non-capturing groups only (`(?:...)`, never bare `(...)`), no `.` wildcards, no lookbehind — this keeps them automatically Purview-safe per `scripts/ci-check.mjs`'s `purviewBanned()` check.
- `frameworks:` on every file: `[ISO 27001, NIST CSF, SOC 2]`.
- `data_categories:` on every file: `[pii]`.
- `risk_rating: 7` on every file (matches both precedents).
- `sensitivity_labels:` identical on every file:
  ```yaml
  sensitivity_labels:
    pspf: "OFFICIAL: Sensitive"
    qgiscf: SENSITIVE
    qgiscf_dlm: "SENSITIVE Personal-Privacy"
    us_gov: CUI Basic
    uk_gov: OFFICIAL-SENSITIVE
    nz_gov: RESTRICTED
    ca_gov: Protected B
  ```
- Each `changelog:` has exactly one entry: `version: 1.0.0`, `date: '2026-07-12'`, and a `description` starting with `'New pattern: '` explaining what gap it fills.

## Task 1: Sexual orientation pair

**Files:**
- Create: `data/patterns/global-sexual-orientation.yaml`
- Create: `data/patterns/au-sexual-orientation.yaml`

**Interfaces:** None — standalone data files, no code dependencies on other tasks.

- [ ] **Step 1: Create `data/patterns/global-sexual-orientation.yaml`** with exactly this content:

```yaml
schema: testpattern/v1
name: Sexual Orientation
slug: global-sexual-orientation
version: 1.0.0
type: keyword_list
pattern_class: concept
engine: universal
description: >-
  Detects references to sexual orientation disclosure: the phrase "sexual orientation" itself,
  LGBTQ+ status fields, explicit identification statements, and same-sex partner/spouse
  references. GDPR Article 9 lists sex life and sexual orientation as a special category of
  personal data with no fixed format — it is detectable only by topic vocabulary. Topic-grade
  detector, low confidence by design.
operation: >-
  Phrase regex matching indicative sexual-orientation disclosure terminology (sexual
  orientation, LGBTQ+ status, identifies as gay/lesbian/bisexual/transgender, same-sex
  partner/spouse, gender identity disclosure, coming out as). Detects the presence of
  sexual-orientation subject matter in a disclosure/record context; not a structured-token
  detector. Pair with corroborative keywords to raise precision.
pattern: '(?i)\b(?:sexual\s+orientations?|LGBTQ\+?\s+status|identifies\s+as\s+(?:gay|lesbian|bisexual|transgender)|same-sex\s+(?:partner|spouse)|gender\s+identity\s+disclosure|coming\s+out\s+as)\b'
confidence: low
confidence_justification: >-
  Low by design. Sexual orientation is a GDPR Article 9 special category with no fixed format,
  so it is detected purely by topic vocabulary. The bare word "orientation" appears constantly
  in non-sensitive prose (employee orientation, building orientation); the regex is scoped to
  full disclosure phrases only, and hits should be paired with corroborative keywords (LGBTQ,
  partner, pride) to raise precision.
jurisdictions:
  - global
  - eu
regulations:
  - GDPR
frameworks:
  - ISO 27001
  - NIST CSF
  - SOC 2
data_categories:
  - pii
corroborative_evidence:
  keywords:
    - LGBTQ
    - gay
    - lesbian
    - bisexual
    - transgender
    - queer
    - partner
    - pride
  proximity: 300
test_cases:
  should_match:
    - value: "HR file notes the employee's sexual orientation as part of the diversity survey."
      description: Sexual orientation phrase present
    - value: 'The profile lists LGBTQ+ status alongside other demographic fields.'
      description: LGBTQ+ status field present
    - value: 'He mentioned coming out as gay to his manager last year.'
      description: Coming out as / identifies as gay terms present
    - value: 'The intake form notes that she identifies as bisexual under optional demographic questions.'
      description: Identifies as bisexual term present
  should_not_match:
    - value: 'The new employee orientation begins Monday morning.'
      description: Near-miss ("orientation" alone), no sexual-orientation disclosure
    - value: "The building's orientation faces north for solar efficiency."
      description: Unrelated "orientation" (architectural), no disclosure vocabulary
    - value: 'The team celebrated Pride month with a company-wide event.'
      description: Topical mention ("Pride"), no personal disclosure phrase
false_positives:
  - description: >-
      The bare word "orientation" appears in unrelated contexts (employee orientation,
      building/map orientation) that have nothing to do with sexual orientation.
    mitigation: >-
      The regex targets full disclosure phrases ("sexual orientation", "LGBTQ+ status",
      "identifies as gay") rather than the bare word "orientation"; require corroborative
      keywords (LGBTQ, partner, pride) for confidence.
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: broad
risk_rating: 7
risk_description: >-
  Sexual orientation is a GDPR Article 9 special category; disclosure can lead to
  discrimination, harassment, and outing individuals without consent, particularly in
  jurisdictions or workplaces where LGBTQ+ status carries legal or social risk.
sensitivity_labels:
  pspf: "OFFICIAL: Sensitive"
  qgiscf: SENSITIVE
  qgiscf_dlm: "SENSITIVE Personal-Privacy"
  us_gov: CUI Basic
  uk_gov: OFFICIAL-SENSITIVE
  nz_gov: RESTRICTED
  ca_gov: Protected B
created: '2026-07-12'
updated: '2026-07-12'
changelog:
  - version: 1.0.0
    date: '2026-07-12'
    description: 'New pattern: replaces the deprecated au/global-top500-015-sexual-orientation attribute-value patterns (needs-EDM/ML) with an honest topic-classifier concept, modeled on global-political-opinion. Fills the D-wave coverage gap logged in c3-deprecation-report.md.'
author: testpattern-community
license: MIT
keywords:
  - sexual orientation
  - LGBTQ+ status
  - identifies as gay
  - identifies as lesbian
  - identifies as bisexual
  - identifies as transgender
  - same-sex partner
  - same-sex spouse
  - gender identity disclosure
  - coming out as
references:
  - url: https://gdpr-info.eu/art-9-gdpr/
    title: GDPR Article 9 — processing of special categories of personal data (sex life and sexual orientation)
```

- [ ] **Step 2: Create `data/patterns/au-sexual-orientation.yaml`** with exactly this content:

```yaml
schema: testpattern/v1
name: Sexual Orientation (Australia)
slug: au-sexual-orientation
version: 1.0.0
type: keyword_list
pattern_class: concept
engine: universal
description: >-
  Detects references to sexual orientation disclosure in Australian documents: the phrase
  "sexual orientation" itself, LGBTQ+ status fields, explicit identification statements, and
  same-sex partner/spouse references. Sexual orientation is a protected attribute under the
  Sex Discrimination Act 1984 (Cth) — adverse action or discrimination on this basis is
  unlawful, making its disclosure sensitive regardless of format. Topic-grade detector, low
  confidence by design.
operation: >-
  Phrase regex matching indicative sexual-orientation disclosure terminology (sexual
  orientation, LGBTQ+ status, identifies as gay/lesbian/bisexual/transgender, same-sex
  partner/spouse, gender identity disclosure, coming out as). Detects the presence of
  sexual-orientation subject matter in a disclosure/record context; not a structured-token
  detector. Pair with corroborative keywords to raise precision.
pattern: '(?i)\b(?:sexual\s+orientations?|LGBTQ\+?\s+status|identifies\s+as\s+(?:gay|lesbian|bisexual|transgender)|same-sex\s+(?:partner|spouse)|gender\s+identity\s+disclosure|coming\s+out\s+as)\b'
confidence: low
confidence_justification: >-
  Low by design. Sexual orientation has no fixed format, so it is detected purely by topic
  vocabulary. The bare word "orientation" appears constantly in non-sensitive prose (employee
  orientation, building orientation); the regex is scoped to full disclosure phrases only, and
  hits should be paired with corroborative keywords (LGBTQ, partner, pride) to raise precision.
jurisdictions:
  - au
regulations:
  - Sex Discrimination Act 1984 (Cth)
  - Privacy Act 1988 (Cth)
  - NDB Scheme (Cth)
frameworks:
  - ISO 27001
  - NIST CSF
  - SOC 2
data_categories:
  - pii
corroborative_evidence:
  keywords:
    - LGBTQ
    - gay
    - lesbian
    - bisexual
    - transgender
    - queer
    - partner
    - pride
  proximity: 300
test_cases:
  should_match:
    - value: "HR file notes the employee's sexual orientation as part of the diversity survey."
      description: Sexual orientation phrase present
    - value: 'The profile lists LGBTQ+ status alongside other demographic fields.'
      description: LGBTQ+ status field present
    - value: 'He mentioned coming out as gay to his manager last year.'
      description: Coming out as / identifies as gay terms present
    - value: 'The intake form notes that she identifies as bisexual under optional demographic questions.'
      description: Identifies as bisexual term present
  should_not_match:
    - value: 'The new employee orientation begins Monday morning.'
      description: Near-miss ("orientation" alone), no sexual-orientation disclosure
    - value: "The building's orientation faces north for solar efficiency."
      description: Unrelated "orientation" (architectural), no disclosure vocabulary
    - value: 'The team celebrated Pride month with a company-wide event.'
      description: Topical mention ("Pride"), no personal disclosure phrase
false_positives:
  - description: >-
      The bare word "orientation" appears in unrelated contexts (employee orientation,
      building/map orientation) that have nothing to do with sexual orientation.
    mitigation: >-
      The regex targets full disclosure phrases ("sexual orientation", "LGBTQ+ status",
      "identifies as gay") rather than the bare word "orientation"; require corroborative
      keywords (LGBTQ, partner, pride) for confidence.
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: broad
risk_rating: 7
risk_description: >-
  Sexual orientation is a protected attribute under the Sex Discrimination Act 1984 (Cth);
  disclosure can lead to workplace discrimination, harassment, and outing individuals without
  consent.
sensitivity_labels:
  pspf: "OFFICIAL: Sensitive"
  qgiscf: SENSITIVE
  qgiscf_dlm: "SENSITIVE Personal-Privacy"
  us_gov: CUI Basic
  uk_gov: OFFICIAL-SENSITIVE
  nz_gov: RESTRICTED
  ca_gov: Protected B
created: '2026-07-12'
updated: '2026-07-12'
changelog:
  - version: 1.0.0
    date: '2026-07-12'
    description: 'New pattern: replaces the deprecated au/global-top500-015-sexual-orientation attribute-value patterns (needs-EDM/ML) with an honest topic-classifier concept, modeled on global-political-opinion but reframed on AU anti-discrimination law rather than GDPR. Fills the D-wave coverage gap logged in c3-deprecation-report.md.'
author: testpattern-community
license: MIT
keywords:
  - sexual orientation
  - LGBTQ+ status
  - identifies as gay
  - identifies as lesbian
  - identifies as bisexual
  - identifies as transgender
  - same-sex partner
  - same-sex spouse
  - gender identity disclosure
  - coming out as
references:
  - url: https://humanrights.gov.au/our-work/sex-discrimination
    title: Sex Discrimination — Australian Human Rights Commission
```

- [ ] **Step 3: Verify both files parse and test cases pass**

Run: `node scripts/verify-pattern-testcases.mjs global-sexual-orientation au-sexual-orientation`
Expected: `all test_cases pass` (no FAIL lines) for both slugs.

- [ ] **Step 4: Commit**

```bash
git add data/patterns/global-sexual-orientation.yaml data/patterns/au-sexual-orientation.yaml
git commit -m "feat(patterns): add sexual-orientation Art-9 reference patterns (au/global)"
```

## Task 2: Religious/philosophical beliefs pair

**Files:**
- Create: `data/patterns/global-religious-beliefs.yaml`
- Create: `data/patterns/au-religious-beliefs.yaml`

**Interfaces:** None — standalone data files, independent of Task 1.

- [ ] **Step 1: Create `data/patterns/global-religious-beliefs.yaml`** with exactly this content:

```yaml
schema: testpattern/v1
name: Religious or Philosophical Beliefs
slug: global-religious-beliefs
version: 1.0.0
type: keyword_list
pattern_class: concept
engine: universal
description: >-
  Detects references to religious or philosophical belief disclosure: religious affiliation,
  belief system, faith tradition, place of worship, and religious conversion records. GDPR
  Article 9 lists religious or philosophical beliefs as a special category of personal data
  with no fixed format — it is detectable only by topic vocabulary. Topic-grade detector, low
  confidence by design.
operation: >-
  Phrase regex matching indicative religious/philosophical-belief disclosure terminology
  (religious beliefs, religious affiliation, philosophical beliefs, belief system, faith
  tradition, religious observance, place of worship, religious denomination, religious
  conversion record). Detects the presence of religious/belief subject matter in a
  disclosure/record context; not a structured-token detector. Pair with corroborative
  keywords to raise precision.
pattern: '(?i)\b(?:religious\s+beliefs?|religious\s+affiliations?|philosophical\s+beliefs?|belief\s+systems?|faith\s+traditions?|religious\s+observance|place\s+of\s+worship|religious\s+denominations?|religious\s+conversion\s+record)\b'
confidence: low
confidence_justification: >-
  Low by design. Religious or philosophical belief is a GDPR Article 9 special category with
  no fixed format, so it is detected purely by topic vocabulary. Generic words like "believe"
  or "religion" appear constantly in non-sensitive prose (corporate values statements,
  educational content); the regex is scoped to full disclosure phrases only, and hits should
  be paired with corroborative keywords (faith, congregation, worship) to raise precision.
jurisdictions:
  - global
  - eu
regulations:
  - GDPR
frameworks:
  - ISO 27001
  - NIST CSF
  - SOC 2
data_categories:
  - pii
corroborative_evidence:
  keywords:
    - faith
    - congregation
    - worship
    - clergy
    - denomination
    - doctrine
    - spiritual
    - religion
  proximity: 300
test_cases:
  should_match:
    - value: 'The intake form records religious affiliation under section 4.'
      description: Religious affiliation phrase present
    - value: 'Profile notes his faith tradition and place of worship.'
      description: Faith tradition / place of worship terms present
    - value: 'HR file documents a religious conversion record from the chaplaincy referral.'
      description: Religious conversion record term present
    - value: 'The census field asks respondents to state their religious beliefs voluntarily.'
      description: Religious beliefs phrase present
  should_not_match:
    - value: 'We believe in transparent pricing for all customers.'
      description: Generic corporate "believe", not a belief-system disclosure
    - value: 'The museum exhibit covered world religions through history.'
      description: Topical/educational mention, no personal disclosure phrase
    - value: 'Religious studies 101 is a required elective this semester.'
      description: Academic course listing, no disclosure phrase
false_positives:
  - description: >-
      Generic corporate or educational use of "believe"/"religion"/"religious" (values
      statements, history/comparative-religion content) has nothing to do with a personal
      belief-disclosure record.
    mitigation: >-
      The regex targets full disclosure phrases ("religious affiliation", "faith tradition",
      "religious conversion record") rather than the bare words "believe"/"religion"; require
      corroborative keywords (faith, congregation, worship, clergy) for confidence.
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: broad
risk_rating: 7
risk_description: >-
  Religious or philosophical belief is a GDPR Article 9 special category; disclosure can lead
  to discrimination, social exclusion, or persecution in jurisdictions or workplaces where
  religious minority status carries legal or social risk.
sensitivity_labels:
  pspf: "OFFICIAL: Sensitive"
  qgiscf: SENSITIVE
  qgiscf_dlm: "SENSITIVE Personal-Privacy"
  us_gov: CUI Basic
  uk_gov: OFFICIAL-SENSITIVE
  nz_gov: RESTRICTED
  ca_gov: Protected B
created: '2026-07-12'
updated: '2026-07-12'
changelog:
  - version: 1.0.0
    date: '2026-07-12'
    description: 'New pattern: replaces the deprecated au/global-top500-016-religious-or-philosophical-beliefs attribute-value patterns (needs-EDM/ML) with an honest topic-classifier concept, modeled on global-political-opinion. Deliberately avoids the deprecated pattern''s generic corroborative terms (personal, identity, demographics), which were the documented cause of its imprecision. Fills the D-wave coverage gap logged in c3-deprecation-report.md.'
author: testpattern-community
license: MIT
keywords:
  - religious beliefs
  - religious affiliation
  - philosophical beliefs
  - belief system
  - faith tradition
  - religious observance
  - place of worship
  - religious denomination
  - religious conversion record
references:
  - url: https://gdpr-info.eu/art-9-gdpr/
    title: GDPR Article 9 — processing of special categories of personal data (religious or philosophical beliefs)
```

- [ ] **Step 2: Create `data/patterns/au-religious-beliefs.yaml`** with exactly this content:

```yaml
schema: testpattern/v1
name: Religious or Philosophical Beliefs (Australia)
slug: au-religious-beliefs
version: 1.0.0
type: keyword_list
pattern_class: concept
engine: universal
description: >-
  Detects references to religious or philosophical belief disclosure in Australian documents:
  religious affiliation, belief system, faith tradition, place of worship, and religious
  conversion records. Religion is a protected attribute under s.351 of the Fair Work Act 2009
  (Cth) — adverse action on this basis is unlawful, making its disclosure sensitive regardless
  of format. Topic-grade detector, low confidence by design.
operation: >-
  Phrase regex matching indicative religious/philosophical-belief disclosure terminology
  (religious beliefs, religious affiliation, philosophical beliefs, belief system, faith
  tradition, religious observance, place of worship, religious denomination, religious
  conversion record). Detects the presence of religious/belief subject matter in a
  disclosure/record context; not a structured-token detector. Pair with corroborative
  keywords to raise precision.
pattern: '(?i)\b(?:religious\s+beliefs?|religious\s+affiliations?|philosophical\s+beliefs?|belief\s+systems?|faith\s+traditions?|religious\s+observance|place\s+of\s+worship|religious\s+denominations?|religious\s+conversion\s+record)\b'
confidence: low
confidence_justification: >-
  Low by design. Religious or philosophical belief has no fixed format, so it is detected
  purely by topic vocabulary. Generic words like "believe" or "religion" appear constantly in
  non-sensitive prose (corporate values statements, educational content); the regex is scoped
  to full disclosure phrases only, and hits should be paired with corroborative keywords
  (faith, congregation, worship) to raise precision.
jurisdictions:
  - au
regulations:
  - Fair Work Act 2009 (Cth)
  - Privacy Act 1988 (Cth)
  - NDB Scheme (Cth)
frameworks:
  - ISO 27001
  - NIST CSF
  - SOC 2
data_categories:
  - pii
corroborative_evidence:
  keywords:
    - faith
    - congregation
    - worship
    - clergy
    - denomination
    - doctrine
    - spiritual
    - religion
  proximity: 300
test_cases:
  should_match:
    - value: 'The intake form records religious affiliation under section 4.'
      description: Religious affiliation phrase present
    - value: 'Profile notes his faith tradition and place of worship.'
      description: Faith tradition / place of worship terms present
    - value: 'HR file documents a religious conversion record from the chaplaincy referral.'
      description: Religious conversion record term present
    - value: 'The census field asks respondents to state their religious beliefs voluntarily.'
      description: Religious beliefs phrase present
  should_not_match:
    - value: 'We believe in transparent pricing for all customers.'
      description: Generic corporate "believe", not a belief-system disclosure
    - value: 'The museum exhibit covered world religions through history.'
      description: Topical/educational mention, no personal disclosure phrase
    - value: 'Religious studies 101 is a required elective this semester.'
      description: Academic course listing, no disclosure phrase
false_positives:
  - description: >-
      Generic corporate or educational use of "believe"/"religion"/"religious" (values
      statements, history/comparative-religion content) has nothing to do with a personal
      belief-disclosure record.
    mitigation: >-
      The regex targets full disclosure phrases ("religious affiliation", "faith tradition",
      "religious conversion record") rather than the bare words "believe"/"religion"; require
      corroborative keywords (faith, congregation, worship, clergy) for confidence.
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: broad
risk_rating: 7
risk_description: >-
  Religion is a protected attribute under s.351 of the Fair Work Act 2009 (Cth); disclosure
  can lead to workplace discrimination, adverse action, or social exclusion.
sensitivity_labels:
  pspf: "OFFICIAL: Sensitive"
  qgiscf: SENSITIVE
  qgiscf_dlm: "SENSITIVE Personal-Privacy"
  us_gov: CUI Basic
  uk_gov: OFFICIAL-SENSITIVE
  nz_gov: RESTRICTED
  ca_gov: Protected B
created: '2026-07-12'
updated: '2026-07-12'
changelog:
  - version: 1.0.0
    date: '2026-07-12'
    description: 'New pattern: replaces the deprecated au/global-top500-016-religious-or-philosophical-beliefs attribute-value patterns (needs-EDM/ML) with an honest topic-classifier concept, modeled on global-political-opinion but reframed on AU anti-discrimination law (Fair Work Act s.351) rather than GDPR. Fills the D-wave coverage gap logged in c3-deprecation-report.md.'
author: testpattern-community
license: MIT
keywords:
  - religious beliefs
  - religious affiliation
  - philosophical beliefs
  - belief system
  - faith tradition
  - religious observance
  - place of worship
  - religious denomination
  - religious conversion record
references:
  - url: https://www.fairwork.gov.au/tools-and-resources/fact-sheets/rights-and-obligations/protection-from-discrimination-at-work
    title: Protection from discrimination at work — Fair Work Ombudsman
```

- [ ] **Step 3: Verify both files parse and test cases pass**

Run: `node scripts/verify-pattern-testcases.mjs global-religious-beliefs au-religious-beliefs`
Expected: `all test_cases pass` (no FAIL lines) for both slugs.

- [ ] **Step 4: Commit**

```bash
git add data/patterns/global-religious-beliefs.yaml data/patterns/au-religious-beliefs.yaml
git commit -m "feat(patterns): add religious/philosophical-beliefs Art-9 reference patterns (au/global)"
```

## Task 3: Racial/ethnic origin pair

**Files:**
- Create: `data/patterns/global-racial-ethnic-origin.yaml`
- Create: `data/patterns/au-racial-ethnic-origin.yaml`

**Interfaces:** None — standalone data files, independent of Tasks 1-2.

- [ ] **Step 1: Create `data/patterns/global-racial-ethnic-origin.yaml`** with exactly this content:

```yaml
schema: testpattern/v1
name: Racial or Ethnic Origin
slug: global-racial-ethnic-origin
version: 1.0.0
type: keyword_list
pattern_class: concept
engine: universal
description: >-
  Detects references to racial or ethnic origin disclosure: racial/ethnic origin fields,
  ethnicity demographic fields, and racial/ethnic identity statements. GDPR Article 9 lists
  racial or ethnic origin as a special category of personal data with no fixed format — it is
  detectable only by topic vocabulary. Topic-grade detector, low confidence by design.
operation: >-
  Phrase regex matching indicative racial/ethnic-origin disclosure terminology (racial origin,
  ethnic origin, race and ethnicity, ethnic background, ethnicity demographic field, racial
  identity, ethnic identity, race/ethnicity data field). Detects the presence of racial/ethnic
  subject matter in a disclosure/record context; not a structured-token detector. Pair with
  corroborative keywords to raise precision.
pattern: '(?i)\b(?:racial\s+origin|ethnic\s+origin|race\s+and\s+ethnicity|ethnic\s+background|ethnicity\s+demographic\s+field|racial\s+identity|ethnic\s+identity|race\/ethnicity\s+data\s+field)\b'
confidence: low
confidence_justification: >-
  Low by design. Racial or ethnic origin is a GDPR Article 9 special category with no fixed
  format, so it is detected purely by topic vocabulary. The bare word "origin" appears
  constantly in unrelated contexts (country of origin on customs/shipping forms, "original"
  documents); the regex is scoped to full disclosure phrases only, and hits should be paired
  with corroborative keywords (race, ethnicity, ancestry) to raise precision.
jurisdictions:
  - global
  - eu
regulations:
  - GDPR
frameworks:
  - ISO 27001
  - NIST CSF
  - SOC 2
data_categories:
  - pii
corroborative_evidence:
  keywords:
    - race
    - ethnicity
    - ethnic
    - ancestry
    - heritage
    - diversity survey
  proximity: 300
test_cases:
  should_match:
    - value: 'The diversity survey asks employees to record ethnic origin voluntarily.'
      description: Ethnic origin phrase present
    - value: 'Profile field captures racial identity alongside other equity data.'
      description: Racial identity phrase present
    - value: 'The intake form lists ethnic background under demographic information.'
      description: Ethnic background phrase present
  should_not_match:
    - value: 'Country of origin: Australia, per the customs declaration.'
      description: Near-miss ("origin" alone, "country of origin"), no racial/ethnic origin disclosure
    - value: 'The original document was notarized by a public official.'
      description: Unrelated root-word near-miss ("original" vs "origin")
    - value: 'The restaurant offers a variety of ethnic cuisines.'
      description: Topical mention ("ethnic" alone), no personal disclosure phrase
false_positives:
  - description: >-
      The bare word "origin" appears in unrelated contexts (country of origin on
      customs/shipping documents, "original" documents) that have nothing to do with racial
      or ethnic origin.
    mitigation: >-
      The regex targets full disclosure phrases ("racial origin", "ethnic origin", "racial
      identity") rather than the bare word "origin"; require corroborative keywords (race,
      ethnicity, ancestry, heritage) for confidence.
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: broad
risk_rating: 7
risk_description: >-
  Racial or ethnic origin is a GDPR Article 9 special category; disclosure can lead to
  discrimination, profiling, and targeted harassment.
sensitivity_labels:
  pspf: "OFFICIAL: Sensitive"
  qgiscf: SENSITIVE
  qgiscf_dlm: "SENSITIVE Personal-Privacy"
  us_gov: CUI Basic
  uk_gov: OFFICIAL-SENSITIVE
  nz_gov: RESTRICTED
  ca_gov: Protected B
created: '2026-07-12'
updated: '2026-07-12'
changelog:
  - version: 1.0.0
    date: '2026-07-12'
    description: 'New pattern: replaces the deprecated au/global-top500-017-ethnicity-or-race attribute-value patterns (needs-EDM/ML) with an honest topic-classifier concept, modeled on global-political-opinion. Fills the D-wave coverage gap logged in c3-deprecation-report.md.'
author: testpattern-community
license: MIT
keywords:
  - racial origin
  - ethnic origin
  - race and ethnicity
  - ethnic background
  - ethnicity demographic field
  - racial identity
  - ethnic identity
  - race/ethnicity data field
references:
  - url: https://gdpr-info.eu/art-9-gdpr/
    title: GDPR Article 9 — processing of special categories of personal data (racial or ethnic origin)
```

- [ ] **Step 2: Create `data/patterns/au-racial-ethnic-origin.yaml`** with exactly this content:

```yaml
schema: testpattern/v1
name: Racial or Ethnic Origin (Australia)
slug: au-racial-ethnic-origin
version: 1.0.0
type: keyword_list
pattern_class: concept
engine: universal
description: >-
  Detects references to racial or ethnic origin disclosure in Australian documents:
  racial/ethnic origin fields, ethnicity demographic fields, and racial/ethnic identity
  statements. Race is a protected attribute under the Racial Discrimination Act 1975 (Cth) —
  discrimination on this basis is unlawful, making its disclosure sensitive regardless of
  format. Topic-grade detector, low confidence by design.
operation: >-
  Phrase regex matching indicative racial/ethnic-origin disclosure terminology (racial origin,
  ethnic origin, race and ethnicity, ethnic background, ethnicity demographic field, racial
  identity, ethnic identity, race/ethnicity data field). Detects the presence of racial/ethnic
  subject matter in a disclosure/record context; not a structured-token detector. Pair with
  corroborative keywords to raise precision.
pattern: '(?i)\b(?:racial\s+origin|ethnic\s+origin|race\s+and\s+ethnicity|ethnic\s+background|ethnicity\s+demographic\s+field|racial\s+identity|ethnic\s+identity|race\/ethnicity\s+data\s+field)\b'
confidence: low
confidence_justification: >-
  Low by design. Racial or ethnic origin has no fixed format, so it is detected purely by
  topic vocabulary. The bare word "origin" appears constantly in unrelated contexts (country
  of origin on customs/shipping forms, "original" documents); the regex is scoped to full
  disclosure phrases only, and hits should be paired with corroborative keywords (race,
  ethnicity, ancestry) to raise precision.
jurisdictions:
  - au
regulations:
  - Racial Discrimination Act 1975 (Cth)
  - Privacy Act 1988 (Cth)
  - NDB Scheme (Cth)
frameworks:
  - ISO 27001
  - NIST CSF
  - SOC 2
data_categories:
  - pii
corroborative_evidence:
  keywords:
    - race
    - ethnicity
    - ethnic
    - ancestry
    - heritage
    - diversity survey
  proximity: 300
test_cases:
  should_match:
    - value: 'The diversity survey asks employees to record ethnic origin voluntarily.'
      description: Ethnic origin phrase present
    - value: 'Profile field captures racial identity alongside other equity data.'
      description: Racial identity phrase present
    - value: 'The intake form lists ethnic background under demographic information.'
      description: Ethnic background phrase present
  should_not_match:
    - value: 'Country of origin: Australia, per the customs declaration.'
      description: Near-miss ("origin" alone, "country of origin"), no racial/ethnic origin disclosure
    - value: 'The original document was notarized by a public official.'
      description: Unrelated root-word near-miss ("original" vs "origin")
    - value: 'The restaurant offers a variety of ethnic cuisines.'
      description: Topical mention ("ethnic" alone), no personal disclosure phrase
false_positives:
  - description: >-
      The bare word "origin" appears in unrelated contexts (country of origin on
      customs/shipping documents, "original" documents) that have nothing to do with racial
      or ethnic origin.
    mitigation: >-
      The regex targets full disclosure phrases ("racial origin", "ethnic origin", "racial
      identity") rather than the bare word "origin"; require corroborative keywords (race,
      ethnicity, ancestry, heritage) for confidence.
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: broad
risk_rating: 7
risk_description: >-
  Race is a protected attribute under the Racial Discrimination Act 1975 (Cth); disclosure can
  lead to discrimination, profiling, and targeted harassment.
sensitivity_labels:
  pspf: "OFFICIAL: Sensitive"
  qgiscf: SENSITIVE
  qgiscf_dlm: "SENSITIVE Personal-Privacy"
  us_gov: CUI Basic
  uk_gov: OFFICIAL-SENSITIVE
  nz_gov: RESTRICTED
  ca_gov: Protected B
created: '2026-07-12'
updated: '2026-07-12'
changelog:
  - version: 1.0.0
    date: '2026-07-12'
    description: 'New pattern: replaces the deprecated au/global-top500-017-ethnicity-or-race attribute-value patterns (needs-EDM/ML) with an honest topic-classifier concept, modeled on global-political-opinion but reframed on AU anti-discrimination law (Racial Discrimination Act 1975) rather than GDPR. Fills the D-wave coverage gap logged in c3-deprecation-report.md.'
author: testpattern-community
license: MIT
keywords:
  - racial origin
  - ethnic origin
  - race and ethnicity
  - ethnic background
  - ethnicity demographic field
  - racial identity
  - ethnic identity
  - race/ethnicity data field
references:
  - url: https://humanrights.gov.au/our-work/race-discrimination
    title: Race Discrimination — Australian Human Rights Commission
```

- [ ] **Step 3: Verify both files parse and test cases pass**

Run: `node scripts/verify-pattern-testcases.mjs global-racial-ethnic-origin au-racial-ethnic-origin`
Expected: `all test_cases pass` (no FAIL lines) for both slugs.

- [ ] **Step 4: Commit**

```bash
git add data/patterns/global-racial-ethnic-origin.yaml data/patterns/au-racial-ethnic-origin.yaml
git commit -m "feat(patterns): add racial/ethnic-origin Art-9 reference patterns (au/global)"
```

## Task 4: Nationality pair

**Files:**
- Create: `data/patterns/global-nationality-origin.yaml`
- Create: `data/patterns/au-nationality-origin.yaml`

**Interfaces:** None — standalone data files, independent of Tasks 1-3.

- [ ] **Step 1: Create `data/patterns/global-nationality-origin.yaml`** with exactly this content:

```yaml
schema: testpattern/v1
name: Nationality and National Origin
slug: global-nationality-origin
version: 1.0.0
type: keyword_list
pattern_class: concept
engine: universal
description: >-
  Detects references to nationality/citizenship/immigration-status disclosure: nationality
  fields, national origin, citizenship status, visa status, and naturalization records. Unlike
  the three sibling Art-9 patterns in this wave (sexual-orientation, religious-beliefs,
  racial-ethnic-origin), nationality is NOT a GDPR Article 9 special category — it is
  processed under GDPR's ordinary Article 6 lawful-basis regime. It is grouped with the Art-9
  set here because it shares the same detection problem (an attribute value with no fixed
  format) and was bundled with them in the C3 deprecation/gap analysis, and because national
  origin carries real discrimination risk. Topic-grade detector, low confidence by design.
operation: >-
  Phrase regex matching indicative nationality/citizenship/immigration-status disclosure
  terminology (nationality field, national origin, citizenship status, immigration status,
  visa status, country of citizenship, dual citizenship, naturalization status, non-citizen
  status). Detects the presence of nationality/immigration subject matter in a
  disclosure/record context; not a structured-token detector. Pair with corroborative keywords
  to raise precision.
pattern: '(?i)\b(?:nationality\s+field|national\s+origin|citizenship\s+status|immigration\s+status|visa\s+status|country\s+of\s+citizenship|dual\s+citizenship|naturaliz(?:ation|ed)\s+status|non-citizen\s+status)\b'
confidence: low
confidence_justification: >-
  Low by design. Nationality/immigration status has no fixed format, so it is detected purely
  by topic vocabulary. The bare word "national" appears constantly in unrelated contexts
  (National Bank, nationally recognized, national holiday); the regex is scoped to full
  disclosure phrases only, and hits should be paired with corroborative keywords (citizenship,
  visa, immigration) to raise precision.
jurisdictions:
  - global
regulations:
  - GDPR
frameworks:
  - ISO 27001
  - NIST CSF
  - SOC 2
data_categories:
  - pii
corroborative_evidence:
  keywords:
    - citizenship
    - visa
    - immigration
    - passport
    - naturalized
    - permanent resident
    - foreign national
  proximity: 300
test_cases:
  should_match:
    - value: 'The onboarding form records nationality and citizenship status.'
      description: Citizenship status phrase present
    - value: 'File notes his current visa status and immigration category.'
      description: Visa status phrase present
    - value: 'HR record documents naturalization status for payroll tax purposes.'
      description: Naturalization status phrase present
  should_not_match:
    - value: 'National Bank of Australia reported quarterly earnings.'
      description: Near-miss proper noun ("National Bank"), no nationality disclosure
    - value: 'She received a nationally recognized award for her research.'
      description: Near-miss adverb ("nationally"), not "nationality"
    - value: 'The office is closed for the national holiday on Monday.'
      description: Unrelated "national" (holiday), no disclosure vocabulary
false_positives:
  - description: >-
      The word "national"/"nationally" appears in unrelated contexts (proper nouns like
      National Bank, adverbial "nationally recognized", "national holiday") that have nothing
      to do with a person's nationality or citizenship.
    mitigation: >-
      The regex targets full disclosure phrases ("national origin", "citizenship status",
      "visa status") rather than the bare word "national"; require corroborative keywords
      (citizenship, visa, immigration, passport) for confidence.
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: broad
risk_rating: 6
risk_description: >-
  Nationality and immigration status carry discrimination and safety risk (particularly for
  refugees, asylum seekers, and undocumented individuals); disclosure can expose individuals
  to targeted harassment or, in some jurisdictions, legal jeopardy.
sensitivity_labels:
  pspf: "OFFICIAL: Sensitive"
  qgiscf: SENSITIVE
  qgiscf_dlm: "SENSITIVE Personal-Privacy"
  us_gov: CUI Basic
  uk_gov: OFFICIAL-SENSITIVE
  nz_gov: RESTRICTED
  ca_gov: Protected B
created: '2026-07-12'
updated: '2026-07-12'
changelog:
  - version: 1.0.0
    date: '2026-07-12'
    description: 'New pattern: replaces the deprecated au/global-top500-005-nationality attribute-value patterns (needs-EDM/ML) with an honest topic-classifier concept, modeled on global-political-opinion. Unlike its 3 sibling patterns in this wave, deliberately NOT framed as a GDPR Article 9 special category (nationality is not on the Art 9 list) — framed instead on discrimination/immigration-status risk under GDPR Art 6. Fills the D-wave coverage gap logged in c3-deprecation-report.md.'
author: testpattern-community
license: MIT
keywords:
  - nationality field
  - national origin
  - citizenship status
  - immigration status
  - visa status
  - country of citizenship
  - dual citizenship
  - naturalization status
  - non-citizen status
references:
  - url: https://gdpr-info.eu/art-6-gdpr/
    title: GDPR Article 6 — lawfulness of processing (nationality is ordinary, not special-category, personal data)
```

- [ ] **Step 2: Create `data/patterns/au-nationality-origin.yaml`** with exactly this content:

```yaml
schema: testpattern/v1
name: Nationality and National Origin (Australia)
slug: au-nationality-origin
version: 1.0.0
type: keyword_list
pattern_class: concept
engine: universal
description: >-
  Detects references to nationality/citizenship/immigration-status disclosure in Australian
  documents: nationality fields, national origin, citizenship status, visa status, and
  naturalization records. Not framed as an Art-9-style special category (Australia has no
  equivalent regime) — sensitivity here rests on immigration-status/visa risk under the
  Migration Act 1958 (Cth) and on the "national origin" limb of the Racial Discrimination Act
  1975 (Cth), distinct from that Act's race/ethnicity limb covered by the sibling
  au-racial-ethnic-origin pattern. Topic-grade detector, low confidence by design.
operation: >-
  Phrase regex matching indicative nationality/citizenship/immigration-status disclosure
  terminology (nationality field, national origin, citizenship status, immigration status,
  visa status, country of citizenship, dual citizenship, naturalization status, non-citizen
  status). Detects the presence of nationality/immigration subject matter in a
  disclosure/record context; not a structured-token detector. Pair with corroborative keywords
  to raise precision.
pattern: '(?i)\b(?:nationality\s+field|national\s+origin|citizenship\s+status|immigration\s+status|visa\s+status|country\s+of\s+citizenship|dual\s+citizenship|naturaliz(?:ation|ed)\s+status|non-citizen\s+status)\b'
confidence: low
confidence_justification: >-
  Low by design. Nationality/immigration status has no fixed format, so it is detected purely
  by topic vocabulary. The bare word "national" appears constantly in unrelated contexts
  (National Bank, nationally recognized, national holiday); the regex is scoped to full
  disclosure phrases only, and hits should be paired with corroborative keywords (citizenship,
  visa, immigration) to raise precision.
jurisdictions:
  - au
regulations:
  - Migration Act 1958 (Cth)
  - Racial Discrimination Act 1975 (Cth)
  - Privacy Act 1988 (Cth)
  - NDB Scheme (Cth)
frameworks:
  - ISO 27001
  - NIST CSF
  - SOC 2
data_categories:
  - pii
corroborative_evidence:
  keywords:
    - citizenship
    - visa
    - immigration
    - passport
    - naturalized
    - permanent resident
    - foreign national
  proximity: 300
test_cases:
  should_match:
    - value: 'The onboarding form records nationality and citizenship status.'
      description: Citizenship status phrase present
    - value: 'File notes his current visa status and immigration category.'
      description: Visa status phrase present
    - value: 'HR record documents naturalization status for payroll tax purposes.'
      description: Naturalization status phrase present
  should_not_match:
    - value: 'National Bank of Australia reported quarterly earnings.'
      description: Near-miss proper noun ("National Bank"), no nationality disclosure
    - value: 'She received a nationally recognized award for her research.'
      description: Near-miss adverb ("nationally"), not "nationality"
    - value: 'The office is closed for the national holiday on Monday.'
      description: Unrelated "national" (holiday), no disclosure vocabulary
false_positives:
  - description: >-
      The word "national"/"nationally" appears in unrelated contexts (proper nouns like
      National Bank, adverbial "nationally recognized", "national holiday") that have nothing
      to do with a person's nationality or citizenship.
    mitigation: >-
      The regex targets full disclosure phrases ("national origin", "citizenship status",
      "visa status") rather than the bare word "national"; require corroborative keywords
      (citizenship, visa, immigration, passport) for confidence.
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: broad
risk_rating: 6
risk_description: >-
  Nationality and immigration status carry discrimination and safety risk under the Racial
  Discrimination Act 1975 (Cth)'s national-origin limb; disclosure of visa/citizenship status
  can expose individuals to targeted harassment or immigration enforcement risk.
sensitivity_labels:
  pspf: "OFFICIAL: Sensitive"
  qgiscf: SENSITIVE
  qgiscf_dlm: "SENSITIVE Personal-Privacy"
  us_gov: CUI Basic
  uk_gov: OFFICIAL-SENSITIVE
  nz_gov: RESTRICTED
  ca_gov: Protected B
created: '2026-07-12'
updated: '2026-07-12'
changelog:
  - version: 1.0.0
    date: '2026-07-12'
    description: 'New pattern: replaces the deprecated au/global-top500-005-nationality attribute-value patterns (needs-EDM/ML) with an honest topic-classifier concept, modeled on global-political-opinion. Not framed as an Art-9-style special category — framed on Migration Act 1958 immigration-status risk and the Racial Discrimination Act 1975''s national-origin limb. Fills the D-wave coverage gap logged in c3-deprecation-report.md.'
author: testpattern-community
license: MIT
keywords:
  - nationality field
  - national origin
  - citizenship status
  - immigration status
  - visa status
  - country of citizenship
  - dual citizenship
  - naturalization status
  - non-citizen status
references:
  - url: https://www.fairwork.gov.au/tools-and-resources/fact-sheets/rights-and-obligations/visa-holders-and-migrant-workers-workplace-rights-and-entitlements
    title: Visa holders and migrant workers — workplace rights and entitlements — Fair Work Ombudsman
```

- [ ] **Step 3: Verify both files parse and test cases pass**

Run: `node scripts/verify-pattern-testcases.mjs global-nationality-origin au-nationality-origin`
Expected: `all test_cases pass` (no FAIL lines) for both slugs.

- [ ] **Step 4: Commit**

```bash
git add data/patterns/global-nationality-origin.yaml data/patterns/au-nationality-origin.yaml
git commit -m "feat(patterns): add nationality/national-origin reference patterns (au/global)"
```

## Task 5: Full-corpus verification, compile, and push

**Files:**
- Modify: `patterns.json` (regenerated by compile script, not hand-edited)

**Interfaces:**
- Consumes: all 8 files created in Tasks 1-4 must exist and be committed before this task runs.

- [ ] **Step 1: Run the CI check across the full corpus**

Run: `npm run check`
Expected: `CI check: 0 error(s), <N> warning(s)` — the warning count may include the 8 new files if they trip any of the existing informational warnings, but there must be **0 errors**. Compare the error count to the pre-task baseline (0) — if any error appears, it must reference one of the 8 new files; fix it before proceeding.

- [ ] **Step 2: Run the quality gate**

Run: `npm run check:quality`
Expected: `Quality gate PASSED: 0 issue(s) in [shortAcronyms, nonCanonical, duplicateLevelsIdentical, weakHigh] outside the exclusion set`

- [ ] **Step 3: Run the full test-case harness across all 8 new slugs together**

Run: `node scripts/verify-pattern-testcases.mjs global-sexual-orientation au-sexual-orientation global-religious-beliefs au-religious-beliefs global-racial-ethnic-origin au-racial-ethnic-origin global-nationality-origin au-nationality-origin`
Expected: `all test_cases pass`

- [ ] **Step 4: Run the full corpus test-case harness to confirm no regressions elsewhere**

Run: `node scripts/verify-pattern-testcases.mjs --all`
Expected: failure/warning counts unchanged from the pre-task baseline (45 failures / 99 warnings per the last known-good baseline — re-check the current baseline with `git stash` + a run on the pre-task HEAD if the numbers differ, to confirm any delta is pre-existing and not caused by the new files).

- [ ] **Step 5: Recompile patterns.json**

Run: `npm run compile`
Expected: `Compiling patterns... Done: 1663 patterns, ...` (1655 + 8 = 1663; if the count differs, one of the 8 files didn't get picked up — check the slug/filename match).

- [ ] **Step 6: Stage and commit the compiled output**

```bash
git add patterns.json
git commit -m "chore(build): recompile patterns.json — Art-9/protected-attribute wave (8 new patterns)"
```

- [ ] **Step 7: Push to main**

```bash
git push origin main
```

Expected: push succeeds, no conflicts (branch was up to date with origin/main before Task 1 started).

- [ ] **Step 8: Confirm the publish workflow succeeds**

Run: `gh run list --limit 3`
Expected: the most recent "Compile patterns and publish to KV" run on `main` shows `completed success`. If it shows `failure`, treat as urgent — check `gh run view --log-failed` for the cause before considering this plan complete (per the project's standing lesson: a red publish run after a merge to main is a live incident, not a follow-up item).
