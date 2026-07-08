# Backlog: Corpus-Wide Dead Noise-Gate Adjudication — Report

Ticket: `dead-noise-gate-pass`. Date: 2026-07-09. Branch: `worktree-wf_ebe163c6-16b-2`.
Methodology: per-file dictionary-collision adjudication established in
`.superpowers/sdd/codex-fix-d4-report.md` (Finding 1), extended corpus-wide.

## 1. Census (script-scan of all 1655 pattern files)

A scanner mirroring the harness semantics (`scripts/verify-pattern-testcases.mjs`:
an id participates in detection only when a tier's `id_match`/`matches`/`excludes`/
`exclusion` references it; `compile.js` only *materializes* `shared_keywords` into
`purview.keywords`) found the dead-declaration problem to be an order of magnitude
larger than the ~200-file estimate:

**2078 declared-but-unreferenced `shared_keywords` entries across 1159 files**, plus
**3 locally-defined `strength: noise` keyword groups referenced by no tier**:

| dict | dead declarations | role when wired elsewhere |
|---|---|---|
| template-exclusion | 242 | NOT gate in every one of the 1341 wired files (never positive) |
| data-record-context | 910 | positive AND-evidence (24 wired files) |
| generic-data-labels | 888 | positive AND-evidence (36 wired files) |
| en-government-classification | 30 | never wired anywhere in the corpus |
| ai-context-markers | 7 | positive evidence (4 wired files) |
| ai-disclosure-elicitation | 1 | never wired via purview (used via `corroborative_evidence.keyword_lists`) |

Dead local noise groups (all named `Keyword_*_domain_context`, terms are the pattern's
own topic vocabulary mislabeled `strength: noise`): `global-top500-214-proprietary-training-datasets`,
`global-top500-224-pre-release-test-result-datasets`, `global-top500-325-laboratory-test-results`.

The batch-2 phone report's "dozens of dead imports" (eu-iban/global-iban precedent:
remove, patch bump, no behavior change) is the same shape as the positive-dict rows.

## 2. Classification

Per the D4 methodology, wiring is only on the table for the noise dict
(template-exclusion — the corpus wires it exclusively as a NOT gate). The five
positive-evidence dicts must not be NOT-gated (their terms — "reference number",
"spreadsheet", "OFFICIAL" — are corroborating vocabulary; a NOT gate would suppress
genuine hits), and wiring them as *positive* evidence would change each pattern's
gating design far beyond this ticket — they are dead imports, removed per the
eu-iban precedent.

template-exclusion (242), adjudicated per file by word-level collision scan of all 13
dictionary terms against (a) every `should_match` value, (b) every `strength: specific`
/ `strength: domain` keyword term, (c) tier regex sources:

| class | count | action |
|---|---|---|
| WIRE-SAFE (0 collisions, wireable tiers) | 178 | wired into tier NOT-groups (minor bump) |
| UNSAFE-REMOVE (collisions with own positives) | 58 | declaration removed (patch bump) |
| NOT-WIREABLE (legacy tier shape: `id_match: ''`, no `matches` lists, id-less `group:`/`values:` keywords) | 6 | declaration removed (patch bump) |
| ALREADY-INTENTIONAL (prose documents deliberate non-use) | 0 | — (the eu-ai-act-conformity-declaration precedent files were already fixed in the D4 pass and no other file documents deliberate non-use) |

The 6 legacy files: commission-of-inquiry-legal-submission, coronial-finding-published,
court-filing-reference, lpp-claim-assessment, patent-prosecution-strategy-pre-filing,
sanctions-compliance-legal-assessment.

The 58 UNSAFE files are dominated by `*-physical-addresses` (collision: dict term
matches address/vocabulary terms) and document classifiers whose intrinsic vocabulary
contains `documentation`/`template`/`sample` (au-scada-ics-documentation,
au-technical-design-document, cybercrime-technical-evidence-package, …).

Local noise groups (3): terms collide massively with the patterns' own primary
vocabulary (e.g. `training`, `datasets`, `test`, `results`) — wiring would suppress
every genuine hit → removed (patch; behavior-neutral since unreferenced).

**Prose debt: none found.** A scan of description/operation/confidence_justification/
false_positives across all 1159 files found zero claims that the dead shared gate
exists (the conformity-declaration case fixed in D4 was unique). The single prose
mention of a dead dict (`ai-system-prompt-disclosure` → ai-disclosure-elicitation)
refers to the `corroborative_evidence.keyword_lists` channel, which remains intact
and is unaffected by removing the dead purview import.

