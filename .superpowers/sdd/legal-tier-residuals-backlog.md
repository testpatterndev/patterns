# Backlog ticket: legal-pattern tier residuals — next activity

Date raised: 2026-07-09
Raised by: the lost NOT-group wrapper fix (`b4882dcb52`, PR #20,
`.superpowers/sdd/legal-exclusion-not-group-report.md`). This file is the ticket for the
follow-up work identified there; nothing below has been started.

## Item 1 — weak 75 tiers on the 14 legal-document patterns

**Problem.** All 22 residual `verify-pattern-testcases.mjs` failures on these slugs share
one cause: each 75 tier requires only `id_match` + the primary keyword group, and those
two are near-synonyms (both match the topic phrase). Any document that merely *mentions*
the topic fires at enforcement confidence 75 — "A class action has been filed...",
"The Solicitor-General of Australia appeared before the High Court...", "The National
Native Title Tribunal maintains a register...".

**Affected slugs** (failure count at baseline): class-action-defence-strategy (3),
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
  the DORA convention puts noise exclusion on every tier. Note from the wrapper fix:
  exclusion alone does NOT clear all negatives (e.g. class-action neg#2 "This chapter
  examines class action procedure..." contains no exclusion term — 'textbook' is in the
  group but the value says 'chapter'); the corroborative requirement is the load-bearing
  change, exclusion extension is defense-in-depth.
- Re-check reachability for should_match values at 75 after each change (all currently
  carry corroborative vocabulary — spot-checked, not exhaustively).

**Acceptance:** verifier failures on the 14 slugs drop from 22 toward 0 with zero
should_match regressions; `npm run check` / `npm run check:quality` stay green; minor
version bumps (behavioral tightening, not a bugfix) + changelog; patterns.json untouched.

## Item 2 — solicitor-general-legal-advice 85 tier under-specified

After the wrapper fix the 85 tier is: title regex (`Solicitor[- ]General`) + primary
(same phrase) + corroborative + NOT-group. The corroborative group contains the generic
word 'advice', so an academic description of the role ("...is to provide independent
legal advice to the Attorney-General") satisfies the full tier (neg#2 fires at 85 today;
it also fails at 75, so the count is unchanged — but the tier is the thinnest of the 14).

**Fix direction:** add a positive requirement that only a real advice document carries —
a document-marker regex (PROTECTED/Legal-Privilege header combos, per the operation
prose: "Document marker detection: 'PROTECTED' + 'Legal-Privilege' + 'Solicitor-General'
in header/footer") and/or tighten the corroborative group (drop bare 'advice'/'opinion',
keep the multi-word privilege phrases). cf. crown-solicitor's `CS-\d{4}-\d{4}` reference
number as the model for what makes its 85 tier trustworthy.

## Item 3 — structural check on differently-nested template-exclusion refs

~45 non-legal files carry `- ref: Evidence_template_exclusion` (plus
`Evidence_source_code_exclusion`, `Evidence_non_health_exclusion`,
`Evidence_serial_code_exclusion`) at deeper indentation than the 14 fixed files —
i.e. inside some nested node, not as a top-level tier match. Grep anchor:

    rg -n "ref: Evidence_\w*_exclusion" data/patterns

Files include: ai-prompt-injection-goal-hijack, au-afsl-number,
au-ai-training-data-reference, au-biometric-data-reference, au-birth-date-indicator,
au-cellular-subscriber-id, au-centrelink-crn, au-childrens-data-reference,
au-citizenship-certificate, au-disp-defence-industry, au-dva-file-number,
au-employment-hr-sensitive-data, au-foi-exemption-references (x2), au-hpi-individual,
au-indigenous-data-reference, au-individual-healthcare-identifier (x2),
au-medicare-provider-number, au-motor-vehicle-permit, au-national-metering-identifier,
au-ndis-number, au-number-plates (x2), au-pbs-prescriber-number,
au-property-title-reference, all au-qld-* form/record patterns,
au-security-clearance-reference, au-superannuation-fund-number,
au-unique-student-identifier, au-water-quality-data-reference.

**Task:** for each occurrence, resolve the parent node. If the parent is a NOT-group
(`min_matches: 0, max_matches: 0`) using `children: [{ref: ...}]`, it is correct — the
harness supports child-ref members (`groupMatchedCount` in verify-pattern-testcases.mjs).
If the parent is a positive any-group or the ref is effectively a positive requirement,
it is the same lost-wrapper class as the legal 14 and needs the identical fix. A one-off
script that parses each YAML and prints (file, tier level, parent-node min/max, member
shape) would settle all ~45 in one pass; eyeballing indentation is how the legal 14
were missed.

**Acceptance:** every `Evidence_*_exclusion` ref catalog-wide is confirmed to sit under
NOT-group semantics, or fixed + version-bumped where it does not; findings appended to
this ticket's eventual report.

## Suggested order

Item 3 first (cheap, purely diagnostic, may enlarge Item 1's scope if more wrapper bugs
surface), then Item 1 as its own branch/PR (behavioral change, biggest review surface),
Item 2 folded into Item 1's pass over solicitor-general.
