#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const enPath = path.join(root, "locales", "en.json");
const ruPath = path.join(root, "locales", "ru.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function placeholderSet(value) {
  const set = new Set();
  const collect = (input) => {
    if (typeof input !== "string") return;
    const matches = input.matchAll(/\{([a-zA-Z0-9_]+)\}/g);
    for (const match of matches) set.add(match[1]);
  };

  if (typeof value === "string") {
    collect(value);
  } else if (value && typeof value === "object") {
    for (const formValue of Object.values(value)) collect(formValue);
  }
  return set;
}

function sorted(arr) {
  return [...arr].sort((a, b) => a.localeCompare(b));
}

function setDiff(left, right) {
  return left.filter((item) => !right.includes(item));
}

function validateSectionParity(errors, enLocale, ruLocale, section) {
  const enSection = enLocale[section] ?? {};
  const ruSection = ruLocale[section] ?? {};

  const enKeys = sorted(Object.keys(enSection));
  const ruKeys = sorted(Object.keys(ruSection));

  const missingInRu = setDiff(enKeys, ruKeys);
  const missingInEn = setDiff(ruKeys, enKeys);

  if (missingInRu.length > 0) {
    errors.push(`[${section}] Missing in ru.json: ${missingInRu.join(", ")}`);
  }
  if (missingInEn.length > 0) {
    errors.push(`[${section}] Missing in en.json: ${missingInEn.join(", ")}`);
  }

  for (const key of enKeys) {
    if (!(key in ruSection)) continue;

    const enValue = enSection[key];
    const ruValue = ruSection[key];
    const enPlaceholders = sorted(Array.from(placeholderSet(enValue)));
    const ruPlaceholders = sorted(Array.from(placeholderSet(ruValue)));

    if (enPlaceholders.join("|") !== ruPlaceholders.join("|")) {
      errors.push(
        `[${section}.${key}] Placeholder mismatch: en={${enPlaceholders.join(",")}} ru={${ruPlaceholders.join(",")}}`
      );
    }
  }
}

function validatePluralForms(errors, enLocale, ruLocale) {
  const enStrings = enLocale.strings ?? {};
  const ruStrings = ruLocale.strings ?? {};

  for (const [key, value] of Object.entries(enStrings)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    if (!("one" in value) || !("other" in value)) {
      errors.push(`[strings.${key}] English plural key should contain "one" and "other" forms.`);
    }

    const ruValue = ruStrings[key];
    if (!ruValue || typeof ruValue !== "object" || Array.isArray(ruValue)) {
      errors.push(`[strings.${key}] Russian locale must provide plural object for pluralized key.`);
      continue;
    }

    for (const form of ["one", "few", "many"]) {
      if (!(form in ruValue)) {
        errors.push(`[strings.${key}] Russian plural key missing form: ${form}`);
      }
    }
  }
}

function main() {
  const errors = [];
  const enLocale = readJson(enPath);
  const ruLocale = readJson(ruPath);

  for (const section of ["strings", "raw", "words"]) {
    validateSectionParity(errors, enLocale, ruLocale, section);
  }

  validatePluralForms(errors, enLocale, ruLocale);

  if (errors.length > 0) {
    console.error("Locale validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log("Locale validation passed.");
}

main();
