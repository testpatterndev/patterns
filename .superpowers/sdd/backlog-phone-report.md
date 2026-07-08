# Backlog report — phone-rendering-hygiene (D1 follow-up Tickets A+B, combined phone-family pass)

Date: 2026-07-08. Branch: `worktree-wf_1baf1e2c-30e-1` (isolated worktree of `feat/coverage-waves-d4`).

Scope files touched: `global-phone-e164`, `us/ca/uk/in/de/fr/es/it/nl-phone-number`,
`au-fixed-line-telephone`, `eu-iban`, `global-iban`, `global-email-address`, `scripts/ci-check.mjs`.
`data/keywords/phone-context.yaml` was reviewed and deliberately left unchanged (see Part B.1 tail note).

Every regex change below was node-verified with before/after probes, including adversarial inputs
(dates, currency, case/file references, year-like parentheticals, embedded digit runs). The probe
harness lives at the scratchpad (`probe-phone.mjs`, 65 assertions, all passing: every pre-existing
positive/negative case behaves identically on the old and new regexes; every new form flips only from
old:false to new:true). `node scripts/verify-pattern-testcases.mjs` passes on all 14 touched slugs;
`npm run check` = 0 errors; `npm run check:quality` = PASSED; `npm run compile` succeeds.

---

## Part A — rendering coverage

### A.1 UK parenthesised area codes — SHIPPED (uk-phone-number 1.1.0)