## 3. Application (full — no remainder)

All 1159 files were edited in one pass (no top-50 fallback needed). Wiring follows
the corpus's dominant wired-sibling convention (verified by scanning all 1341 wired
files: NOT node last in `matches`, alias alone in a fresh NOT node; alias listed
first when a local `Filter_*` NOT-group already exists — the D4/DORA style; bare
tiers without a `matches` list stay bare, matching the 29 wired files that leave
such tiers ungated):

- **178 files wired**: 404 tiers gained the gate (251 tiers got a new NOT node /
  filled an empty `refs:` stub — `au-deposit-account-reference` carried four dangling
  `refs:` stubs exactly where the gate belongs; 153 tiers had the alias prepended to
  an existing NOT-group). 81 bare tiers left ungated by convention. Minor version
  bump + changelog each.
- **981 files removal-only**: 58 + 6 template-exclusion declarations, 1836
  positive-dict dead imports, 3 dead local noise groups. Patch bump + changelog each.
  (Files needing both, e.g. br-cnpj, got a single combined minor bump.)

Every edited file was machine-validated: the post-edit YAML parse must deep-equal the
independently computed in-memory transform of the original parse (formatting-preserving
text surgery + structural proof). 1159/1159 passed.

## 4. Verification

- `node scripts/verify-pattern-testcases.mjs --all` before vs after: **identical
  results — 86 failures / 77 warnings both sides, zero line-level flips** (all 86
  pre-existing, none in touched behavior). No should_match regressions; wire-safety
  is also structural: a NOT-group can only veto a should_match value if a dict term
  occurs in the value itself, which the collision scan excludes.
- **Suppression is real (empirical probes against HEAD vs new):**
  - br-cnpj full-evidence probe: document with valid CNPJ + context keyword fires the
    85 tier in both versions; the same document + "sample invoice template for
    training data" **fired at 85 before wiring and is suppressed after** — exactly
    the flip the ticket requires, demonstrated at tier level.
  - 10-file wired sample (harness `tierWouldFire` semantics): clean should_match
    behavior identical old vs new in 10/10; noisy variant suppressed in all files
    where enforcement tiers fire on the value as a whole document
    (active-investigation-target-package's local filter already caught the probe
    terms — the shared gate adds the remaining dict vocabulary).
- **Compiled output sample (10 wired files)**: after `npm run compile`, patterns.json
  carries the materialized dict under the alias (13/13 terms, `shared: true`) AND the
  alias inside a `max_matches: 0` NOT-group in every sampled file — 10/10.
- **Residual census**: re-running the scanner post-apply reports **0**
  declared-but-unreferenced shared dicts and **0** dead local noise groups in 1655 files.
- Gates: `npm run check` **0 errors** (57 pre-existing warnings, unchanged);
  `npm run check:quality` **PASSED**; `npm run compile` OK (1655 patterns);
  patterns.json reverted before staging per convention.

## 5. Out-of-scope findings (follow-up tickets)

1. **`strength: noise` groups referenced as POSITIVE tier evidence (20 files)** — the
   85 tier *requires* noise terms to be present (e.g.
   `ma-legal-due-diligence-for-gocs` requires `Evidence_..._exclusion` — 'announced',
   'annual report' — as AND evidence). Almost certainly miswired NOT-gates. Files:
   au-top500-247-infrastructure-as-code-templates, au-unique-student-identifier,
   au-water-quality-data-reference, cabinet-legal-briefing,
   class-action-defence-strategy, coronial-inquest-draft-submission,
   crown-solicitor-legal-opinion, global-lab-test-terms,
   global-top500-247-infrastructure-as-code-templates,
   global-top500-291-malware-sample-repositories, judicial-review-defence-file,
   ma-legal-due-diligence-for-gocs, major-litigation-strategy-document,
   native-title-negotiation-strategy, regulatory-investigation-defence-strategy,
   regulatory-prosecution-brief, royal-commission-draft-submission,
   settlement-authority-and-negotiation-mandate, solicitor-general-legal-advice,
   state-legal-liability-assessment.
2. **6 legacy-shape files** (empty `id_match`, id-less keywords) predate the tier
   schema and are unevaluable by the harness — candidates for modernization.
3. **en-government-classification** is wired nowhere in the corpus (30 dead imports
   removed here) — decide whether the dict should be retired or deliberately wired
   into the marking/classification family.
4. `verify-pattern-testcases.mjs --all` carries 86 pre-existing failures unrelated to
   this sweep.
