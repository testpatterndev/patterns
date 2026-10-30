# Capture-group migration (2026-10-30)

Every regex in `data/patterns` and `data/identifiers` now has exactly one capturing group, and it spans the match the regex reports. Group 0 is unchanged. The aim is best-effort Copilot prompt blocking (a test-tenant A/B blocked more prompts with `\b(X)\b` than with `\bX\b`); nothing here makes blocking reliable and nothing here is a speed change.

Files: `equivalence-summary.json` (totals), `equivalence-per-regex.csv` (one row per regex field). Reproduce with `node scripts/verify-capture-group-equivalence.mjs --base 81ee920f72 --exporter <testpattern>/src/lib/regex-compat.js`.

## Counts

Capturing groups per regex, counted by `scripts/lib/capture-groups.mjs` (agrees with V8 on all 3,064 unique base texts). After the change every row is 1 group spanning the whole match.

| Regex field | Before: fields | 0 groups | 1, whole match | 1, part of match | After: fields (all 1, whole match) |
|---|---:|---:|---:|---:|---:|
| top-level `pattern` | 1,367 | 1,324 | 30 | 13 | 1,367 |
| `purview.regexes[]` | 3,329 | 3,284 | 30 | 15 | 3,334 |
| `purview.filters[]` (exclude_pattern, not exported) | 3 | 3 | 0 | 0 | 3 |
| identifier `public_format` / `fallback` / `example_overlay` | 118 | 118 | 0 | 0 | 118 |
| **All fields** | **4,817** | 4,729 | 60 | 28 | **4,822** |
| Unique texts | 3,064 | 2,992 | 57 | 15 | 3,069 |
| Shipped catalogue (`patterns.json`, live patterns, unique `purview.regexes`) | 2,674 | 2,631 | 28 | 15 | 2,679 |

No regex had 2 or more capturing groups. The seven regexes previously reported as multi-group (for example `Regex_au_qld_mandatory_data_breach_notification_party_field`) have 0: their parentheses are inside character classes such as `[A-Za-z&'.,()-]`. After: +5 fields because one evidence regex became six (below).

## Rules applied

| Rule | Fields | What happened |
|---|---:|---|
| promote | 2,118 | Core between the boundaries was one `(?:...)` group; it became the capturing group: `(?i)\b(?:a\|b)\b` → `(?i)\b(a\|b)\b` |
| wrap | 2,600 | Group added around the core, boundaries and leading flags left outside: `(?<!\d)\d{9}(?!\d)` → `(?<!\d)(\d{9})(?!\d)`; with a top-level `\|` the group takes the whole body |
| unchanged | 60 | Already one group spanning the match (`(?i)\b(terms)\b`) |
| regroup | 25 | A group around part of the match became `(?:...)` and the whole match was wrapped (listed below) |
| wrap-after-keep | 3 | Group starts after the top-level `\K`, where the reported match starts (listed below) |
| wrap+nonspace | 8 | Wrapped, and bare `\S+`/`\S{n,}` written `[^\s]` (listed below) |
| regroup+nonspace | 2 | Regroup plus `\S` → `[^\s]` (listed below) |
| hand | 1 | Backreference; rearchitected by hand (below) |

## Changed primary-value spans (owner review)

These regexes had one capturing group around **part** of the match. That group is now `(?:...)` and the new group spans the whole match, so if anything reads group 1 as the primary value, these values change from the part to the whole match. Group 0 (what Purview reports by default; our exporter emits no `primaryCapturingGroup`) is unchanged. Deprecated patterns are marked.

