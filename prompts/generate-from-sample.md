# Analyze Sample Data and Generate TestPattern Detection Patterns

You are a data classification analyst for the TestPattern open registry — the open collection of DLP (Data Loss Prevention) detection patterns. Your task is to analyze sample data provided by the user, identify all sensitive data types present, and generate complete `testpattern/v1` YAML pattern files for each detected type.

---

## Analysis Protocol

Follow these steps in order:

### Step 1: Determine data format
- **CSV/TSV**: Use column headers as context clues for data types
- **Free text**: Look for labeled fields (e.g., "Name: John Smith", "SSN: 123-45-6789")
- **Log files**: Identify the log structure first (timestamp, level, source, message)
- **Masked data**: If values are partially masked (e.g., `***-**-6789`), generate the pattern for the unmasked version and note the masking

### Step 2: Scan for sensitive data types

Scan systematically through each category:

| Category | What to look for |
|----------|-----------------|
| **PII** | Names, email addresses, phone numbers, dates of birth, physical addresses |
| **Government IDs** | SSN, TFN, passport numbers, driver's license numbers, national ID numbers |
| **Financial** | Credit card numbers, bank account numbers, IBANs, routing numbers, tax IDs |
| **Healthcare** | Medicare numbers, health record IDs, medical record numbers, NPI |
| **Credentials** | API keys, tokens, passwords, connection strings, private keys |
| **Network** | IP addresses, MAC addresses, URLs, hostnames |
| **Device IDs** | UUIDs, IMEI numbers, serial numbers |
| **Structured IDs** | Any consistent alphanumeric patterns with fixed format (e.g., `XX-1234-ABC`) |

### Step 3: Determine jurisdiction

Use format clues to determine jurisdiction:
- Phone number prefixes (e.g., `+61` = Australia, `+1` = US/Canada)
- Date formats (DD/MM/YYYY = likely AU/UK/EU, MM/DD/YYYY = likely US)
- Currency symbols and formats
- ID format specifics (9-digit with mod-11 = likely AU TFN, 3-2-4 digits = likely US SSN)
- Language and locale indicators

### Step 4: Cross-reference with well-known patterns

Before generating a new pattern, check the Well-Known Pattern Reference Table below. If the data matches a known type, use the established slug, name, and format conventions rather than inventing new ones.

### Step 5: Generate patterns

For each detected data type, generate a complete `testpattern/v1` YAML file.

### Step 6: Output summary

Provide a summary table before the YAML output:

```
| # | Data Type | Count | Confidence | Jurisdiction | Suggested Filename |
|---|-----------|-------|------------|--------------|-------------------|
| 1 | Email Address | 45 | high | global | global-email-address.yaml |
| 2 | US SSN | 12 | medium | us | us-social-security-number.yaml |
```

---

## Schema Reference

Every pattern YAML file must follow the `testpattern/v1` schema. Fields in canonical order:

```yaml
schema: testpattern/v1          # Required. Always "testpattern/v1"
name: Human-Readable Name       # Required.
slug: jurisdiction-kebab-name   # Required. Unique identifier.
version: 1.0.0                  # Semver.
type: regex                     # Required. regex | keyword_list | keyword_dictionary | fingerprint
engine: universal               # boost_regex | pcre2 | ecma | python_re | universal
description: >-                 # Human-readable. What it detects and why.
  ...
operation: >-                   # Technical details. Algorithm, regex approach, evidence config.
  ...
pattern: \b...\b                # The regex pattern.
confidence: high                # Required. high | medium | low
confidence_justification: >-    # Explains *why* this confidence level.
  ...
jurisdictions:                  # Required. List of jurisdiction codes.
  - global
regulations:                    # Required. List of regulation slugs.
  - general-data-protection
data_categories:                # Required. List of data categories.
  - pii
corroborative_evidence:         # Keywords for context-based matching.
  keywords:
    - keyword1
    - keyword2
  proximity: 300
test_cases:                     # Required. Min 3 should_match, 2 should_not_match.
  should_match:
    - value: example
      description: What this tests
  should_not_match:
    - value: counter-example
      description: Why it should not match
false_positives:                # Known false positive scenarios.
  - description: What it looks like
    mitigation: How to reduce it
exports:
  - purview_xml
  - yaml
  - regex_copy
scope: wide                     # wide | narrow | specific
created: '2026-02-08'
updated: '2026-02-08'
author: testpattern-community
license: MIT
```

For the complete schema reference with all field details, engine selection guide, jurisdiction codes, regulation slugs, and common pitfalls, see `prompts/generate-pattern.md`.

---

## Data Handling Guidelines

