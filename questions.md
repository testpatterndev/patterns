# Questions for Nathan — overnight backlog run (2026-07-08 → 09)

Parked here per your instruction; none of these block the loop. Newest at top of each section.

**2026-07-09: all four decided by Nathan (in-session):**
1. Classification run → regenerate batches incl. D3/D4 first, then he runs at the keyboard.
2. Secret Scanning + push protection → stay ON.
3. Concept-strategy C1–C4 → **GO**; start C1 (the ~36 deferred top500 self-corroborating tiers
   fold into it rather than piecemeal fixes).
4. Follow-ups → legal 75-tier ticket (legal-tier-residuals-backlog.md Items 1–2) starts now;
   case_sensitive harmonization / ci-check recursive read / en-gov dict fate stay parked.

## Needs your decision (RESOLVED — see above)

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

- **2026-07-09 (contstart, this machine): redundant-session output adjudicated.** The two
  spun-off task-chip sessions left three worktree branches; all pattern changes are
  superseded by main and none needs merging:
  - `claude/friendly-keller-630c9d` (task_3bfa12e2 sweep, 242 files): duplicate of merged
    PR #19 — same files reach the same wired state on main with different changelog text.
    No PR was opened. Safe to close the session and delete the branch/worktree.
  - `claude/pensive-albattani-26afe0` (task_bb58ffc0 COA fix): duplicate of merged PR #21.
    Only delta: its regex also covers plural "authorities" (`authorit(?:y|ies)`) where
    main covers only "authority" — cosmetic nit, not worth a PR. Safe to close/delete.
  - `claude/funny-wright-3a7464` = **PR #20** (open, NOT in the handoff): 14-file legal
    NOT-group fix. Superseded — all 14 slugs on main already carry the identical T2 fix
    (v1.2.0, batch-3) plus the noise-gate wiring (v1.2.1). **PR #20 closed unmerged**;
    its follow-up analysis preserved as `.superpowers/sdd/legal-tier-residuals-backlog.md`.
- **Item 3 of that ticket resolved by audit:** all 1,058 `Evidence_*_exclusion` refs
  catalog-wide sit under correct negative semantics (1,010 NOT-group refs lists, 39
  NOT-group children, 9 excludes keys, 0 positive). The legal 14 were the only instances
  of the lost-wrapper class; no further fixes needed. Items 1–2 (weak legal 75 tiers,
  ~22 verifier FAILs) remain open — they subsume the deferred item 4b design pass above.