| Pattern | Field | Old group 1 | Before | After |
|---|---|---|---|---|
| cn-resident-id | pattern | `(19\|20)` | `\b[1-9]\d{5}(19\|20)\d{2}(?:0[1-9]\|1[0-2])(?:0[1-9]\|[12]\d\|3[01])\d{3}[\dXx]\b` | `\b([1-9]\d{5}(?:19\|20)\d{2}(?:0[1-9]\|1[0-2])(?:0[1-9]\|[12]\d\|3[01])\d{3}[\dXx])\b` |
| cn-resident-id | purview.regexes/Regex_cn_resident_id | `(19\|20)` | `\b[1-9]\d{5}(19\|20)\d{2}(?:0[1-9]\|1[0-2])(?:0[1-9]\|[12]\d\|3[01])\d{3}[\dXx]\b` | `\b([1-9]\d{5}(?:19\|20)\d{2}(?:0[1-9]\|1[0-2])(?:0[1-9]\|[12]\d\|3[01])\d{3}[\dXx])\b` |
| covert-operative-identity-record | purview.regexes/Pattern_covert_operative_identity_record_qps_personnel_number | `(Reg\.?\s*No\.?\|Registration\s+Number\|Service\s+Number)` | `\b(Reg\.?\s*No\.?\|Registration\s+Number\|Service\s+Number)\s*:?\s*\d{4,6}\b` | `\b((?:Reg\.?\s*No\.?\|Registration\s+Number\|Service\s+Number)\s*:?\s*\d{4,6})\b` |
| fr-nir-social-security | pattern | `(0[1-9]\|1[0-2]\|[2-4][0-9])` | `\b[12]\d{2}(0[1-9]\|1[0-2]\|[2-4][0-9])\d{2}(?:\d{3}\|2[AB])\d{3}\d{2}\b` | `\b([12]\d{2}(?:0[1-9]\|1[0-2]\|[2-4][0-9])\d{2}(?:\d{3}\|2[AB])\d{3}\d{2})\b` |
| fr-nir-social-security | purview.regexes/Regex_fr_nir | `(0[1-9]\|1[0-2]\|[2-4][0-9])` | `\b[12]\d{2}(0[1-9]\|1[0-2]\|[2-4][0-9])\d{2}(?:\d{3}\|2[AB])\d{3}\d{2}\b` | `\b([12]\d{2}(?:0[1-9]\|1[0-2]\|[2-4][0-9])\d{2}(?:\d{3}\|2[AB])\d{3}\d{2})\b` |
| global-aws-access-key | pattern | `(A3T[A-Z0-9]\|AKIA\|AGPA\|AIDA\|AROA\|AIPA\|ANPA\|ANVA\|ASIA)` | `\b(A3T[A-Z0-9]\|AKIA\|AGPA\|AIDA\|AROA\|AIPA\|ANPA\|ANVA\|ASIA)[A-Z0-9]{16}\b` | `\b((?:A3T[A-Z0-9]\|AKIA\|AGPA\|AIDA\|AROA\|AIPA\|ANPA\|ANVA\|ASIA)[A-Z0-9]{16})\b` |
| global-aws-access-key | purview.regexes/Regex_aws_access_key | `(A3T[A-Z0-9]\|AKIA\|AGPA\|AIDA\|AROA\|AIPA\|ANPA\|ANVA\|ASIA)` | `\b(A3T[A-Z0-9]\|AKIA\|AGPA\|AIDA\|AROA\|AIPA\|ANPA\|ANVA\|ASIA)[A-Z0-9]{16}\b` | `\b((?:A3T[A-Z0-9]\|AKIA\|AGPA\|AIDA\|AROA\|AIPA\|ANPA\|ANVA\|ASIA)[A-Z0-9]{16})\b` |
| global-github-pat | pattern | `(ghp\|gho\|ghu\|ghs\|ghr)` | `\b(ghp\|gho\|ghu\|ghs\|ghr)_[A-Za-z0-9]{36}\b` | `\b((?:ghp\|gho\|ghu\|ghs\|ghr)_[A-Za-z0-9]{36})\b` |
| global-github-pat | purview.regexes/Regex_github_pat | `(ghp\|gho\|ghu\|ghs\|ghr)` | `\b(ghp\|gho\|ghu\|ghs\|ghr)_[A-Za-z0-9]{36}\b` | `\b((?:ghp\|gho\|ghu\|ghs\|ghr)_[A-Za-z0-9]{36})\b` |
| global-http-authorization-header | pattern | `(Bearer\|Basic)` | `\bAuthorization:\s*(Bearer\|Basic)\s+[A-Za-z0-9+/=._~-]{10,}` | `\b(Authorization:\s*(?:Bearer\|Basic)\s+[A-Za-z0-9+/=._~-]{10,})` |
| global-http-authorization-header | purview.regexes/Regex_http_authorization_header | `(Bearer\|Basic)` | `\bAuthorization:\s*(Bearer\|Basic)\s+[A-Za-z0-9+/=._~-]{10,}` | `\b(Authorization:\s*(?:Bearer\|Basic)\s+[A-Za-z0-9+/=._~-]{10,})` |
| global-mongodb-connection-string | pattern | `(\+srv)` | `mongodb(\+srv)?://[^:]+:[^@]+@[^/]+` | `(mongodb(?:\+srv)?://[^:]+:[^@]+@[^/]+)` |
| global-mongodb-connection-string | purview.regexes/Regex_mongodb_connection | `(\+srv)` | `mongodb(\+srv)?://[^:]+:[^@]+@[^/]+` | `(mongodb(?:\+srv)?://[^:]+:[^@]+@[^/]+)` |
| global-postgresql-connection-string | pattern | `(ql)` | `postgres(ql)?://[^:]+:[^@]+@[^/]+/\S+` | `(postgres(?:ql)?://[^:]+:[^@]+@[^/]+/[^\s]+)` |
| global-postgresql-connection-string | purview.regexes/Regex_postgresql_connection | `(ql)` | `postgres(ql)?://[^:]+:[^@]+@[^/]+/\S+` | `(postgres(?:ql)?://[^:]+:[^@]+@[^/]+/[^\s]+)` |
| global-stripe-key | pattern | `(sk\|pk)` | `\b(sk\|pk)_(?:live\|test)_[0-9a-zA-Z]{24,}\b` | `\b((?:sk\|pk)_(?:live\|test)_[0-9a-zA-Z]{24,})\b` |
| global-stripe-key | purview.regexes/Regex_stripe_key | `(sk\|pk)` | `\b(sk\|pk)_(?:live\|test)_[0-9a-zA-Z]{24,}\b` | `\b((?:sk\|pk)_(?:live\|test)_[0-9a-zA-Z]{24,})\b` |
| global-x509-certificate-private-key | pattern | `(RSA\s+\|EC\s+\|OPENSSH\s+\|DSA\s+\|ENCRYPTED\s+)` | `-----BEGIN\s+(RSA\s+\|EC\s+\|OPENSSH\s+\|DSA\s+\|ENCRYPTED\s+)?PRIVATE\s+KEY-----` | `(-----BEGIN\s+(?:RSA\s+\|EC\s+\|OPENSSH\s+\|DSA\s+\|ENCRYPTED\s+)?PRIVATE\s+KEY-----)` |
| global-x509-certificate-private-key | purview.regexes/Regex_x509_private_key | `(RSA\s+\|EC\s+\|OPENSSH\s+\|DSA\s+\|ENCRYPTED\s+)` | `-----BEGIN\s+(RSA\s+\|EC\s+\|OPENSSH\s+\|DSA\s+\|ENCRYPTED\s+)?PRIVATE\s+KEY-----` | `(-----BEGIN\s+(?:RSA\s+\|EC\s+\|OPENSSH\s+\|DSA\s+\|ENCRYPTED\s+)?PRIVATE\s+KEY-----)` |
| pl-regon | pattern | `(\d{5})` | `\b\d{9}(\d{5})?\b` | `\b(\d{9}(?:\d{5})?)\b` |
| pl-regon | purview.regexes/Regex_pl_regon | `(\d{5})` | `\b\d{9}(\d{5})?\b` | `\b(\d{9}(?:\d{5})?)\b` |
| ru-tax-id | pattern | `(\d{2})` | `\b\d{10}(\d{2})?\b` | `\b(\d{10}(?:\d{2})?)\b` |
| ru-tax-id | purview.regexes/Regex_ru_tax_id | `(\d{2})` | `\b\d{10}(\d{2})?\b` | `\b(\d{10}(?:\d{2})?)\b` |
| se-personnummer | pattern | `(19\|20)` | `\b(19\|20)?\d{6}[-+]?\d{4}\b` | `\b((?:19\|20)?\d{6}[-+]?\d{4})\b` |
| se-personnummer | purview.regexes/Regex_se_personnummer | `(19\|20)` | `\b(19\|20)?\d{6}[-+]?\d{4}\b` | `\b((?:19\|20)?\d{6}[-+]?\d{4})\b` |
| us-employer-id-number | pattern | `(0[1-6]\|1[0-6]\|2[0-7]\|3[0-9]\|4[0-8]\|5[0-9]\|6[0-8]\|7[1-7]\|8[1-8]\|9[0-5]\|9[89])` | `\b(0[1-6]\|1[0-6]\|2[0-7]\|3[0-9]\|4[0-8]\|5[0-9]\|6[0-8]\|7[1-7]\|8[1-8]\|9[0-5]\|9[89])-?\d{7}\b` | `\b((?:0[1-6]\|1[0-6]\|2[0-7]\|3[0-9]\|4[0-8]\|5[0-9]\|6[0-8]\|7[1-7]\|8[1-8]\|9[0-5]\|9[89])-?\d{7})\b` |
| us-employer-id-number | purview.regexes/Regex_us_ein | `(0[1-6]\|1[0-6]\|2[0-7]\|3[0-9]\|4[0-8]\|5[0-9]\|6[0-8]\|7[1-7]\|8[1-8]\|9[0-5]\|9[89])` | `\b(0[1-6]\|1[0-6]\|2[0-7]\|3[0-9]\|4[0-8]\|5[0-9]\|6[0-8]\|7[1-7]\|8[1-8]\|9[0-5]\|9[89])-?\d{7}\b` | `\b((?:0[1-6]\|1[0-6]\|2[0-7]\|3[0-9]\|4[0-8]\|5[0-9]\|6[0-8]\|7[1-7]\|8[1-8]\|9[0-5]\|9[89])-?\d{7})\b` |

