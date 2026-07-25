# Customisation Placeholders — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to turn this into a task-by-task implementation plan before touching any pattern file.

**Goal:** Let the public catalogue ship patterns whose *detection shape* is generic but whose *high-precision terms* are organisation-specific (unit identifiers, project codenames, facility names, executive rosters), by making "this part must be localised" a first-class, machine-checkable schema feature — declared in the pattern, resolved with safe generic fallbacks at public compile time, and enforced fail-closed by downstream deployment tooling so an unresolved or un-customised pattern can never reach a tenant in enforce mode.

**Why now:** Today's model is sanitisation-by-vigilance: authors must remember to keep organisation-identifying values out of public YAML (examples, test data, featured identifiers), and downstream deployments separately maintain private term subsets with no schema-level contract between the two. That is both a leak risk in the public direction (a real identifier used as an example) and a precision loss in the deploy direction (nothing *requires* the tenant-specific subset to be supplied). This mechanism replaces vigilance with structure in both directions.

**Scope guard:** v1 covers keyword-type content only — dictionary term subsets, corroborative keyword sets, and Purview keyword-group terms. `{{CUSTOMISE:*}}` tokens are **banned inside regex bodies** in v1 (`pattern:`, tier `id_match` regexes, evidence regexes): token substitution inside regexes interacts with escaping, Purview-safety validation, and the self-test harness in ways that need their own design pass. The site rendering panel is a later phase. Nothing in v1 changes the compiled behaviour of any existing pattern that does not opt in.

---

## 1. Schema: the `customisation:` block (testpattern/v1 extension)

A pattern (or keyword dictionary) MAY declare a top-level `customisation:` list. Each entry:

```yaml
customisation:
  - key: participant-duids            # [a-z0-9-]{3,40}, unique within the file
    kind: dictionary-subset           # dictionary-subset | keyword-set | value
    target: corroborative_evidence.keyword_lists/au-nem-duids
    note: >-
      Replace with the subset of DUIDs registered to your organisation
      (filter the AEMO registration list by participant). The public
      dictionary is the full market list; a participant subset makes
      matches organisation-specific.
    required_for_enforcement: false   # see §4 gate semantics
```

```yaml
customisation:
  - key: project-codenames
    kind: keyword-set
    target: corroborative_evidence.keywords   # or purview.keywords/<GroupId>
    note: Replace the in-file example codenames with your organisation's live project codenames.
    required_for_enforcement: true
    # No separate fallback list: the referenced group's IN-FILE terms ARE the
    # public fallback and must be plainly fictional. One source of truth — the
    # deploy overlay replaces the whole set.
```

**Kinds:**

- `dictionary-subset` — the referenced keyword dictionary is complete and public as shipped; the customisation is a *tenant-side filter/replacement* for precision. No `fallback` (the full public dictionary IS the fallback). This is the pattern for public-registry identifier lists (market unit IDs, licence registers).
- `keyword-set` — the referenced keyword group's public terms are **generic placeholders**; real detection value only exists after tenant substitution. The group's in-file terms are the public fallback (must be plainly fictional); no separate `fallback` field. Valid targets: `purview.keywords/<GroupId>` or `corroborative_evidence.keywords`. This is the "publish a sensitive-shaped skeleton" case.
- `value` — a single token appears inline as a term (`{{CUSTOMISE:org-domain}}` inside a keyword term string). `fallback` (string) required; compile substitutes it.

**Inline token convention:** `{{CUSTOMISE:<key>}}` may appear inside keyword term strings only (dictionary terms, `corroborative_evidence.keywords` entries, Purview keyword-group terms). Every token must have a declaration with a matching `key`; every `value`-kind declaration must have at least one token referencing it.

## 2. Public compile behaviour (`scripts/compile.js`)

1. Resolve every token/keyword-set against its declared `fallback` — the published `patterns.json` always contains concrete, generic, self-consistent values. Byte-level guarantee: the string `{{CUSTOMISE:` MUST NOT appear anywhere in compiled output (compile fails otherwise).
2. Pass the `customisation:` block through to the compiled pattern object verbatim (minus nothing — notes included). This is deliberate: the compiled catalogue *advertises* what needs localising, so any consumer (our deploy tooling, third parties, the site) can build gates and UI on it. The block is metadata; Purview exporters ignore it for XML generation.
3. Self-test harness (`verify-pattern-testcases.mjs`) evaluates patterns **after fallback resolution** — test cases exercise the public/fallback form. Tenant-substituted behaviour is the deploy side's test burden (§4).

