// One entry point for every source file: readSource(name, buffer).
// Returns { report, values }. The report says what was read, what was skipped
// and why, anything ambiguous, and the status: read / read with warnings /
// couldn't read / refused.
import { xlsxToGrids, csvToGrids, rowCells } from "./grid.js";
import { readSheet } from "./tables.js";
import { parseDateText, resolveDateOrder } from "./values.js";
import { bandsOverlap, parseAudience } from "./audience.js";

// Row-level personal data. If a file looks like this, nothing is ingested.
const PII_HEADER = /^(first\s*name|last\s*name|surname|forename|given\s*name|full\s*name|name|child'?s?\s*name|pupil|student\s*(id|name)|email|e-?mail(\s*address)?|date\s*of\s*birth|d\.?o\.?b\.?|birth\s*date|post\s*code|postcode|home\s*address|address|phone|mobile|telephone|child\s*id|user\s*id|member\s*id|ip\s*address)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function screenForPersonalData(grids) {
  const hits = [];
  for (const g of grids) {
    let emails = 0;
    for (const x of g.cells.values()) {
      const t = String(x.raw ?? "").trim();
      if (PII_HEADER.test(t)) hits.push(`${g.sheet}!${x.ref} "${t}"`);
      if (EMAIL.test(t)) emails++;
    }
    if (emails >= 2) hits.push(`${g.sheet}: ${emails} email addresses`);
  }
  return hits;
}

function fileDateOrder(grids) {
  const parts = [];
  for (const g of grids) for (const x of g.cells.values()) {
    for (const m of String(x.raw ?? "").matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g)) {
      const v = parseDateText(m[0]);
      if (v?.parts) parts.push(v.parts);
    }
  }
  return resolveDateOrder(parts);
}

// Everything a person should know before using these figures, grouped, with
// a count and example cells. Nothing here changes a value; it explains it.
const FLAG_TEXT = {
  hidden: "Hidden cells: read and marked hidden. Never used in a plan unless a planner chooses them",
  range: "Ranges: stored as a range, never as a single figure",
  none: "No-value cells (placeholders like n/a, TBC, POA, <1): stored as \"no value\", never as zero",
  modelled: "Modelled figures: the file says these audience splits are modelled, not measured",
  footnote_marker: "Values with a footnote marker: the footnote is attached to the value",
  comment: "Cell comments: kept with the value (they can change what it means)",
  fraction_read_as_percent: "Fractions read as percentages (e.g. 0.41 → 41%) because the column or label is a rate",
  comma_decimal: "Commas read as decimal points (e.g. 5,38 → 5.38)",
  number_stored_as_text: "Numbers stored as text (e.g. \"80,504\", \"113.0k\"): converted, original kept",
  us_date_order: "Dates read as US month/day order",
  uk_date_order: "Dates read as UK day/month order",
  text_in_numbers: "Text in a number column: can't be used as a number. Needs review",
};

function checkThese(values, report) {
  const groups = new Map();
  const add = (key, v, detail) => {
    const g = groups.get(key) || { key, text: FLAG_TEXT[key] || key, count: 0, examples: [], details: new Set() };
    g.count++;
    if (g.examples.length < 4) g.examples.push(`${v.sheet}!${v.ref} "${v.original}"`);
    if (detail) g.details.add(detail);
    groups.set(key, g);
  };
  for (const v of values) {
    if (v.hidden) add("hidden", v);
    if (v.kind === "range") add("range", v);
    if (v.kind === "none") add("none", v, `${v.original} = ${v.reason}`);
    if (v.kind === "text") add("text_in_numbers", v);
    for (const f of ["modelled", "footnote_marker", "fraction_read_as_percent", "comma_decimal", "number_stored_as_text"]) if (v.flags.includes(f)) add(f, v);
    if (v.notes.some((n) => n.column === "comment" || n.column === "header comment")) add("comment", v, v.notes.find((n) => n.column.includes("comment")).text);
  }
  // overlapping age bands inside one sheet: never add them together
  const bySheet = new Map();
  for (const v of values) {
    if (!v.audience?.age) continue;
    const k = v.sheet; const m = bySheet.get(k) || new Map();
    m.set(v.audience.age.label, v.audience.age); bySheet.set(k, m);
  }
  for (const [sheet, bands] of bySheet) {
    const list = [...bands.values()], pairs = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (bandsOverlap(list[i], list[j])) pairs.push(`${list[i].label} & ${list[j].label}`);
    if (pairs.length) groups.set(`overlap:${sheet}`, { key: "overlap", text: `Overlapping age bands on "${sheet}": never added together`, count: pairs.length, examples: pairs.slice(0, 4), details: new Set() });
  }
  // non-age audiences (parents, accounts, households): never treated as child age bands
  const nonAge = values.filter((v) => v.audience?.type && v.audience.type !== "children" && v.audience.type !== "adults");
  if (nonAge.length) {
    const typeLabel = (v) => v.audience.labels.find((l) => { const a = parseAudience(l); return a.type && a.type !== "children" && a.type !== "adults"; }) || v.audience.labels[0];
    const kinds = [...new Set(nonAge.map(typeLabel))].slice(0, 4);
    groups.set("non_age", { key: "non_age", text: "Audiences that are not child age bands (parents, accounts, shoppers…): kept separate, never mapped to a child age band", count: nonAge.length, examples: kinds, details: new Set() });
  }
  return [...groups.values()].map((g) => ({ ...g, details: [...g.details].slice(0, 6) }));
}