**Claim + source.** UK geographic numbers are conventionally written with the area code in parentheses
("(020) 7946 0958", "(01632) 960960"). This is ITU-T E.123's national notation (parentheses mark
digits not always dialled — the area code); E.123 is already the family's notation reference
(https://www.itu.int/rec/T-REC-E.123). Area-code lengths (0+2 through 0+5 significant digits, with the
subscriber number making a constant 10 significant digits) are per Ofcom's National Telephone Numbering
Plan (https://www.ofcom.org.uk/siteassets/resources/documents/phones-telecoms-and-internet/information-for-industry/numbering/other/national-numbering-plan.pdf).

**Implementation.** Four explicit alternatives keyed on paren content length, so the subscriber-digit
count always complements the area-code length to exactly 10 significant digits:
`\(02\d\)` + 8 digits, `\(01\d{2}\)` + 7, `\(01\d{3}\)` + 6, `\(01\d{4}\)` + 5. Digits inside parens are
contiguous (matching real usage); subscriber digits keep the family's per-digit optional `[\s.-]?`
separator. Mobiles are NOT given a paren form — the mobile prefix is always dialled, so the E.123
parenthesis semantics don't apply, and the rendering is not conventional for 07 numbers.

**Collision analysis (done before shipping).**
- The opening context requires `(?<!\d)\(0[12]…` — a literal paren, a trunk 0, then 1/2. Year-like
  parentheticals "(2026)", section refs "(1)", NANP "(212) 555-0148" all fail the leading-0-then-[12]
  requirement. Probed: `(2026) 1234 5678` → no match; `(0345) 600 0000` (03 service range) → no match.
- Exact complementary length is enforced per branch (fixed `{n}` repeats, no backtracking escape):
  probed `(020) 7946 095` (short), `(020) 7946 09581` (long), `(01632) 96096` (short) → no match.
- A digit immediately before the paren blocks the match (`9(020) 7946 0958` → no match), so digit runs
  containing bracketed fragments can't partially match.
- Residual risk: a bracketed internal extension list like "(020) 12345678" that is actually an invoice
  fragment is structurally indistinguishable from a phone — this is the same residual class as the
  existing unbracketed form and stays behind the evidence gates (75/85 only, no zero-evidence tier).

### A.2 DE DIN 5008 legacy slash + parens — SHIPPED for the in-scope mobile ranges (de-phone-number 1.1.0)

**Claim + source.** Current DIN 5008 (2020) prescribes plain space grouping ("030 12345678"); the
older convention separated Vorwahl and Rufnummer with a slash or wrapped the Vorwahl in parens
("030/12345678", "(030) 12345678") and remains widespread. Source describing the DIN 5008 rule and the
deprecated legacy forms: working@office (Telefonnummern nach DIN 5008,
https://www.workingoffice.de/korrespondenz/din-5008/telefonnummer-richtig-schreiben/); DIN 5008 itself
is paywalled, so a reputable secondary describing the norm is cited.

**Scope decision.** The ticket's example forms are landline ("030/…"), but de-phone-number scopes
landlines OUT (BNetzA publishes no verified minimum length for legacy Ortsnetz stock — documented in
the pattern since 1.0.0). Decision: implement the slash/paren renderings for the in-scope 015/016/017
mobile prefixes only ("0171/3920045", "(0171) 3920045"), and document explicitly that the landline
renderings stay unmatched. Widening to landlines through the back door of a rendering ticket would
reverse a sourced scoping decision without the missing primary source.

**Implementation.** Two new alternatives on the mobile regex: `01[5-7]\d\s?/\s?\d(?:[\s.-]?\d){6,7}` and
`\(01[5-7]\d\)[\s.-]?\d(?:[\s.-]?\d){6,7}`. The 4-digit prefix is contiguous (as rendered in practice);
the 7-8 remaining digits keep the BNetzA 10-11 NSN envelope; slash allows the also-common spaced form
"0171 / 392 00 45".

**Collision analysis.**
- Dates with slashes: "01/07/2026", "15/07/2026 10:30" → no match (slash branch needs a 4-digit
  01[5-7]x prefix before the slash and 7-8 digits after; both probed).
- German file/case references ("Az. 0152/2020") → no match (4 digits after slash, needs 7-8; probed).
- Fractions/currency ("1/2", "EUR 0,50/100") → no match (probed).
- Landline forms "030/12345678", "(030) 12345678", "(0180) 5123456" (service prefix) → no match
  (probed) — the branches require the mobile second/third digits.
- Length over/underruns probed: "0171/392004" (short), "0152/288173861234" (long) → no match. The
  `{6,7}` bounded repeat plus trailing `(?!\d)` cannot silently absorb longer runs (greedy backtrack
  re-fails on the boundary — verified).
- Residual risk: order/reference numbers of the exact shape "0157/8228877" collide, as for every
  rendering of a checksum-less number; unchanged evidence gating applies.

### A.3 Family-wide "+CC (0)" letterhead form — per-country decision table

**Claim + source.** Writing the national trunk zero in parentheses inside the international form
("+44 (0)20 7946 0958") is a widespread practice that ITU-T E.123 documents and advises against
(parentheses "should not be used" in international notation). For DLP detection the discouraged form
still appears constantly on letterheads/signatures, so where a country actually has a trunk-0
convention the form is real and worth matching. Source: ITU-T E.123 (https://www.itu.int/rec/T-REC-E.123);
the practice and its failure mode are also described in the E.123 literature (e.g. the Wikipedia E.123
summary of the "(0)" misuse). Reference entries were added to each shipped pattern.

| Pattern | Decision | Rationale |
|---|---|---|
| uk-phone-number | SHIP `(?:\(0\)[\s.-]?)?` after `\+44[\s.-]?` | Trunk-0 plan; form ubiquitous in UK usage |
| de-phone-number | SHIP after `\+49` | Trunk-0 plan; "+49 (0)…" standard on German letterheads |
| fr-phone-number | SHIP after `\+33` | Trunk-0 plan; "+33 (0)…" standard on French letterheads |
| nl-phone-number | SHIP after `\+31` | Trunk-0 plan; "+31 (0)…" standard on Dutch letterheads |
| es-phone-number | N/A — skip | Spain has no trunk prefix; "+34 (0)" does not exist |
| it-phone-number | N/A — skip | Italian mobiles never had a trunk 0 (landlines, which keep the 0, are out of scope) |
| us/ca-phone-number | N/A — skip | NANP trunk is "1", not "0"; "+1 (0)" does not exist |
| in-phone-number | SKIP (documented in changelog) | India does use trunk 0, and "+91 (0)…" is seen informally, but no authoritative style/regulator documentation of the rendering was found — the family only ships renderings with a citable source; revisit if one appears |
| global-phone-e164 | SKIP (documented in description) | "(0)" is not an E.164 representation; keeping this pattern strictly E.164-shaped, the four trunk-0 country patterns carry the form |

**Collision analysis (shipped four).** The optional group only ever matches the exact literal "(0)"
plus one optional separator, wedged between the literal +CC and the already-constrained first
significant digit — it adds no new digit-shape freedom. The out-of-scope ranges stay excluded through
the letterhead door: probed "+44 (0)345 600 0000" (UK 03), "+49 (0)30 23125678" (DE landline),
"+33 (0)8 92 68 00 00" (FR VAS), "+31 (0)800 123456" (NL service) → all no match. Short-number probe
"+44 (0)20 7946 095" → no match. No pre-existing positive or negative case changed behavior.
Note: global-phone-e164 does NOT match the letterhead form (the "(" breaks its digit run after "+44",
leaving fewer than 8 digits — verified), consistent with the skip decision above.

### A.4 UK 07624 Isle of Man carve-out — SHIPPED (uk-phone-number 1.1.0)

**Verification.** Ofcom's National Telephone Numbering Plan allocates 076 to radiopaging EXCEPT 07624,
which is the Isle of Man mobile code (Manx Telecom holds 7624 (0-1) and (3-9); Sure Isle of Man also
issues 07624 numbers). IoM numbering is administered within the UK plan (Ofcom allocates; usage is
07624 + 6 digits, mirroring the 01624 landline code). Sources: Ofcom National Telephone Numbering Plan
PDF (https://www.ofcom.org.uk/siteassets/resources/documents/phones-telecoms-and-internet/information-for-industry/numbering/other/national-numbering-plan.pdf);
Manx Telecom IoM mobile numbers page (https://www.manxtelecom.com/support/mobile/number-portability/iom-mobile-numbers/).
Conclusion: it IS a UK-plan mobile range and the previous blanket exclusion of 076 over-excluded it.

**Implementation.** New alternative `7[\s.-]?6[\s.-]?2[\s.-]?4` + 6 digits (10 significant total) in
both the domestic (leading 0) and +44 branches. The rest of 076 (pagers) and 070 remain excluded.

**Collision analysis.** This widening admits exactly the digit prefix 07624 (1 of the 10 three-digit
07x× spaces previously excluded, narrowed to a single 5-digit prefix): a 1-in-100,000 leading-prefix
slice of 11-digit digit-space. Probed: "07634 496123" (adjacent paging prefix) → no match;
"07624 49612" (short) / "07624 4961234" (11 significant, long) → no match; "076245 12345" → match,
which is correct — it is the same 10-significant-digit number 07624 512345 under the family's
flexible-grouping convention. No Ofcom drama range exists inside 07624, so the test value is an
illustrative synthetic (declared as such, mirroring the ES/IT/NL precedent).

### A.5 Domestic-regex-fires-inside-+CC overlap (US/CA/ES/IT/IN) — REPORT-ONLY, no regex change

Empirically verified (probe `probe-overlap.mjs`):

| Pattern | Spaced intl rendering | Domestic sub-regex result | Contiguous rendering |
|---|---|---|---|
| us | "+1 212 555 0134" | MATCHES "1 212 555 0134" | "+12125550134" → MATCHES "12125550134" (optional trunk-1 branch) |
| ca | "+1 514 555 0134" | MATCHES "1 514 555 0134" | same as us |
| es | "+34 612 345 678" | MATCHES "612 345 678" | "+34612345678" → no match (digit lookbehind) |
| it | "+39 345 678 9012" | MATCHES "345 678 9012" | no match contiguous |
| in | "+91 9876543210" | MATCHES "9876543210" | no match contiguous |
| uk/fr/nl/de | all four | no match | no match (domestic forms require the trunk 0, absent in +CC form) |

Why no fix is shipped: the only structural fix is a variable-width negative lookbehind (the separator
between +CC and the number varies), which the `engine: universal` target (Boost.RegEx for Purview)
does not support; a fixed-width `(?<!\+)` would only suppress the US/CA trunk-1 sub-case and leave the
rest, buying inconsistency rather than precision. The co-fire is benign by construction: domestic and
intl sub-regexes carry IDENTICAL tier levels and evidence requirements in all five patterns, so the
duplicate can never raise confidence — it duplicates a finding at the same level and offset range,
which reporting layers de-duplicate. Documented as a false_positives entry (with the verified example)
in all five patterns; the trunk-0 countries need no note since they provably don't overlap.

---

## Part B — hygiene

### B.1 Keyword_*_phone_specific 85-tier dict purification (term-by-term)

Doctrine: the 85 tier is "country-specific phone evidence"; bare generic phone nouns belong to the
shared phone-context dict (75 tier). Every dropped generic below remains 75-tier evidence via
Evidence_phone_context, so no coverage is lost — matches near a generic term simply score 75 instead
of a spurious 85.

| Pattern | Kept (rationale) | Dropped (rationale) | Post-purge count |
|---|---|---|---|
| us | "US phone number", "United States phone number", "US mobile number", "American cell phone" (explicit country refs); "call me at", "text me at" (US-idiom phrasing, retained for the NANP pair per initial design) | "cell", "mobile" (bare generics; both already in phone-context) | 6 |
| ca | "Canadian phone number", "Canada mobile number", "Canadian cell phone", "Canada contact number" (country refs); "call me at", "text me at" (as us) | "cell", "mobile" (same) | 6 |
| uk | "UK phone number", "United Kingdom mobile", "British mobile number" (country refs); "call me on", "text me on" (distinctively British "on"-idiom) | "mobile", "landline" (bare generics; both in phone-context) | 5 |
| in | "Indian mobile number", "India phone number" (country refs); "WhatsApp number" (phrase = an actual number is present; dominant channel in IN usage); "call me at" (Indian-English idiom) | "mobile number" (generic; in phone-context), "SMS" (generic; in phone-context) | 4 |
| de | "German phone number", "German mobile number" (country refs); "Telefonnummer", "Handynummer", "Mobilnummer", "Rufnummer" (German-language, strong locale signal) | "call me at", "text me at" (generic English, zero DE specificity) | 6 |
| fr | "French phone number", "French mobile number"; "numéro de téléphone", "numéro de portable" (French-language); ADDED "téléphone portable" (French-language, replaces the dropped bare term with a specific phrase) | "portable" (bare — also a plain English word: "portable device"), "call me at", "text me at" | 5 |
| es | "Spanish phone number", "Spanish mobile number"; "número de teléfono", "número de móvil"; ADDED "teléfono móvil" | "móvil" (bare generic in any Spanish-language doc, incl. non-ES jurisdictions), "call me at", "text me at" | 5 |
| it | "Italian phone number", "Italian mobile number"; "numero di telefono", "numero di cellulare"; ADDED "telefono cellulare" | "cellulare" (bare generic in any Italian doc), "call me at", "text me at" | 5 |
| nl | "Dutch phone number", "Dutch mobile number"; "telefoonnummer", "mobiel nummer"; ADDED "mobiele nummer" (inflected form) | "mobiel" (bare — extremely common Dutch adjective), "call me at", "text me at" | 5 |
| global-e164 | "international phone number", "call internationally", "international mobile number" (internationality markers); "WhatsApp number", "call me at" (value-adjacent phone phrases — the +CC value itself supplies the international signal) | "mobile", "cell" (bare generics; in phone-context) | 5 |

Evidence sufficiency check: every 85 tier retains 4-6 specific terms including at least two explicit
country/internationality references; quality gate (weakHigh) confirms all 85 tiers still classify as
specific-strength. The `corroborative_evidence.keywords` inline lists (non-Purview engines) were left
untouched — they are broad-evidence lists by design.

`data/keywords/phone-context.yaml` itself: reviewed; all 17 terms are genuinely jurisdiction-neutral
generic phone vocabulary (that is its job as the 75-tier dict) — no change needed.

### B.2 Noise-exclusion NOT nodes on the phone 75 tiers

Added the identifier-family NOT node (`type: any, min_matches: 0, max_matches: 0,
refs: [Keyword_noise_exclusion]`, the same shape nl-bsn/mx-rfc/uk-sort-code-account carry on their 75
tiers) to every phone 75 tier: 2 tiers each in us/ca/uk/in/de/fr/es/it/nl (domestic + intl), 1 in
global-phone-e164, and the 75 tier of au-fixed-line-telephone (alias Evidence_template_exclusion
there). The dicts were already imported by every phone pattern (previously used only at 85), so no new
imports were needed. Effect: a phone-shaped value inside template/sample/demo content no longer scores
75.

### B.3 au-fixed-line-telephone 65-tier retrofit (2.2.0)

Current-state check first, as instructed: `Evidence_personal_record` still existed as a LOCAL keyword
group (record/file/form/register/directory/roster — generic document words with no phone signal) wired
to the 65 tier; the purge that removed this list elsewhere in the corpus never reached this file. The
shared phone-context dict (which the whole D1 family uses) was not imported at all.

Changes: imported `phone-context` as `Evidence_phone_context`; pointed the 65 tier at it (generic
phone vocabulary is the correct low-rung evidence, consistent with the family using phone-context as
its generic rung); deleted the now-unreferenced local Evidence_personal_record group; added the
template-exclusion NOT node to the 75 tier (B.2); converted the 85 tier's legacy `children:` spelling
to `refs:` (verified semantically identical in scripts/verify-pattern-testcases.mjs, which treats
`refs|children` as the same field); updated the `operation` prose accordingly. Note the AU pattern
keeps its 65 tier (it predates the D1 "no 65 rung" convention and its 65 rung is evidence-gated, not
zero-evidence — removing the rung entirely was not in this ticket's scope).

### B.4 Dead Keyword_noise_exclusion imports — eu-iban 1.1.1, global-iban 1.0.1

Verified programmatically (scan of every `purview.shared_keywords[].as` alias against all references
in each file, plus the compiler path: compile.js only injects the dict into `purview.keywords` — no
tier in either file references the alias, so the injected group was dead weight in patterns.json).
Removed the import from both files. No detection behavior change → patch bumps. (The scan shows the
same dead-import shape exists in ~dozens of other files — out of scope here, worth its own ticket.)

### B.5 Doc-nits batch

| File | Nit | Fix |
|---|---|---|
| global-email-address 1.0.1 | "WHATWG subset" claim was imprecise: WHATWG accepts dotless domains (user@localhost), this regex requires a TLD | Added explicit divergence note in description; negative test case now cross-references it |
| de-phone-number | Length-envelope sentence implied per-range exactness | Added sentence: the 10-11 bound is a single union envelope across 015/016/017, not per-sub-range exact lengths — a documented over-acceptance |
| nl-phone-number | 0800 was listed as an "09" example (it is 08); 085/091 ranges unmentioned | Fixed the 08/09 example split; documented 085 (VoIP) and 091 (new services) as location-independent ranges available to individuals — a known false negative; added Rijksoverheid source + a should_not_match for 085 |
| es-phone-number | 71-74 opening was attributed to "CMT" with a 2010/2011 wording clash | Corrected: Resolución de 12 de marzo de 2010 was issued by SETSI (BOE-A-2010-5251, primary source now referenced directly); CMT then assigned ranges, service from 2010/2011; test-case description aligned |
| it-phone-number | Delibera 8/15/CIR reference title said "10-digit total" unconditionally | Title now carries the legacy-9-digit qualifier the body text already documents |
| fr-phone-number | 00-negative test parenthetical claimed "valid categories are 01-07 and 09" (08 IS a valid plan category, merely out of scope) | Parenthetical now says: plan categories are 01-09; this pattern covers 01-07 and 09 with 08 deliberately out of scope |

### Gate-script fix (scripts/ci-check.mjs)

The Purview banned-construct check counted escaped literal `\(` as capturing groups (naive
`match(/\((?!\?)/)` on the class-stripped source), which false-flagged the new parenthesised
renderings (`\(020\)`, `\(0\)`). Fixed by stripping escaped characters (`\\.`) before counting —
literal parens are fine in Boost.RegEx/Purview (the corpus already ships `\(?` in the NANP patterns);
only real unnamed capture groups remain flagged. Verified: with the original script exactly the 3 new
false positives errored and nothing else; with the fix, 0 errors and the warning set is unchanged (57
before and after, none in touched files).

---

## Version census

| File | Version | Bump type |
|---|---|---|
| uk-phone-number | 1.0.0 → 1.1.0 | minor (regex + tiers + dict) |
| de-phone-number | 1.0.0 → 1.1.0 | minor (regex + tiers + dict) |
| fr-phone-number | 1.0.0 → 1.1.0 | minor (regex + tiers + dict) |
| nl-phone-number | 1.0.0 → 1.1.0 | minor (regex + tiers + dict) |
| us-phone-number | 1.0.0 → 1.1.0 | minor (tiers + dict) |
| ca-phone-number | 1.0.0 → 1.1.0 | minor (tiers + dict) |
| es-phone-number | 1.0.0 → 1.1.0 | minor (tiers + dict + citation fix) |
| it-phone-number | 1.0.0 → 1.1.0 | minor (tiers + dict + ref title) |
| in-phone-number | 1.0.0 → 1.1.0 | minor (tiers + dict) |
| global-phone-e164 | 1.0.0 → 1.1.0 | minor (tier + dict) |
| au-fixed-line-telephone | 2.1.0 → 2.2.0 | minor (tier rewiring) |
| eu-iban | 1.1.0 → 1.1.1 | patch (dead import, no behavior change) |
| global-iban | 1.0.0 → 1.0.1 | patch (dead import, no behavior change) |
| global-email-address | 1.0.0 → 1.0.1 | patch (docs only) |

Gates at commit: `npm run check` 0 errors / 57 warnings (baseline), `npm run check:quality` PASSED,
`npm run compile` OK (1655 patterns), `verify-pattern-testcases.mjs` all 14 touched slugs pass.
`patterns.json` reverted before staging per repo convention.
