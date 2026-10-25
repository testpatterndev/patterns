# IDCF cross-walk (`sensitivity_labels.idcf`, `sensitivity_labels.idcf_marker`)

Reviewed: 2026-10-20

The Industry Data Classification Framework (IDCF) is the Australian Department of Home
Affairs' voluntary classification scheme for industry (developed with CSIRO Data61, CC BY 4.0):
<https://www.homeaffairs.gov.au/cyber-security-subsite/idcf/Documents/industry-data-classification-framework.pdf>.
Section and table numbers below are from that PDF.

Every pattern carries an IDCF Data Security Level (`idcf`) and, where the IDCF defines a direct
equivalent, one IDCF integrated marker (`idcf_marker`). Both are **derived from the pattern's
existing Queensland labels** by the rules on this page. The derivation is code
(`scripts/lib/classification.mjs`, `idcfForLabels`) and CI fails a pattern whose stored value
disagrees with it, the same discipline as `classification.tier` following `qgiscf_dlm`. The
justification for a pattern's IDCF value is therefore this cross-walk plus the pattern's own
`classification.rationale`; there is no separate per-pattern IDCF prose.

## What the IDCF is, in the terms this catalogue uses

- The IDCF has four modules: Introduction, Risk Assessment, Data Security Levels (DSL) and
  Markers (§2.1.3). The DSL module is the compulsory core; markers are optional (§5.1).
