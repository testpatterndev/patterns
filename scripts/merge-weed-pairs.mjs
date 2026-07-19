#!/usr/bin/env node
/**
 * Merge near-duplicate SITs from the QG/CI weed shortlist.
 * Survivor keeps (and expands) detection metadata; loser is deprecated.
 */
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

const PATTERN_DIR = path.join('data', 'patterns')
const TODAY = '2026-07-19'

const MERGES = [
  {
    id: 'qg-1',
    keep: 'au-qld-mental-health-assessment',
    drop: 'mental-health-involuntary-treatment-order',
    name: 'QLD Mental Health Assessment and Involuntary Treatment',
    description:
      'Detects Queensland mental health assessment and involuntary treatment records, including psychiatric evaluations, Mental Health Act 2016 (Qld) involuntary treatment orders (ITOs), treatment authority documents, and Mental Health Review Tribunal decisions affecting compulsory treatment.',
    risk_rating: 9,
    risk_note:
      'Compulsory mental-health treatment and assessment records identify a person under statutory care and can expose diagnosis, order terms, and tribunal outcomes. Risk 9 OFFICIAL:Sensitive is appropriate for involuntary treatment substance; generic policy discussion remains out of scope.',
  },
  {
    id: 'qg-4',
    keep: 'major-litigation-strategy-document',
    drop: 'au-top500-165-litigation-strategy-documents',
    alsoDeprecate: ['global-top500-165-litigation-strategy-documents'],
    name: 'Litigation Strategy Document',
    description:
      'Detects privileged litigation strategy documents and related case strategy materials, including high-exposure matters (significant financial exposure or systemic policy impact), defence strategy content, prospects assessments, and settlement posture. Covers both formal major-matter strategy packs and general litigation strategy document references in Australian legal contexts.',
    risk_rating: 8,
    risk_note:
      'Litigation strategy materials reveal privileged case theory, exposure estimates, and settlement posture. Risk 8 OFFICIAL:Sensitive remains correct for privileged strategy content; public case commentary is excluded by negatives.',
  },
  {
    id: 'qg-5',
    keep: 'au-qld-special-needs-education-plan',
    drop: 'au-top500-345-special-education-plans',
    alsoDeprecate: ['global-top500-345-special-education-plans'],
    name: 'Special Education and Special Needs Learning Plans',
    description:
      "Detects special education and special needs learning plans, including Queensland individual education / special needs plans with children's disability and learning-support details, goals, adjustments, and review dates, and equivalent special education plan records in Australian education contexts.",
    risk_rating: 8,
    risk_note:
      "Special education plans combine a child's identity with disability and support arrangements. Risk 8 OFFICIAL:Sensitive remains appropriate for child education + disability substance.",
  },
  {
    id: 'qg-6-bitcoin',
    keep: 'global-bitcoin-address-bech32',
    drop: 'global-bitcoin-address-legacy',
    special: 'bitcoin-union',
    name: 'Bitcoin Address',
    description:
      'Detects Bitcoin payment address candidates in both Bech32 (bc1…) and legacy Base58 (1…/3…) shapes. Checksums are not validated (Purview custom SITs lack Bech32/Base58Check functions), so matches are structural candidates and require Bitcoin/transfer context at enforce tiers.',
    risk_rating: 5,
    risk_note:
      'A wallet address can link transactions and counterparties when combined with exchange or payment context. Isolated shape matches are common false positives, so risk stays 5 OFFICIAL with medium confidence and context gates.',
  },
  {
    id: 'qg-7',
    keep: 'au-birth-date-indicator',
    drop: 'global-top500-003-date-of-birth',
    name: 'Date of Birth',
    description:
      'Detects date-of-birth references across common date formats (numeric slash/dot/hyphen, written month, ISO) when birth-record labels or personal-record context are present. Covers Australian and global document styles; business dates (invoice, due, expiry) and template samples are suppressed.',
    risk_rating: 3,
    risk_note:
      'A birth date alone is low-harm correlating PII and is shared by many people. Risk 3 OFFICIAL remains correct; elevation requires a fuller identity profile or linked sensitive domain.',
    jurisdictions: ['au', 'global'],
  },
  {
    id: 'qg-10',
    keep: 'au-top500-079-workplace-investigation-files',
    drop: 'au-top500-167-internal-investigation-reports',
    alsoDeprecate: ['global-top500-167-internal-investigation-reports'],
    name: 'Workplace and Internal Investigation Records',
    description:
      'Detects workplace investigation files and internal investigation reports, including HR/conduct investigation case files, internal inquiry reports, findings, and related investigation record packages in Australian organisational contexts.',
    risk_rating: 8,
    risk_note:
      'Investigation files expose allegations, findings, and often staff identities. Risk 8 OFFICIAL:Sensitive remains appropriate for active or completed internal investigation substance.',
  },
  {
    id: 'qg-14',
    keep: 'global-ndc',
    drop: 'global-ndc-code',
    name: 'US NDC Drug Code',
    description:
      'Detects US National Drug Codes (NDC) identifying drug products, including common dashed labeler formats (4-4-2, 5-3-2, 5-4-2) and HIPAA 11-digit zero-padded forms. Structural NDC candidates used in pharmacy, claims, and clinical product coding.',
    risk_rating: 3,
    risk_note:
      'An NDC identifies a product, not a patient. Risk 3 OFFICIAL remains correct unless combined with an identified person and therapy context.',
  },
  {
    id: 'qg-15',
    keep: 'au-top500-163-legal-advice-memoranda',
    drop: 'solicitor-general-legal-advice',
    alsoDeprecate: ['global-top500-163-legal-advice-memoranda'],
    // keep global twin active? User merge is local pair - deprecating global twin of keep is wrong.
    // Only deprecate solicitor-general; do NOT deprecate global-top500-163 (that's the twin of keep)
    name: 'Legal Advice Memoranda',
    description:
      'Detects privileged legal advice memoranda and formal legal advice records in Australian contexts, including Solicitor-General advice on constitutional and high-stakes matters and other solicitor/Crown legal advice memoranda.',
    risk_rating: 8,
    risk_note:
      'Legal advice memoranda are privileged and can reveal litigation posture, constitutional risk, and Crown strategy. Risk 8 OFFICIAL:Sensitive remains appropriate.',
  },
  {
    id: 'ci-2',
    keep: 'forensic-evidence-chain-of-custody-active',
    drop: 'au-top500-299-evidence-chain-of-custody-records',
    alsoDeprecate: ['global-top500-299-evidence-chain-of-custody-records'],
    name: 'Forensic Evidence and Chain-of-Custody Records',
    description:
      'Detects forensic evidence and chain-of-custody records for active criminal or security investigations, including exhibit registers, DNA/fingerprint/ballistics results, custody handovers, and formal chain-of-custody documentation.',
    risk_rating: 8,
    risk_note:
      'Active forensic and custody records can identify investigations, exhibits, and suspects. Risk 8 OFFICIAL:Sensitive remains appropriate for operational evidence packages.',
  },
  {
    id: 'ci-6',
    keep: 'au-disaster-recovery-plan',
    drop: 'global-top500-303-disaster-recovery-runbooks',
    alsoDeprecate: ['au-top500-303-disaster-recovery-runbooks'],
    name: 'Disaster Recovery Plans and Runbooks',
    description:
      'Detects disaster recovery plans and operational recovery runbooks, including RTO/RPO targets, recovery procedures, failover steps, service restoration sequences, and infrastructure dependency detail used for continuity and incident recovery.',
    risk_rating: 8,
    risk_note:
      'DR plans and runbooks expose recovery sequencing and infrastructure dependencies useful to an attacker. Risk 8 OFFICIAL:Sensitive is appropriate for operational DR substance (elevated from runbook-only risk 7).',
  },
]

