import assert from 'node:assert/strict'
import { validateClassification, validateReferences, validateRegulations, tierForLabel } from '../classification.mjs'

let passed = 0, failed = 0
function t(name, fn) { try { fn(); passed++ } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`) } }

const RATIONALE = 'Risk 8 aligns with PSPF OFFICIAL: Sensitive, QGISCF SENSITIVE and SENSITIVE InfoTech because a confirmed match exposes a live credential. PROTECTED is not met without national-security consequence.'
const good = () => ({
  slug: 'x', risk_rating: 8,
  classification: {
    tier: 'Medium', rationale: RATIONALE,
    generic: { classification: 'Medium', dlm: 'Medium InfoTech', rationale: 'Medium InfoTech handling for a single live credential.' },
  },
  references: [{ title: 'Criminal Code Act 1995 (Cth)', url: 'https://www.legislation.gov.au/C2004A04868/latest/text' }],
})

t('complete block passes', () => assert.deepEqual(validateClassification(good()), []))
t('missing block fails', () => { const p = good(); delete p.classification; assert.equal(validateClassification(p).length, 1) })
t('bad tier value fails', () => { const p = good(); p.classification.tier = 'Severe'; assert.ok(validateClassification(p).some(m => m.includes('tier must be'))) })
t('tier must equal generic classification', () => {
  const p = good(); p.classification.tier = 'High'
  assert.ok(validateClassification(p).some(m => m.includes("must equal the generic classification ('Medium')")))
})
t('Alert pairs with N/A', () => {
  const p = good(); p.classification.tier = 'Alert'; p.classification.generic.classification = 'N/A'; p.classification.generic.dlm = 'N/A'
  assert.deepEqual(validateClassification(p), [])
})
t('short rationale fails', () => { const p = good(); p.classification.rationale = 'Medium.'; assert.ok(validateClassification(p).some(m => m.includes('>= 80'))) })
t('missing generic parts fail', () => {
  const p = good(); p.classification.generic = { classification: 'Medium' }
  assert.equal(validateClassification(p).length, 2)
})
t('rationale opening with another risk is stale', () => {
  const p = good(); p.risk_rating = 7
  assert.ok(validateClassification(p).some(m => m.includes('opens with risk 8')))
})
t('a later mention of a different risk is fine', () => {
  const p = good(); p.classification.rationale = RATIONALE + ' The next higher risk 9 threshold is not met.'
  assert.deepEqual(validateClassification(p), [])
})
t('references pass', () => assert.deepEqual(validateReferences(good()), []))
t('no references fails', () => assert.equal(validateReferences({ references: [] }).length, 1))
t('bare URL string fails', () => assert.ok(validateReferences({ references: ['https://x.example'] })[0].includes('{title, url}')))
t('untitled or non-http reference fails', () => {
  assert.equal(validateReferences({ references: [{ url: 'https://x.example' }, { title: 'T', url: 'ftp://x' }] }).length, 2)
})

t('regulations required', () => { assert.equal(validateRegulations({ regulations: [] }).length, 1); assert.deepEqual(validateRegulations({ regulations: ['Privacy Act 1988 (Cth)'] }), []) })

t('tier must follow the label', () => {
  const p = good(); p.sensitivity_labels = { qgiscf_dlm: 'PROTECTED Government' }
  assert.ok(validateClassification(p).some(m => m.includes("does not match qgiscf_dlm 'PROTECTED Government' (expected 'High')")))
  p.classification.tier = 'High'; p.classification.generic.classification = 'High'
  assert.deepEqual(validateClassification(p), [])
})
t('tierForLabel', () => {
  assert.equal(tierForLabel('OFFICIAL'), 'Low'); assert.equal(tierForLabel('SENSITIVE InfoTech'), 'Medium')
  assert.equal(tierForLabel('Marking Protected'), 'High'); assert.equal(tierForLabel('N/A'), 'Alert'); assert.equal(tierForLabel(''), null)
})

console.log(`${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
