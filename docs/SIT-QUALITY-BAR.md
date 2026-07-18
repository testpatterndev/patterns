# SIT quality bar (adversarial / operational)

Authoritative expectations for pattern YAML in this repo. CI may enforce a subset; reviewers enforce the rest.

## Matching discipline

1. **No bare-value enforce for PII/PHI identifiers.**  
   If the primary is a number/alphanumeric shape (`\d{…}`, short serials, account-like tokens), every **enforce** tier (≥75, not `discovery_only`) MUST require at least one **positive** corroboration:
   - a domain keyword group, **or**
   - a label embedded in the primary regex (`medicaid id …`, `student id …`, `NPI …`), **or**
   - a high-entropy credential prefix that is itself the secret (`npm_`, `AKIA…`, PEM markers, DB URL with password).

2. **Discovery-only is allowed for bare shapes** at 65 (or lower recommended confidence), so inventory can still surface candidates.

3. **Concept SITs must not enforce on topic phrases alone.**  
   Enforce tiers need a **record/structure** primary (IDs + fields, metric lines, flow edges) **or** independent evidence beyond the same primary phrase list.  
   Pure `*_label` topic phrases are discovery-only.

4. **Same-span self-corroboration is forbidden at enforce.**  
   Do not list the same multi-word phrase as both primary and the only evidence for 75/85.

5. **Secrets with distinctive structure** (npm tokens, connection URLs, PEM keys) may enforce on structure alone; still use template/noise exclusion.

## Metadata consistency

| Field | Must agree with |
|-------|-----------------|
| `name` | What the detector actually matches (not a legacy product nickname) |
| `slug` | Stable ID; may lag rename — document in description if so |
| `description` / `operation` | Primary shapes, tier gates, what is discovery-only |
| `risk_rating` + `risk_description` | Current match behaviour (not a previous weaker detector) |
| `sensitivity_labels` (pspf, qgiscf, qgiscf_dlm, us_gov, uk_gov, nz_gov, ca_gov) | Same elevation as risk (e.g. risk ≥8 ⇒ not plain OFFICIAL) |
| `data_categories` | Semantic class (not default `pii` for business/IP; not `credentials` for findings/maps) |
| `confidence` | Honesty about FP rate (digit shapes without checksum ⇒ not `high`) |
| `recommended_confidence` | Align with lowest intended **enforce** tier |

## Classification cross-walk (minimum)

- risk 1–4 → typically OFFICIAL / low DLM  
- risk 5–7 → OFFICIAL or OFFICIAL:Sensitive depending on substance  
- risk 8–9 → OFFICIAL:Sensitive / SENSITIVE (+ domain DLM)  
- risk 10 → PROTECTED / equivalent when justified  

Workbook (v25+) and YAML must not diverge by more than one band without a changelog note.

## Change checklist

- [ ] Enforce tiers meet corroboration rule  
- [ ] Name/description/risk/labels/categories updated together  
- [ ] Tests: positives at intended tier; corporate/policy decoys fail enforce  
- [ ] `node scripts/ci-check.mjs` + `verify-pattern-testcases.mjs <slug>` green  
