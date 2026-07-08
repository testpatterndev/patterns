# Backlog ticket: tier-aware-harness — report

**Task:** make `scripts/verify-pattern-testcases.mjs` tier-aware so evidence / label-context
regexes are never evaluated as standalone detectors of the whole test value (ledger defect,
Plan-1 Task 9).

**Result:** full-catalog failures drop from **550 FAIL lines across 258 patterns** to
**86 FAIL lines across 68 patterns**. Every eliminated failure was a spurious artifact of the
old "any regex in the file must (not) match" semantics; every remaining failure was manually
spot-verified against the pattern YAML and is a genuine catalog issue (ticket candidates
below — no patterns were modified in this task).

---

## 1. Reproduction (before)

Old script semantics: collect top-level `pattern` plus every `purview.regexes[].pattern`,
then require *some* regex to match each `should_match` value and *no* regex to match any
`should_not_match` value.

Full-catalog run (all 1655 slugs), old script:

- **550 FAIL lines** (239 should_match, 251 should_not_match, 60 "no compilable regex")
  across **258 patterns**.
- The ledger's known-spurious class — label-context / evidence regexes matching bare words —
  is exactly what fails the azure credential family (all spurious, all should_not_match):

```
FAIL azure-app-service-deployment-password should_not_match: "password=\"short\""
FAIL azure-cognitive-search-api-key should_not_match: "api-key=short"
FAIL azure-cognitive-search-api-key should_not_match: "searchServiceName=my-search-service"
FAIL azure-cognitive-service-key should_not_match: "Ocp-Apim-Subscription-Key=tooshort"
FAIL azure-cognitive-service-key should_not_match: "cognitiveServiceEndpoint=https://myservice.cognitiveservices.azure.com"
FAIL azure-cosmos-db-account-access-key should_not_match: "AccountEndpoint=https://myaccount.documents.azure.com"
FAIL azure-databricks-personal-access-token should_not_match: "databricks-token=some-other-format"
FAIL azure-documentdb-auth-key should_not_match: "AccountEndpoint=https://mydb.documents.azure.com:443"
FAIL azure-entra-client-access-token should_not_match: "This is not a JWT token"
FAIL azure-entra-user-credentials should_not_match: "The user must enter their password to log in"
FAIL azure-eventgrid-access-key should_not_match: "aeg-sas-key=short"
FAIL azure-eventgrid-access-key should_not_match: "topicEndpoint=https://mytopic.westus2-1.eventgrid.azure.net"
FAIL azure-function-master-api-key should_not_match: "x-functions-key=\"\""
FAIL azure-function-master-api-key should_not_match: "functionAppName=my-function-app"
FAIL azure-iaas-database-connection-string-sql should_not_match: "Server=myserver;Database=mydb;Integrated Security=True"
FAIL azure-iaas-database-connection-string-sql should_not_match: "Server=myserver;Database=mydb"
FAIL azure-iot-connection-string should_not_match: "HostName=myhub.azure-devices.net;SharedAccessKeyName=iothubowner"
FAIL azure-logic-app-shared-access-signature should_not_match: "https://prod-00.westus.logic.azure.com/workflows/aaaa0000/triggers/manual"
FAIL azure-maps-subscription-key should_not_match: "subscription-key=short"
FAIL azure-maps-subscription-key should_not_match: "mapsAccountName=my-maps-account"
FAIL azure-redis-cache-connection-string should_not_match: "myredis.redis.cache.windows.net"
FAIL azure-redis-cache-connection-string should_not_match: "redis://localhost:6379"
FAIL azure-signalr-access-key should_not_match: "Endpoint=https://myapp.service.signalr.net"
```

Cause in every case: a `Pattern_*_label_context` regex (bare words like `azure`, `key`,
`password`, `endpoint`) or a domain-context keyword regex matched the negative value even
though the tier's `id_match` (the actual secret shape) cannot match it. Under tier
semantics these regexes only corroborate an `id_match` hit; they are not detectors.

Other spurious before-classes (all eliminated):

- **Keyword-anchored tiers ignored** (~200 should_match FAILs): concept patterns
  (`au-commercial-lease-agreement`, `au-qld-health-clinical-handover`, `eu-tax-id`,
  `global-all-full-names`, …) whose detection is the `keywords` array
  (keyword_list/keyword_dictionary) or a keyword-group `id_match` — the old script only
  compiled regexes, so their test values "matched nothing".
- **"no compilable regex"** (60 FAILs): keyword_list / keyword_proximity /
  trainable_classifier patterns with no regexes at all — not a defect of the pattern.
