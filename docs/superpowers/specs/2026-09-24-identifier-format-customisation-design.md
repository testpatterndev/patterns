# Identifier-format customisation (customisation v2) — Design

**Extends:** `2026-07-25-customisation-placeholders-design.md` (v1: `dictionary-subset`, `keyword-set`, `value`). v1 banned `{{CUSTOMISE:*}}` tokens inside regex bodies and listed regex customisation as a v2 item. This document is that v2 item.

**Goal:** Many classifiers depend on identifiers whose format is organisation-specific or unpublished — case and file numbers, student numbers, offender numbers, tenancy references, court and tribunal file numbers. The catalogue must (1) detect these as accurately as the public evidence allows, (2) never invent a format, (3) say exactly which classifiers depend on which identifier, and (4) document each identifier and how a customer replaces it — with that documentation enforced by CI, not left to vigilance.

## 1. Identifier registry (`data/identifiers/<key>.yaml`, schema `testpattern/identifier-v1`)

One file per identifier type. Every field is mandatory; `scripts/lib/identifiers.mjs#validateIdentifier` errors on anything missing.

| Field | Purpose |
|---|---|
| `key`, `name`, `issuer` | Identity; the file name must equal `<key>.yaml`. |
| `description` (≥ 40 chars) | What the identifier identifies. |
| `appears_in`, `labels` | Where it appears and the label text it is printed under. |
| `public_format.status` | `verified` \| `partial` \| `unpublished` \| `customer-defined`. `verified`/`partial` require `pattern` **and** a `source` URL. |
| `public_format.notes` | What is and is not known about the format. |
| `fallback.pattern` | The public regex used when no customer format is supplied. Must compile and pass the Purview-banned checks. |
| `fallback.precision`, `fallback.rationale` | Honest precision (`low`/`medium`/`high`) and why the fallback is as accurate as the evidence allows. |
| `fallback.samples` | Fictional values the fallback matches (checked). |
| `replacement.customer_supplies` | What the customer provides at engagement. |
| `replacement.steps` | How the identifier is replaced, step by step. |
| `replacement.validation` | Checks a customer overlay must pass. |
| `replacement.example_overlay` | A fictional overlay regex with ≥ 3 samples (checked to match and Purview-safe). |
| `sensitivity` | Why the identifier matters. |

**Accuracy rule.** A fallback may encode a format only when `public_format.status` is `verified` or `partial` with a cited source. Otherwise the fallback anchors on the identifier's documented **labels** (e.g. `IOMS number: <value>`) with a deliberately loose value shape. Invented formats (the previous `DVO-YYYY-NNNNN`, `QPS-EX-YYYY-…`, `WHS-PROS-…`, `TSD-…`, `MAG-/DC-/SC-…`, `CCO-/PB-…`, `EV-NNNN`, `QLD-YYYY-NNNN`, `SARAS-YYYY-…` references) are not allowed.

## 2. Classifier slots (`customisation` kind `identifier-format`)

```yaml
customisation:
  - key: qcs-ioms-number
    kind: identifier-format
    identifier: qcs-ioms-number              # data/identifiers/qcs-ioms-number.yaml
    target: purview.regexes/<regex-id>       # the regex this slot upgrades
    mode: extend                             # extend = add the customer regex as an alternative; replace = swap it
    affects_tiers: [75, 85]                  # must equal the tiers that positively reference the target
    required_for_enforcement: false
    note: >-                                 # >= 40 chars; links to docs/identifiers.md#<key>
      ...
```

Validation (`scripts/lib/identifiers.mjs#validateIdentifierFormatEntry`, run by `ci-check`):

- `identifier` exists in the registry and its definition is complete.
- `target` is an existing `purview.regexes/<id>` used positively by at least one tier; `affects_tiers` equals exactly those tiers (NOT-groups excluded).
- No `fallback` field: the in-file target regex **is** the public fallback.
- For `unpublished` / `customer-defined` identifiers in `replace` mode on an enforce tier with `required_for_enforcement: false`, the in-file regex must equal the registry's documented `fallback.pattern` — so an enforce tier can never run on an undocumented or invented format.
- Slots are patterns-only (not keyword dictionaries).
- The interim `identifier_dependencies` metadata key is rejected.

Modes in practice:

- **extend** — record-structure regexes (the generic labelled-field evidence introduced with the 75-tier gating work). The customer's identifier becomes an extra alternative; the fallback keeps working.
- **replace** — dedicated reference regexes (exhibit numbers, warrant references, court file numbers). The documented labelled fallback ships publicly; the overlay swaps in the real format.

## 3. Generated documentation

`npm run build-identifier-docs` renders `docs/identifiers.md` from the registry plus the slot usage (which classifiers reference each identifier). `ci-check` recomputes it and **fails if the committed file differs**, so any change to an identifier or a slot must ship with updated documentation. Unreferenced identifiers are warnings.

## 4. Compile output

`scripts/compile.js` adds `identifierTypes` (the registry, keyed by identifier) to `patterns.json`. Slots flow through verbatim in each pattern's `customisation` block, so deployment tooling has the definition, fallback, replacement steps and validation checks in one artifact.

## 5. Deployment contract (private tooling)

Overlay entries are keyed by identifier, not by pattern, so one engagement answer applies to every slot that references it:

```jsonc
"identifierFormats": {
  "qcs-ioms-number": { "pattern": "…", "samples": ["…", "…", "…"], "labels": ["IOMS number"] }
}
```

The builder must: run the identifier's `replacement.validation` checks (samples match; Purview-banned clean; no placeholder matches; overlay values never logged), apply `extend`/`replace` to every referencing slot, re-run each affected classifier's test cases with the overlay applied, and refuse to enable a tier listed in `affects_tiers` for a slot with `required_for_enforcement: true` unless an overlay or explicit waiver exists.

## 6. First conversions (this change)

- 20 identifier definitions, all `unpublished` or `customer-defined` except `qld-eq-id` (`partial`, single-school source).
- 25 new Queensland government classifiers: interim `identifier_dependencies` → `extend` slots on their record-structure regex.
- 5 classifiers whose 85 tier required an invented reference format (community corrections, forensic chain of custody, regulatory prosecution brief, surveillance operation plan, court filing reference): the invented regex is replaced by the documented labelled fallback and declared as a `replace` slot; test values converted to labelled references; each gains a complete record that reaches 85. The forensic 85 tier now needs any one labelled reference (exhibit / evidence bag / seal or indictment) instead of three.

## 7. Non-goals

- Inline `{{CUSTOMISE:*}}` tokens inside regex bodies (whole-regex slots avoid the escaping problem).
- Implementing the private deployment overlay (tracked in Compl8DLPDeploy).
- Site UI for customisation (the compiled metadata supports it later).
