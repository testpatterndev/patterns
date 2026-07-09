# Backlog ticket: legal-pattern tier residuals — next activity

Date raised: 2026-07-09
Origin: PR #20 (`claude/funny-wright-3a7464`, closed unmerged — its 14-file NOT-group fix
was independently superseded by backlog batch-3 on main: the T2 "exclusion lists wired as
required refs" fix at v1.2.0 plus the v1.2.1 noise-gate wiring on all 14 legal slugs).
This ticket preserves the follow-up analysis from that PR's report
(`legal-exclusion-not-group-report.md` on the closed branch), adjudicated 2026-07-09.

> **STATUS 2026-07-09: Items 1–2 RESOLVED** on branch `fix/legal-75-tier-corroboration`.
> All 22 verifier FAILs cleared (67 → 45 corpus-wide, 0 introduced), zero should_match
> regressions, gates green. Per-file design decisions recorded in each file's 1.4.0
> changelog entry. The 3 slugs with narrow 75 id_matches (cabinet-legal-briefing,
> crown-solicitor-legal-opinion, state-legal-liability-assessment) were left untouched
> (0 failures; their id_match is already the discriminator — minimal-change principle).
> Extra design calls: native-title exclusion list gained academic-publication terms
> (journal article, academic analysis); regulatory-prosecution corroborative dropped
> bare 'regulatory' + 'Work Health and Safety' (legislative-prose vocabulary);
> solicitor-general corroborative tightened per Item 2 (drops opinion/advice/
> constitutional/High Court, adds state sovereignty).

## Item 1 — weak 75 tiers on the 14 legal-document patterns (RESOLVED, was: design pass)

**Problem.** All 22 residual `verify-pattern-testcases.mjs` failures on these slugs share
one cause: each 75 tier requires only `id_match` + the primary keyword group, and those
two are near-synonyms (both match the topic phrase). Any document that merely *mentions*
the topic fires at enforcement confidence 75 — "A class action has been filed...",
"The Solicitor-General of Australia appeared before the High Court...", "The National
Native Title Tribunal maintains a register...".

**Affected slugs** (failure count at PR #20's baseline): class-action-defence-strategy (3),
judicial-review-defence-file (3), major-litigation-strategy-document (3),
native-title-negotiation-strategy (3), solicitor-general-legal-advice (3),
royal-commission-draft-submission (2), coronial-inquest-draft-submission (1),
ma-legal-due-diligence-for-gocs (1), regulatory-investigation-defence-strategy (1),
regulatory-prosecution-brief (1), settlement-authority-and-negotiation-mandate (1).
(cabinet-legal-briefing, crown-solicitor-legal-opinion, state-legal-liability-assessment
have narrow 75 id_matches and currently produce 0 failures.)

**Candidate fixes, per file (design decision each — not mechanical):**
- Require the corroborative group at 75 (mirrors the operation prose: topic term within
  proximity of privilege/strategy indicators).
- And/or extend the `Evidence_*_exclusion` NOT-group to the 75 (and 65 discovery) tier —
  the DORA convention puts noise exclusion on every tier. Note: exclusion alone does NOT
  clear all negatives (e.g. class-action neg#2 "This chapter examines class action
  procedure..." contains no exclusion term — 'textbook' is in the group but the value
  says 'chapter'); the corroborative requirement is the load-bearing change, exclusion
  extension is defense-in-depth.
- Re-check reachability for should_match values at 75 after each change (all currently
  carry corroborative vocabulary — spot-checked, not exhaustively).

**Acceptance:** verifier failures on the 14 slugs drop from 22 toward 0 with zero
should_match regressions; `npm run check` / `npm run check:quality` stay green; minor
version bumps (behavioral tightening, not a bugfix) + changelog; patterns.json untouched.

**Relationship to deferred triage class (questions.md item 4b):** this is the concrete,
per-slug version of the "~20 legal-concept new noise-gates design pass" that was parked
overnight. Fold that class into this ticket when picked up.

## Item 2 — solicitor-general-legal-advice 85 tier under-specified (RESOLVED, see status above)

After the wrapper fix the 85 tier is: title regex (`Solicitor[- ]General`) + primary
(same phrase) + corroborative + NOT-group. The corroborative group contains the generic
word 'advice', so an academic description of the role ("...is to provide independent
legal advice to the Attorney-General") satisfies the full tier (neg#2 fires at 85; it
also fails at 75, so the count is unchanged — but the tier is the thinnest of the 14).

**Fix direction:** add a positive requirement that only a real advice document carries —
a document-marker regex (PROTECTED/Legal-Privilege header combos, per the operation
prose: "Document marker detection: 'PROTECTED' + 'Legal-Privilege' + 'Solicitor-General'
in header/footer") and/or tighten the corroborative group (drop bare 'advice'/'opinion',
keep the multi-word privilege phrases). cf. crown-solicitor's `CS-\d{4}-\d{4}` reference
number as the model for what makes its 85 tier trustworthy.

Fold into Item 1's pass over solicitor-general.

## Item 3 — structural check on differently-nested template-exclusion refs (RESOLVED 2026-07-09)

PR #20's report flagged ~45 non-legal files carrying `- ref: Evidence_template_exclusion`
(plus `Evidence_source_code_exclusion`, `Evidence_non_health_exclusion`,
`Evidence_serial_code_exclusion`) at deeper nesting than the 14 fixed legal files, and
asked whether any were the same lost-wrapper class.

**Result: NO residual bugs.** A YAML-parsing audit (not indentation-eyeballing) walked
every pattern in `data/patterns` and classified all 1,058 `Evidence_*_exclusion`
references catalog-wide by their resolved parent-node semantics:

| Context | Count | Verdict |
|---|---|---|
| NOT-group `refs:` list (`min_matches: 0, max_matches: 0`) | 1,010 | correct |
| NOT-group `children:` list | 39 | correct |
| explicit `excludes:` key on a `pattern_tiers` tier | 9 | correct |
| positive tier ref (the bug class) | **0** | — |

The 14 legal files fixed on main (batch-3 T2) were the only instances of the class.
Audit script: session scratchpad `audit-exclusion-refs.mjs` (walks `purview` recursively;
classifies object-form `ref:`, string-form `refs:` members, and `excludes:` entries by
nearest governing ancestor).

## Suggested order

Item 1 as its own branch/PR (behavioral change, biggest review surface), Item 2 folded
into Item 1's pass over solicitor-general. Item 3 needed no action.
