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
