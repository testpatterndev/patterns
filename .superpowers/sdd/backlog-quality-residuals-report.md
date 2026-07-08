# Backlog ticket: quality-tool-residuals — report

Date: 2026-07-08
Branch: worktree branch off `main` (isolated worktree)
Scope: `scripts/verify-catalog-quality.mjs` residual blind spots (Part A) + 3 parked ungated
weakMedium adjudications (Part B).

## Part A — tool residual blind spots

### What was investigated

Task 10 taught the tool shared_keywords resolution and removed id-substring classification. The
ledger flagged two residuals:

1. **Regex-ref awareness** — a tier's positive `matches[]` refs can point at supporting element
   regexes declared in `purview.regexes` (e.g. `Pattern_*_label_context` corroboration regexes),
   not only at keywords. The tool resolved refs exclusively through `keywordById`, so a regex ref
   was silently dropped (`.filter(Boolean)`): a tier evidenced only by a corroborating regex read
   as `noEvidence`, and a tier combining a regex ref with generic keywords read as `genericOnly`.
2. **Alternative-tier awareness** — verify that `duplicateLevelsIdentical` no longer flags
   distinct-evidence same-level alternatives (Task 10's evidence-signature rework).

Catalog survey (one-off scripts, run before changing anything):

- **761 tiers** carry at least one positive regex ref — in 760 of them it sits alongside keyword
  evidence, so the blind spot was masked.
- **Exactly 1 tier** catalog-wide has regex-only positive evidence
  (`au-deposit-account-reference.yaml`, 65-tier) and it is already `discovery_only: true`, so no
  category verdict depended on the bug.
- **0 tiers** have unresolvable positive refs; **0 tiers** have optional (`min_matches: 0`,
  `max_matches` ≠ 0) evidence nodes that could be over-credited.
- An impact simulation (before/after judgment per tier) showed **zero verdict changes on the
  current catalog** — the blind spot is real but currently latent.

### What was fixed

`scripts/verify-catalog-quality.mjs`:

- Builds a per-pattern `regexIds` set from `purview.regexes`; positive refs now resolve to
  `keywordById.get(ref) ?? (regexIds.has(ref) ? 'regex' : undefined)`.
- The new `'regex'` strength counts as evidence (clears `noEvidence`), breaks `genericOnly`
  (it is neither generic nor structural), satisfies `hasSpecificOrDomain` (a deliberately-authored
  supporting regex is structural-or-better evidence), and counts toward `hasStrongConceptHigh`.
- Header comment documents the semantics and the accepted residuals (below).

### Empirical verification (synthetic fixtures, old vs new tool)

Fixture catalog: identical-evidence duplicate pair with permuted ref order; distinct-evidence
alternative pair; tiers evidenced only by a supporting regex ref (85) and regex ref + generic
keywords (75); tiers with an unresolvable ref / empty matches.

| Category | old tool | new tool | verdict |
|---|---|---|---|
| duplicateLevelsIdentical (permuted-ref duplicates) | 1 | 1 | correct both — normalization holds |
| duplicateLevelsAlternative (distinct evidence) | 1 | 1 | correct both — alternatives are NOT flagged identical (**verified**, ledger item 2) |
| weakHigh | 2 | 1 | old tool wrongly flagged the regex-ref-evidenced 85 tier |
| weakMedium | 4 | 2 | old tool wrongly flagged both regex-ref-evidenced tiers |
| unresolvable-ref tiers | flagged | flagged | still treated as evidence-less (correct) |

### Re-baseline — every count change explained

| Category | before | after | explanation |
|---|---|---|---|
| nonCanonical | 7 | 7 | unchanged |
| duplicateLevelsIdentical | 0 | 0 | unchanged (gate category) |
| duplicateLevelsAlternative | 352 | 351 | −1: global-top500-262 previously had two distinct-evidence 75-tiers (ungated phrase tier + gated shadow-hash tier); the Part B demotion leaves a single 75-tier, so the file's 75-level alternative entry disappears. Its demoted tier is the only 65-tier, so no new 65-level entry appears. |
| recommendedDrift | 0 | 0 | unchanged (85 still exported by global-top500-262) |
| weakHigh | 29 | 29 | unchanged — all 29 are in the documented marking-SIT exclusion set; the regex-ref fix changed no verdicts on the real catalog (all regex-ref tiers ≥75 also carry keyword evidence) |
| weakMedium | 39 | 38 | −1: global-top500-262's ungated 75 phrase tier demoted to 65 discovery_only (Part B). The 2 snaffler-unattend-password findings remain by design (adjudicated, exclusion set). No change from the regex-ref fix (latent). |
| conceptHigh | 0 | 0 | unchanged |
| discoveryMissing | 77 | 77 | unchanged — the demoted 262 tier is `discovery_only: true`, so it does not enter this category |
| shortAcronyms | 3 | 3 | unchanged (all 3 in exclusion set) |
| **Total** | **507** | **505** | −2 = duplicateLevelsAlternative −1, weakMedium −1, both from the Part B pattern change |

Gate (`npm run check:quality`, fail-on shortAcronyms/nonCanonical/duplicateLevelsIdentical/weakHigh):
**PASSED — 0 issues outside the exclusion set** (now 20 files; see Part B).

### Remaining blind spots (documented, deliberately not fixed)

1. **Tautological supporting regexes.** The tool cannot distinguish a substantive supporting regex
   from one that restates the tier's own `id_match` (e.g. `Pattern_*_label_context` regexes that
   are the same phrase as the primary). Crediting them is an over-credit in principle, but
   detecting equivalence-modulo-flags between regexes is not cheap or reliable, and today every
   ≥75 tier with such a ref also carries keyword evidence. Accepted; noted in the script header.