## Hand-handled regexes

### `\K` (group placed after `\K`)

`\K` drops the prefix from the reported match, so the group starts there. Checked in JavaScript as `(?<=prefix)(rest)`.

- au-individual-name-record purview.regexes/Pattern_individual_name_offset1
  - before: `(?-i)\b(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+\K(?!(?i:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir\|Dear\|Hi\|Hello\|Regards\|Kind\|Thanks)\b)(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+(?:(?:Van\|Thi\|Duc\|Bin\|Binti\|Binte\|Ibn\|Abu\|Al\|El\|De\|Del\|Della\|Di\|Da\|Dos\|Du\|Le\|La\|Von\|Der\|Den\|Ter\|Ten)\s+)?(?!(?i:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir\|Dear\|Hi\|Hello\|Regards\|Kind\|Thanks)\b)(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\b(?!\s+(?i:Street\|St\|Road\|Rd\|Avenue\|Ave\|Drive\|Lane\|Court\|Place\|Parade\|Terrace\|Crescent\|Highway\|Boulevard\|Close\|Circuit\|Way\|Pty\|Ltd\|Limited\|Holdings\|Group\|Corporation\|Corp\|Company\|Inc\|Engineering\|Consulting\|Services\|Partners\|Associates\|Council\|University)\b)`
  - after: `(?-i)\b(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+\K(?!(?i:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir\|Dear\|Hi\|Hello\|Regards\|Kind\|Thanks)\b)((?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+(?:(?:Van\|Thi\|Duc\|Bin\|Binti\|Binte\|Ibn\|Abu\|Al\|El\|De\|Del\|Della\|Di\|Da\|Dos\|Du\|Le\|La\|Von\|Der\|Den\|Ter\|Ten)\s+)?(?!(?i:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir\|Dear\|Hi\|Hello\|Regards\|Kind\|Thanks)\b)(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?)\b(?!\s+(?i:Street\|St\|Road\|Rd\|Avenue\|Ave\|Drive\|Lane\|Court\|Place\|Parade\|Terrace\|Crescent\|Highway\|Boulevard\|Close\|Circuit\|Way\|Pty\|Ltd\|Limited\|Holdings\|Group\|Corporation\|Corp\|Company\|Inc\|Engineering\|Consulting\|Services\|Partners\|Associates\|Council\|University)\b)`
