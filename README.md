# TestPattern — DLP Detection Patterns

The open registry of DLP (Data Loss Prevention) detection patterns. Regex, keyword lists, and classification rules for detecting sensitive data including PII, PHI, financial records, government identifiers, and credentials.

**What Sigma is to SIEM, TestPattern is to DLP.**

Browse patterns at [testpattern.dev](https://testpattern.dev).

## Quick start

Fetch the pre-compiled `patterns.json` for direct consumption:

```bash
curl -sL https://raw.githubusercontent.com/testpatterndev/patterns/main/patterns.json -o patterns.json
```

Or clone and compile from YAML sources:

```bash
git clone https://github.com/testpatterndev/patterns.git
cd patterns
npm install
npm run compile
```

## Repository structure

```
data/
  patterns/     1,059 detection pattern YAML files
  collections/  14 curated pattern bundles
  keywords/     105 keyword dictionary YAMLs
  reference/    Large consolidated reference lists (JSON)
scripts/
  compile.js    YAML → patterns.json compiler
patterns.json   Pre-compiled output (checked in for direct consumption)
```

## Pattern schema

Every pattern follows the `testpattern/v1` schema:

```yaml
schema: testpattern/v1
name: Australian Tax File Number
slug: au-tax-file-number
version: 1.0.0
type: regex                    # regex | keyword_list | keyword_dictionary | fingerprint
engine: boost_regex            # boost_regex | pcre2 | ecma | python_re | universal
description: >-
  Human-readable description of what this pattern detects.
operation: >-
  Technical details: validation algorithm, regex approach, corroborative evidence config.
pattern: \b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b
confidence: high               # high | medium | low
confidence_justification: ...
jurisdictions:
  - au
regulations:
  - privacy-act-1988
data_categories:
  - pii
  - financial
  - government-id
corroborative_evidence:
  keywords:
    - tax file number
    - TFN
  proximity: 300
  keyword_lists:
    - au-identity-tfn
test_cases:
  should_match:
    - value: 123 456 789
      description: Standard spaced format
  should_not_match:
    - value: 12 345 678
      description: Only 8 digits
false_positives:
  - description: Generic nine-digit numbers
    mitigation: Require corroborative evidence keywords.
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: narrow                  # wide | narrow | specific
created: '2026-02-08'
updated: '2026-02-08'
author: testpattern-community
license: MIT
```

## Export formats

Patterns export to:

- **Microsoft Purview** — XML RulePack format importable via `New-DlpSensitiveInformationTypeRulePackage`
- **Raw YAML** — Full pattern definition
- **Regex** — Copy-to-clipboard regex pattern

GCP DLP and AWS Macie formats are planned.

## Data categories

Patterns cover these sensitive data categories:

| Category | Description |
|---|---|
| `pii` | Personally identifiable information |
| `phi` | Protected health information |
| `financial` | Financial records, account numbers |
| `government-id` | Government-issued identifiers |
| `credentials` | API keys, tokens, secrets |
| `security` | Security-sensitive information |
| `location` | Geographic and address data |
| `business-id` | Business identifiers |
| `healthcare` | General healthcare information |
| `government` | Government records |
| `network` | Network identifiers |
| `device-id` | Device identifiers |

## Jurisdictions

Patterns are tagged by jurisdiction: `au`, `us`, `uk`, `eu`, `global`, and country-specific codes (`es`, `fr`, `de`, `br`, `ca`, `in`, `jp`, `kr`, `sg`, `za`, etc.).

## Contributing

We welcome contributions. To add or improve a pattern:

1. Fork this repository
2. Create or edit a YAML file in `data/patterns/`
3. Ensure your pattern meets quality requirements:
   - At least 3 `should_match` and 2 `should_not_match` test cases
   - False positive documentation with mitigation strategies
   - At least one regulation and jurisdiction tag
   - Confidence level with justification
4. Run `npm run compile` to verify
5. Open a pull request

See the [contributing guide](https://testpattern.dev/contributing) for full details.

## License

MIT. See [LICENSE](LICENSE).

## Sponsored by

[Compl8](https://compl8.com) — TestPattern is a community project, not a Compl8 product.
