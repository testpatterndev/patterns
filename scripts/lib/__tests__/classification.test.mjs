import assert from 'node:assert/strict'
import { validateClassification, validateReferences, validateRegulations, tierForLabel, idcfForLabels, validateIdcf, IDCF_LEVELS, IDCF_MARKERS } from '../classification.mjs'

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

// IDCF derivation (docs/IDCF-CROSSWALK.md)
const idcf = (labels) => idcfForLabels(labels)
t('idcf: each qgiscf_dlm family', () => {
  assert.deepEqual(idcf({ qgiscf_dlm: 'OFFICIAL' }), { idcf: 'DSL-2', idcf_marker: undefined })
  assert.deepEqual(idcf({ qgiscf_dlm: 'SENSITIVE InfoTech' }), { idcf: 'DSL-3', idcf_marker: undefined })
  assert.deepEqual(idcf({ qgiscf_dlm: 'SENSITIVE' }), { idcf: 'DSL-3', idcf_marker: undefined })
  assert.deepEqual(idcf({ qgiscf_dlm: 'Marking Sensitive' }), { idcf: 'DSL-3', idcf_marker: undefined })
  assert.deepEqual(idcf({ qgiscf_dlm: 'PROTECTED Government' }), { idcf: 'DSL-4', idcf_marker: undefined })
  assert.deepEqual(idcf({ qgiscf_dlm: 'Marking Protected' }), { idcf: 'DSL-4', idcf_marker: undefined })
  assert.deepEqual(idcf({ qgiscf_dlm: 'N/A' }), { idcf: 'N/A', idcf_marker: undefined })
  assert.deepEqual(idcf({ qgiscf_dlm: 'Marking PSPF' }), { idcf: 'N/A', idcf_marker: undefined })
})
t('idcf: markers from the DLM suffix at any level', () => {
  assert.equal(idcf({ qgiscf_dlm: 'SENSITIVE Personal-Privacy' }).idcf_marker, 'Personal Privacy')
  assert.equal(idcf({ qgiscf_dlm: 'PROTECTED Personal-Privacy' }).idcf_marker, 'Personal Privacy')
  assert.equal(idcf({ qgiscf_dlm: 'SENSITIVE Legal' }).idcf_marker, 'Legal Privilege')
  assert.equal(idcf({ qgiscf_dlm: 'PROTECTED Legal' }).idcf_marker, 'Legal Privilege')
  assert.equal(idcf({ qgiscf_dlm: 'SENSITIVE Commercial-in-Confidence' }).idcf_marker, 'Confidential')
  for (const d of ['SENSITIVE Financial', 'SENSITIVE InfoTech', 'PROTECTED Cabinet-in-Confidence', 'SENSITIVE Electoral Roll', 'OFFICIAL', 'N/A'])
    assert.equal(idcf({ qgiscf_dlm: d }).idcf_marker, undefined, d)
})
t('idcf: falls back to qgiscf then pspf only when the DLM is absent', () => {
  assert.equal(idcf({ qgiscf: 'OFFICIAL', pspf: 'PROTECTED' }).idcf, 'DSL-2')
  assert.equal(idcf({ qgiscf: 'SENSITIVE' }).idcf, 'DSL-3')
  assert.equal(idcf({ qgiscf: 'PROTECTED' }).idcf, 'DSL-4')
  assert.equal(idcf({ qgiscf: 'N/A' }).idcf, 'N/A')
  assert.equal(idcf({ pspf: 'OFFICIAL' }).idcf, 'DSL-2')
  assert.equal(idcf({ pspf: 'OFFICIAL: Sensitive' }).idcf, 'DSL-3')
  assert.equal(idcf({ pspf: 'PROTECTED' }).idcf, 'DSL-4')
  assert.equal(idcf({ pspf: 'N/A' }).idcf, 'N/A')
  assert.equal(idcf({ qgiscf: 'SENSITIVE' }).idcf_marker, undefined, 'no marker without a DLM')
  assert.equal(idcf({ qgiscf_dlm: 'Marking Official', qgiscf: 'OFFICIAL' }).idcf, 'DSL-2', 'Marking Official is the OFFICIAL band, like tierForLabel')
})
t('idcf: nothing to derive from', () => {
  assert.deepEqual(idcf({}), { idcf: null, idcf_marker: undefined })
  assert.deepEqual(idcf(undefined), { idcf: null, idcf_marker: undefined })
  assert.ok(IDCF_LEVELS.includes('N/A') && IDCF_MARKERS.length === 3)
})
t('validateIdcf: stored values must equal the derivation', () => {
  const p = good(); p.sensitivity_labels = { qgiscf_dlm: 'SENSITIVE Personal-Privacy', idcf: 'DSL-3', idcf_marker: 'Personal Privacy' }
  assert.deepEqual(validateIdcf(p), [])
  p.sensitivity_labels.idcf = 'DSL-2'
  assert.ok(validateIdcf(p).some(m => m.includes("idcf 'DSL-2' does not match qgiscf_dlm 'SENSITIVE Personal-Privacy' (expected 'DSL-3')") && m.includes('backfill-idcf-labels')))
  p.sensitivity_labels = { qgiscf_dlm: 'OFFICIAL' }
  assert.ok(validateIdcf(p).some(m => m.includes("idcf is missing qgiscf_dlm 'OFFICIAL' (expected 'DSL-2')")))
  assert.equal(validateIdcf(p).length, 1, 'no marker complaint when none is derived and none stored')
  p.sensitivity_labels = { qgiscf_dlm: 'OFFICIAL', idcf: 'DSL-2', idcf_marker: 'Confidential' }
  assert.ok(validateIdcf(p).some(m => m.includes("idcf_marker 'Confidential' does not match qgiscf_dlm 'OFFICIAL' (expected none)")))
  p.sensitivity_labels = { qgiscf_dlm: 'SENSITIVE Legal', idcf: 'DSL-3' }
  assert.ok(validateIdcf(p).some(m => m.includes("idcf_marker is missing qgiscf_dlm 'SENSITIVE Legal' (expected 'Legal Privilege')")))
  assert.deepEqual(validateIdcf(good()), [], 'no labels at all: nothing to check')
})

console.log(`${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