- au-individual-name-record purview.regexes/Pattern_individual_name_offset3
  - before: `(?-i)\b(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+\K(?!(?i:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir\|Dear\|Hi\|Hello\|Regards\|Kind\|Thanks)\b)(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+(?:(?:Van\|Thi\|Duc\|Bin\|Binti\|Binte\|Ibn\|Abu\|Al\|El\|De\|Del\|Della\|Di\|Da\|Dos\|Du\|Le\|La\|Von\|Der\|Den\|Ter\|Ten)\s+)?(?!(?i:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir\|Dear\|Hi\|Hello\|Regards\|Kind\|Thanks)\b)(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\b(?!\s+(?i:Street\|St\|Road\|Rd\|Avenue\|Ave\|Drive\|Lane\|Court\|Place\|Parade\|Terrace\|Crescent\|Highway\|Boulevard\|Close\|Circuit\|Way\|Pty\|Ltd\|Limited\|Holdings\|Group\|Corporation\|Corp\|Company\|Inc\|Engineering\|Consulting\|Services\|Partners\|Associates\|Council\|University)\b)`
  - after: `(?-i)\b(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+\K(?!(?i:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir\|Dear\|Hi\|Hello\|Regards\|Kind\|Thanks)\b)((?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?\s+(?:(?:Van\|Thi\|Duc\|Bin\|Binti\|Binte\|Ibn\|Abu\|Al\|El\|De\|Del\|Della\|Di\|Da\|Dos\|Du\|Le\|La\|Von\|Der\|Den\|Ter\|Ten)\s+)?(?!(?i:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir\|Dear\|Hi\|Hello\|Regards\|Kind\|Thanks)\b)(?:O[’'])?[A-Z][A-Za-z]{1,20}(?:-[A-Z][A-Za-z]{1,20})?)\b(?!\s+(?i:Street\|St\|Road\|Rd\|Avenue\|Ave\|Drive\|Lane\|Court\|Place\|Parade\|Terrace\|Crescent\|Highway\|Boulevard\|Close\|Circuit\|Way\|Pty\|Ltd\|Limited\|Holdings\|Group\|Corporation\|Corp\|Company\|Inc\|Engineering\|Consulting\|Services\|Partners\|Associates\|Council\|University)\b)`