// Fix qg-15: don't deprecate global twin of survivor
MERGES.find(m => m.id === 'qg-15').alsoDeprecate = []

function loadPattern(slug) {
  const file = path.join(PATTERN_DIR, `${slug}.yaml`)
  const text = fs.readFileSync(file, 'utf8')
  return { file, text, data: yaml.load(text) }
}

function dumpPattern(data) {
  return yaml.dump(data, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: "'",
  })
}

function bumpVersion(version) {
  const parts = String(version || '1.0.0').split('.').map(n => Number(n) || 0)
  while (parts.length < 3) parts.push(0)
  parts[2] += 1
  return parts.join('.')
}

function unionTests(keepTests = {}, dropTests = {}) {
  const out = {
    should_match: [...(keepTests.should_match || [])],
    should_not_match: [...(keepTests.should_not_match || [])],
  }
  const seenMatch = new Set(out.should_match.map(t => String(t.value)))
  const seenNeg = new Set(out.should_not_match.map(t => String(t.value)))
  for (const t of dropTests.should_match || []) {
    const v = String(t.value)
    if (seenMatch.has(v)) continue
    // skip drop positives that were explicit negatives on survivor where possible
    seenMatch.add(v)
    out.should_match.push({
      ...t,
      description: `${t.description || 'Merged positive'} (merged from companion SIT)`,
    })
  }
  for (const t of dropTests.should_not_match || []) {
    const v = String(t.value)
    if (seenNeg.has(v) || seenMatch.has(v)) continue
    seenNeg.add(v)
    out.should_not_match.push({
      ...t,
      description: `${t.description || 'Merged negative'} (merged from companion SIT)`,
    })
  }
  return out
}

