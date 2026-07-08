# Backlog: concept-plural-hygiene — plural pass + test hygiene report

Ticket: Concept plural-forms pass + test hygiene (t2/t3 wave follow-ups).
Scope: the 9 `eu-dora-*` / `eu-nis2-*` / `eu-ai-act-*` concept patterns.
Date: 2026-07-08. Branch: `feat/coverage-waves-d4` (isolated worktree).

## Method

- Before/after node probes ran every file's top-level pattern against all of its own
  `should_match` / `should_not_match` cases plus custom FP probes (generic prose, near-miss
  suffix words, cross-language tokens). Baseline and after runs were diffed by eye; the only
  behaviour deltas are the ones documented below.
- Purview keyword semantics checked in `scripts/compile.js`: keyword terms are passed through
  verbatim (`match_style: word` → exact whole-word/phrase match, no stemming). Purview word
  match does NOT cover plurals automatically — the corpus already lists explicit plural terms
  where needed (e.g. `essential entity` / `essential entities` in eu-nis2-cybersecurity-risk-
  measures). Therefore every regex pluralisation is mirrored with an explicit plural term in
  the corresponding `Evidence_*_primary` keyword group (otherwise plural documents would match
  the tier regex but fail primary keyword evidence and drop to discovery-only).

## Per-file results

### eu-dora-major-incident-report (1.0.0 → 1.1.0)

Pluralised:
- `major ICT-related incident` → `incidents?` — DORA Art 19's own title is "reporting of
  major ICT-related incidents"; aggregate reports (Art 11(10) costs/losses) use the plural.
- `significant cyber threat` → `threats?` — Art 19 title: "…significant cyber threats".
- Primary keyword group + top-level `corroborative_evidence.keywords`: added
  `major ICT-related incidents`, `significant cyber threats`.

Node-probe evidence (no new FPs):
- `two major ICT-related incidentss` / `a major ICT-related incidental note` → no-match
  (word boundary holds; `incidental` not captured).
- `significant cyber threatscape analysis` → no-match.
- Generic probes ("major incidents from Q2", "significant number of incidents") → no-match
  before and after.
- All 4 should_match still match; should_not_match[0]/[2] unchanged (filter-dependent).

Test hygiene: `should_not_match[1]` (consultancy webinar) previously contained no primary
phrase (probe: TOP=no-match — it tested nothing). Reworded to "Consultancy webinar: reporting
a major ICT-related incident under DORA…". After: TOP=MATCH with noise terms `webinar`,
`newsletter` present (both in `Filter_eu_dora_major_incident_report_exclusion`, gated
min 0/max 0 at every tier) — the negative now genuinely exercises the noise gate.

### eu-dora-register-of-information (1.0.0 → 1.1.0)

Pluralised:
- `ICT third-party service provider` → `providers?` — Art 28(3) itself reads "…provided by
  ICT third-party service providers"; the file's own should_match[1] uses the plural and
  previously only matched via its other phrase.
- `contractual arrangement reference number` → `numbers?` — register extracts list ranges
  ("reference numbers CAR-2026-0201 to CAR-2026-0219").
- Primary keyword group + top-level `corroborative_evidence.keywords`: added both plurals.

Skipped:
- `register of information` → `registers?` — the plural rendering ("registers of information")
  is characteristic of ESA/regulator aggregate commentary and consultancy prose (enumerated FP
  classes); the in-scope Art 28(3) document is the entity's own singular register.

Node-probe evidence (no new FPs):
- `third-party service providers` without the ICT prefix → no-match.
- `ICT third-party service providership scheme` → no-match.
- `customer reference numbers` / `register of informational brochures` → no-match.
- Template-code structural regex `B_(?:0[1-7]|99)\.0[1-3]` untouched (no plural concept).
- All should_match/should_not_match behaviour otherwise identical to baseline.

### eu-nis2-incident-notification (1.0.0 → 1.1.0)

Pluralised:
- `significant incident` → `incidents?` — Art 23 obliges notification of significant
  incidents (plural in the directive's own reporting prose; recurring-incident filings
  plausibly use the plural).
- Primary keyword group: added `significant incidents` (term absent from the top-level
  corroborative list, so no change there).

Node-probe evidence:
- `significant incidence of phishing` / `significant incidentally` → no-match.
- `several significant incidents of vandalism` → now matches. This is NOT a new FP class:
  the file's own `false_positives[0]` already documents that "'significant incident' remains
  a genuine collision at the 75 and 65 tiers" for generic incident-management prose; the
  plural is the same collision class, and the 85 tier still requires NIS2 vocabulary
  (CSIRT, Directive (EU) 2022/2555, severe operational disruption).