## 3. Validation (`scripts/ci-check.mjs` additions, all ERROR level unless noted)

- Every `{{CUSTOMISE:key}}` token has a matching declaration; every declaration key is unique; `value` declarations are referenced by ≥1 token (unreferenced → warning).
- `kind`/`target` consistency: `target` must resolve to a real dictionary slug / keyword group / term location in the same file's structures.
- `fallback` present for `value` only; `keyword-set` targets must carry ≥1 in-file (fictional) term; `dictionary-subset` never has a fallback.
- `note` present and non-trivial (≥ 40 chars) — the note IS the user-facing alert.
- If a `keyword-set` customisation's group is load-bearing for a tier at confidence ≥ 75 and `required_for_enforcement` is false → error ("either the fallback genuinely detects, or enforcement must require customisation — pick one").
- Token syntax anywhere outside permitted locations (regex bodies, metadata fields) → error.
- Length/Purview gates run on the fallback-resolved form (fallbacks are what ships).

## 4. Deployment-side contract (private tooling; work items tracked there)

The downstream package builder consumes compiled patterns + a per-customer overlay document:

```jsonc
// workspace-request customerOverlay (private, per-tenant)
"customisations": {
  "au-nem-duid/participant-duids":   { "mode": "subset",  "terms": ["..."], "keywordId": "..." },
  "x-pattern/project-codenames":     { "mode": "replace", "terms": ["..."], "keywordId": "..." }
  // value-kind overlay application is v2: in v1 a value declaration ships its
  // compiled fallback, and if required_for_enforcement it needs an explicit
  // acceptFallback waiver to deploy.
}
```

Gate semantics (fail closed):

1. **Build/readiness:** a selected pattern declaring `required_for_enforcement: true` with no matching overlay entry → package build and readiness checks refuse (NOT READY), unless the workspace carries an explicit per-key waiver (`"acceptFallback": true`) recording that the operator knowingly ships the generic form. Waivers are surfaced in the readiness output, never silent.
2. **Seal:** final byte-gate on every packaged XML — the literal `{{CUSTOMISE:` must not appear (defence in depth; compile already guarantees this for the public artifact, the seal gate covers any future tenant-side substitution bugs).
3. **Substitution testing:** v1 = build-side term sanity validation (every overlay term non-empty, no token literal, structural apply fails loud on missing keyword groups) so a malformed overlay fails the build, not the tenant. v2 = re-run the pattern's test cases with substituted terms spliced into generated positives.
4. `dictionary-subset` overlays replace the packaged dictionary terms for that tenant only; the public dictionary is untouched.

## 5. First conversions (v1 acceptance demos)

1. `au-nem-duids` dictionary + `au-nem-duid`/`au-nem-bid-file`: declare `participant-duids` as `dictionary-subset` (`required_for_enforcement: false` — the full public list already works; the subset is a precision upgrade). Proves the no-fallback kind end to end.
2. One new demonstrator pattern authored WITH the mechanism: a project-codename / internal-initiative detector whose public form carries fictional codenames (`keyword-set`, `required_for_enforcement: true`). Proves the publish-sensitive-shaped-skeleton case and the deploy refusal path.

## 6. Non-goals (v1)

- Tokens in regex bodies (needs escaping + Purview-safety design; v2 candidate).
- Site "customisation required" UI panel (metadata already flows; render later).
- Automated sensitivity scanning of fallback values (human review remains the check that a fallback is fictional; ci-check enforces presence and shape, not semantics).
- Retro-converting existing patterns beyond the §5 demos.

## 7. Risks / edge cases the plan must cover

- Fallback resolution ordering vs existing `keyword_lists` reference resolution in compile.js (777 patterns already resolve list refs — substitution must compose, not race).
- A `dictionary-subset` declaration on a dictionary consumed by multiple patterns: declaration lives on the dictionary file once, patterns reference it; validator must handle both file shapes.
- Overlay term hygiene: terms are tenant secrets — they must never appear in build logs, error messages, or readiness output (print counts and keys, never values).
- Backwards compatibility: consumers that don't know the `customisation` field must be unaffected (additive metadata only) — verify the site loader and existing export tooling tolerate the extra key.