function addChangelog(data, description) {
  if (!Array.isArray(data.changelog)) data.changelog = []
  data.changelog.unshift({
    version: data.version,
    date: TODAY,
    description,
  })
}

function applyBitcoinUnion(keep, drop) {
  // Ensure both regexes exist and each enforce tier accepts either shape.
  const regexes = keep.purview?.regexes || []
  const dropRegexes = drop.purview?.regexes || []
  const have = new Set(regexes.map(r => r.id))
  for (const r of dropRegexes) {
    if (!have.has(r.id)) {
      regexes.push(r)
      have.add(r.id)
    }
  }
  // legacy id names
  if (!have.has('Regex_btc_legacy')) {
    regexes.push({ id: 'Regex_btc_legacy', pattern: String(drop.pattern || '\\b[13][a-km-zA-HJ-NP-Z1-9]{24,33}\\b') })
  }
  if (!have.has('Regex_bitcoin_address_bech32')) {
    regexes.push({ id: 'Regex_bitcoin_address_bech32', pattern: String(keep.pattern || '\\bbc1[a-z0-9]{25,39}\\b') })
  }
  keep.purview.regexes = regexes
  keep.pattern = '(?:\\bbc1[a-z0-9]{25,39}\\b|\\b[13][a-km-zA-HJ-NP-Z1-9]{24,33}\\b)'
  keep.case_sensitive = false

  // Merge useful keywords from drop
  const kw = keep.purview.keywords || []
  const kwIds = new Set(kw.map(k => k.id))
  for (const k of drop.purview?.keywords || []) {
    if (!kwIds.has(k.id)) {
      kw.push(k)
      kwIds.add(k.id)
    }
  }
  keep.purview.keywords = kw

  // Rewrite tiers to any-of both regexes, preserving evidence burden bands
  const tiers = keep.purview.pattern_tiers || []
  keep.purview.pattern_tiers = tiers.map(tier => {
    const next = { ...tier }
    next.id_match = {
      type: 'any',
      ids: ['Regex_bitcoin_address_bech32', 'Regex_btc_legacy'],
    }
    return next
  })

  // Drop should_not_match that required "bech32 must not hit legacy SIT"
  const snm = (keep.test_cases?.should_not_match || []).filter(t =>
    !/bech32 addresses must not route through the legacy/i.test(String(t.description || '')))
  keep.test_cases = keep.test_cases || {}
  keep.test_cases.should_not_match = snm
}

