#!/usr/bin/env node
// Bumps minor version, sets updated date, prepends a changelog entry on a pattern YAML.
// Line-based text editing only (never yaml.load/dump — patterns are hand-formatted and a
// round-trip would churn unrelated formatting).
// CLI: node scripts/lib/bump-pattern-version.mjs <slug> "<note>"
//      node scripts/lib/bump-pattern-version.mjs --stdin   (lines of: slug<TAB>note)
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const TODAY = process.env.PATTERN_BUMP_DATE || '2026-07-04'
const DIR = 'data/patterns'

// Matches the catalog's actual quoting conventions: plain scalars by default,
// single-quoted only when the value would otherwise be ambiguous YAML.
function yamlScalar(value) {
  const str = String(value).replace(/\r?\n/g, ' ')
  const needsQuoting =
    /^\s|\s$/.test(str) ||
    /: |:$/.test(str) ||
    / #/.test(str) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(str) ||
    str === ''
  if (!needsQuoting) return str
  return `'${str.replace(/'/g, "''")}'`
}

export function bumpPatternVersion(slug, note) {
  const file = join(DIR, `${slug}.yaml`)
  if (!existsSync(file)) throw new Error(`no such pattern: ${slug}`)
  let text = readFileSync(file, 'utf8')

  // Most pattern YAMLs are CRLF (checked out with core.autocrlf); a minority are LF.
  // Match `\r?\n` everywhere and reuse the file's own line ending for anything we insert,
  // so we never leave a file with mixed endings.
  const nl = text.includes('\r\n') ? '\r\n' : '\n'

  let version = null
  // Preserve whatever quote style (or lack thereof) the file already uses for `version:`.
  // Trailing whitespace is [ \t] only, never \s — \s matches \r, and greedy backtracking
  // would otherwise swallow the \r of a CRLF line ending into this match and drop it.
  text = text.replace(/^version:[ \t]*(['"]?)(\d+)\.(\d+)\.(\d+)\1[ \t]*$/m, (m, quote, a, b) => {
    version = `${a}.${Number(b) + 1}.0`
    return `version: ${quote}${version}${quote}`
  })
  if (!version) throw new Error(`${slug}: no version field`)

  if (!/^updated:\s*.*$/m.test(text)) throw new Error(`${slug}: no updated field`)
  text = text.replace(/^updated:\s*.*$/m, `updated: '${TODAY}'`)

  // Match the file's existing changelog item indent (most files use 2 spaces, a
  // minority use zero-indent list items — mixing the two breaks the YAML parse).
  const itemIndent = text.match(/^changelog:\s*\r?\n([ \t]*)- version:/m)?.[1] ?? '  '
  const entry = `${itemIndent}- version: ${version}${nl}${itemIndent}  date: '${TODAY}'${nl}${itemIndent}  description: ${yamlScalar(note)}${nl}`
  if (/^changelog:\s*$/m.test(text)) {
    text = text.replace(/^changelog:\s*\r?\n/m, `changelog:${nl}${entry}`)
  } else {
    // No changelog block yet: create one immediately after `updated:`, matching the
    // position it appears in every pattern that already has one.
    text = text.replace(/^(updated:.*\r?\n)/m, `$1changelog:${nl}${entry}`)
  }

  writeFileSync(file, text)
  return version
}

const args = process.argv.slice(2)
if (args[0] === '--stdin') {
  const lines = readFileSync(0, 'utf8').split('\n').filter(Boolean)
  for (const line of lines) {
    const [slug, ...rest] = line.split('\t')
    console.log(`${slug} -> ${bumpPatternVersion(slug.trim(), rest.join('\t').trim())}`)
  }
} else if (args.length >= 2) {
  console.log(`${args[0]} -> ${bumpPatternVersion(args[0], args.slice(1).join(' '))}`)
}
