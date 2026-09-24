import assert from 'node:assert/strict'
import { validateIdentifier, validateIdentifierFormatEntry, renderIdentifierDocs, IDENTIFIER_SCHEMA } from '../identifiers.mjs'
import { validateCustomisations } from '../customisation.mjs'

let passed = 0, failed = 0
function t(name, fn) { try { fn(); passed++ } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`) } }

const FB = String.raw`(?i)\bWIDGET\s+(?:no\.?|number)\s*[:#]?\s*[A-Z0-9][A-Z0-9/-]{3,20}\b`
const ID = {
  schema: IDENTIFIER_SCHEMA, key: 'widget-number', name: 'Widget number', issuer: 'Widget Registry (fictional)',
  description: 'Fictional identifier used only by unit tests to exercise the identifier-format schema.',
  appears_in: ['Widget registers'], labels: ['Widget number'],
  public_format: { status: 'unpublished', notes: 'Fictional: no public format exists for widgets.' },
  fallback: { pattern: FB, precision: 'medium', rationale: 'The widget-specific label makes a labelled value a reasonable signal without a format.', samples: ['Widget number: W12345'] },
  replacement: {
    customer_supplies: ['Format description'], steps: ['Write the regex', 'Apply the overlay'], validation: ['Samples match'],
    example_overlay: { pattern: String.raw`(?i)\bWIDGET\s+number\s*[:#]?\s*W\d{5}\b`, samples: ['Widget number: W12345', 'Widget number W00001', 'widget number: W99999'] },
  },
  sensitivity: 'Fictional sensitivity note for tests.',
}
const REG = new Map([['widget-number', ID]])
const DOC = (target = 'Regex_ref', pattern = FB) => ({
  slug: 'x',
  purview: {
    regexes: [{ id: 'Regex_primary', pattern: 'widget' }, { id: 'Regex_ref', pattern }],
    pattern_tiers: [
      { confidence_level: 85, id_match: 'Regex_primary', matches: [{ ref: 'Regex_ref' }] },
      { confidence_level: 75, id_match: 'Regex_primary', matches: [{ type: 'any', min_matches: 0, max_matches: 0, refs: ['Regex_ref'] }] },
      { confidence_level: 65, discovery_only: true, id_match: 'Regex_primary', matches: [] },
    ],
  },
  customisation: [{ key: 'widget-number', kind: 'identifier-format', identifier: 'widget-number', target: `purview.regexes/${target}`, mode: 'replace', affects_tiers: [85], required_for_enforcement: false, note: 'Replace the documented labelled fallback with the customer widget format.' }],
})

t('complete identifier definition validates', () => assert.deepEqual(validateIdentifier({ ...ID, __file: 'widget-number.yaml' }), []))
t('missing replacement steps is an error', () => {
  const errs = validateIdentifier({ ...ID, replacement: { ...ID.replacement, steps: [] } })
  assert.ok(errs.some((e) => e.includes('replacement.steps')))
})
t('short description is an error', () => assert.ok(validateIdentifier({ ...ID, description: 'too short' }).some((e) => e.includes('description'))))
t('verified format needs pattern and source', () => {
  const errs = validateIdentifier({ ...ID, public_format: { status: 'verified', notes: 'Claimed verified without evidence here.' } })
  assert.ok(errs.some((e) => e.includes('public_format.pattern')) && errs.some((e) => e.includes('public_format.source')))
})
t('fallback sample must match fallback pattern', () => {
  const errs = validateIdentifier({ ...ID, fallback: { ...ID.fallback, samples: ['Gadget number: 12345'] } })
  assert.ok(errs.some((e) => e.includes('fallback.samples')))
})
t('example overlay needs three matching samples', () => {
  const errs = validateIdentifier({ ...ID, replacement: { ...ID.replacement, example_overlay: { pattern: ID.replacement.example_overlay.pattern, samples: ['Widget number: W12345', 'nope'] } } })
  assert.ok(errs.some((e) => e.includes('at least 3')) && errs.some((e) => e.includes('does not match')))
})
t('Purview-banned fallback is an error', () => {
  const errs = validateIdentifier({ ...ID, fallback: { ...ID.fallback, pattern: String.raw`^WIDGET.*` } })
  assert.ok(errs.some((e) => e.includes('Purview-banned')))
})
t('file name must match key', () => assert.ok(validateIdentifier({ ...ID, __file: 'other.yaml' }).some((e) => e.includes('file name'))))

t('valid identifier-format entry passes', () => assert.deepEqual(validateCustomisations(DOC(), { identifiers: REG }), []))
t('unknown identifier is an error', () => {
  const d = DOC(); d.customisation[0].identifier = 'nope'
  assert.ok(validateCustomisations(d, { identifiers: REG }).some((e) => e.includes("unknown identifier 'nope'")))
})
t('target must exist', () => assert.ok(validateCustomisations(DOC('Regex_missing'), { identifiers: REG }).some((e) => e.includes('target must be'))))
t('affects_tiers must equal the tiers that use the target (NOT-groups excluded)', () => {
  const d = DOC(); d.customisation[0].affects_tiers = [75, 85]
  assert.ok(validateCustomisations(d, { identifiers: REG }).some((e) => e.includes('affects_tiers')))
})
t('fallback field is rejected', () => {
  const d = DOC(); d.customisation[0].fallback = 'x'
  assert.ok(validateCustomisations(d, { identifiers: REG }).some((e) => e.includes('no fallback field')))
})
t('unpublished identifier: replace-mode target must be the documented fallback when enforcement does not require customisation', () => {
  const d = DOC('Regex_ref', String.raw`\bWID-\d{4}-\d{5}\b`)
  assert.ok(validateCustomisations(d, { identifiers: REG }).some((e) => e.includes('differs from the documented fallback')))
  d.customisation[0].required_for_enforcement = true
  assert.ok(!validateCustomisations(d, { identifiers: REG }).some((e) => e.includes('differs from the documented fallback')))
})
t('identifier-format rejected on dictionaries', () => {
  const errs = validateCustomisations({ slug: 'd', keywords: ['a'], customisation: [{ key: 'widget-number', kind: 'identifier-format', note: 'Replace the documented labelled fallback with the customer widget format.', required_for_enforcement: false }] }, { isDictionary: true })
  assert.ok(errs.some((e) => e.includes('only valid on patterns')))
})
t('rendered docs include replacement steps and usage', () => {
  const md = renderIdentifierDocs(REG, new Map([['widget-number', ['x']]]))
  assert.ok(md.includes('## widget-number') && md.includes('**How to replace:**') && md.includes('1. Write the regex') && md.includes('`x`'))
})

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