2. **Label-embedded-in-regex evidence (D1 convention).** Tiers whose evidence lives inside the
   `id_match` regex itself (label-attached identifier regexes: `nz-nzbn.yaml`,
   `uk-companies-house-number.yaml`, `uk-sort-code-account.yaml` — all created after Plan-1, all
   documented in their own descriptions as "label-embedded-in-regex counts as label gating per the
   D1 decision record") still read as evidence-less/generic-only weakMedium. A literal-token
   heuristic on the regex text would also silence genuinely weak bare-phrase markers (exactly the
   global-top500-262 case adjudicated below), so it would trade a false positive for a worse false
   negative. Left informational; weakMedium is not a gated category.

## Part B — the 3 parked ungated weakMedium adjudications

### 1. global-top500-262-password-hash-databases — FIXED (v1.2.0 → v1.3.0)

Finding: the bare `(?i)\bpassword\s+hash\s+databases\b` phrase tier sat at confidence 75 gated
only by the template-exclusion NOT-group.

Design intent (its own `confidence_justification`): "Low confidence marker: phrase-based artifact
detection … **Requires corroborative evidence** and later hardening." An ungated bare topic phrase
therefore contradicts the pattern's own design.

Why not keyword-gate the 75-tier instead: any gate drawn from the corroborative keyword set
("password", "hash", "credential", the `credentials` dictionary) is **tautological** — the matched
phrase itself contains "password" and "hash", so a proximity keyword gate on those terms is
auto-satisfied by every match and adds zero precision.

Fix applied, matching the established sibling convention (global-top500-261 v1.1.0 remediation:
"Downgraded weak medium-confidence tier to low because evidence was generic, structural, or
absent"): the ungated phrase tier is demoted to **65 `discovery_only: true`**. The two
evidence-gated 85 phrase tiers and the gated 75/85 shadow-hash-line tiers are unchanged;
`recommended_confidence: 85` still resolves to exported tiers. Version bumped to 1.3.0 with
changelog entry; compile verified the exported ladder is now 85/85/65(discovery)/75/85.

### 2–3. snaffler-unattend-password (two 75-tiers) — STAYS WEAK, added to exclusion set

Findings: the 75-tiers for `Regex_unattend_admin_password` and `Regex_unattend_autologon_password`
are gated only by the template-exclusion NOT-group.

Adjudication — the structural regex is the evidence, per the pattern's design intent:

- The `id_match` regexes require the exact XML nesting
  `<AdministratorPassword>…<Value>x</Value>` / `<AutoLogon>…<Value>x</Value>` (Snaffler rule
  `KeepUnattendXmlRegexRed`). The pattern's own `confidence_justification`: "the XML element
  structure … is highly specific to Windows unattend answer files. False positives … are extremely
  rare." This is the same regex-is-the-evidence architecture as the 17 protective-marking SITs
  already in the exclusion set, whose header documents that a structural regex gated only by the
  template-exclusion NOT-group is deliberate design, not missing evidence.
- The only real keyword evidence available (`Keyword_unattend_context`: unattend, UserAccounts,
  PlainText, cpassword, …) already defines the 85-tiers. Gating the 75-tiers on it would make them
  duplicates of the 85-tiers; gating on the declared-but-unused `Evidence_data_record_context`
  (structural strength) would leave them genericOnly-weak anyway and adds nothing for XML answer
  files. Credential-bearing unattend fragments are routinely pasted or exfiltrated without the
  surrounding file context, so any keyword gate loses recall without reducing an already
  vanishingly-small false-positive surface.

Outcome: no pattern change (no version bump needed). `snaffler-unattend-password.yaml` added to
the tool's `EXCLUDED_FILES` (19 → 20 files) with a full rationale block in the script header. The
file has no findings in any gated category, so the gate outcome is unaffected; its two weakMedium
entries remain visible in the informational report, now documented.

## Gates

- `npm run check`: **0 errors** (57 pre-existing warnings)
- `npm run check:quality`: **PASSED** — 0 issues in gated categories outside the 20-file exclusion set
- `npm run compile`: succeeds — 1655 patterns, 20 collections, 131 keyword dictionaries
- `patterns.json` restored via `git checkout -- patterns.json` before staging (repo convention)

## Files changed

- `scripts/verify-catalog-quality.mjs` — regex-ref evidence resolution; snaffler-unattend-password
  exclusion entry + rationale; header comments for new semantics and accepted residuals
- `data/patterns/global-top500-262-password-hash-databases.yaml` — 75 → 65 discovery_only
  demotion, v1.3.0, changelog
- `.superpowers/sdd/backlog-quality-residuals-report.md` — this report
