# Customisation Placeholders (patterns repo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `customisation:` schema block + `{{CUSTOMISE:key}}` token mechanism to testpattern/v1 — validated by ci-check, fallback-resolved by compile with a byte-gate, honoured by the self-test harness — and convert the first patterns (spec: `docs/superpowers/specs/2026-07-25-customisation-placeholders-design.md`).

**Architecture:** One new library module (`scripts/lib/customisation.mjs`) owns parsing, validation, and fallback resolution; `ci-check.mjs`, `compile.js`, and `verify-pattern-testcases.mjs` each make one small call into it. Kinds: `dictionary-subset` (no fallback — full public dictionary is the fallback), `keyword-set` (in-file fictional terms are the fallback), `value` (`fallback` string substituted for inline tokens). Compiled `patterns.json` carries the `customisation` block through verbatim and must never contain the literal `{{CUSTOMISE:`.

**Tech Stack:** Node ESM (repo `"type": "module"`), js-yaml, plain-assert test files run via `node` (mirror `scripts/lib/__tests__/purview-banned.test.mjs`).

## Global Constraints

- Tokens are BANNED in regex bodies (`pattern:`, tier `id_match`, evidence regexes) — v1 permits tokens only in: dictionary `keywords` terms, `corroborative_evidence.keywords` entries, `purview.keywords[].groups[].terms`.
- Token syntax: `{{CUSTOMISE:<key>}}`, key `[a-z0-9-]{3,40}`.
- Compiled output byte-gate: compile MUST fail if `{{CUSTOMISE:` appears in the output string.
- After ANY change: `npm run check` must report 0 errors and warning count must not increase; before push also run `npm run check:quality` (publish gate is stricter than ci-check — standing lesson 2026-07-25).
- No organisation-identifying values anywhere (public repo). Fictional entities only in examples (Coralstone convention).
- Work on branch `feat/customisation-placeholders` off `main`. Do not push until the final task's full-gate step passes.

---

### Task 1: `customisation.mjs` core module (validate + resolve)

**Files:**
- Create: `scripts/lib/customisation.mjs`
- Test: `scripts/lib/__tests__/customisation.test.mjs`
- Modify: `package.json` (add `"test:customisation": "node scripts/lib/__tests__/customisation.test.mjs"` to `scripts`)

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (later tasks import exactly these):
  - `TOKEN_LITERAL` — the string `'{{CUSTOMISE:'`
  - `validateCustomisations(doc, {kwSlugs?: Set<string>, isDictionary?: boolean}) : string[]` — error messages WITHOUT file prefix (callers prefix with slug/filename)
  - `resolveCustomisationFallbacks(doc, isDictionary?: boolean) : object` — deep-copied doc with `value` tokens substituted; `customisation` block preserved verbatim

- [ ] **Step 1: Write the failing test**

`scripts/lib/__tests__/customisation.test.mjs` (mirror the assert/summary style of `purview-banned.test.mjs`):

```js
import assert from 'node:assert/strict'
import { validateCustomisations, resolveCustomisationFallbacks, TOKEN_LITERAL } from '../customisation.mjs'

let passed = 0, failed = 0
function t(name, fn) { try { fn(); passed++ } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`) } }

const VALUE_DOC = {
  slug: 'x', customisation: [{ key: 'org-domain', kind: 'value', note: 'Replace with your primary internal email/AD domain so matches are organisation-scoped.', required_for_enforcement: true, fallback: 'coralstone.internal' }],
  corroborative_evidence: { keywords: ['credentials for {{CUSTOMISE:org-domain}}', 'password'] },
}