- A DSL states the **level of protection the data requires** (physical, cyber, authorised
  person), not the harm or national-security value of the data (§4.5.1: "DSLs focus only on the
  level of protective security controls needed"). Six levels: DSL-0, DSL-1, DSL-2, DSL-3, DSL-4,
  DSL-5+ (§4.3, Table 9). Exactly one DSL is applied to data; the data owner chooses it from
  inherent risk and risk appetite (§4.4). The IDCF's own examples assume a moderate risk
  appetite; organisations with a lower appetite may classify higher (§4.4).
- Markers are a secondary classification that follow the DSL, several may apply, and a data
  recipient may disregard them unless agreed (§5.1.2). Formatting: `DSL-3, Personal Privacy`
  (§5.2.5). Integrated markers have no prefix; adopted TLP markers use `TLP:`; user-defined
  markers use an organisation prefix (§5.2.6).
- The IDCF does not prescribe how a DSL or marker is captured in metadata (§2.3.2), so the
  Purview label shape used here is a catalogue choice.

## Level cross-walk

The IDCF itself anchors two levels to the PSPF (§4.5.1 and Table 16): systems suitable for
PSPF `OFFICIAL: Sensitive` meet DSL-3, systems suitable for `PROTECTED` meet DSL-4. The
Queensland scheme (QGISCF) is the PSPF with Queensland DLMs, so the catalogue's
`qgiscf_dlm` family maps directly.

| `qgiscf_dlm` family (`qgiscf` fallback) | `idcf` | IDCF anchor |
|---|---|---|
| `PUBLIC` | `DSL-0` | Catalogue decision (2026-10-20): PUBLIC is DSL-0. §4.7.1 lists published and publicly available material as DSL-0 data and says DSL-0 "may be appropriate for data suitable for public release". The IDCF's separate `Public` dissemination marker is not modelled. No pattern carries PUBLIC today; the PUBLIC label deploys without classifiers. |
| `OFFICIAL`, `Marking Official` | `DSL-2` | §4.7.3: DSL-2 is the everyday level "for data that is not sensitive, confidential, or which has low business impact"; Table 12 examples are regular business correspondence, general expense receipts, draft reports, internal policy. That is the OFFICIAL band. |
| `SENSITIVE *`, `Marking Sensitive` | `DSL-3` | §4.5.1 (OFFICIAL: Sensitive ↔ DSL-3). §4.7.4 / Table 13 examples: personal and sensitive information under the Privacy Act 1988, confidential IP and trade secrets, sensitive financial and market-sensitive information, personnel files, small-team deliberations. |
| `PROTECTED *`, `Marking Protected` | `DSL-4` | §4.5.1 (PROTECTED ↔ DSL-4). §4.7.5 / Table 14 examples: nationally important data, highly confidential IP, sensitive information with serious impact, sensitive personnel files. |
| `N/A`, `Marking PSPF` | `N/A` | The detector finds a marking rather than a fixed sensitivity; downstream controls read the marking found. Same convention as `pspf: N/A`. |

Patterns with no `qgiscf_dlm` use `qgiscf` (`OFFICIAL` → DSL-2, `SENSITIVE` → DSL-3,
`PROTECTED` → DSL-4, `N/A` → N/A); with neither, `pspf` (`OFFICIAL` → DSL-2,
`OFFICIAL: Sensitive` → DSL-3, `PROTECTED` → DSL-4, `N/A` → N/A). A pattern with none of
the three has no `idcf`.

### Levels never assigned by the catalogue

- **DSL-0** is the PUBLIC label (see the table above). No detector identifies content as
  public, and the absence of a DSL label never means DSL-0 (§4.6), so it is a deployment-time
  label with no auto-labelling classifiers, exactly like the Queensland PUBLIC label.
- **DSL-1** is for encrypted copies without their key, hard-copy originals and small
  quantities of low-sensitivity data, with physical controls only (§4.7.2). It is a
  container/copy decision, not a content classification.
- **DSL-5+** is "as agreed between parties" with no prescribed protections (§4.7.6, Table 15).
  Table 16 says data owners use it for data that would be `SECRET` or `TOP SECRET` if held by
  government, while stating it "is not an equivalent or industry version" of those
  classifications. The catalogue has no SECRET band (`qgiscf` tops out at PROTECTED), so no
  pattern derives DSL-5+; a data owner elects it.

Edge case, decided deliberately: `au-marking-secret-topsecret` carries `qgiscf_dlm: Marking
Protected`, so it derives **DSL-4**, the highest level the IDCF prescribes controls for. The
catalogue already collapses SECRET/TOP SECRET markings to PROTECTED, and the IDCF value follows
the catalogue label rather than re-deriving from the slug.

## Marker cross-walk

Only IDCF integrated markers with a direct equivalent in the Queensland DLM are assigned
(§5.2.2, Table 18 "nature of risk" markers). Everything else is left to the deploying
organisation.

| `qgiscf_dlm` suffix | `idcf_marker` | Why |
|---|---|---|
| `Personal-Privacy` | `Personal Privacy` | Table 18: data that is or may become "personal information (including sensitive information)" under the Privacy Act 1988. Same meaning. |
| `Legal` | `Legal Privilege` | Table 18: data covered by legal professional privilege. The Queensland `Legal` DLM covers privileged legal material. |
| `Commercial-in-Confidence` | `Confidential` | Table 18: data assessed as confidential "particularly where obligations to maintain confidence arise in contract and equity". |
| `Financial` | none | The only IDCF finance marker, `Finance Only` (Table 19), is a dissemination restriction to the finance team, not a nature-of-risk marker for financial data. |
| `InfoTech`, `Government`, `Law-Enforcement`, `Cabinet-in-Confidence`, `Electoral Roll` | none | No IDCF integrated marker covers these; they are government concepts the IDCF (an industry framework) does not define. |
| bare `OFFICIAL`, `SENSITIVE`, `PROTECTED`, `Marking *`, `N/A` | none | No domain suffix to map. |

`Intellectual Property`, `Cultural` and `Embargo` (Table 18) and the dissemination markers
`Public`, `Internal`, `Finance Only`, `Executive Only`, `Board Only` (Table 19) and the adopted
TLP markers (§5.2.3) are deployment-time choices; the catalogue does not infer them.

## Field shape

```yaml
sensitivity_labels:
  pspf: 'OFFICIAL: Sensitive'
  qgiscf: SENSITIVE
  qgiscf_dlm: SENSITIVE Personal-Privacy
  idcf: DSL-3                       # DSL-0 | DSL-2 | DSL-3 | DSL-4 | N/A  (derived, CI-checked)
  idcf_marker: Personal Privacy     # Personal Privacy | Legal Privilege | Confidential; omitted otherwise
```

Both keys are flat strings so every consumer that reads `sensitivity_labels` as a
scheme → label map (testpattern.dev, the SIT-Reference workbook) can show them unchanged.
The IDCF presentation form is `<idcf>, <idcf_marker>` (§5.2.5), for example `DSL-3, Personal Privacy`.

## Caveat carried into every consumer

The IDCF value is the catalogue's candidate under the IDCF's moderate-risk-appetite examples.
The data owner's risk appetite decides the DSL (§4.4), and the default IDCF rules let a data
recipient reclassify upward but never downward without the owner (§4.8.1). Deployments should
treat `idcf` as the starting label, not a determination.
