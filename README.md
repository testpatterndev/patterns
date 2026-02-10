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
  patterns/     1,407 detection pattern YAML files
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
purview:                       # Optional: full Microsoft SIT definition
  patterns_proximity: 300
  recommended_confidence: 85
  pattern_tiers:
    - confidence_level: 85
      id_match: Regex_1
      matches:
        - ref: Keyword_1
    - confidence_level: 65
      id_match: Regex_1
  regexes:
    - id: Regex_1
      pattern: '\b\d{3}\s?\d{3}\s?\d{3}\b'
      validators: [Validator_1]
  keywords:
    - id: Keyword_1
      groups:
        - match_style: word
          terms: [tax file number, tfn]
  validators:
    - id: Validator_1
      type: Checksum
      weights: '1 4 3 7 5 8 6 9 10'
      mod: 11
      check_digit: last
created: '2026-02-08'
updated: '2026-02-08'
author: testpattern-community
license: MIT
```

The `purview` block is optional. When present, the website uses it for full Purview XML export with multiple confidence tiers, checksum validators, filters, and nested AND/OR/NOT match trees. When absent, the simple export path generates basic XML from the top-level `pattern` and `corroborative_evidence` fields.

## Export formats

Patterns export to:

- **Microsoft Purview XML** — RulePack format importable via `New-DlpSensitiveInformationTypeRulePackage`
- **Purview Deployment Script** — PowerShell that creates keyword dictionaries + imports the SIT
- **GCP DLP JSON** — InspectTemplate format for Google Cloud DLP
- **AWS Macie JSON** — Custom data identifier format for Amazon Macie
- **Raw YAML** — Full pattern definition
- **Regex** — Copy-to-clipboard regex pattern

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

## Generating patterns

### From a description (AI-assisted)

Use the prompt in `prompts/generate-pattern.md` as context for any AI assistant (Claude, ChatGPT, etc.), then describe the pattern you need:

> "Generate a pattern for Australian Medicare numbers"

The AI will output a complete `testpattern/v1` YAML file ready to save in `data/patterns/`.

### From sample data (local script)

Analyze a CSV or text file to auto-detect sensitive data patterns:

```bash
node scripts/generate-from-sample.js sample.csv
node scripts/generate-from-sample.js sample.csv --output-dir ./drafts
node scripts/generate-from-sample.js sample.csv --verbose
```

The script detects emails, credit cards, IBANs, IP addresses, UUIDs, AWS keys, SSNs, phone numbers, dates, URLs, and unknown structured formats. Output is draft YAML that you review and refine before committing.

### From sample data (AI-assisted)

Use the prompt in `prompts/generate-from-sample.md` as context for any AI assistant, then paste your sample data. The AI will analyze the data, identify all sensitive types, and generate complete pattern YAML files.

## License

MIT. See [LICENSE](LICENSE).

## Sponsored by

[Compl8](https://aairii.com) — TestPattern is a community project, not a Compl8 product.
