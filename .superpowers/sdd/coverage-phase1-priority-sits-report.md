# Coverage Phase 1 — Priority Identifier SITs (2026-07-09)

## Scope
Implement mature, Purview-safe identifier SITs from the multi-region coverage backlog, with full metadata for Compl8 pack workbooks (v18 / sector forks).

## Delivered (15 new SITs)

| Slug | Region | Purpose |
|------|--------|---------|
| uk-vat-number | UK | HMRC VAT (GB/XI) |
| ca-business-number | CA | CRA BN + program accounts |
| in-ifsc | IN | Bank branch IFSC |
| in-upi-vpa | IN | UPI virtual payment address |
| in-uan | IN | EPFO Universal Account Number |
| sg-uen | SG | Unique Entity Number |
| cn-uscc | CN | Unified Social Credit Code |
| mx-clabe | MX | 18-digit SPEI CLABE |
| id-npwp | ID | Taxpayer ID (15/16) |
| br-cnh | BR | Driver licence number |
| sa-iqama | SA | Expatriate residence number |
| ph-sss | PH | SSS dashed format |
| ph-philhealth | PH | PhilHealth PIN dashed format |
| global-ndc | US/global | National Drug Code |
| vn-citizen-id | VN | 12-digit CCCD |

Collection: `data/collections/coverage-phase1-priority-identifiers.yaml`

## Hardening (4 existing)
- ca-social-insurance-number — specific SIN/NAS keywords (was identifier/number/ID)
- in-aadhaar — Aadhaar/UIDAI/आधार keywords
- sg-nric — NRIC/FIN keywords
- in-pan — PAN/income-tax keywords

## Quality bar applied
- Purview-safe regex (no nested multi-match groups, no unbounded `.` quantifiers, no `^/$`, ≤1 capturing group)
- Full `purview` tiers 85/75/65 + template-exclusion NOT-group
- Specific corroborative keywords (not generic identifier/number/ID)
- Spreadsheet fields: `risk_rating`, `risk_description`, `sensitivity_labels` (pspf, qgiscf, qgiscf_dlm, us/uk/nz/ca), `pattern_class`, `data_categories`, `regulations`, `frameworks`
- ≥3 should_match / ≥2 should_not_match, false_positives documented

## Remaining backlog (not in this PR)
- UK CHI / NI Health & Care Number
- CA provincial health cards (OHIP, etc.) as distinct SITs
- IN UAN is done; still missing deeper payroll rails if needed
- SG FIN (covered by sg-nric F/G/M — document only)
- BR PIX keys (multi-format)
- AE country IBAN (covered by global-iban)
- PE/NG/KE national IDs
- global-cpt-hcpcs, global-loinc
- Finance/Health **pack workbooks** (Compl8) — separate from SIT authoring

## Next: audit
After merge, run v18 ↔ patterns drift audit and draft Health/Finance workbook forks using these SITs + existing catalog.