export function detectType(name, buffer) {
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  const zip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (ext === "xlsx" || ext === "xlsm") return zip ? "xlsx" : "bad";
  if (ext === "csv" || ext === "tsv" || ext === "txt") return "csv";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "xls") return "xls";
  return "unknown";
}

export async function readSource(name, buffer, { uploadedAt = new Date().toISOString() } = {}) {
  const type = detectType(name, buffer);
  const report = { file: name, type, uploadedAt, status: null, summary: "", sheets: [], issues: [], skipped: [], counts: {} };
  const done = (status, summary, values = []) => { report.status = status; report.summary = summary; return { report, values }; };

  if (type === "xls") return done("couldn't read", "Old Excel format (.xls). Save it as .xlsx and upload again.");
  if (type === "bad") return done("couldn't read", "The file says it is Excel but isn't a valid .xlsx file.");
  if (type === "unknown") return done("couldn't read", "Unknown file type. Supported: .xlsx, .csv (briefs: .pdf, .docx).");
  if (type === "pdf" || type === "docx" || type === "pptx") {
    return done("couldn't read", `${type.toUpperCase()} files are read as briefs or past plans, not as data tables. Not read here.`);
  }

  let grids;
  const openWarnings = [];
  try { grids = type === "xlsx" ? await xlsxToGrids(buffer, openWarnings) : csvToGrids(buffer, name); }
  catch (e) { return done("couldn't read", `The file couldn't be opened: ${e.message}`); }

  const pii = screenForPersonalData(grids);
  if (pii.length) {
    report.issues.push(...pii.map((h) => ({ level: "fail", ref: h, text: "Looks like personal data" })));
    return done("refused", "This file looks like it holds data about individual people (" + pii.slice(0, 3).join("; ") + "). It was not read and nothing from it was stored. Only aggregated audience totals can be used.");
  }

  for (const w of openWarnings) report.issues.push({ level: "warn", ref: name, text: w });
  const order = fileDateOrder(grids);
  const values = [];
  for (const g of grids) {
    const s = readSheet(g, name, { fileDateOrder: order });
    const sheetValues = s.tables.flatMap((t) => t.values);
    values.push(...sheetValues);
    report.issues.push(...s.issues.map((i) => ({ ...i, sheet: g.sheet })));
    report.skipped.push(...s.skipped.map((i) => ({ ...i, sheet: g.sheet })));
    report.sheets.push({
      sheet: g.sheet, hidden: g.sheetHidden,
      hiddenRows: [...g.hiddenRows], hiddenCols: [...g.hiddenCols],
      tables: s.tables.map(({ values: tv, ...t }) => ({ ...t, valueCount: tv.length })),
      textOnly: s.tables.length === 0 ? s.notes.map((n) => n.text) : [],
    });
    if (g.sheetHidden) report.issues.push({ level: "warn", sheet: g.sheet, ref: g.sheet, text: "This whole sheet is hidden. Its values were read and marked hidden." });
    if (g.sheetHidden) for (const v of sheetValues) { v.hidden = true; v.flags.push("hidden_sheet"); }
  }

  const c = (pred) => values.filter(pred).length;
  report.counts = {
    values: values.length,
    numbers: c((v) => ["number", "percent", "currency", "duration"].includes(v.kind)),
    ranges: c((v) => v.kind === "range"),
    noValue: c((v) => v.kind === "none"),
    text: c((v) => v.kind === "text"),
    hidden: c((v) => v.hidden),
    modelled: c((v) => v.flags.includes("modelled")),
    withNotes: c((v) => v.notes.length > 0),
    needsReview: c((v) => v.needsReview),
  };
  report.noValueExamples = [...new Map(values.filter((v) => v.kind === "none").map((v) => [v.original, v])).values()]
    .map((v) => ({ original: v.original, reason: v.reason, count: values.filter((x) => x.kind === "none" && x.original === v.original).length, example: `${v.sheet}!${v.ref}` }));
  if (!values.length) return done("couldn't read", "No data tables were found in this file.", values);
  report.checkThese = checkThese(values, report);
  const warnings = report.issues.filter((i) => i.level !== "info").length + report.counts.needsReview + report.checkThese.length;
  return done(warnings ? "read with warnings" : "read",
    `${values.length} values read from ${report.sheets.reduce((n, s) => n + s.tables.length, 0)} table(s) on ${grids.length} sheet(s).`, values);
}