- **Sentinel-filter negatives** (e.g. `au-motor-vehicle-permit should_not_match "00000000"`):
  values excluded by declared `purview.filters` (AllDigitsSameFilter / TextMatchFilter),
  which the old script did not model.
- **Tier-gated negatives** (e.g. `ae-passport-number "sample template placeholder number
  123456789"`): id shape matches but every tier is AND-gated on evidence that is absent, or
  blocked by the template-exclusion NOT-group. The SIT cannot fire; the new script reports
  these as non-failing `warn` lines (parity with ci-check's warning behavior).

Full before/after transcripts were captured during the run; the before stats above are the
complete failure census of the old script at commit `0838f6b2`.

## 2. Tier semantics implemented (derived from the catalog + compile.js, not invented)

A `purview.pattern_tiers[]` entry is one confidence tier of the SIT:

```
- confidence_level: 85
  id_match: <regex-id | keyword-id | { type: any, ids: [...] }>
  matches:                        # supporting evidence within patterns_proximity of the id match
    - ref: <id>                                  # required (AND)
    - ref: <id>, min_count: N, unique_results: b # required, needs >= N (unique) hits
    - type: any, min_matches: m, max_matches: M, refs|children: [...]
                                                 # m..M of the members must match;
                                                 # min 0 / max 0 == NOT-group (exclusion)
  excludes: [{ref}]               # alternate exclusion spelling (au-number-plates family)
  exclusion: [<any-group>]        # alternate exclusion spelling (au-hpi family)
  discovery_only: true            # deliberately-broad inventory tier
```

Resolution rules (mirroring `scripts/compile.js`):

- `purview.regexes[].id` → regex matcher (JS translation of `(?ims)` prefixes, repo-standard
  forced case-insensitivity unless `case_sensitive: true`).
- `purview.keywords[].id` → keyword-group matcher; `match_style: word` = word-boundary
  match, `string` = substring; terms may be `{text, case_sensitive}` objects. Legacy shapes
  (`name`/`words`, `group`/`values`) are normalized the same way.
- `purview.shared_keywords[] {dict, as, match_style}` → the referenced
  `data/keywords/<dict>.yaml` terms registered under the `as` id (what compile.js inlines).
- `purview.filters`: `AllDigitsSameFilter` rejects an id-match hit whose digits are all the
  same digit; `TextMatchFilter (direction Full, logic Exclude)` rejects an id-match hit whose
  full matched text equals one of the terms; legacy `exclude`/`exclude_keyword`
  (term-in-document) and `exclude_pattern` (regex-in-document) suppress the whole detection.

Test-case evaluation:

- **should_match passes** iff the tier logic *can* pass for the value: some tier's
  `id_match` matches the value (with at least one hit surviving match-level filters) and the
  value itself does not trip that tier's NOT-groups / document filters. Positive evidence
  (`{ref}`, min-groups) may legitimately come from surrounding document context in
  deployment, so it is **not** required to be inside the test value — but exclusion content
  inside the value is always inside the proximity window, so it permanently vetoes the tier.
  The top-level `pattern` (universal-engine detector) and, for keyword_list/dictionary
  types, the `keywords` array are additional accepted detection paths.
- **should_not_match fails** iff the detector *would* fire on the value taken as a whole
  document: some non-`discovery_only` tier's `id_match` matches (surviving filters), all of
  that tier's positive evidence is found in the value (honoring `min_count`/`unique_results`
  and any-group min/max), and no exclusion or filter suppresses it. Evidence/label-context
  regexes alone can never fail a negative. A top-level-pattern hit on a tier-gated pattern
  is a `warn`, not a failure (73 such warnings catalog-wide, same class ci-check warns on).
- Unresolvable/ENGINE-DIVERGENT refs: as positive evidence they count as *not satisfied*
  (the harness never claims a tier fires on unverifiable evidence); as exclusions they count
  as *not tripped* (never veto a should_match on unverifiable grounds). Dangling tier refs
  are surfaced as warnings.

Known approximations (documented, deliberate):

- Proximity distances are not simulated: the test value is treated as one window. 139 test
  values exceed their `patterns_proximity` (300); for these the harness is slightly lenient.
- Regex `validators` (checksums) and trainable-classifier logic are not evaluated (JS cannot);
  patterns relying on them are judged on regex shape alone, same as before.
