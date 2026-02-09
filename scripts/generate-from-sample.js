#!/usr/bin/env node

// generate-from-sample.js — Heuristic pattern detection from sample files
// Usage:
//   node scripts/generate-from-sample.js sample.txt
//   node scripts/generate-from-sample.js data.csv --output-dir ./drafts
//   node scripts/generate-from-sample.js data.csv --verbose

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import yaml from 'js-yaml'

// ── CLI argument parsing ──

const args = process.argv.slice(2)
const flags = { verbose: false, outputDir: null }
const positional = []

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--verbose' || args[i] === '-v') {
    flags.verbose = true
  } else if (args[i] === '--output-dir' || args[i] === '-o') {
    flags.outputDir = args[++i]
  } else if (args[i] === '--help' || args[i] === '-h') {
    printUsage()
    process.exit(0)
  } else if (args[i].startsWith('-')) {
    console.error(`Unknown flag: ${args[i]}`)
    printUsage()
    process.exit(1)
  } else {
    positional.push(args[i])
  }
}

if (positional.length === 0) {
  console.error('Error: No input file specified.\n')
  printUsage()
  process.exit(1)
}

function printUsage() {
  console.log(`Usage: node scripts/generate-from-sample.js <file> [options]

Options:
  --output-dir, -o <dir>  Write individual YAML files to directory
  --verbose, -v           Print detection details
  --help, -h              Show this help

Examples:
  node scripts/generate-from-sample.js sample.txt
  node scripts/generate-from-sample.js data.csv --output-dir ./drafts
  node scripts/generate-from-sample.js data.csv --verbose`)
}

// ── Phase 1: Tokenize ──

function tokenize(content) {
  const lines = content.split(/\r?\n/)
  const isCSV = detectCSV(lines)
  const result = { isCSV, headers: [], tokens: [], lines: [] }

  if (isCSV) {
    result.headers = parseCSVRow(lines[0])
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue
      const fields = parseCSVRow(lines[i])
      for (let col = 0; col < fields.length; col++) {
        const val = fields[col].trim()
        if (val === '') continue
        result.tokens.push({
          value: val,
          line: i + 1,
          column: col,
          header: result.headers[col] || `column_${col}`
        })
      }
      result.lines.push({ number: i + 1, content: lines[i] })
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '') continue
      result.lines.push({ number: i + 1, content: line })
      // Extract whitespace-separated tokens
      const words = line.split(/\s+/).filter(w => w.length > 0)
      for (const word of words) {
        result.tokens.push({ value: word, line: i + 1 })
      }
      // Also add the full line as a token for multi-word pattern matching
      result.tokens.push({ value: line.trim(), line: i + 1, fullLine: true })
    }
  }

  return result
}

function detectCSV(lines) {
  if (lines.length < 2) return false
  const firstLine = lines[0]
  // Check if the first line looks like a header with commas
  if (!firstLine.includes(',')) return false
  const headerFields = parseCSVRow(firstLine)
  if (headerFields.length < 2) return false
  // Check that headers look like labels (not data)
  const looksLikeHeaders = headerFields.every(h =>
    /^[A-Za-z_][\w\s./-]*$/.test(h.trim()) && h.trim().length < 60
  )
  return looksLikeHeaders
}

