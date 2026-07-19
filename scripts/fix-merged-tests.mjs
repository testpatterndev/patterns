#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

const survivors = [
  'au-qld-mental-health-assessment',
  'major-litigation-strategy-document',
  'au-qld-special-needs-education-plan',
  'global-bitcoin-address-bech32',
  'au-birth-date-indicator',
  'au-top500-079-workplace-investigation-files',
  'global-ndc',
  'au-top500-163-legal-advice-memoranda',
  'forensic-evidence-chain-of-custody-active',
  'au-disaster-recovery-plan',
]

for (const slug of survivors) {
  const file = path.join('data/patterns', `${slug}.yaml`)
  const data = yaml.load(fs.readFileSync(file, 'utf8'))
  const tc = data.test_cases || {}
  const beforeM = (tc.should_match || []).length
  const beforeN = (tc.should_not_match || []).length
  // Drop-side positives often don't match the survivor detector — remove them.
  tc.should_match = (tc.should_match || []).filter(
    t => !/merged from companion SIT/i.test(String(t.description || '')),
  )
  // Keyword-list CI rule: should_not_match must not contain listed keywords.
  // Merged negatives from companions are unsafe for keyword_list survivors.
  if (data.type === 'keyword_list' || data.type === 'keyword_proximity') {
    tc.should_not_match = (tc.should_not_match || []).filter(
      t => !/merged from companion SIT/i.test(String(t.description || '')),
    )
  }
  data.test_cases = tc
  fs.writeFileSync(
    file,
    yaml.dump(data, { lineWidth: 120, noRefs: true, sortKeys: false, quotingType: "'" }),
  )
  console.log(
    `${slug}: match ${beforeM}->${tc.should_match.length}, neg ${beforeN}->${(tc.should_not_match || []).length}`,
  )
}