function deprecate(slug, survivorSlug, reasonExtra = '') {
  const { file, data } = loadPattern(slug)
  if (data.status === 'deprecated') {
    console.log(`  already deprecated: ${slug}`)
    return
  }
  data.status = 'deprecated'
  data.deprecation_reason =
    `merged into ${survivorSlug} (${TODAY}) — near-duplicate detector consolidated to reduce package overlap and cross-fire; ${reasonExtra}`.trim()
  data.version = bumpVersion(data.version)
  addChangelog(
    data,
    `Deprecated: merged into ${survivorSlug}. Detection retained in source for audit only; excluded from compiled catalog and package selection.`,
  )
  // Soften risk description note
  if (typeof data.description === 'string' && !data.description.startsWith('DEPRECATED')) {
    data.description = `DEPRECATED — merged into ${survivorSlug}. ${data.description}`
  }
  fs.writeFileSync(file, dumpPattern(data))
  console.log(`  deprecated ${slug} → ${survivorSlug}`)
}

function mergeOne(spec) {
  console.log(`\n[${spec.id}] keep=${spec.keep} drop=${spec.drop}`)
  const keepLoaded = loadPattern(spec.keep)
  const dropLoaded = loadPattern(spec.drop)
  const keep = keepLoaded.data
  const drop = dropLoaded.data

  keep.version = bumpVersion(keep.version)
  if (spec.name) keep.name = spec.name
  if (spec.description) keep.description = spec.description
  if (typeof spec.risk_rating === 'number') keep.risk_rating = Math.max(Number(keep.risk_rating) || 0, spec.risk_rating)
  if (spec.risk_note) keep.risk_description = spec.risk_note
  if (spec.jurisdictions) {
    const set = new Set([...(keep.jurisdictions || []), ...spec.jurisdictions])
    keep.jurisdictions = [...set]
  }

  // operation: append coverage note rather than rewrite detection prose wholesale
  const coverageNote =
    ` Consolidated coverage (merge ${spec.id}): also covers the former ${spec.drop} detector scope.`
  if (typeof keep.operation === 'string' && !keep.operation.includes(spec.drop)) {
    keep.operation = `${keep.operation}${coverageNote}`
  }

  keep.test_cases = unionTests(keep.test_cases, drop.test_cases)

  if (spec.special === 'bitcoin-union') {
    applyBitcoinUnion(keep, drop)
  }

  // Prefer higher recommended confidence if drop was stricter
  if (keep.purview && drop.purview?.recommended_confidence) {
    keep.purview.recommended_confidence = Math.max(
      Number(keep.purview.recommended_confidence) || 0,
      Number(drop.purview.recommended_confidence) || 0,
    )
  }

  addChangelog(
    keep,
    `Merge ${spec.drop}: expanded name/description/risk for combined coverage; absorbed unique test cases; companion SIT deprecated.`,
  )

  fs.writeFileSync(keepLoaded.file, dumpPattern(keep))
  console.log(`  updated survivor ${spec.keep} v${keep.version} risk=${keep.risk_rating}`)

  deprecate(spec.drop, spec.keep, spec.description ? 'survivor description covers both scopes.' : '')
  for (const extra of spec.alsoDeprecate || []) {
    if (!fs.existsSync(path.join(PATTERN_DIR, `${extra}.yaml`))) {
      console.log(`  skip missing alsoDeprecate ${extra}`)
      continue
    }
    deprecate(extra, spec.keep, 'regional/sibling twin of merged near-duplicate.')
  }
}

function main() {
  for (const spec of MERGES) mergeOne(spec)
  console.log('\nDone. Next: npm run compile && verify selected packages.')
}

main()