- au-individual-name-record purview.regexes/Pattern_individual_name_labelled
  - before: `(?i)\b(?:full\s+legal\s+name\|legal\s+full\s+name\|full\s+name\|legal\s+name\|first\s+name\|last\s+name\|surname\|given\s+name\|family\s+name\|middle\s+name\|(?:applicant\|customer\|client\|patient\|employee\|member\|holder\|contact)\s+name\|applicant\|customer\|client\|patient\|employee\|member\|holder\|contact)\s*(?::\|-\|is)\s*(?:(?:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir)\.?\s+)?\K(?!(?:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir)\b)(?:O[’'])?[A-Z][A-Z]{1,20}(?:-[A-Z][A-Z]{1,20})?\s+(?:(?:Van\|Thi\|Duc\|Bin\|Binti\|Binte\|Ibn\|Abu\|Al\|El\|De\|Del\|Della\|Di\|Da\|Dos\|Du\|Le\|La\|Von\|Der\|Den\|Ter\|Ten)\s+)?(?:O[’'])?[A-Z][A-Z]{1,20}(?:-[A-Z][A-Z]{1,20})?\b(?!\s+(?:Street\|St\|Road\|Rd\|Avenue\|Ave\|Drive\|Lane\|Court\|Place\|Parade\|Terrace\|Crescent\|Highway\|Boulevard\|Close\|Circuit\|Way\|Pty\|Ltd\|Limited\|Holdings\|Group\|Corporation\|Corp\|Company\|Inc\|Engineering\|Consulting\|Services\|Partners\|Associates\|Council\|University)\b)`
  - after: `(?i)\b(?:full\s+legal\s+name\|legal\s+full\s+name\|full\s+name\|legal\s+name\|first\s+name\|last\s+name\|surname\|given\s+name\|family\s+name\|middle\s+name\|(?:applicant\|customer\|client\|patient\|employee\|member\|holder\|contact)\s+name\|applicant\|customer\|client\|patient\|employee\|member\|holder\|contact)\s*(?::\|-\|is)\s*(?:(?:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir)\.?\s+)?\K(?!(?:Mr\|Mrs\|Ms\|Miss\|Mx\|Dr\|Prof\|Sir)\b)((?:O[’'])?[A-Z][A-Z]{1,20}(?:-[A-Z][A-Z]{1,20})?\s+(?:(?:Van\|Thi\|Duc\|Bin\|Binti\|Binte\|Ibn\|Abu\|Al\|El\|De\|Del\|Della\|Di\|Da\|Dos\|Du\|Le\|La\|Von\|Der\|Den\|Ter\|Ten)\s+)?(?:O[’'])?[A-Z][A-Z]{1,20}(?:-[A-Z][A-Z]{1,20})?)\b(?!\s+(?:Street\|St\|Road\|Rd\|Avenue\|Ave\|Drive\|Lane\|Court\|Place\|Parade\|Terrace\|Crescent\|Highway\|Boulevard\|Close\|Circuit\|Way\|Pty\|Ltd\|Limited\|Holdings\|Group\|Corporation\|Corp\|Company\|Inc\|Engineering\|Consulting\|Services\|Partners\|Associates\|Council\|University)\b)`