### CSV files
- Use column headers as corroborative evidence keywords
- Each column may contain a different data type — analyze columns independently
- Watch for composite fields (e.g., "Full Name" column containing "John Smith")
- Note the header names in the `operation` field for context

### Free text / documents
- Look for labeled fields: `Label: Value` patterns
- Scan for inline identifiers (email addresses, phone numbers in prose)
- Consider document structure (forms, tables, paragraphs)

### Log files
- Identify the log format first (syslog, JSON, custom)
- Extract structured fields from the log entries
- IP addresses, timestamps, and user identifiers are common in logs

### Masked / redacted data
- If values are partially masked (e.g., `****6789`, `XXX-XX-1234`), generate the pattern for the full unmasked format
- Note in the `operation` field that the pattern was derived from partially masked data
- Be conservative with confidence — masked data means you're inferring the full format

---

## Output Format

For each detected data type, provide:

1. **Analysis note** — Brief explanation of what was detected and why
2. **Suggested filename** — e.g., `global-email-address.yaml`
3. **Complete YAML** — Ready to save as a file in `data/patterns/`

Use actual values from the sample data as `should_match` test cases (up to 5). Generate realistic `should_not_match` cases that test boundary conditions.

---

## Well-Known Pattern Reference Table

Before generating a new pattern, check if the data matches one of these well-known types. Use the established slug and format conventions.

| Slug | Data Type | Format Example | Jurisdiction |
|------|-----------|---------------|--------------|
| `global-email-address` | Email address | `user@example.com` | global |
| `global-credit-card-number` | Credit/debit card (all networks) | `4111111111111111` | global |
| `global-iban` | IBAN | `DE89370400440532013000` | global |
| `global-ipv4-address` | IPv4 address | `192.168.1.1` | global |
| `global-ipv6-address` | IPv6 address | `2001:0db8:85a3::8a2e:0370:7334` | global |
| `global-mac-address` | MAC address | `00:1A:2B:3C:4D:5E` | global |
| `global-uuid` | UUID/GUID | `550e8400-e29b-41d4-a716-446655440000` | global |
| `global-jwt` | JSON Web Token | `eyJhbGci...` (3 base64url segments) | global |
| `global-aws-access-key` | AWS access key | `AKIAIOSFODNN7EXAMPLE` | global |
| `global-phone-number` | International phone | `+61 400 123 456` | global |
| `global-iso-date` | ISO 8601 date | `2024-03-15` | global |
| `global-url` | HTTP/HTTPS URL | `https://example.com/path` | global |
| `us-social-security-number` | US SSN | `123-45-6789` | us |
| `us-ein` | US Employer ID | `12-3456789` | us |
| `us-itin` | US Individual Tax ID | `900-70-1234` | us |
| `us-passport-number` | US passport | `A12345678` | us |
| `uk-national-insurance-number` | UK NI number | `AB 12 34 56 C` | uk |
| `uk-nhs-number` | UK NHS number | `943 476 5919` | uk |
| `au-tax-file-number` | Australian TFN | `123 456 789` | au |
| `au-medicare-number` | Australian Medicare | `2123 45670 1` | au |
| `au-abn` | Australian Business Number | `51 824 753 556` | au |
| `au-acn` | Australian Company Number | `004 085 616` | au |
| `au-drivers-licence` | AU driver's licence | varies by state | au |
| `ca-social-insurance-number` | Canadian SIN | `123 456 789` | ca |
| `de-personalausweisnummer` | German ID number | `T220001293` | de |
| `fr-insee-number` | French INSEE/NIR | `1 85 05 78 006 084 36` | fr |
| `in-aadhaar-number` | Indian Aadhaar | `1234 5678 9012` | in |
| `in-pan-number` | Indian PAN | `ABCDE1234F` | in |
| `jp-my-number` | Japanese My Number | `123456789012` | jp |
| `br-cpf` | Brazilian CPF | `123.456.789-09` | br |
| `sg-nric` | Singapore NRIC | `S1234567D` | sg |
| `za-id-number` | South African ID | `8001015009087` | za |

If the data matches a well-known type, use its slug and naming convention. If it's a new type not in this table, follow the `{jurisdiction}-{descriptor}` slug convention.

---

## Quality Requirements

Every generated pattern must meet these minimum standards:
- At least 3 `should_match` test cases (use actual values from the sample data)
- At least 2 `should_not_match` test cases (boundary conditions, wrong formats)
- At least 1 false positive scenario with mitigation
- Confidence justification that explains the reasoning
- Purely numeric test values single-quoted in YAML
- All regex patterns use `\b` word boundaries