function parseCSVRow(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

// ── Phase 2: Detect ──

// Luhn check for credit card validation
function luhnCheck(numStr) {
  const digits = numStr.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

// Built-in detectors ordered by priority
const DETECTORS = [
  {
    name: 'Email Address',
    slug: 'global-email-address',
    regex: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
    confidence: 'high',
    categories: ['pii'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['email', 'e-mail', 'mail', 'contact', 'address'],
    patternTemplate: '[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}',
    generateNegatives: () => [
      { value: 'not-an-email', description: 'Plain text without @ symbol' },
      { value: 'user@', description: 'Missing domain after @ symbol' },
    ]
  },
  {
    name: 'Credit Card Number',
    slug: 'global-credit-card-number',
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    validate: (match) => luhnCheck(match),
    confidence: 'high',
    categories: ['financial'],
    jurisdictions: ['global'],
    regulations: ['pci-dss'],
    contextKeywords: ['credit card', 'card number', 'CC', 'CVV', 'expiry', 'cardholder'],
    patternTemplate: '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\\d{3})\\d{11})\\b',
    generateNegatives: () => [
      { value: '1234567890123456', description: '16-digit number with no valid card network prefix' },
      { value: '0000000000000000', description: 'All-zeros string does not match any card prefix' },
    ]
  },
  {
    name: 'IBAN',
    slug: 'global-iban',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,
    confidence: 'high',
    categories: ['financial'],
    jurisdictions: ['global'],
    regulations: ['psd2', 'gdpr'],
    contextKeywords: ['IBAN', 'bank account', 'account number', 'bank transfer', 'wire transfer'],
    patternTemplate: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{4,30}\\b',
    generateNegatives: () => [
      { value: 'AB12', description: 'Too short to be a valid IBAN' },
      { value: '1234567890', description: 'Numeric string without country prefix' },
    ]
  },
  {
    name: 'IPv4 Address',
    slug: 'global-ipv4-address',
    regex: /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g,
    validate: (match) => {
      const octets = match.split('.')
      return octets.every(o => { const n = parseInt(o, 10); return n >= 0 && n <= 255 })
    },
    confidence: 'high',
    categories: ['network'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['IP', 'address', 'host', 'server', 'network', 'subnet'],
    patternTemplate: '\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b',
    generateNegatives: () => [
      { value: '999.999.999.999', description: 'Octets exceed the valid 0-255 range' },
      { value: '1.2.3', description: 'Only three octets, not a valid IPv4 address' },
    ]
  },
  {
    name: 'IPv6 Address',
    slug: 'global-ipv6-address',
    regex: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    confidence: 'high',
    categories: ['network'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['IPv6', 'address', 'host', 'network'],
    patternTemplate: '\\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\\b',
    generateNegatives: () => [
      { value: '1234:5678', description: 'Too few groups for a valid IPv6 address' },
      { value: 'zzzz:zzzz:zzzz:zzzz:zzzz:zzzz:zzzz:zzzz', description: 'Non-hex characters' },
    ]
  },
  {
    name: 'MAC Address',
    slug: 'global-mac-address',
    regex: /\b(?:[0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g,
    confidence: 'high',
    categories: ['device-id', 'network'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['MAC', 'mac address', 'hardware address', 'physical address', 'device'],
    patternTemplate: '\\b(?:[0-9A-Fa-f]{2}[:\\-]){5}[0-9A-Fa-f]{2}\\b',
    generateNegatives: () => [
      { value: 'GG:HH:II:JJ:KK:LL', description: 'Non-hex characters in MAC address format' },
      { value: '00:11:22:33:44', description: 'Only 5 groups instead of 6' },
    ]
  },
  {
    name: 'UUID',
    slug: 'global-uuid',
    regex: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    confidence: 'high',
    categories: ['device-id'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['UUID', 'GUID', 'identifier', 'ID', 'unique'],
    patternTemplate: '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b',
    generateNegatives: () => [
      { value: '12345678-1234-1234-1234', description: 'Missing the last group' },
      { value: 'not-a-uuid-at-all-nope', description: 'Text that superficially resembles UUID format' },
    ]
  },
  {
    name: 'JSON Web Token',
    slug: 'global-jwt',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    confidence: 'high',
    categories: ['credentials', 'security'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['JWT', 'token', 'bearer', 'authorization', 'auth'],
    patternTemplate: '\\beyJ[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-]{10,}\\b',
    generateNegatives: () => [
      { value: 'eyJnot.valid', description: 'Too few segments for a JWT' },
      { value: 'notaJWT.at.all', description: 'Does not start with eyJ prefix' },
    ]
  },
  {
    name: 'AWS Access Key',
    slug: 'global-aws-access-key',
    regex: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
    confidence: 'high',
    categories: ['credentials', 'security'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['AWS', 'access key', 'secret key', 'api key', 'credentials'],
    patternTemplate: '\\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\\b',
    generateNegatives: () => [
      { value: 'INVALID_DATA_123', description: 'Random string that does not match the expected format' },
      { value: 'ABCDIOSFODNN7EXAMPLE', description: 'Invalid prefix not matching any AWS key type' },
    ]
  },
  {
    name: 'US Social Security Number',
    slug: 'us-social-security-number',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    confidence: 'medium',
    categories: ['pii', 'government-id'],
    jurisdictions: ['us'],
    regulations: ['ccpa'],
    contextKeywords: ['SSN', 'social security', 'social security number', 'SS#'],
    patternTemplate: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    generateNegatives: () => [
      { value: '000-00-0000', description: 'All-zeros SSN is invalid' },
      { value: '123-45-6789-0', description: 'Extra digit group after valid SSN format' },
    ]
  },
  {
    name: 'Phone Number (International)',
    slug: 'global-phone-number',
    regex: /\+\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{3,5}[\s-]?\d{3,5}/g,
    confidence: 'medium',
    categories: ['pii'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['phone', 'telephone', 'mobile', 'cell', 'contact', 'fax'],
    patternTemplate: '\\+\\d{1,3}[\\s-]?\\(?\\d{1,4}\\)?[\\s-]?\\d{3,5}[\\s-]?\\d{3,5}',
    generateNegatives: () => [
      { value: '12345', description: 'Short number without international prefix' },
      { value: '+1', description: 'Country code only, no subscriber number' },
    ]
  },
  {
    name: 'ISO Date',
    slug: 'global-iso-date',
    regex: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    validate: (match) => {
      const parts = match.split('-')
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10)
      const d = parseInt(parts[2], 10)
      return y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31
    },
    confidence: 'medium',
    categories: ['pii'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['date', 'born', 'birthday', 'DOB', 'date of birth', 'created', 'updated'],
    patternTemplate: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
    generateNegatives: () => [
      { value: '2024-13-01', description: 'Invalid month (13)' },
      { value: '2024-00-15', description: 'Invalid month (00)' },
    ]
  },
  {
    name: 'URL',
    slug: 'global-url',
    regex: /https?:\/\/[^\s"'<>]+/g,
    confidence: 'medium',
    categories: ['network'],
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    contextKeywords: ['URL', 'link', 'website', 'http', 'endpoint'],
    patternTemplate: 'https?:\\/\\/[^\\s"\'<>]+',
    generateNegatives: () => [
      { value: 'ftp://example.com', description: 'FTP protocol, not HTTP/HTTPS' },
      { value: 'not a url', description: 'Plain text without URL structure' },
    ]
  },
]

// Map built-in detector regexes to their names for deduplication with structural patterns
const BUILTIN_NAMES = new Set(DETECTORS.map(d => d.name))

function runDetectors(tokenData) {
  const detections = new Map() // detectorName -> { detector, matches, score, seenValues }

  for (const detector of DETECTORS) {
    const matches = []
    const seenValues = new Set()
    const seenLines = new Set()

    for (const token of tokenData.tokens) {
      detector.regex.lastIndex = 0
      let m
      while ((m = detector.regex.exec(token.value)) !== null) {
        const val = m[0]
        // Run optional validator
        if (detector.validate && !detector.validate(val)) continue

        const entry = { value: val, line: token.line }
        if (token.header) entry.header = token.header
        matches.push(entry)

        if (!seenValues.has(val)) {
          seenValues.add(val)
        }
        if (!seenLines.has(token.line)) {
          seenLines.add(token.line)
        }
      }
    }

    if (matches.length === 0) continue

    // Scoring: +1 per occurrence, +2 for distinct-line matches, +5 if CSV header suggests sensitivity
    let score = matches.length + (seenLines.size * 2)

    if (tokenData.isCSV) {
      const sensitiveHeaders = ['email', 'ssn', 'phone', 'card', 'credit', 'ip', 'address',
        'name', 'dob', 'birth', 'account', 'token', 'key', 'secret', 'password', 'id']
      for (const header of tokenData.headers) {
        const h = header.toLowerCase()
        if (sensitiveHeaders.some(s => h.includes(s))) {
          score += 5
          break
        }
      }
    }

    if (score >= 2) {
      detections.set(detector.name, { detector, matches, score, seenValues })
    }
  }

  return detections
}

// ── Structural Pattern Analyzer ──

function analyzeStructural(tokenData, builtinMatches) {
  // Collect values already matched by built-in detectors
  const alreadyMatched = new Set()
  for (const [, det] of builtinMatches) {
    for (const m of det.matches) {
      alreadyMatched.add(m.value)
    }
  }

  // Extract structured-looking tokens (contain digits + consistent separators)
  const structuredTokens = []
  for (const token of tokenData.tokens) {
    if (token.fullLine) continue
    const val = token.value
    if (alreadyMatched.has(val)) continue
    // Must contain at least one digit and one separator or mixed alpha-digit
    if (!/\d/.test(val)) continue
    if (val.length < 4) continue
    // Must have some structure (separators, mixed case, or consistent grouping)
    if (/^[\d.]+$/.test(val) && !val.includes('.')) continue // plain numbers
    if (/^\d+$/.test(val) && val.length < 6) continue // short plain numbers
    structuredTokens.push(token)
  }

  // Compute structural signatures
  const signatureGroups = new Map() // signature -> [{ value, line, header? }]

  for (const token of structuredTokens) {
    const sig = computeSignature(token.value)
    if (!sig) continue
    if (!signatureGroups.has(sig)) signatureGroups.set(sig, [])
    signatureGroups.get(sig).push(token)
  }

  // Keep signatures with >= 3 unique values
  const results = []
  for (const [sig, tokens] of signatureGroups) {
    const uniqueValues = new Set(tokens.map(t => t.value))
    if (uniqueValues.size < 3) continue

    const regex = signatureToRegex(sig)
    if (!regex) continue

    // Derive a name from CSV headers or signature
    let name = 'Structured Pattern'
    let headerContext = null
    if (tokenData.isCSV) {
      const headers = new Set(tokens.filter(t => t.header).map(t => t.header))
      if (headers.size === 1) {
        headerContext = [...headers][0]
        name = `Structured ${headerContext}`
      }
    }

    let score = tokens.length + (new Set(tokens.map(t => t.line)).size * 2)
    if (headerContext) score += 5

    if (score >= 2) {
      results.push({
        name,
        signature: sig,
        regex,
        tokens,
        uniqueValues,
        score,
        headerContext
      })
    }
  }

  return results
}

function computeSignature(value) {
  // Convert to structural signature: letters -> A, digits -> d, keep separators
  let sig = ''
  let i = 0
  while (i < value.length) {
    if (/[A-Za-z]/.test(value[i])) {
      let count = 0
      while (i < value.length && /[A-Za-z]/.test(value[i])) { count++; i++ }
      sig += `${count}A`
    } else if (/\d/.test(value[i])) {
      let count = 0
      while (i < value.length && /\d/.test(value[i])) { count++; i++ }
      sig += `${count}d`
    } else {
      sig += value[i]
      i++
    }
  }
  // Skip very short or very long signatures
  if (sig.length < 2 || sig.length > 40) return null
  return sig
}

function signatureToRegex(sig) {
  let regex = '\\b'
  let i = 0
  while (i < sig.length) {
    // Parse count + type
    let count = ''
    while (i < sig.length && /\d/.test(sig[i])) { count += sig[i]; i++ }
    if (count && i < sig.length) {
      const type = sig[i]
      i++
      const n = parseInt(count, 10)
      if (type === 'A') {
        regex += `[A-Za-z]{${n}}`
      } else if (type === 'd') {
        regex += `\\d{${n}}`
      }
    } else if (i < sig.length) {
      // Separator character — escape if needed
      const ch = sig[i]
      i++
      if (/[.\-+*?^${}()|[\]\\]/.test(ch)) {
        regex += `\\${ch}`
      } else if (ch === ' ') {
        regex += '\\s'
      } else {
        regex += ch
      }
    }
  }
  regex += '\\b'
  return regex
}

// ── Phase 3: Generate YAML ──

// Canonical field order for YAML output
const FIELD_ORDER = [
  'schema', 'name', 'slug', 'version', 'type', 'engine',
  'description', 'operation', 'pattern', 'confidence', 'confidence_justification',
  'jurisdictions', 'regulations', 'data_categories',
  'corroborative_evidence', 'test_cases', 'false_positives',
  'exports', 'scope', 'created', 'updated', 'author', 'license'
]

function sortKeys(a, b) {
  const ia = FIELD_ORDER.indexOf(a)
  const ib = FIELD_ORDER.indexOf(b)
  if (ia === -1 && ib === -1) return a.localeCompare(b)
  if (ia === -1) return 1
  if (ib === -1) return -1
  return ia - ib
}

function generateBuiltinPattern(name, detector, matches, seenValues, csvHeaders) {
  const today = new Date().toISOString().slice(0, 10)
  const slug = `DRAFT-${detector.slug}`

  // Pick up to 5 unique sample values as should_match
  const sampleValues = [...seenValues].slice(0, 5)
  const shouldMatch = sampleValues.map(v => ({
    value: v,
    description: 'Detected in sample data'
  }))

  // Generate should_not_match from detector
  const shouldNotMatch = detector.generateNegatives()

  // Build corroborative keywords from context + CSV headers
  const keywords = [...detector.contextKeywords]
  if (csvHeaders) {
    for (const h of csvHeaders) {
      const lower = h.toLowerCase().trim()
      if (lower && !keywords.includes(lower)) keywords.push(lower)
    }
  }

  const pattern = {
    schema: 'testpattern/v1',
    name: `DRAFT: ${detector.name}`,
    slug,
    version: '1.0.0',
    type: 'regex',
    engine: 'universal',
    description: `DRAFT: Auto-detected ${detector.name} pattern from sample data. Review and refine before committing.`,
    operation: 'DRAFT: Review detection approach and corroborative evidence configuration.',
    pattern: detector.patternTemplate,
    confidence: detector.confidence,
    confidence_justification: `DRAFT: Auto-assigned ${detector.confidence} confidence based on pattern structure. Review and provide specific justification.`,
    jurisdictions: detector.jurisdictions,
    regulations: detector.regulations,
    data_categories: detector.categories,
    corroborative_evidence: {
      keywords: keywords.slice(0, 10),
      proximity: 300
    },
    test_cases: {
      should_match: shouldMatch,
      should_not_match: shouldNotMatch
    },
    false_positives: [
      {
        description: 'DRAFT: Review for false positive scenarios specific to your data context.',
        mitigation: 'DRAFT: Add specific mitigation strategies after reviewing sample data and deployment context.'
      }
    ],
    exports: ['purview_xml', 'yaml', 'regex_copy'],
    scope: 'wide',
    created: today,
    updated: today,
    author: 'testpattern-community',
    license: 'MIT'
  }

  return pattern
}

function generateStructuralPattern(structural) {
  const today = new Date().toISOString().slice(0, 10)
  const slugName = structural.headerContext
    ? structural.headerContext.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : `structural-${structural.signature.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`
  const slug = `DRAFT-global-${slugName}`

  const sampleValues = [...structural.uniqueValues].slice(0, 5)
  const shouldMatch = sampleValues.map(v => ({
    value: v,
    description: 'Detected in sample data'
  }))

  // Generate negatives by altering the structure
  const shouldNotMatch = generateStructuralNegatives(sampleValues[0], structural.signature)

  const keywords = []
  if (structural.headerContext) {
    keywords.push(structural.headerContext.toLowerCase())
  }

  const pattern = {
    schema: 'testpattern/v1',
    name: `DRAFT: ${structural.name} (${structural.signature})`,
    slug,
    version: '1.0.0',
    type: 'regex',
    engine: 'universal',
    description: `DRAFT: Auto-detected structured pattern with signature "${structural.signature}" from sample data. Review and refine before committing.`,
    operation: `DRAFT: Structural pattern detected from ${structural.uniqueValues.size} unique values. Review the regex and adjust for edge cases.`,
    pattern: structural.regex,
    confidence: 'medium',
    confidence_justification: 'DRAFT: Medium confidence assigned to auto-detected structural pattern. Review the format specificity and add corroborative evidence if the structure is generic.',
    jurisdictions: ['global'],
    regulations: ['general-data-protection'],
    data_categories: ['pii'],
    corroborative_evidence: {
      keywords: keywords.length > 0 ? keywords : ['identifier', 'ID', 'number', 'code'],
      proximity: 300
    },
    test_cases: {
      should_match: shouldMatch,
      should_not_match: shouldNotMatch
    },
    false_positives: [
      {
        description: 'DRAFT: Review for false positive scenarios specific to your data context.',
        mitigation: 'DRAFT: Add specific mitigation strategies after reviewing sample data and deployment context.'
      }
    ],
    exports: ['purview_xml', 'yaml', 'regex_copy'],
    scope: 'wide',
    created: today,
    updated: today,
    author: 'testpattern-community',
    license: 'MIT'
  }

  return pattern
}

function generateStructuralNegatives(sampleValue, signature) {
  const negatives = []
  if (!sampleValue) {
    return [
      { value: 'XXXXX', description: 'Random string not matching structural pattern' },
      { value: '12345', description: 'Plain number without expected structure' },
    ]
  }
  // Truncated version
  const truncated = sampleValue.slice(0, Math.ceil(sampleValue.length / 2))
  negatives.push({ value: truncated, description: 'Truncated value — too short to match' })
  // Extended version
  negatives.push({ value: sampleValue + '99', description: 'Extended value — extra characters appended' })
  return negatives
}

function patternToYAML(pattern) {
  return yaml.dump(pattern, {
    sortKeys,
    lineWidth: 120,
    noRefs: true,
    quotingType: "'",
    forceQuotes: false
  })
}

// ── Main ──

const inputFile = positional[0]
let content
try {
  content = readFileSync(inputFile, 'utf-8')
} catch (err) {
  console.error(`Error reading file: ${inputFile}`)
  console.error(err.message)
  process.exit(1)
}

if (flags.verbose) {
  console.error(`\n── Analyzing: ${inputFile} ──\n`)
}

// Phase 1: Tokenize
const tokenData = tokenize(content)

if (flags.verbose) {
  console.error(`Format: ${tokenData.isCSV ? 'CSV' : 'Plain text'}`)
  if (tokenData.isCSV) {
    console.error(`Headers: ${tokenData.headers.join(', ')}`)
  }
  console.error(`Lines: ${tokenData.lines.length}`)
  console.error(`Tokens: ${tokenData.tokens.length}\n`)
}

// Phase 2: Detect
const builtinDetections = runDetectors(tokenData)
const structuralDetections = analyzeStructural(tokenData, builtinDetections)

if (flags.verbose) {
  console.error('── Built-in detections ──')
  if (builtinDetections.size === 0) {
    console.error('  (none)')
  }
  for (const [name, det] of builtinDetections) {
    console.error(`  ${name}: ${det.matches.length} matches, ${det.seenValues.size} unique, score=${det.score}`)
    const samples = [...det.seenValues].slice(0, 3).join(', ')
    console.error(`    samples: ${samples}`)
  }
  console.error('\n── Structural detections ──')
  if (structuralDetections.length === 0) {
    console.error('  (none)')
  }
  for (const s of structuralDetections) {
    console.error(`  ${s.name} [${s.signature}]: ${s.uniqueValues.size} unique values, score=${s.score}`)
    console.error(`    regex: ${s.regex}`)
    const samples = [...s.uniqueValues].slice(0, 3).join(', ')
    console.error(`    samples: ${samples}`)
  }
  console.error('')
}

// Phase 3: Generate
const allPatterns = []

for (const [name, det] of builtinDetections) {
  const csvHeaders = tokenData.isCSV ? tokenData.headers : null
  allPatterns.push(generateBuiltinPattern(name, det.detector, det.matches, det.seenValues, csvHeaders))
}

for (const s of structuralDetections) {
  allPatterns.push(generateStructuralPattern(s))
}

if (allPatterns.length === 0) {
  console.error('No patterns detected in the input file.')
  process.exit(0)
}

// Output
if (flags.outputDir) {
  if (!existsSync(flags.outputDir)) {
    mkdirSync(flags.outputDir, { recursive: true })
  }
  for (const pattern of allPatterns) {
    const filename = `${pattern.slug}.yaml`
    const filepath = join(flags.outputDir, filename)
    writeFileSync(filepath, patternToYAML(pattern))
    console.error(`Wrote: ${filepath}`)
  }
  console.error(`\n${allPatterns.length} draft pattern(s) written to ${flags.outputDir}`)
} else {
  // Print to stdout, separated by ---
  const yamlDocs = allPatterns.map(p => patternToYAML(p))
  console.log(yamlDocs.join('---\n'))
}

if (allPatterns.length > 0) {
  console.error(`\nReminder: Draft patterns are prefixed with "DRAFT-". Review and rename slugs before committing.`)
}