### `\S` written `[^\s]`

Wrapping moves a bare top-level `\S+` / `\S{n,}` inside a group, which `purviewBanned()` rejects (the `(?:/\S*)?` live rejection). `[^\s]` is the same set in Boost and JavaScript; the Purview-banned rules are unchanged.

- global-mysql-connection-string pattern
  - before: `mysql://[^:]+:[^@]+@[^/]+/\S+`
  - after: `(mysql://[^:]+:[^@]+@[^/]+/[^\s]+)`
- global-mysql-connection-string purview.regexes/Regex_mysql_connection
  - before: `mysql://[^:]+:[^@]+@[^/]+/\S+`
  - after: `(mysql://[^:]+:[^@]+@[^/]+/[^\s]+)`
- global-postgresql-connection-string pattern
  - before: `postgres(ql)?://[^:]+:[^@]+@[^/]+/\S+`
  - after: `(postgres(?:ql)?://[^:]+:[^@]+@[^/]+/[^\s]+)`
- global-postgresql-connection-string purview.regexes/Regex_postgresql_connection
  - before: `postgres(ql)?://[^:]+:[^@]+@[^/]+/\S+`
  - after: `(postgres(?:ql)?://[^:]+:[^@]+@[^/]+/[^\s]+)`
- snaffler-domain-join-creds pattern
  - before: `(?:DomainAdminPassword\|AdminPassword)\s*=\s*\S{4,}`
  - after: `((?:DomainAdminPassword\|AdminPassword)\s*=\s*[^\s]{4,})`
- snaffler-domain-join-creds purview.regexes/Regex_snaffler_domain_admin_password
  - before: `(?:DomainAdminPassword\|AdminPassword)\s*=\s*\S{4,}`
  - after: `((?:DomainAdminPassword\|AdminPassword)\s*=\s*[^\s]{4,})`