- Structural regex `\bCSIRTs?\b` already plural-aware — untouched.

### eu-nis2-cybersecurity-risk-measures (1.0.0 → 1.1.0)

Pluralised: nothing — the Art 21 term of art `cybersecurity risk-management measures` is
already plural; there is no singular document rendering to add ("cybersecurity risk-management
measure" is not the defined term and would loosen the anchor).

Test hygiene: `should_not_match[1]` (vendor webinar) previously contained no primary phrase
(probe: TOP=no-match). Reworded to "Recorded webinar now available: implementing the
cybersecurity risk-management measures of NIS2 Article 21…". After: TOP=MATCH with noise
terms `webinar` (own Filter list) and `sample` (shared template-exclusion dict, verified
present) — genuinely exercises the noise gate at every tier.

### eu-dora-ict-risk-framework (unchanged, 1.0.0)

Skipped:
- `ICT risk management framework` → `frameworks?` — the plural rendering appears almost
  exclusively in regulator guidance and consultancy comparison prose ("entities' ICT risk
  management frameworks"), which are this pattern's enumerated FP classes; the in-scope
  Art 6 document describes the entity's own singular framework.
- `digital operational resilience strategy` → `strategies?` — same reasoning (Art 6(8) is a
  single strategy per entity; plural = commentary).

### eu-ai-act-conformity-declaration (unchanged, 1.0.0)

Skipped:
- `EU declaration of conformity` → `declarations?` — plural phrasing is the design signal for
  commentary: the file's own should_not_match[1] ("must draw up declarations of conformity…")
  is a deliberate plural-phrasing negative. Pluralising would flip a designed negative.
- Context alternation `AI system` → `AI systems?` — probe-verified new FP path: "Our AI
  systems roadmap is unrelated; separately the pump EU declaration of conformity was filed in
  2019." is no-match today and WOULD couple with `systems?` (incidental plural mention of AI
  systems within the 400-char window of a non-AI declaration). Skipped on that evidence.

### eu-ai-act-fria (unchanged, 1.0.0)

Skipped:
- `fundamental rights impact assessment` → `assessments?` — the plural rendering is
  characteristic of academic/policy survey literature (an enumerated FP class, incl. the
  Dutch FRAIA corpus); an actual Article 27 FRIA is a singular self-referential document.
- Structural acronym `\bFRIA\b` → `FRIAs?` — probe-verified new token collision: the regex is
  case-insensitive and `FRIAs?` matches Portuguese/Spanish "frias" ("bebidas frias" → MATCH).
  The existing singular already borders "fria"; widening it buys nothing (the primary keyword
  `FRIA` is case-sensitive and the tier still requires the defined term).

### eu-ai-act-gpai-model-documentation (unchanged, 1.0.0)

Skipped:
- `general-purpose AI model` → `models?` — probe-verified regression: the file's own
  should_not_match[0] news negative ("Obligations for general-purpose AI models entered into
  application…") is no-match today and WOULD match with `models?`. The confidence
  justification itself notes the plural saturates news/commentary; Annex XI documentation is
  per-model singular.
- `public summary of training content` / `summary about the content used for training` /
  `technical documentation of the (GPAI) model` — fixed Article 53 phrases; no plausible
  plural document rendering.

### eu-ai-act-technical-documentation (unchanged, 1.0.0)

Skipped:
- `technical documentation of (a|the) high-risk AI system` → `systems?` — probe-verified new
  FP path: "The technical documentation of the high-risk AI systems SentinelHire and
  TriageAssist is stored in the vault." (a mere reference, not the document class) is
  no-match today and WOULD match. Article 11 itself uses the singular ("of a high-risk AI
  system"); plural renderings are category commentary.
- `general description of the AI system` / `post-market monitoring plan` / `Annex IV technical
  documentation` — fixed Annex IV headings, singular in the document class itself.

## Keyword evidence note

Purview `match_style: word` performs exact whole-word matching with no plural stemming
(compiler passes terms through verbatim; corpus precedent lists explicit plural terms).
Keyword changes were therefore made ONLY in the three files whose regex gained a plural, and
only to the primary evidence groups (plus the mirroring top-level corroborative lists where
the primary terms were already listed there). No corroborative-only vocabulary was pluralised.

## Gates

- `npm run check` — 0 errors (warnings are the documented filter-dependent negatives).
- `npm run check:quality` — PASSED.
- `npm run compile` — succeeds; `patterns.json` reverted before staging per repo convention.