t('valid value doc has no errors', () => assert.deepEqual(validateCustomisations(VALUE_DOC), []))
t('resolve substitutes fallback', () => {
  const r = resolveCustomisationFallbacks(VALUE_DOC)
  assert.equal(r.corroborative_evidence.keywords[0], 'credentials for coralstone.internal')
  assert.ok(!JSON.stringify(r.corroborative_evidence).includes(TOKEN_LITERAL))
  assert.deepEqual(r.customisation, VALUE_DOC.customisation) // metadata preserved
  assert.equal(VALUE_DOC.corroborative_evidence.keywords[0].includes('{{CUSTOMISE:'), true) // input not mutated
})
t('token without declaration errors', () => {
  const errs = validateCustomisations({ slug: 'x', corroborative_evidence: { keywords: ['{{CUSTOMISE:mystery}}'] } })
  assert.ok(errs.some(e => e.includes("mystery") && e.includes('no customisation declaration')))
})
t('value declaration without token errors', () => {
  const errs = validateCustomisations({ slug: 'x', customisation: [{ key: 'org-domain', kind: 'value', note: 'Replace with your primary internal email/AD domain so matches are organisation-scoped.', required_for_enforcement: true, fallback: 'a.b' }] })
  assert.ok(errs.some(e => e.includes('no {{CUSTOMISE:org-domain}} token')))
})
t('short note errors', () => {
  const errs = validateCustomisations({ slug: 'x', customisation: [{ key: 'abc-key', kind: 'value', note: 'fix me', required_for_enforcement: false, fallback: 'v' }], corroborative_evidence: { keywords: ['{{CUSTOMISE:abc-key}}'] } })
  assert.ok(errs.some(e => e.includes('note')))
})
t('bad kind errors', () => {
  const errs = validateCustomisations({ slug: 'x', customisation: [{ key: 'abc-key', kind: 'magic', note: 'Replace with your organisation-specific list of terms for local precision.', required_for_enforcement: false }] })
  assert.ok(errs.some(e => e.includes('kind')))
})
t('fallback on non-value kind errors', () => {
  const errs = validateCustomisations({ slug: 'x', customisation: [{ key: 'abc-key', kind: 'keyword-set', target: 'corroborative_evidence.keywords', note: 'Replace the in-file example terms with your organisation-specific equivalents.', required_for_enforcement: true, fallback: ['x'] }], corroborative_evidence: { keywords: ['PROJECT CORALSTONE'] } })
  assert.ok(errs.some(e => e.includes('fallback is only valid for the value kind')))
})
t('keyword-set on corroborative keywords validates', () => {
  const errs = validateCustomisations({ slug: 'x', customisation: [{ key: 'codenames', kind: 'keyword-set', target: 'corroborative_evidence.keywords', note: 'Replace the fictional example codenames with your organisation\'s live project codenames.', required_for_enforcement: true }], corroborative_evidence: { keywords: ['PROJECT CORALSTONE'] } })
  assert.deepEqual(errs, [])
})
t('keyword-set purview target must exist', () => {
  const errs = validateCustomisations({ slug: 'x', customisation: [{ key: 'codenames', kind: 'keyword-set', target: 'purview.keywords/Keyword_missing', note: 'Replace the fictional example codenames with your organisation\'s live project codenames.', required_for_enforcement: true }] })
  assert.ok(errs.some(e => e.includes('Keyword_missing')))
})
t('dictionary-subset on pattern needs referenced list', () => {
  const errs = validateCustomisations({ slug: 'x', customisation: [{ key: 'participant-ids', kind: 'dictionary-subset', target: 'corroborative_evidence.keyword_lists/au-nem-duids', note: 'Filter the full public market list to the identifiers registered to your organisation.', required_for_enforcement: false }], corroborative_evidence: { keyword_lists: ['au-nem-duids'] } }, { kwSlugs: new Set(['au-nem-duids']) })
  assert.deepEqual(errs, [])
})
t('dictionary-subset unknown list errors', () => {
  const errs = validateCustomisations({ slug: 'x', customisation: [{ key: 'participant-ids', kind: 'dictionary-subset', target: 'corroborative_evidence.keyword_lists/nope', note: 'Filter the full public market list to the identifiers registered to your organisation.', required_for_enforcement: false }], corroborative_evidence: { keyword_lists: ['nope'] } }, { kwSlugs: new Set(['au-nem-duids']) })
  assert.ok(errs.some(e => e.includes("'nope'")))
})
t('dictionary file: only dictionary-subset, no target', () => {
  const okDict = { slug: 'd', keywords: ['AAA1'], customisation: [{ key: 'participant-ids', kind: 'dictionary-subset', note: 'Filter this full-market public list to the identifiers registered to your organisation for precision.', required_for_enforcement: false }] }
  assert.deepEqual(validateCustomisations(okDict, { isDictionary: true }), [])
  const bad = { ...okDict, customisation: [{ ...okDict.customisation[0], kind: 'keyword-set' }] }
  assert.ok(validateCustomisations(bad, { isDictionary: true }).length > 0)
})
t('token in dictionary term resolves', () => {
  const d = { slug: 'd', keywords: [{ text: 'ID-{{CUSTOMISE:site-code}}', case_sensitive: true }], customisation: [{ key: 'site-code', kind: 'value', note: 'Replace with the site short-code your organisation stamps on internal identifiers.', required_for_enforcement: false, fallback: 'CSTN' }] }
  assert.deepEqual(validateCustomisations(d, { isDictionary: true }), [])
  assert.equal(resolveCustomisationFallbacks(d, true).keywords[0].text, 'ID-CSTN')
})
t('stray token outside keyword sites errors', () => {
  const errs = validateCustomisations({ slug: 'x', description: 'uses {{CUSTOMISE:abc-key}}', customisation: [{ key: 'abc-key', kind: 'value', note: 'Replace with your organisation-specific value; this fallback is a generic stand-in.', required_for_enforcement: false, fallback: 'v' }], corroborative_evidence: { keywords: ['{{CUSTOMISE:abc-key}}'] } })
  assert.ok(errs.some(e => e.includes('outside permitted')))
})
t('duplicate keys error', () => {
  const d = { key: 'abc-key', kind: 'value', note: 'Replace with your organisation-specific value; this fallback is a generic stand-in.', required_for_enforcement: false, fallback: 'v' }
  const errs = validateCustomisations({ slug: 'x', customisation: [d, { ...d }], corroborative_evidence: { keywords: ['{{CUSTOMISE:abc-key}}'] } })
  assert.ok(errs.some(e => e.includes('duplicate')))
})
t('load-bearing >=75 keyword-set without required_for_enforcement errors', () => {
  const doc = {
    slug: 'x',
    customisation: [{ key: 'codenames', kind: 'keyword-set', target: 'purview.keywords/Keyword_codenames', note: 'Replace the fictional example codenames with your organisation\'s live project codenames.', required_for_enforcement: false }],
    purview: {
      keywords: [{ id: 'Keyword_codenames', groups: [{ terms: ['PROJECT CORALSTONE'] }] }],
      pattern_tiers: [{ confidence_level: 75, id_match: 'Pattern_x', matches: [{ ref: 'Keyword_codenames' }] }],
    },
  }
  const errs = validateCustomisations(doc)
  assert.ok(errs.some(e => e.includes('load-bearing')))
  doc.customisation[0].required_for_enforcement = true
  assert.deepEqual(validateCustomisations(doc), [])
})
t('NOT-group reference is not load-bearing', () => {
  const doc = {
    slug: 'x',
    customisation: [{ key: 'codenames', kind: 'keyword-set', target: 'purview.keywords/Keyword_codenames', note: 'Replace the fictional example codenames with your organisation\'s live project codenames.', required_for_enforcement: false }],
    purview: {
      keywords: [{ id: 'Keyword_codenames', groups: [{ terms: ['PROJECT CORALSTONE'] }] }],
      pattern_tiers: [{ confidence_level: 75, id_match: 'Pattern_x', matches: [{ type: 'any', min_matches: 0, max_matches: 0, refs: ['Keyword_codenames'] }] }],
    },
  }
  assert.deepEqual(validateCustomisations(doc), [])
})

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/lib/__tests__/customisation.test.mjs`
Expected: FAIL — `Cannot find module '../customisation.mjs'`

- [ ] **Step 3: Write the implementation**

`scripts/lib/customisation.mjs`:

```js
// Customisation placeholders (testpattern/v1 extension).
// Design: docs/superpowers/specs/2026-07-25-customisation-placeholders-design.md
// Three kinds: dictionary-subset (full public dictionary IS the fallback),
// keyword-set (in-file fictional terms ARE the fallback), value ({{CUSTOMISE:key}}
// tokens substituted with the declared fallback string at compile time).