- snaffler-shell-history-creds pattern
  - before: `export\s+[A-Za-z_]*(?:PASS\|TOKEN\|SECRET\|KEY)[A-Za-z_]*=\S{4,}`
  - after: `(export\s+[A-Za-z_]*(?:PASS\|TOKEN\|SECRET\|KEY)[A-Za-z_]*=[^\s]{4,})`
- snaffler-shell-history-creds purview.regexes/Regex_snaffler_shell_export_cred
  - before: `export\s+[A-Za-z_]*(?:PASS\|TOKEN\|SECRET\|KEY)[A-Za-z_]*=\S{4,}`
  - after: `(export\s+[A-Za-z_]*(?:PASS\|TOKEN\|SECRET\|KEY)[A-Za-z_]*=[^\s]{4,})`
- snaffler-shell-history-creds purview.regexes/Regex_snaffler_mysql_inline_pass
  - before: `mysql\s+[\s\S]{0,40}-p\S{3,}`
  - after: `(mysql\s+[\s\S]{0,40}-p[^\s]{3,})`
- snaffler-shell-history-creds purview.regexes/Regex_snaffler_sshpass_inline
  - before: `sshpass\s+-p\s+\S{3,}`
  - after: `(sshpass\s+-p\s+[^\s]{3,})`

### Backreference: `global-top500-275-key-recovery-material` `Evidence_recovery_value`

Before: `(?<!\d)(?!([0-9]{6})(?:-\1){7})(?:[0-9]{6}-){7}[0-9]{6}(?!\d)`

The negative lookahead rejects eight identical blocks through `\1`, which needs its own capturing group, so no single-group rewrite keeps matching identical. Owner decision: rearchitect. The regex is supporting evidence (presence within the proximity window), so it is replaced by six regexes `Evidence_recovery_value_pos1`..`pos6`, one per digit position: each matches a recovery value whose digit at that position is not the same in all eight blocks. Both tiers reference them as `{ type: any, min_matches: 1, refs: [pos1..pos6] }`. "Some position differs" is "not all blocks identical", so evidence presence is unchanged.

Proof: union of the six vs the original over the repo corpus (1,074 strings, 260 matches, 0 differences) and 20,000 generated eight-block values (9,712 matches, 0 differences). Known residual: with nine or more consecutive 6-digit blocks the OR can report an extra overlapping span 7 characters later, for example `123457-123456-123456-123456-123456-123456-123456-123456-123466` gives `0:55` before and `0:55,7:55` after. Presence is the same.

## Equivalence proof

Base `81ee920f72`. Every regex field is paired with its base version by file and field and run in JavaScript (global), under case-insensitive and case-sensitive flags, with leading flags, `(?-i)`, `\K` and `(?i:...)` read as the repo checkers read them. The (index, length) of every group-0 match must be identical, and every new match must have group 1 equal to group 0.

Corpus per regex: all repo test values and identifier samples joined into documents; the regex's own file's values one by one; for every old match found, the match alone, doubled, case-flipped, with neighbouring characters added and with each character deleted or replaced; 40 random strings over the regex's own literal characters plus digits, letters and separators.

| | |
|---|---:|
| Regex fields compared | 4,816 (3,066 unique pairs, 4,756 changed) |
| Repo test values / documents | 10,224 / 256 |
| Strings run | 32,659,731 |
| Old matches compared | 19,399,092 |
| Pairs with any difference | **0** |
| New matches where group 1 ≠ group 0 | **0** |
| New regexes without exactly one whole-match group | **0** |
| Exported text (testpattern `normalizePdfRegex`): pairs compared / with differences / not one whole group or over 1,024 chars | 3,006 / **0** / **0** |

JavaScript is the engine here; Boost has the same rule that capturing groups do not change what a backtracking match consumes (no backreferences or conditionals remain). The test-tenant classification A/B in the PR is the Boost-side check on a sample.

