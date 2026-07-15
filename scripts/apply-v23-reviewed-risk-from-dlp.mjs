#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const repo = path.resolve(import.meta.dirname, "..");
const patternDir = path.join(repo, "data", "patterns");
const defaultReviewRoot = "C:/claudecode/Compl8DLPDeploy/outputs/v23-individual-assessment/review";
const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const reviewRoot = path.resolve(argValue("--review-root", defaultReviewRoot));
const reportPath = path.resolve(argValue("--report", path.join(reviewRoot, "qa", "testpattern-v23-sync.json")));
const write = process.argv.includes("--write");
const today = argValue("--date", new Date().toISOString().slice(0, 10));

const readJsonl = async (file) => (await fs.readFile(file, "utf8"))
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const clean = (value) => String(value ?? "").trim();
const walk = async (dir) => {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.ya?ml$/i.test(entry.name)) files.push(full);
  }
  return files;
};
const gitHead = (file) => {
  const relative = path.relative(repo, file).replaceAll("\\", "/");
  const result = spawnSync("git", ["show", `HEAD:${relative}`], { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Cannot read HEAD:${relative}: ${clean(result.stderr)}`);
  return result.stdout;
};
const deepClone = (value) => JSON.parse(JSON.stringify(value));
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
const stableJson = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());
const sameProjection = (a, b) => {
  const normalise = (value) => {
    if (Array.isArray(value)) return value.map(normalise);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalise(value[key])]));
    }
    return value;
  };
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
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
const topLevelBlock = (content, field) => {
  const { lines, start, end } = blockBounds(content, field);
  return start < 0 ? null : lines.slice(start, end).join("\n");
};
const replaceTopLevelBlock = (content, field, replacement, anchor = "purview") => {
  const { lines, start, end } = blockBounds(content, field);
  const replacementLines = replacement ? replacement.split("\n") : [];
  if (start >= 0) {
    lines.splice(start, end - start, ...replacementLines);
    return lines.join("\n");
  }
  if (!replacement) return content;
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
  if (!/^sensitivity_labels:\s*$/m.test(content)) {
    content = replaceTopLevelBlock(content, "sensitivity_labels", "sensitivity_labels:", "purview");
  }
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
  const firstItem = start >= 0
    ? lines.slice(start + 1).find((line) => /^(\s*)-\s+/.test(line))
    : null;
  const itemIndent = firstItem?.match(/^(\s*)-/)?.[1] ?? "  ";
  const childIndent = `${itemIndent}  `;
  const entry = [
    `${itemIndent}- version: ${version}`,
    `${childIndent}date: '${today}'`,
    `${childIndent}description: 'v23 reviewed risk assessment: apply the individually reviewed workbook outcome from row ${sourceRow} without changing detector or package metadata.'`,
  ];
  if (start >= 0) lines.splice(start + 1, 0, ...entry);
  else lines.push("changelog:", ...entry);
  return lines.join("\n");
};

const resultFiles = (await fs.readdir(path.join(reviewRoot, "results")))
  .filter((name) => name.endsWith("-review.jsonl"))
  .sort();
const results = [];
for (const file of resultFiles) results.push(...await readJsonl(path.join(reviewRoot, "results", file)));
if (resultFiles.length !== 61 || results.length !== 2178 || new Set(results.map((row) => row.row)).size !== 2178) {
  throw new Error(`Review is incomplete: ${resultFiles.length}/61 result files and ${results.length}/2178 rows.`);
}
const resultByRow = new Map(results.map((row) => [row.row, row]));
const mapping = JSON.parse(await fs.readFile(path.join(reviewRoot, "pattern-mapping.json"), "utf8"));
const priorities = {
  exact_slug: 0,
  testpattern_url_slug: 1,
  slug_alias: 2,
  manual_alias: 3,
  exact_name_analogue: 4,
  exact_reference_analogue: 5,
  composite: 6,
  ambiguous: 7,
};
const selectedBySlug = new Map();
for (const row of mapping.rows) {
  const result = resultByRow.get(row.excelRow);
  if (!result) throw new Error(`Mapping references missing reviewed row ${row.excelRow}.`);
  const priority = priorities[row.mappingKind] ?? 99;
  for (const slug of row.patternSlugs ?? []) {
    const current = selectedBySlug.get(slug);
    if (!current || priority < current.priority) selectedBySlug.set(slug, { priority, mapping: row, result });
  }
}

const files = (await walk(patternDir)).sort();
const rows = [];
const errors = [];
for (const file of files) {
  const relative = path.relative(repo, file).replaceAll("\\", "/");
  const currentText = await fs.readFile(file, "utf8");
  const eol = currentText.includes("\r\n") ? "\r\n" : "\n";
  const headText = gitHead(file).replace(/\r?\n/g, eol);
  const currentDocument = yaml.load(currentText);
  const headDocument = yaml.load(headText);
  const slug = clean(headDocument.slug);
  if (!sameProjection(detectorProjection(currentDocument), detectorProjection(headDocument))) {
    errors.push({ slug, relative, code: "non-risk-drift", detail: "Working-tree changes extend beyond the allowed risk, version, update-date, and changelog fields." });
    continue;
  }

  let next = currentText;
  for (const field of ["version", "risk_rating", "risk_description", "sensitivity_labels", "updated", "changelog"]) {
    next = replaceTopLevelBlock(next, field, topLevelBlock(headText, field));
  }
  const selected = selectedBySlug.get(slug);
  let changedFromHead = false;
  let sourceRow = null;
  let mappingKind = null;
  if (selected) {
    const assessment = selected.result.assessment;
    sourceRow = selected.result.row;
    mappingKind = selected.mapping.mappingKind;
    changedFromHead = Number(headDocument.risk_rating) !== Number(assessment.riskRating)
      || clean(headDocument.risk_description) !== clean(assessment.riskDescription)
      || clean(headDocument.sensitivity_labels?.pspf) !== clean(assessment.pspf)
      || clean(headDocument.sensitivity_labels?.qgiscf) !== clean(assessment.qgiscf)
      || clean(headDocument.sensitivity_labels?.qgiscf_dlm) !== clean(assessment.qgiscfDlm);
    next = setScalar(next, "risk_rating", String(assessment.riskRating));
    next = setDescription(next, assessment.riskDescription);
    next = setNestedLabel(next, "pspf", assessment.pspf);
    next = setNestedLabel(next, "qgiscf", assessment.qgiscf);
    next = setNestedLabel(next, "qgiscf_dlm", assessment.qgiscfDlm);
    if (changedFromHead) {
      const version = bumpPatch(headDocument.version);
      next = setScalar(next, "version", version, "type");
      next = setScalar(next, "updated", `'${today}'`, "changelog");
      next = prependChangelog(next, version, sourceRow);
    }
  }
  next = next.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, eol);

  const parsedNext = yaml.load(next);
  if (!sameProjection(detectorProjection(parsedNext), detectorProjection(headDocument))) {
    errors.push({ slug, relative, code: "generated-non-risk-drift", detail: "Generated output changed detector or non-risk metadata." });
    continue;
  }
  const shouldWrite = next !== currentText;
  if (write && shouldWrite) await fs.writeFile(file, next, "utf8");
  rows.push({
    slug,
    relative,
    selected: Boolean(selected),
    sourceRow,
    mappingKind,
    changedFromHead,
    workingTreeChanged: shouldWrite,
    qgiscf: clean(parsedNext.sensitivity_labels?.qgiscf),
    riskRating: Number(parsedNext.risk_rating),
  });
}

const report = {
  schema: "testpattern.v23-risk-sync.v1",
  generated: new Date().toISOString(),
  mode: write ? "write" : "dry-run",
  reviewRoot,
  patternCount: files.length,
  selectedPatterns: rows.filter((row) => row.selected).length,
  unselectedPatterns: rows.filter((row) => !row.selected).length,
  changedFromHead: rows.filter((row) => row.changedFromHead).length,
  workingTreeFilesToChange: rows.filter((row) => row.workingTreeChanged).length,
  errors,
  rows,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  mode: report.mode,
  patternCount: report.patternCount,
  selectedPatterns: report.selectedPatterns,
  unselectedPatterns: report.unselectedPatterns,
  changedFromHead: report.changedFromHead,
  workingTreeFilesToChange: report.workingTreeFilesToChange,
  errors: report.errors.length,
  reportPath,
}, null, 2));
if (errors.length) process.exitCode = 1;