- Evidence may overlap the id-match span (Purview's window includes the primary match).
- JS `\b` is ASCII-only (known ledger caveat for Cyrillic/CJK label terms).
- `discovery_only` tiers are exempt from should_not_match firing checks: they are declared
  broad inventory tiers and negatives are authored against enforcement tiers.

## 3. Proof

1. **Spurious FAILs disappear.** All 23 azure-family FAILs above, and the whole
   label-context class, pass under the new script (`node scripts/verify-pattern-testcases.mjs
   azure-storage-account-key azure-cognitive-search-api-key ... → all test_cases pass`).
2. **Deliberate breakage is still caught.** Injected into `azure-storage-account-key.yaml`
   and ran the script, then reverted the YAML (`git checkout --`):
   - should_match `"definitely-not-a-key!"` (cannot match the 88-char base64 id regex) →
     `FAIL ... should_match: "definitely-not-a-key!" — no tier can pass`, exit 1.
   - should_not_match `"account key: <88-char base64>"` (id_match + specific keyword
     evidence, no exclusions) → `FAIL ... — tier@85 fires (id_match
     "Regex_azure_storage_account_key")`, exit 1.
   - After revert: `all test_cases pass`, exit 0.
3. **Gates:** `npm run check` → 0 errors; `npm run check:quality` → PASSED;
   `npm run compile` → succeeds (patterns.json reset before staging).

## 4. After: remaining failures (86 across 68 patterns) — triage

Complete list at the end. Every class below was spot-verified against the YAML; these are
genuine catalog issues and are **ticket candidates** — nothing was changed in this task.

### T1. Self-corroborating topic tiers — 36 should_not_match (top500 family)

17 `au-top500-*` + 19 `global-top500-*` patterns. The non-discovery 65/75 tier's evidence
keyword group contains the *same phrases* as the `id_match` regex (e.g.
`global-top500-241`: id `\b(?:source\s+code|...)` + evidence `Keyword_private_source_code_repos`
containing "source code"), so a two-word negative like `"source code config"` genuinely
fires the tier. The should_not_match cases document the intent ("generic word pair from old
broad template should not match") — the tiers don't implement it.
**Candidate fix:** remove id_match phrases from the evidence groups or require
`min_count: 2 / unique_results` distinct corroboration on the lowest non-discovery tier.

### T2. Publication/education-context negatives fire legal-concept tiers — 25 should_not_match

`class-action-defence-strategy` (3), `judicial-review-defence-file` (3),
`major-litigation-strategy-document` (3), `native-title-negotiation-strategy` (3),
`solicitor-general-legal-advice` (3), `royal-commission-draft-submission` (2),
`coronial-inquest-draft-submission`, `gender-reassignment-medical-record`,
`ma-legal-due-diligence-for-gocs`, `regulatory-investigation-defence-strategy`,
`regulatory-prosecution-brief`, `settlement-authority-and-negotiation-mandate`,
`sexual-assault-counselling-record`, `witness-protection-program-record` (1 each).
Long "published judgment / textbook chapter / media report" negatives satisfy the 75/85
tier (id phrase + primary evidence keywords present) and nothing excludes the publication
context. Notably `major-litigation-strategy-document` defines
`Evidence_major_litigation_strategy_document_exclusion` (terms: textbook, brochure,
published judgment, …) but wires it as a **required positive `{ref}`** on the 85 tier
instead of a `max_matches: 0` NOT-group — an authoring bug repeated across this family.
**Candidate fix:** wire the `Evidence_*_exclusion` groups as NOT-groups on every
enforcement tier and extend them with the publication-context phrases used by the negatives.

### T3. Sentinel TextMatchFilter contradicts should_match values — 3 should_match

`au-motor-vehicle-permit`: `Guard_permit_exclude_test` excludes the exact values
`123456789`, `1234567`, `1234567890` that the should_match cases use (its other sentinel
values `12345678`/`A12345` survive only via other formats). The declared filter makes these
positives impossible.
**Candidate fix:** use realistic non-sentinel sample values in should_match.

### T4. Template-noise terms inside should_match values — 5 should_match

`snaffler-shell-history-creds` (2: `api.example.com`, `host.example.com`),
`snaffler-source-db-credentials` (`db.example.com`), `global-npm-access-token`
(`example-npm-token-placeholder-xyz0` — trips both "example" and "placeholder"),
`global-sql-server-connection-string` (`sql01.corp.example.com`). Every tier of these
patterns carries the `template-exclusion` NOT-group ("example", "placeholder", …), so the
SIT can never fire on these values.
**Candidate fix:** change test hostnames/tokens to non-noise forms (e.g. `corp.internal`),
or deliberately exempt bare "example" from the credential-pattern noise dictionaries.

### T5. should_match values only hit evidence-only regexes — 11 should_match

`controlled-operation-authorisation`, `corrective-services-intelligence-report`,
`government-procurement-pricing-schedule-sealed` (2), `grant-assessment-scoring-matrix`,
`pre-announcement-grant-funding-recommendation`, `procurement-tender-evaluation-with-pricing`,
`state-borrowing-and-debt-issuance-strategy`, `trading-algorithm-or-quantitative-strategy`,
`whole-of-government-erp-payment-authorisation-file` (2). All tiers in each pattern anchor
on a single primary regex; these values only contain the *other* regexes (e.g.
`COA-2024-QPS-0089` reference numbers, SAP payment-run references) which appear exclusively
as evidence, so no tier can ever anchor on them.
**Candidate fix:** add a tier anchored on the structured-reference regex, or include the
primary phrase in the test value.

### T6. Legacy descriptive-tier patterns — 6 should_not_match

`commission-of-inquiry-legal-submission` (2), `patent-prosecution-strategy-pre-filing` (2),
`lpp-claim-assessment` (1), `sanctions-compliance-legal-assessment` (1) — four of the six
pre-schema patterns whose tiers have `id_match: ""` (not evaluable) and legacy
`exclude`/`exclude_keyword`/`exclude_pattern` filters whose phrasings don't cover their own
negatives (e.g. filter term "final report published" vs value "published its final report").
The top-level pattern matches the negatives ungated. (`coronial-finding-published` and
`court-filing-reference` — same architecture — now pass because their legacy document-level
filters do cover their negatives, which the harness models.)
**Candidate fix:** migrate the six legacy patterns to the standard tier schema.

### Complete after-run FAIL list

```
FAIL au-motor-vehicle-permit should_match: "123456789" — no tier can pass (id_match never matches the value)
FAIL au-motor-vehicle-permit should_match: "1234567" — no tier can pass (id_match never matches the value)
FAIL au-motor-vehicle-permit should_match: "1234567890" — no tier can pass (id_match never matches the value)
FAIL au-top500-225-reliability-and-failure-analysis should_not_match: "product failure" — tier@65 fires
FAIL au-top500-241-private-source-code-repositories should_not_match: "source code config" — tier@75 fires
FAIL au-top500-283-intrusion-detection-alerts should_not_match: "ids intrusion detection" — tier@75 fires
FAIL au-top500-285-sensitive-network-topology-diagrams should_not_match: "network diagram dmz" — tier@85 fires
FAIL au-top500-287-patch-exception-records should_not_match: "patch exception cve" — tier@75 fires
FAIL au-top500-300-insider-threat-investigation-files should_not_match: "insider threat case" — tier@75 fires
FAIL au-top500-353-campus-incident-reports should_not_match: "campus incident security incident" — tier@85 fires
FAIL au-top500-442-plc-logic-programs should_not_match: "plc function block" — tier@75 fires
FAIL au-top500-443-distributed-control-system-configurations should_not_match: "distributed control system configuration" — tier@75 fires
FAIL au-top500-444-substation-protection-relay-settings should_not_match: "protection relay substation" — tier@85 fires
FAIL au-top500-446-water-treatment-dosing-formulas should_not_match: "water treatment dosing" — tier@75 fires
FAIL au-top500-456-ot-cyber-incident-reports should_not_match: "ot cyber incident report" — tier@85 fires
FAIL au-top500-458-cctv-coverage-and-blind-spot-analyses should_not_match: "cctv blind spot" — tier@85 fires
FAIL au-top500-460-dam-safety-and-integrity-reports should_not_match: "dam safety report" — tier@75 fires
FAIL au-top500-461-enterprise-data-inventories should_not_match: "data inventory compliance" — tier@85 fires
FAIL au-top500-483-election-incident-response-records should_not_match: "election incident response" — tier@85 fires
FAIL au-top500-498-sovereign-debt-issuance-plans should_not_match: "voter sovereign debt" — tier@75 fires
FAIL class-action-defence-strategy should_not_match: "A class action has been filed against the State Government..." — tier@75 fires
FAIL class-action-defence-strategy should_not_match: "This chapter examines class action procedure in Australia..." — tier@75 fires
FAIL class-action-defence-strategy should_not_match: "The class action was settled for $85 million..." — tier@75 fires
FAIL commission-of-inquiry-legal-submission should_not_match: "The Coaldrake Commission of Inquiry published its final report..." — top-level pattern matches (no tiers to gate it)
FAIL commission-of-inquiry-legal-submission should_not_match: "The State's submission to the Commission of Inquiry was tabled..." — top-level pattern matches (no tiers to gate it)
FAIL controlled-operation-authorisation should_match: "COA renewal. COA-2024-QPS-0089. Extension 60 days..." — no tier can pass
FAIL coronial-inquest-draft-submission should_not_match: "A media report about the coronial inquest revealed..." — tier@75 fires
FAIL corrective-services-intelligence-report should_match: "QCS Intelligence Unit — Monthly Assessment. Prison gang activity..." — no tier can pass
FAIL gender-reassignment-medical-record should_not_match: "Transgender Day of Visibility is observed annually..." — tier@75 fires
FAIL global-npm-access-token should_match: "//registry.npmjs.org/:_authToken=example-npm-token-placeholder-xyz0" — no tier can pass
FAIL global-sql-server-connection-string should_match: "Data Source=sql01.corp.example.com\\SQLEXPRESS;Initial Catalog=..." — no tier can pass
FAIL global-top500-241-private-source-code-repositories should_not_match: "source code config" — tier@65 fires
FAIL global-top500-283-intrusion-detection-alerts should_not_match: "ids intrusion detection" — tier@65 fires
FAIL global-top500-285-sensitive-network-topology-diagrams should_not_match: "network diagram dmz" — tier@65 fires
FAIL global-top500-286-vulnerability-scan-outputs should_not_match: "nessus vulnerability scan" — tier@65 fires
FAIL global-top500-287-patch-exception-records should_not_match: "patch exception cve" — tier@65 fires
FAIL global-top500-300-insider-threat-investigation-files should_not_match: "insider threat case" — tier@65 fires
FAIL global-top500-353-campus-incident-reports should_not_match: "campus incident security incident" — tier@65 fires
FAIL global-top500-389-immigration-interview-transcripts should_not_match: "immigration case" — tier@65 fires
FAIL global-top500-441-scada-network-diagrams should_not_match: "scada network diagram" — tier@65 fires
FAIL global-top500-442-plc-logic-programs should_not_match: "plc function block" — tier@65 fires
FAIL global-top500-443-distributed-control-system-configurations should_not_match: "distributed control system configuration" — tier@65 fires
FAIL global-top500-444-substation-protection-relay-settings should_not_match: "protection relay substation" — tier@65 fires
FAIL global-top500-446-water-treatment-dosing-formulas should_not_match: "water treatment dosing" — tier@65 fires
FAIL global-top500-450-rail-signaling-configurations should_not_match: "rail signal configuration" — tier@65 fires
FAIL global-top500-456-ot-cyber-incident-reports should_not_match: "ot cyber incident report" — tier@65 fires
FAIL global-top500-457-physical-badge-access-maps should_not_match: "badge access zone" — tier@65 fires
FAIL global-top500-459-hazardous-material-storage-maps should_not_match: "hazardous material storage" — tier@65 fires
FAIL global-top500-460-dam-safety-and-integrity-reports should_not_match: "dam safety report" — tier@65 fires
FAIL global-top500-498-sovereign-debt-issuance-plans should_not_match: "voter sovereign debt" — tier@65 fires
FAIL government-procurement-pricing-schedule-sealed should_match: "Price Submission — Financial Offer. RFT ICT Managed Services..." — no tier can pass
FAIL government-procurement-pricing-schedule-sealed should_match: "PROTECTED. Sealed Commercial Submission — Major Infrastructure..." — no tier can pass
FAIL grant-assessment-scoring-matrix should_match: "Evaluation Panel Summary — Community Grants 2026..." — no tier can pass
FAIL judicial-review-defence-file should_not_match: "The Supreme Court allowed the judicial review application..." — tier@85 fires
FAIL judicial-review-defence-file should_not_match: "This textbook chapter provides an overview of judicial review..." — tier@75 fires
FAIL judicial-review-defence-file should_not_match: "The Ombudsman's annual report noted an increase..." — tier@75 fires
FAIL lpp-claim-assessment should_not_match: "The court considered the privilege claim and upheld it in part..." — top-level pattern matches (no tiers to gate it)
FAIL ma-legal-due-diligence-for-gocs should_not_match: "This textbook chapter covers legal due diligence methodology..." — tier@75 fires
FAIL major-litigation-strategy-document should_not_match: "This chapter examines litigation strategy as a concept..." — tier@75 fires
FAIL major-litigation-strategy-document should_not_match: "Our firm's litigation strategy brochure outlines..." — tier@75 fires
FAIL major-litigation-strategy-document should_not_match: "The published judgment discussed the plaintiff's litigation strategy..." — tier@75 fires
FAIL native-title-negotiation-strategy should_not_match: "The National Native Title Tribunal maintains a register..." — tier@75 fires
FAIL native-title-negotiation-strategy should_not_match: "The Federal Court made a native title determination..." — tier@75 fires
FAIL native-title-negotiation-strategy should_not_match: "This journal article examines the development of native title..." — tier@75 fires
FAIL patent-prosecution-strategy-pre-filing should_not_match: "Australian Patent No. 2024123456 was granted..." — top-level pattern matches (no tiers to gate it)
FAIL patent-prosecution-strategy-pre-filing should_not_match: "This textbook chapter provides an overview of patent prosecution..." — top-level pattern matches (no tiers to gate it)
FAIL pre-announcement-grant-funding-recommendation should_match: "Submission to Director-General. Pre-announcement..." — no tier can pass
FAIL procurement-tender-evaluation-with-pricing should_match: "Commercial-in-Confidence. Procurement evaluation matrix..." — no tier can pass
FAIL regulatory-investigation-defence-strategy should_not_match: "This article examines regulatory investigation defence strategies..." — tier@75 fires
FAIL regulatory-prosecution-brief should_not_match: "This chapter examines the regulatory prosecution process..." — tier@75 fires
FAIL royal-commission-draft-submission should_not_match: "The State of Queensland's submission to the Royal Commission was tabled..." — tier@75 fires
FAIL royal-commission-draft-submission should_not_match: "A news report about the Royal Commission hearing..." — tier@75 fires
FAIL sanctions-compliance-legal-assessment should_not_match: "This article discusses the development of international sanctions..." — top-level pattern matches (no tiers to gate it)
FAIL settlement-authority-and-negotiation-mandate should_not_match: "The settlement authority process in Queensland Government..." — tier@75 fires
FAIL sexual-assault-counselling-record should_not_match: "The Queensland Government funds Sexual Assault Response and Support..." — tier@75 fires
FAIL snaffler-shell-history-creds should_match: "curl https://api.example.com/data -u admin:HunterTwo99" — no tier can pass
FAIL snaffler-shell-history-creds should_match: "sshpass -p 'Secret1' ssh user@host.example.com" — no tier can pass
FAIL snaffler-source-db-credentials should_match: "mysql_connect(\"db.example.com\", \"root\", $password)" — no tier can pass
FAIL solicitor-general-legal-advice should_not_match: "The Solicitor-General of Australia appeared before the High Court..." — tier@85 fires
FAIL solicitor-general-legal-advice should_not_match: "The role of the Solicitor-General in the Australian legal system..." — tier@75 fires
FAIL solicitor-general-legal-advice should_not_match: "The former Solicitor-General delivered a public lecture..." — tier@85 fires
FAIL state-borrowing-and-debt-issuance-strategy should_match: "Confidential — Not for distribution. QTC Debt Issuance Strategy..." — no tier can pass
FAIL trading-algorithm-or-quantitative-strategy should_match: "PROTECTED — QIC Quantitative Investment v4.1..." — no tier can pass
FAIL whole-of-government-erp-payment-authorisation-file should_match: "PROTECTED — ERP Payment Authorisation File. Source: SAP..." — no tier can pass
FAIL whole-of-government-erp-payment-authorisation-file should_match: "PROTECTED — Oracle ERP batch payment authorisation..." — no tier can pass
FAIL witness-protection-program-record should_not_match: "The Queensland Government administers the Witness Protection Act 2000..." — tier@75 fires
```

Additional observation (not a FAIL under the discovery exemption, worth a ticket):
`au-titled-person-reference` negative `"The mrs clause in the contract"` matches
`Pattern_titled_person` because the repo convention compiles all regexes case-insensitively
(`[A-Z][a-z]+` stops being a casing constraint) — the test's rationale assumes
case-sensitivity. The pattern should set `case_sensitive: true` or the negative should change.

## 5. Usage

```
node scripts/verify-pattern-testcases.mjs <slug> [<slug> ...]
node scripts/verify-pattern-testcases.mjs --all      # full catalog (new)
```

Exit codes unchanged (non-zero on any FAIL). Output adds `warn` lines (non-failing) for
tier-gated negatives that match the top-level pattern and for dangling tier refs.