export const TOKEN_LITERAL = '{{CUSTOMISE:'
const TOKEN_RE = /\{\{CUSTOMISE:([a-z0-9-]{3,40})\}\}/g
const KEY_RE = /^[a-z0-9-]{3,40}$/
const KINDS = new Set(['dictionary-subset', 'keyword-set', 'value'])
const MIN_NOTE = 40

const termText = (t) => (typeof t === 'string' ? t : String(t?.text ?? ''))

// Permitted token sites. visit(text) is called once per keyword term string.
function visitTokenSites(doc, isDictionary, visit) {
  if (isDictionary) {
    for (const t of doc.keywords ?? []) visit(termText(t))
    return
  }
  for (const k of doc.corroborative_evidence?.keywords ?? []) visit(String(k))
  for (const kw of doc.purview?.keywords ?? [])
    for (const g of kw.groups ?? [])
      for (const t of g.terms ?? []) visit(termText(t))
}

function tokensInPermittedSites(doc, isDictionary) {
  const found = []
  visitTokenSites(doc, isDictionary, (text) => {
    for (const m of text.matchAll(TOKEN_RE)) found.push(m[1])
  })
  return found
}

export function validateCustomisations(doc, { kwSlugs = new Set(), isDictionary = false } = {}) {
  const errs = []
  const raw = doc.customisation
  if (raw != null && !Array.isArray(raw)) return ['customisation must be a list']
  const decls = raw ?? []
  const byKey = new Map()

  for (const d of decls) {
    if (!d || typeof d !== 'object') { errs.push('customisation entries must be objects'); continue }
    const key = String(d.key ?? '')
    if (!KEY_RE.test(key)) errs.push(`customisation key '${key}' must match [a-z0-9-]{3,40}`)
    if (byKey.has(key)) errs.push(`duplicate customisation key '${key}'`)
    byKey.set(key, d)
    if (!KINDS.has(d.kind)) errs.push(`customisation '${key}': kind must be dictionary-subset|keyword-set|value`)
    if (typeof d.note !== 'string' || d.note.trim().length < MIN_NOTE) errs.push(`customisation '${key}': note must explain the localisation (>= ${MIN_NOTE} chars)`)
    if (typeof d.required_for_enforcement !== 'boolean') errs.push(`customisation '${key}': required_for_enforcement must be boolean`)

    if (d.kind === 'value') {
      if (typeof d.fallback !== 'string' || !d.fallback.trim()) errs.push(`customisation '${key}': value kind requires a non-empty string fallback`)
      if ('target' in d) errs.push(`customisation '${key}': value kind locates via {{CUSTOMISE:${key}}} tokens, not target`)
    } else if ('fallback' in d) {
      errs.push(`customisation '${key}': fallback is only valid for the value kind (keyword-set uses the in-file terms as fallback; dictionary-subset uses the full public dictionary)`)
    }

    if (isDictionary) {
      if (d.kind === 'keyword-set') errs.push(`customisation '${key}': dictionaries support dictionary-subset and value kinds only`)
      if (d.kind === 'dictionary-subset' && 'target' in d) errs.push(`customisation '${key}': target is implicit on a dictionary file`)
      continue
    }

    if (d.kind === 'dictionary-subset') {
      const m = String(d.target ?? '').match(/^corroborative_evidence\.keyword_lists\/([a-z0-9-]+)$/)
      if (!m) { errs.push(`customisation '${key}': dictionary-subset target must be corroborative_evidence.keyword_lists/<slug>`); continue }
      if (!(doc.corroborative_evidence?.keyword_lists ?? []).includes(m[1])) errs.push(`customisation '${key}': pattern does not reference keyword_list '${m[1]}'`)
      else if (kwSlugs.size && !kwSlugs.has(m[1])) errs.push(`customisation '${key}': unknown keyword_list '${m[1]}'`)
    } else if (d.kind === 'keyword-set') {
      const target = String(d.target ?? '')
      if (target === 'corroborative_evidence.keywords') {
        if (!(doc.corroborative_evidence?.keywords ?? []).length) errs.push(`customisation '${key}': corroborative_evidence.keywords must carry fallback terms`)
      } else {
        const m = target.match(/^purview\.keywords\/([A-Za-z0-9_]+)$/)
        const group = m && (doc.purview?.keywords ?? []).find((k) => k.id === m[1])
        if (!m || !group) { errs.push(`customisation '${key}': keyword-set target '${target}' must be corroborative_evidence.keywords or purview.keywords/<existing-group-id> (checked: ${m ? m[1] : target})`); continue }
        if (!(group.groups ?? []).some((g) => (g.terms ?? []).length)) errs.push(`customisation '${key}': keyword-set group '${m[1]}' must carry in-file fallback terms`)
        // Load-bearing check: a positive (non-NOT) reference at >=75 with
        // required_for_enforcement false means the fictional fallback would
        // silently carry an enforce tier — force the author to pick a side.
        if (d.required_for_enforcement === false) {
          for (const tier of doc.purview?.pattern_tiers ?? []) {
            if ((tier.confidence_level ?? 0) < 75) continue
            for (const node of tier.matches ?? []) {
              const isNot = node?.min_matches === 0 && node?.max_matches === 0
              const carries = node?.ref === m[1] || (Array.isArray(node?.refs) && node.refs.includes(m[1]))
              if (carries && !isNot) errs.push(`customisation '${key}': group '${m[1]}' is load-bearing at tier ${tier.confidence_level} — set required_for_enforcement: true or remove it from the tier`)
            }
          }
        }
      }
    }
  }

  const siteTokens = tokensInPermittedSites(doc, isDictionary)
  for (const key of siteTokens) {
    const d = byKey.get(key)
    if (!d) errs.push(`token {{CUSTOMISE:${key}}} has no customisation declaration`)
    else if (d.kind !== 'value') errs.push(`token {{CUSTOMISE:${key}}} may only reference a value-kind declaration`)
  }
  for (const [key, d] of byKey) {
    if (d.kind === 'value' && !siteTokens.includes(key)) errs.push(`customisation '${key}': no {{CUSTOMISE:${key}}} token references it`)
  }

  // Stray-token gate: tokens anywhere in the document outside the permitted
  // keyword sites (descriptions, regexes, test cases, notes...) are errors.
  const total = (JSON.stringify(doc).match(/\{\{CUSTOMISE:/g) ?? []).length
  if (total !== siteTokens.length) errs.push(`{{CUSTOMISE:*}} token found outside permitted keyword locations (${total} in document, ${siteTokens.length} in permitted sites)`)

  return errs
}

export function resolveCustomisationFallbacks(doc, isDictionary = false) {
  const decls = Array.isArray(doc.customisation) ? doc.customisation : []
  const values = new Map(decls.filter((d) => d?.kind === 'value' && typeof d.fallback === 'string').map((d) => [d.key, d.fallback]))
  const out = JSON.parse(JSON.stringify(doc))
  if (!values.size) return out
  const sub = (s) => String(s).replace(TOKEN_RE, (whole, key) => (values.has(key) ? values.get(key) : whole))
  const mapTerm = (t) => (typeof t === 'string' ? sub(t) : { ...t, text: sub(t?.text ?? '') })
  if (isDictionary) {
    if (Array.isArray(out.keywords)) out.keywords = out.keywords.map(mapTerm)
    return out
  }
  if (Array.isArray(out.corroborative_evidence?.keywords)) out.corroborative_evidence.keywords = out.corroborative_evidence.keywords.map((k) => sub(k))
  for (const kw of out.purview?.keywords ?? []) for (const g of kw.groups ?? []) if (Array.isArray(g.terms)) g.terms = g.terms.map(mapTerm)
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/lib/__tests__/customisation.test.mjs`
Expected: `17 passed, 0 failed`

- [ ] **Step 5: Add the npm script and run it**

In `package.json` scripts, after `"test:purview-banned"` add:
```json
"test:customisation": "node scripts/lib/__tests__/customisation.test.mjs",
```
Run: `npm run test:customisation` → same pass output.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/customisation.mjs scripts/lib/__tests__/customisation.test.mjs package.json
git commit -m "feat(tooling): customisation-placeholder core — validate + fallback-resolve ({{CUSTOMISE:key}} schema)"
```

---

### Task 2: ci-check integration

**Files:**
- Modify: `scripts/ci-check.mjs` (pattern main loop ~line 50s; dictionary loop — locate the loop that iterates `data/keywords/*.yaml` building `kwSlugs`)

**Interfaces:**
- Consumes: `validateCustomisations` from Task 1.
- Produces: ci-check ERROR lines of the form `<slug>: customisation '<key>': ...` — Task 5/6 rely on ci-check catching malformed conversions.

- [ ] **Step 1: Wire pattern-side validation**

Add to the imports at the top of `scripts/ci-check.mjs`:
```js
import { validateCustomisations } from './lib/customisation.mjs'
```
In the per-pattern loop, after the `deprecation_reason` checks (~line 58), add:
```js
  for (const msg of validateCustomisations(p, { kwSlugs, isDictionary: false })) errors.push(`${p.slug ?? f}: ${msg}`)
```
IMPORTANT ordering check: `kwSlugs` must already be populated when the pattern loop runs. Read the file top-down first; if dictionaries are loaded AFTER patterns, collect pattern docs and run the customisation pass after `kwSlugs` is built instead (a second small loop `for (const [slug, doc] of collectedPatterns) ...` is acceptable — keep it right after the kwSlugs build).

- [ ] **Step 2: Wire dictionary-side validation**

In the loop that reads `data/keywords/*.yaml`, add for each parsed dictionary `d` (filename `kf`):
```js
  for (const msg of validateCustomisations(d, { isDictionary: true })) errors.push(`${d.slug ?? kf}: ${msg}`)
```

- [ ] **Step 3: Verify no regression on the corpus**

Run: `npm run check`
Expected: `CI check: 0 error(s), 440 warning(s)` (identical counts — no pattern opts in yet).

- [ ] **Step 4: Prove it fires (throwaway fixture)**

```bash
cat > data/patterns/zz-cust-fixture.yaml <<'EOF'
schema: testpattern/v1
name: Fixture
slug: zz-cust-fixture
version: 1.0.0
type: regex
pattern_class: concept
engine: boost_regex
description: fixture
operation: fixture
pattern: \bfixture\b
confidence: low
corroborative_evidence:
  keywords:
    - "{{CUSTOMISE:undeclared}}"
EOF
npm run check ; rm data/patterns/zz-cust-fixture.yaml
```
Expected: check output contains `zz-cust-fixture: token {{CUSTOMISE:undeclared}} has no customisation declaration` (plus unrelated missing-field errors for the minimal fixture — fine). Fixture is deleted afterwards; re-run `npm run check` → back to 0 errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci-check.mjs
git commit -m "feat(ci): validate customisation declarations and {{CUSTOMISE:*}} tokens in patterns and dictionaries"
```

---

### Task 3: compile.js fallback resolution + byte gate

**Files:**
- Modify: `scripts/compile.js` — (a) dictionary load into `keywordMap`, (b) per-pattern processing before the `corroborative_evidence.keyword_lists` resolution (~line 144), (c) the `writeFileSync(OUT_FILE, ...)` at ~line 249.

**Interfaces:**
- Consumes: `resolveCustomisationFallbacks`, `TOKEN_LITERAL` from Task 1.
- Produces: compiled `patterns.json` in which (1) every pattern object that declared `customisation` still carries the block verbatim, (2) no `{{CUSTOMISE:` literal exists anywhere. Plan B's deploy tooling reads exactly this metadata shape.

- [ ] **Step 1: Resolve dictionaries at load**

Where dictionary YAMLs are parsed into `keywordMap`, wrap the parsed doc:
```js
import { resolveCustomisationFallbacks, TOKEN_LITERAL } from './lib/customisation.mjs'
// at the dictionary load site, replace direct use of the parsed doc:
const resolvedDict = resolveCustomisationFallbacks(parsedDict, true)
```
and build `keywordMap` from `resolvedDict.keywords`. (Locate by searching `keywordMap.set` — keep the existing term-object handling untouched.)

- [ ] **Step 2: Resolve patterns before reference resolution**

In the per-pattern processing, immediately after the YAML is loaded into `data` and before the deprecation handling / keyword_lists resolution:
```js
  data = resolveCustomisationFallbacks(data, false)
```
(If `data` is `const`, change to `let`.)

- [ ] **Step 3: Byte gate on output**

Replace `writeFileSync(OUT_FILE, JSON.stringify(output, null, 2))` with:
```js
const outString = JSON.stringify(output, null, 2)
if (outString.includes(TOKEN_LITERAL)) {
  console.error('FATAL: unresolved {{CUSTOMISE:*}} token in compiled output — declaration/fallback mismatch upstream')
  process.exit(1)
}
writeFileSync(OUT_FILE, outString)
```

- [ ] **Step 4: Verify corpus is byte-identical**

```bash
npm run compile
git diff --stat patterns.json
```
Expected: no diff (no pattern opts in yet, resolution is identity). If patterns.json shows a diff, STOP — the resolver mutated something it shouldn't; fix before proceeding.

- [ ] **Step 5: Commit**

```bash
git add scripts/compile.js
git commit -m "feat(build): resolve customisation fallbacks at compile; fail on unresolved {{CUSTOMISE:*}} in output"
```

---

### Task 4: self-test harness resolution

**Files:**
- Modify: `scripts/verify-pattern-testcases.mjs` — pattern load (~line 352 `p = yaml.load(readFileSync(file, 'utf-8'))`) and dictionary term load (~line 114).

**Interfaces:**
- Consumes: `resolveCustomisationFallbacks` from Task 1.
- Produces: harness evaluates the fallback-resolved form — test cases in Tasks 5/6 are written against fallback values.

- [ ] **Step 1: Wire resolution**

```js
import { resolveCustomisationFallbacks } from './lib/customisation.mjs'
```
At ~line 352, after the load: `p = resolveCustomisationFallbacks(p, false)`.
At ~line 114 (dictionary terms), load the full doc, resolve, then take `.keywords`:
```js
    try { const d = yaml.load(readFileSync(file, 'utf-8')); terms = resolveCustomisationFallbacks(d ?? {}, true).keywords ?? [] } catch { terms = null }
```

- [ ] **Step 2: Verify no regression**

Run: `node scripts/verify-pattern-testcases.mjs --all 2>&1 | tail -3`
Expected: same result as `main` (all pass; warning count unchanged).

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-pattern-testcases.mjs
git commit -m "feat(harness): evaluate test cases against customisation-fallback-resolved patterns"
```

---

### Task 5: first conversion — DUID dictionary-subset declarations

**Files:**
- Modify: `data/keywords/au-nem-duids.yaml`, `data/patterns/au-nem-duid.yaml`, `data/patterns/au-nem-bid-file.yaml`

**Interfaces:**
- Consumes: Tasks 1–4 live.
- Produces: the first real `customisation` metadata in compiled patterns.json (`au-nem-duid`, `au-nem-bid-file` — key `participant-duids`); Plan B tests read these slugs/keys as its live example.

- [ ] **Step 1: Dictionary declaration**

In `data/keywords/au-nem-duids.yaml`, after `data_categories:` and before `keywords:` add:
```yaml
customisation:
  - key: participant-duids
    kind: dictionary-subset
    note: >-
      Filter this full-market public list to the DUIDs registered to your
      organisation (AEMO NEM Registration and Exemption List, participant
      column) and supply the subset as a deployment overlay. The full list is
      generic market context; a participant subset makes a match
      organisation-specific evidence.
    required_for_enforcement: false
```

- [ ] **Step 2: Pattern declarations**

In `data/patterns/au-nem-duid.yaml` add at top level (after `corroborative_evidence:` block):
```yaml
customisation:
  - key: participant-duids
    kind: dictionary-subset
    target: corroborative_evidence.keyword_lists/au-nem-duids
    note: >-
      For participant-specific precision, replace the full-market DUID
      dictionary with the subset registered to your organisation (deployment
      overlay). Without the overlay this pattern stays a generic market-context
      discovery marker.
    required_for_enforcement: false
```
Same block in `data/patterns/au-nem-bid-file.yaml` with the note's second sentence adjusted: `Without the overlay the bid-structure arms still detect; the DUID corroboration is market-wide rather than organisation-specific.`
Bump each file's `version` patch (+changelog entry, `updated: 2026-07-25`):
```yaml
  - version: <bumped>
    date: 2026-07-25
    note: Declare participant-duids dictionary-subset customisation (deployment overlays supply a participant-filtered DUID subset).
```
(au-nem-duid is at 1.0.1 → 1.0.2; check the other two files' current versions in-file. The dictionary file has no version field — no bump there.)

- [ ] **Step 3: Full gates + compiled metadata check**

```bash
npm run check && npm run compile && npm run check:quality
node -e "const p=JSON.parse(require('fs').readFileSync('patterns.json','utf8')); const pat=(p.patterns??p).find(x=>x.slug==='au-nem-duid'); if(!pat.customisation||pat.customisation[0].key!=='participant-duids'){console.error('metadata missing');process.exit(1)}; console.log('metadata OK')"
node scripts/verify-pattern-testcases.mjs au-nem-duid au-nem-bid-file
```
Expected: 0 errors, quality gate PASSED, `metadata OK`, all test cases pass.

- [ ] **Step 4: Commit**

```bash
git add data/keywords/au-nem-duids.yaml data/patterns/au-nem-duid.yaml data/patterns/au-nem-bid-file.yaml patterns.json
git commit -m "feat(catalog): declare participant-duids dictionary-subset customisation on the NEM DUID assets"
```

---

### Task 6: demonstrator pattern — sensitive-shaped skeleton

**Files:**
- Create: `data/patterns/global-project-codename-reference.yaml`
- Modify: `data/package-tags.json`, `data/classifier-ids.json` (via script)

**Interfaces:**
- Consumes: whole mechanism.
- Produces: the `required_for_enforcement: true` example Plan B's refusal-path test uses (slug `global-project-codename-reference`, key `project-codenames`).

- [ ] **Step 1: Author the pattern**

```yaml
schema: testpattern/v1
name: Internal Project Codename Reference
slug: global-project-codename-reference
version: 1.0.0
type: regex
pattern_class: concept
engine: boost_regex
description: >-
  Detects references to internal project or initiative codenames in the
  "Project <CODENAME>" / "Operation <CODENAME>" labelling style. The public
  form of this pattern carries fictional example codenames only - it is a
  customisation skeleton: deployments substitute their organisation's live
  codename list via the declared customisation, which is what gives the
  pattern real detection value.
operation: >-
  The regex matches the generic labelling shape (project/operation/codename
  followed by an upper-case token). Precision comes entirely from the
  corroborative codename list, which is declared as a required keyword-set
  customisation - the in-file terms are fictional placeholders and enforcing
  deployments must replace them.
pattern: >-
  \b(?:project|operation|initiative|codename)\s+[A-Z][A-Z0-9]{3,14}\b
confidence: low
confidence_justification: >-
  Low confidence by design: the labelling shape alone matches ordinary project
  management prose. Real precision requires the organisation-specific codename
  list supplied through the declared customisation; until then the pattern is
  a discovery-only skeleton.
jurisdictions:
  - global
regulations: []
frameworks:
  - ISO 27001
data_categories:
  - business
  - intellectual-property
corroborative_evidence:
  keywords:
    - PROJECT CORALSTONE
    - PROJECT SEAHORSE
    - OPERATION WATTLEBIRD
  proximity: 300
customisation:
  - key: project-codenames
    kind: keyword-set
    target: corroborative_evidence.keywords
    note: >-
      Replace the fictional example codenames with your organisation's live
      project/initiative codenames (deployment overlay). The in-file terms are
      placeholders; enforcement without substitution is refused by compliant
      deployment tooling.
    required_for_enforcement: true
test_cases:
  should_match:
    - value: 'the Project CORALSTONE steering pack is embargoed until the board meeting'
      description: Codename labelling shape with an upper-case token
    - value: 'access to Operation WATTLEBIRD materials is restricted to cleared staff'
      description: Operation-style codename reference
  should_not_match:
    - value: 'the project deadline moved and the operation continues normally'
      description: Ordinary prose without an upper-case codename token
    - value: 'Project managers met to discuss initiative funding'
      description: Title-case role wording, not a codename
false_positives:
  - description: Legitimate public project names and all-caps acronyms following
      the word project (e.g. project HVAC scope).
    mitigation: Keep the pattern discovery-only until the codename customisation
      is applied; the organisation-specific list is the precision mechanism.
exports:
  - yaml
scope: wide
risk_rating: 5
risk_description: >-
  Internal codenames mark an organisation's most sensitive initiatives -
  references travelling outside controlled channels reveal that the initiative
  exists and often its context. Severity is organisation-specific, which is
  why the codename list itself is customisation-supplied.
sensitivity_labels:
  - SENSITIVE
references:
  - "Common M&A/initiative codename handling practice (public security guidance)"
created: 2026-07-25
updated: 2026-07-25
changelog:
  - version: 1.0.0
    date: 2026-07-25
    note: Initial customisation-skeleton demonstrator (keyword-set, required_for_enforcement).
author: Compl8 (draft)
source: compl8-customisation-v1
license: CC-BY-4.0
```

- [ ] **Step 2: IDs + package tags**

```bash
node scripts/sync-classifier-ids.mjs
```
Add to `data/package-tags.json` `patterns` map:
```json
"global-project-codename-reference": {
  "primary_component": "business-records",
  "components": ["business-records"],
  "component_tier": "large",
  "deployment_priority": ["expanded"],
  "sectors": ["generic-enterprise"],
  "addons": [],
  "label_domains": ["business"]
}
```

- [ ] **Step 3: Full gates**

```bash
node scripts/verify-pattern-testcases.mjs global-project-codename-reference
npm run check && npm run compile && npm run check:quality
```
Expected: all pass, 0 errors. Confirm `grep -c 'CUSTOMISE' patterns.json` returns a count only from `customisation` metadata blocks (the literal `{{CUSTOMISE:` must be absent: `grep -c '{{CUSTOMISE:' patterns.json` → 0).

- [ ] **Step 4: Commit**

```bash
git add data/patterns/global-project-codename-reference.yaml data/package-tags.json data/classifier-ids.json patterns.json
git commit -m "feat(catalog): project-codename customisation skeleton — first required_for_enforcement keyword-set demonstrator"
```

---

### Task 7: final verification + merge

- [ ] **Step 1: Full sweep**

```bash
npm run test:customisation && npm run test:purview-banned && npm run test:remediation
npm run check && npm run compile && npm run check:quality
node scripts/verify-pattern-testcases.mjs --all 2>&1 | tail -3
git status --short
```
Expected: every gate green, tree clean apart from intended changes, ci-check 0 errors with warning count ≤ baseline (440).

- [ ] **Step 2: Confidentiality sweep (public repo standing rule)**

The engagement-sensitive term list lives OUTSIDE the repo tree (it must never
be committed — it IS the thing the sweep keeps out). Maintain it at
`.superpowers/sdd/confidentiality-terms.txt` (that directory is gitignored):

```bash
git diff main...HEAD | grep -i -f .superpowers/sdd/confidentiality-terms.txt ; echo "exit=$?"
```
Expected: `exit=1` (no hits). If the terms file is missing, recreate it from
the private project memory before running the sweep.

- [ ] **Step 3: Merge + push (fast-forward onto main)**

```bash
git checkout main && git merge --ff-only feat/customisation-placeholders && git push origin main
```
Then watch the `Compile patterns and publish to KV` Action to success.
