#!/usr/bin/env node
//
// Plain-node regression test for the remediation ops applier (no test
// framework in this repo). For each fixture directory under
// fixtures/remediation/<name>/{original.yaml, ops.json, expected.yaml}:
//   1. applyOpsToText(original, ops) must equal expected.yaml BYTE-FOR-BYTE
//      (this is what catches line-ending drift, indentation slips, etc.)
//   2. yaml.load(editedText) must deepEqual applyOpsToObject(yaml.load(original), ops)
//      — the same cross-check the full-catalog CLI run performs per file.
//   3. checkDiffAllowList(original, editedText) must report zero violations.
//
// Exits non-zero if any fixture fails. Wired as `npm run test:remediation`.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { applyOpsToText, applyOpsToObject, deepEqual, checkDiffAllowList } from '../apply-remediation-ops.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, 'fixtures', 'remediation')

const fixtureNames = fs.readdirSync(fixturesDir).filter(name =>
  fs.statSync(path.join(fixturesDir, name)).isDirectory()
)

let failures = 0

for (const name of fixtureNames) {
  const dir = path.join(fixturesDir, name)
  const problems = []

  const originalPath = path.join(dir, 'original.yaml')
  const opsPath = path.join(dir, 'ops.json')
  const expectedPath = path.join(dir, 'expected.yaml')

  const original = fs.readFileSync(originalPath, 'utf8')
  const ops = JSON.parse(fs.readFileSync(opsPath, 'utf8'))
  const expected = fs.readFileSync(expectedPath, 'utf8')

  let editedText
  try {
    editedText = applyOpsToText(original, ops)
  } catch (err) {
    problems.push(`applyOpsToText threw: ${err.message}`)
  }

  if (editedText !== undefined && editedText !== expected) {
    problems.push('applyOpsToText output does not byte-match expected.yaml')
    const a = editedText.split(/\r\n|\n/)
    const b = expected.split(/\r\n|\n/)
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        problems.push(`  first mismatch at line ${i + 1}:\n    actual:   ${JSON.stringify(a[i])}\n    expected: ${JSON.stringify(b[i])}`)
        break
      }
    }
  }

  let objResult
  try {
    objResult = applyOpsToObject(yaml.load(original), ops)
  } catch (err) {
    problems.push(`applyOpsToObject threw: ${err.message}`)
  }

  if (editedText !== undefined && objResult !== undefined) {
    const textParsed = yaml.load(editedText)
    const expectedParsed = yaml.load(expected)
    if (!deepEqual(textParsed, objResult)) {
      problems.push('deepEqual(yaml.load(editedText), applyOpsToObject(...)) failed')
    }
    if (!deepEqual(expectedParsed, objResult)) {
      problems.push('deepEqual(yaml.load(expected.yaml), applyOpsToObject(...)) failed')
    }
  }

  if (editedText !== undefined) {
    const violations = checkDiffAllowList(original, editedText)
    if (violations.length) {
      problems.push(`diff allow-list violation(s): ${JSON.stringify(violations.slice(0, 5))}`)
    }
  }

  if (problems.length) {
    failures++
    console.error(`FAIL ${name}`)
    for (const p of problems) console.error(`  - ${p}`)
  } else {
    console.log(`PASS ${name}`)
  }
}

console.log(`\n${fixtureNames.length - failures}/${fixtureNames.length} fixtures passed.`)
if (failures > 0) {
  console.error(`${failures} fixture(s) FAILED.`)
  process.exit(1)
}
