#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const repo = path.resolve(import.meta.dirname, "..");
const defaultAlignment = "C:/claudecode/Compl8DLPDeploy/outputs/v25-authoritative/v25-testpattern-alignment.json";
const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const alignmentPath = path.resolve(argValue("--alignment", defaultAlignment));
const reportPath = path.resolve(argValue("--report", "C:/claudecode/Compl8DLPDeploy/outputs/v25-authoritative/v25-pattern-sync.json"));
const write = process.argv.includes("--write");
const today = argValue("--date", new Date().toISOString().slice(0, 10));
const clean = (value) => String(value ?? "").trim();
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const normalise = (value) => {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalise(value[key])]));
  return value;
};
const same = (left, right) => JSON.stringify(normalise(left)) === JSON.stringify(normalise(right));
const detectorProjection = (document) => {
  const projected = deepClone(document);
  delete projected.version;
  delete projected.updated;
  delete projected.changelog;
  delete projected.risk_rating;
  delete projected.risk_description;
  if (projected.sensitivity_labels) {
    delete projected.sensitivity_labels.pspf;
    delete projected.sensitivity_labels.qgiscf;
    delete projected.sensitivity_labels.qgiscf_dlm;
  }
  return projected;
};
const blockBounds = (content, field) => {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^${field}:`).test(line));
  if (start < 0) return { lines, start: -1, end: -1 };
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) && lines[index].trim()) {
      end = index;
      break;
    }
  }
  return { lines, start, end };
};
const replaceTopLevelBlock = (content, field, replacement, anchor = "purview") => {
  const { lines, start, end } = blockBounds(content, field);
  const replacementLines = replacement ? replacement.split("\n") : [];
  if (start >= 0) {
    lines.splice(start, end - start, ...replacementLines);
    return lines.join("\n");
  }
  const anchorIndex = lines.findIndex((line) => new RegExp(`^${anchor}:`).test(line));
  lines.splice(anchorIndex >= 0 ? anchorIndex : lines.length, 0, ...replacementLines);
  return lines.join("\n");
};
const quoteYaml = (value) => {
  const text = String(value);
  return /^[A-Za-z0-9_./ -]+$/.test(text) && !text.includes(":") ? text : JSON.stringify(text);
};
const setScalar = (content, field, value, anchor = "risk_description") => replaceTopLevelBlock(content, field, `${field}: ${value}`, anchor);
const setDescription = (content, description) => replaceTopLevelBlock(
  content,
  "risk_description",
  `risk_description: >-\n  ${clean(description).replace(/\r?\n/g, " ")}`,
  "sensitivity_labels",
);
const setNestedLabel = (content, field, value) => {
  if (!/^sensitivity_labels:\s*$/m.test(content)) content = replaceTopLevelBlock(content, "sensitivity_labels", "sensitivity_labels:", "purview");
  const lines = content.split("\n");
  const start = lines.findIndex((line) => /^sensitivity_labels:\s*$/.test(line));
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) && lines[index].trim()) {
      end = index;
      break;
    }
  }
  const existing = lines.findIndex((line, index) => index > start && index < end && new RegExp(`^  ${field}:`).test(line));
  if (existing >= 0) lines[existing] = `  ${field}: ${quoteYaml(value)}`;
  else lines.splice(end, 0, `  ${field}: ${quoteYaml(value)}`);
  return lines.join("\n");
};
const bumpPatch = (version) => {
  const parts = clean(version || "1.0.0").split(".").map((part) => Number.parseInt(part, 10));
  while (parts.length < 3) parts.push(0);
  if (parts.some(Number.isNaN)) return "1.0.1";
  parts[2] += 1;
  return parts.slice(0, 3).join(".");
};
const prependChangelog = (content, version, sourceRow) => {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => /^changelog:\s*$/.test(line));
  const firstItem = start >= 0 ? lines.slice(start + 1).find((line) => /^(\s*)-\s+/.test(line)) : null;
  const itemIndent = firstItem?.match(/^(\s*)-/)?.[1] ?? "  ";
  const childIndent = `${itemIndent}  `;
  const entry = [
    `${itemIndent}- version: ${version}`,
    `${childIndent}date: '${today}'`,
    `${childIndent}description: 'v25 authoritative risk alignment from Compl8DLPDeploy workbook row ${sourceRow}; detector and package metadata unchanged.'`,
  ];
  if (start >= 0) lines.splice(start + 1, 0, ...entry);
  else lines.push("changelog:", ...entry);
  return lines.join("\n");
};
const projection = (document) => ({
  riskRating: Number(document.risk_rating),
  riskDescription: clean(document.risk_description),
  pspf: clean(document.sensitivity_labels?.pspf),
  qgiscf: clean(document.sensitivity_labels?.qgiscf),
  qgiscfDlm: clean(document.sensitivity_labels?.qgiscf_dlm),
});

const alignment = JSON.parse(await fs.readFile(alignmentPath, "utf8"));
if (alignment.schema !== "compl8.v25-testpattern-alignment/v1" || alignment.errors.length) throw new Error("The v25 alignment audit is invalid or contains errors.");
const targets = alignment.rows.filter((row) => row.status === "NEEDS V25 UPDATE");
if (targets.length !== alignment.patternsNeedingUpdate) throw new Error("Alignment target count is inconsistent.");

const rows = [];
const errors = [];
for (const target of targets) {
  const file = path.join(repo, "data/patterns", target.file);
  let currentText;
  try {
    currentText = await fs.readFile(file, "utf8");
  } catch (error) {
    errors.push({ slug: target.slug, file: target.file, code: "read-failed", detail: error.message });
    continue;
  }
  const eol = currentText.includes("\r\n") ? "\r\n" : "\n";
  const normalText = currentText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const current = yaml.load(normalText);
  if (clean(current.slug) !== target.slug) {
    errors.push({ slug: target.slug, file: target.file, code: "slug-mismatch", detail: clean(current.slug) });
    continue;
  }
  const currentRisk = projection(current);
  if (same(currentRisk, target.expected)) {
    rows.push({ slug: target.slug, file: target.file, sourceRow: target.sourceRow, status: "ALREADY ALIGNED", changedFields: [] });
    continue;
  }
  if (!same(currentRisk, target.current)) {
    errors.push({ slug: target.slug, file: target.file, code: "stale-audit", detail: { audited: target.current, actual: currentRisk, expected: target.expected } });
    continue;
  }

  const changedFields = Object.keys(target.expected).filter((field) => !same(currentRisk[field], target.expected[field]));
  let next = normalText;
  next = setScalar(next, "risk_rating", String(target.expected.riskRating));
  next = setDescription(next, target.expected.riskDescription);
  next = setNestedLabel(next, "pspf", target.expected.pspf);
  next = setNestedLabel(next, "qgiscf", target.expected.qgiscf);
  next = setNestedLabel(next, "qgiscf_dlm", target.expected.qgiscfDlm);
  const version = bumpPatch(current.version);
  next = setScalar(next, "version", version, "type");
  next = setScalar(next, "updated", `'${today}'`, "changelog");
  next = prependChangelog(next, version, target.sourceRow);
  const parsed = yaml.load(next);
  if (!same(detectorProjection(parsed), detectorProjection(current))) {
    errors.push({ slug: target.slug, file: target.file, code: "non-risk-drift", detail: "Generated output changed detector or package metadata." });
    continue;
  }
  if (!same(projection(parsed), target.expected)) {
    errors.push({ slug: target.slug, file: target.file, code: "risk-write-mismatch", detail: { expected: target.expected, generated: projection(parsed) } });
    continue;
  }
  const outputText = next.replace(/\n/g, eol);
  if (write) await fs.writeFile(file, outputText, "utf8");
  rows.push({ slug: target.slug, file: target.file, sourceRow: target.sourceRow, status: write ? "UPDATED" : "WOULD UPDATE", versionBefore: current.version, versionAfter: version, changedFields });
}

const report = {
  schema: "testpattern.v25-authoritative-risk-sync/v1",
  generated: new Date().toISOString(),
  mode: write ? "write" : "dry-run",
  alignmentPath,
  targetPatterns: targets.length,
  updatedPatterns: rows.filter((row) => ["UPDATED", "WOULD UPDATE"].includes(row.status)).length,
  alreadyAligned: rows.filter((row) => row.status === "ALREADY ALIGNED").length,
  errors,
  rows,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  mode: report.mode,
  targetPatterns: report.targetPatterns,
  updatedPatterns: report.updatedPatterns,
  alreadyAligned: report.alreadyAligned,
  errors: report.errors.length,
  reportPath,
}, null, 2));
if (errors.length) process.exitCode = 1;
