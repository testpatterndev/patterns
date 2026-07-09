# Questions for Nathan — overnight backlog run (2026-07-08 → 09)

Parked here per your instruction; none of these block the loop. Newest at top of each section.

## Needs your decision

1. **Targeted classification run** — ~100 new patterns since the March baseline are staged for
   validation but the harness needs you at the keyboard for the `Connect-IPPSSession` popup.
   When you're back: `cd C:\claudecode\testpattern; .\test-classification.ps1 -StartBatch 1 -EndBatch 30 -OutputDir ".\test-output\classification-targeted-2026-07-04"`
   (that's the staged 2026-07-04 run; D3/D4 additions would need batch regeneration first — say the
   word and I'll prep an updated batch set.)

2. **Secret Scanning + push protection are now ENABLED repo-wide** (I turned them on via API to
   unblock D2; the bypass API handles synthetic-value pushes per-push). Leaving them on is my
   recommendation (it's what makes the bypass API available). Flag if you'd rather they're off.

3. **Concept-strategy plan (C1–C4)** — if the ticket backlog completes before you're back, do you
   want me to start it? It's the queued plan (verdict-model redesign ~950 concept patterns; spans
   patterns repo + site repo + harness). I will NOT start it without a yes — it's a plan, not a
   ticket. (C2's pilot also needs a tenant window eventually.)

4. **Two triage classes deliberately deferred overnight** (from the tier-aware harness's 86-finding
   triage): (a) ~36 self-corroborating top500 concept tiers — that's concept-strategy C1/C2
   territory, fixing them piecemeal would conflict with the verdict-model redesign; (b) adding
   brand-new publication-context noise gates to ~20 legal-concept patterns — a design pass, not a
   mechanical fix. Both stay parked unless you say otherwise. (The mechanical subsets — broken test
   values, actual wiring bugs — ARE being fixed in batch 3.)

## FYI / will report when answered by the work itself

- j2 engine harmonization: I'm fixing the 3 D4 files now; the task will also produce a corpus-wide
  census of other `universal`-engine letter-prefixed identifiers — if the census is big, the wider
  pass becomes a question here.
- Codex high reviews run after each merged set; any finding requiring product judgment (rather than
  a mechanical fix) gets added here.

## Status at morning (2026-07-09 ~10:45)

**The ticket backlog is COMPLETE, including all codex-review findings.** Landed overnight/this
morning: patterns PRs #16, #17, #18, #19, #21 + site PR #7. The final codex review came back
0 Critical/High with 1 Medium (a dead-branch tier regex) — fixed and merged as PR #21.
NOTE: you already clicked the task chip for that same dead-branch fix (task_bb58ffc0) — that
session is redundant, the fix is merged (controlled-operation-authorisation v1.3.0); safe to close.
Headline numbers: 2,078 dead noise-gate declarations adjudicated across 1,159 files (175 wired,
rest removed); catalog test-harness FAILs 550 → 67 (remainder triaged/deferred by design); site
regex testers fixed (78% of tier regexes silently errored before); collections curated (15 → 75
credential members + 2 new collections + integrity CI check); phone family rendering + hygiene
pass complete. Full trail: .superpowers/sdd/progress.md.

**Small follow-up candidates surfaced by the run** (not started — say go if wanted): re-wire
template-exclusion into the 2 legal patterns whose miswire is now fixed; dead tier-regex branches
in controlled-operation-authorisation (task chip exists); make ci-check's patterns-dir read
recursive to match collections; decide fate of the tier-orphaned en-government-classification
dict; the 74-file case_sensitive harmonization wave from the j2 census.

## Answered / resolved during the run

(nothing yet)
