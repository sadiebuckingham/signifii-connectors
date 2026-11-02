// Finds tables inside a sheet grid and turns every number into a labelled
// value with provenance. General rules only: nothing here knows about any
// particular file.
//
// Layout handled: title/notes lines above the header; two-row headers with
// merged group labels; group label rows inside the data (carried down);
// blank rows between blocks; total rows (skipped, reported); footnotes under
// the table; transposed tables (metrics as rows); several tables per sheet;
// label/value lists with no header; hidden rows/columns; cell comments.
import { at, rowCells, ref } from "./grid.js";
import { normaliseValue, resolveDateOrder, applyDateOrder, parseDateText, isNumericKind } from "./values.js";
import { parseAudience, hasAudienceMeaning } from "./audience.js";
import { qualifiersOf, noteScope, noteApplies, describeScope, isBoilerplate } from "./notes.js";

const TOTAL_RE = /^\s*(sub[- ]?total|grand total|total|sum|overall)\b/i;
const NOTE_LEAD_RE = /^\s*(\*|†|‡|note|notes|source|nb|n\.b\.|\d+\.\s|caveat|updated|figures?:)/i;

// Header words that say what kind of column a text column is.
const DIM_ROLES = [
  ["notes", /^(notes?|comments?|remarks?|caveats?)$/i],
  ["period", /\b(date|week|wk|w\/c|period|month|day|flight)\b/i],
  ["audience", /\b(age|gender|sex|audience|demo(graphic)?s?|segment|target(ing)?|basis)\b/i],
  ["unit", /\b(buying unit|unit|rate basis|cost basis|currency)\b/i],
  ["metric", /^(metric|measure|kpi|statistic|stat)s?$/i],
  ["entity", /\b(channel|station|media|owner|format|campaign|ad ?group|platform|title|publisher|placement|line|creative|product|site|programme|show)\b/i],
];

function classifyRow(g, r, span) {
  const cells = rowCells(g, r).filter((x) => x.c >= span.left && x.c <= span.right);
  const vals = cells.map((x) => ({ x, v: normaliseValue(x.raw, x.text, { numFmt: x.numFmt }) }));
  const numeric = vals.filter(({ v }) => isNumericKind(v.kind) || v.kind === "none" && v.reason !== "empty").length;
  const text = vals.filter(({ v }) => v.kind === "text").length;
  return { r, cells, n: cells.length, numeric, text, first: cells[0] || null };
}

const isBlank = (g, r) => rowCells(g, r).length === 0;

function looksLikeHeader(g, r) {
  const cells = rowCells(g, r);
  if (cells.length < 2) return false;
  // a header row holds labels only: no numbers, prices, percentages or placeholders
  for (const x of cells) {
    const v = normaliseValue(x.raw, x.text, { numFmt: x.numFmt });
    if (v.kind !== "text") return false;
  }
  // must be followed (within 4 rows) by a row with at least one number in the same columns
  const left = cells[0].c, right = cells[cells.length - 1].c;
  for (let k = r + 1; k <= Math.min(g.rows, r + 4); k++) {
    const row = classifyRow(g, k, { left, right });
    if (row.numeric >= 1 && row.n >= 2) return true;
  }
  return false;
}

// Of several header-like rows stacked together, the real header is the last
// one before the data; the ones above it are group labels.
function settleHeader(g, r) {
  while (r + 1 <= g.rows && looksLikeHeader(g, r + 1) && rowCells(g, r + 1).length >= rowCells(g, r).length) r++;
  return r;
}

// The row directly above a header is a group-label row if it has labels over
// header columns (merged or not) and isn't just a one-cell title in the first column.
function groupLabels(g, headerRow, span, decisions) {
  const above = headerRow - 1;
  if (above < 1 || isBlank(g, above)) return null;
  const cells = rowCells(g, above).filter((x) => x.c >= span.left && x.c <= span.right);
  if (!cells.length) return null;
  if (cells.length === 1 && cells[0].c === span.left) return null; // a title line, not group labels
  const labels = new Map();
  for (const m of g.merges.filter((m) => m.top <= above && m.bottom >= above)) {
    const master = at(g, m.top, m.left);
    if (!master) continue;
    for (let c = m.left; c <= m.right; c++) labels.set(c, String(master.raw).trim());
    decisions.push(`Group label "${master.raw}" (merged ${m.ref}) combined with the column names under it`);
  }
  for (const x of cells) {
    if (labels.has(x.c)) continue;
    labels.set(x.c, String(x.raw).trim());
    decisions.push(`Group label "${x.raw}" at ${x.ref} is not merged, so it was applied to its own column only`);
  }
  return { row: above, labels };
}

function dimRole(header, values) {
  for (const [role, re] of DIM_ROLES) if (re.test(header)) return role;
  const withAud = values.filter((v) => hasAudienceMeaning(parseAudience(v))).length;
  if (values.length && withAud / values.length > 0.6) return "audience";
  return "attribute";
}

// Pull dates, units, metric names and source lines out of title/notes text.
export function readPreamble(lines) {
  const meta = { title: null, lines: [], period: null, unit: null, metric: null, source: null, fictional: false, dateTexts: [], spans: [] };
  for (const { text, ref: cref } of lines) {
    meta.lines.push({ text, ref: cref });
    if (!meta.title) meta.title = text;
    if (/fictional/i.test(text)) meta.fictional = true;
    const fig = text.match(/figures?\s*:\s*([^|]+)/i);
    if (fig) {
      const u = fig[1].match(/\(([^)]+)\)/);
      meta.metric = fig[1].replace(/\([^)]*\)/, "").trim();
      if (u) meta.unit = u[1].trim();
    }
    const src = text.match(/^\s*source\s*:\s*(.+)$/i);
    if (src) meta.source = src[1].trim();
    const dates = [...text.matchAll(/(?<![\d.])(\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{4}[-./]\d{2}[-./]\d{2}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}|\d{1,2}[/.]\d{1,2}[/.]\d{2})(?![\d.])/g)].map((m) => m[1]);
    for (const d of dates) meta.dateTexts.push({ text: d, ref: cref });
    // whole quarters or months named in a title ("Q4 2026", "October 2026") when no exact dates are given
    const q = text.match(/\bQ([1-4])\s*['’]?\s*(20\d{2}|\d{2})\b/i);
    if (q) meta.spans.push({ kind: "quarter", q: Number(q[1]), y: Number(q[2].length === 2 ? "20" + q[2] : q[2]), text: q[0], ref: cref });
    const mo = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(20\d{2})\b/i);
    if (mo && !/\d\s+$/.test(text.slice(0, mo.index))) meta.spans.push({ kind: "month", m: MONTH_NO[mo[1].slice(0, 3).toLowerCase()], y: Number(mo[2]), text: mo[0], ref: cref });
  }
  return meta;
}

export function resolvePeriod(meta, fileDateOrder) {
  const parsed = meta.dateTexts.map((d) => ({ ...d, v: parseDateText(d.text) })).filter((d) => d.v);
  const order = resolveDateOrder(parsed.filter((d) => d.v.parts).map((d) => d.v.parts)) || fileDateOrder;
  const dates = parsed.map((d) => ({ ...d, v: applyDateOrder(d.v, order) }));
  if (!dates.length) {
    const sp = meta.spans[0];
    if (!sp) return null;
    const pad = (n) => String(n).padStart(2, "0");
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const [m1, m2] = sp.kind === "quarter" ? [sp.q * 3 - 2, sp.q * 3] : [sp.m, sp.m];
    return { from: `${sp.y}-${pad(m1)}-01`, to: `${sp.y}-${pad(m2)}-${lastDay(sp.y, m2)}`, original: sp.text, ref: sp.ref, ambiguous: false, basis: sp.kind === "quarter" ? "quarter named in the title" : "month named in the title" };
  }
  const ok = dates.filter((d) => d.v.value);
  const amb = dates.filter((d) => !d.v.value);
  return {
    from: ok[0]?.v.value ?? null, to: ok.length > 1 ? ok[ok.length - 1].v.value : null,
    original: dates.map((d) => d.text).join(" – "), ref: dates[0].ref,
    ambiguous: amb.length > 0,
  };
}

const MONTH_NO = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const PERCENT_HEADER = /%|\bper ?cent/i;
// A "buying unit" column (CPT, CPM, per insertion) describes price columns only.
const UNIT_APPLIES = /\b(rate|price|cost|cpm|cpt|cpp)\b/i;
const unitIn = (label) => (String(label || "").match(/\(([^)]*\b(000s?|m|mins?|secs?|seconds|minutes|£|gbp)\b[^)]*)\)/i) || [])[1] || null;
const RATE_HEADER = /\brate\b/i;

// ---- main ----------------------------------------------------------------

export function readSheet(g, file, opts = {}) {
  const tables = [];
  const issues = [];      // things a person should look at
  const skipped = [];     // rows/cells deliberately not read, with reasons
  let r = 1;
  let preambleLines = [];

  while (r <= g.rows) {
    if (isBlank(g, r)) { r++; continue; }
    if (!looksLikeHeader(g, r)) {
      const cells = rowCells(g, r);
      if (looksLikePair(cells)) {
        // start of a label/value list
        const kv = readKeyValue(g, r, file, preambleLines, issues);
        if (kv) { tables.push(kv.table); r = kv.next; preambleLines = []; continue; }
      }
      preambleLines.push({ text: cells.map((x) => String(x.raw)).join("  "), ref: cells[0].ref });
      r++;
      continue;
    }
    const h = settleHeader(g, r);
    if (h !== r) { preambleLines.push(...rowCells(g, r).slice(0, 1).map(() => ({ text: rowCells(g, r).map((x) => String(x.raw)).join("  "), ref: rowCells(g, r)[0].ref, groupRow: true }))); }
    const t = readTable(g, h, file, preambleLines, issues, skipped, opts);
    tables.push(t.table);
    preambleLines = [];
    r = t.next;
  }
  if (!tables.length && preambleLines.length) {
    issues.push({ level: "warn", ref: preambleLines[0].ref, text: "No table found on this sheet: only text lines. Nothing was read as data." });
  }
  return { sheet: g.sheet, sheetHidden: g.sheetHidden, tables, issues, skipped, notes: preambleLines };
}

function readTable(g, headerRow, file, preambleLines, issues, skipped, opts) {
  const decisions = [];
  const hdrCells = rowCells(g, headerRow);
  const span = { left: hdrCells[0].c, right: hdrCells[hdrCells.length - 1].c };
  const group = groupLabels(g, headerRow, span, decisions);
  const pre = preambleLines.filter((l) => !l.groupRow && (!group || l.ref !== ref(group.row, span.left)));
  const meta = readPreamble(pre);

  const columns = [];
  for (let c = span.left; c <= span.right; c++) {
    const h = at(g, headerRow, c);
    const grp = group?.labels.get(c) || null;
    const name = h ? String(h.raw).trim() : "";
    if (!name && !grp) continue;
    if (!name) issues.push({ level: "warn", ref: ref(headerRow, c), text: `Column ${ref(headerRow, c).replace(/\d+/, "")} has no header. Its values were not read.` });
    columns.push({ c, name, group: grp, label: grp ? `${grp} › ${name}` : name, ref: ref(headerRow, c), hidden: g.hiddenCols.has(c), comment: h?.comment || null });
  }

  // ---- walk the body
  const dataRows = [], noteRows = [], groupRows = [];
  let currentGroup = null, r = headerRow + 1, blanks = 0;
  for (; r <= g.rows; r++) {
    if (isBlank(g, r)) { blanks++; if (blanks >= 2 && dataRows.length) break; continue; }
    if (blanks >= 1 && dataRows.length && looksLikeHeader(g, r)) break; // a new table starts after a gap
    const row = classifyRow(g, r, span);
    const firstText = row.first ? String(row.first.raw) : "";
    if (row.n === 0) continue;
    if (TOTAL_RE.test(firstText)) {
      skipped.push({ ref: row.first.ref, text: `Total row "${firstText}" skipped (totals are calculated, not read)` });
      blanks = 0; continue;
    }
    if (row.n === 1 && row.first.c === span.left && row.numeric === 0) {
      // group label (followed by data) or a note (not followed by data)
      let k = r + 1; while (k <= g.rows && isBlank(g, k)) k++;
      const next = k <= g.rows ? classifyRow(g, k, span) : null;
      const isGroup = next && next.n >= 2 && next.numeric >= 1 && firstText.length <= 40 && !NOTE_LEAD_RE.test(firstText) && dataRows.length >= 0;
      if (isGroup && !(blanks >= 1 && dataRows.length && NOTE_LEAD_RE.test(firstText))) {
        currentGroup = { text: firstText.trim(), ref: row.first.ref };
        groupRows.push(currentGroup);
        blanks = 0; continue;
      }
      noteRows.push({ text: firstText.trim(), ref: row.first.ref });
      blanks = 0; continue;
    }
    if (row.n >= 2 || (row.n === 1 && row.numeric === 1)) {
      dataRows.push({ r, group: currentGroup, hidden: g.hiddenRows.has(r) });
      blanks = 0; continue;
    }
    noteRows.push({ text: row.cells.map((x) => String(x.raw)).join("  "), ref: row.first.ref });
  }
  // notes directly after the table (single-cell lines until the next blank gap or header)
  let next = r;
  while (next <= g.rows) {
    if (isBlank(g, next)) { next++; continue; }
    if (looksLikeHeader(g, next)) break;
    const cells = rowCells(g, next);
    if (looksLikePair(cells) && normaliseValue(cells[1].raw, cells[1].text).kind !== "text") break; // a label/value list
    if (cells.length >= 3) break;
    noteRows.push({ text: cells.map((x) => String(x.raw)).join("  "), ref: cells[0].ref });
    next++;
  }
  if (groupRows.length) decisions.push(`Label rows inside the data (${groupRows.map((x) => `"${x.text}"`).join(", ")}) carried down as a "group" column`);

  // ---- column roles from the body
  for (const col of columns) {
    const vals = dataRows.map((d) => at(g, d.r, col.c)).filter(Boolean).map((x) => ({ x, v: normaliseValue(x.raw, x.text, { numFmt: x.numFmt }) }));
    const nonEmpty = vals.filter(({ v }) => !(v.kind === "none" && v.reason === "empty"));
    const textish = nonEmpty.filter(({ v }) => v.kind === "text" || v.kind === "boolean").length;
    const dates = nonEmpty.filter(({ v }) => v.kind === "date").length;
    const placeholders = nonEmpty.filter(({ v }) => v.kind === "none").length;
    const mostlyText = textish > 0 && textish >= (nonEmpty.length - placeholders) / 2;
    const roleByName = DIM_ROLES.find(([role, re]) => role === "notes" && re.test(col.name));
    if (roleByName && mostlyText) col.role = "notes";
    else if (dates && dates >= nonEmpty.length / 2) col.role = "period";
    else if (mostlyText) col.role = dimRole(col.name, nonEmpty.map(({ v }) => String(v.value)));
    else col.role = "measure";
    if (col.role === "measure") {
      const nums = nonEmpty.filter(({ v }) => v.kind === "number");
      col.percent = PERCENT_HEADER.test(col.label) || (RATE_HEADER.test(col.label) && nums.length > 0 && nums.every(({ v }) => v.value >= 0 && v.value <= 1));
      if (col.percent && !PERCENT_HEADER.test(col.label)) decisions.push(`"${col.label}": every value is between 0 and 1, so they were read as percentages (0.41 → 41%)`);
      const unitM = col.label.match(/\(([^)]*(000s?|£|gbp|%|mins?|secs?|seconds|minutes)[^)]*)\)/i);
      if (unitM) col.unit = unitM[1];
      const curr = col.label.match(/\b(GBP|USD|EUR)\b|£/i);
      if (curr) col.currency = curr[0] === "£" ? "GBP" : curr[0].toUpperCase();
    }
    // hidden columns are read but marked
    if (col.hidden) decisions.push(`Column "${col.label}" (${col.ref.replace(/\d+/, "")}) is hidden. Its values were read and marked hidden; they are never used in a plan unless a planner chooses them.`);
  }

  // dates in columns: decide day/month order per column, then fall back to the whole file
  const dateOrderByCol = new Map();
  for (const col of columns.filter((c) => c.role === "period")) {
    const parts = dataRows.map((d) => at(g, d.r, col.c)).filter(Boolean).map((x) => parseDateText(String(x.raw))).filter((v) => v?.parts).map((v) => v.parts);
    const order = resolveDateOrder(parts) || opts.fileDateOrder || null;
    dateOrderByCol.set(col.c, order);
    if (parts.length) decisions.push(order
      ? `Dates in "${col.label}" read as ${order === "mdy" ? "month/day/year (US)" : "day/month/year (UK)"} because ${resolveDateOrder(parts) ? "at least one date only makes sense that way" : "the file's other dates use that order"}`
      : `Dates in "${col.label}" are ambiguous (could be UK or US order). Flagged, not guessed.`);
  }

  // ---- notes: lines above the table (except the title) and below it, each with a scope
  const aboveNotes = meta.lines.slice(1).map((l) => ({ ...l, where: "above" }));
  const tableNotes = [...aboveNotes, ...noteRows.map((n) => ({ ...n, where: "below" }))].filter((n) => !isBoilerplate(n.text));
  for (const n of tableNotes) {
    n.scope = noteScope(n.text, columns);
    n.qualifiers = qualifiersOf(n.text);
    if (n.scope.kind !== "table") decisions.push(`Note "${n.text}" applied to ${describeScope(n.scope)}`);
  }
  const markerNotes = new Map();
  for (const n of tableNotes) {
    const m = n.text.match(/^\s*([*†‡#]+)\s*(.+)$/);
    if (m) markerNotes.set(m[1], { ...n, meaning: m[2] });
  }
  const conditional = [];
  for (const n of tableNotes) {
    const m = n.text.match(/^\s*(.+?)\s*=\s*([^:]+?)\s*:\s*(.+)$/);
    if (!m) continue;
    const col = columns.find((c) => c.name.toLowerCase() === m[1].trim().toLowerCase());
    if (col) {
      conditional.push({ col, value: m[2].trim().toLowerCase(), note: n, modelled: /modell?ed/i.test(m[3]) });
      decisions.push(`Note "${n.text}" applied only to rows where "${col.name}" = ${m[2].trim()}`);
    }
  }
  const noSum = tableNotes.filter((n) => /do not (sum|add)|don't (sum|add)|not (be )?summ?ed|may not sum|not comparable|overlap/i.test(n.text));
  const commaNote = tableNotes.some((n) => /comma.*decimal/i.test(n.text));

  // which dimension supplies the metric name (transposed tables)
  const metricCol = columns.find((c) => c.role === "metric") ||
    (columns.filter((c) => c.role === "measure").every((c) => hasAudienceMeaning(parseAudience(c.label)))
      ? columns.find((c) => c.role === "attribute" && c.c === span.left) : null);
  if (metricCol && metricCol.role !== "metric") { metricCol.role = "metric"; decisions.push(`Table is transposed: metrics are in rows ("${metricCol.name}"), audiences are in the columns`); }

  const tableRange = `${ref(group ? group.row : headerRow, span.left)}:${ref(Math.max(headerRow, ...dataRows.map((d) => d.r)), span.right)}`;

  // ---- values
  const values = [];
  for (const d of dataRows) {
    const rowDims = { entity: [], audience: [], period: [], unit: [], attribute: [], metric: null, notes: [] };
    for (const col of columns.filter((c) => c.role !== "measure")) {
      const x = at(g, d.r, col.c);
      if (!x) continue;
      let v = normaliseValue(x.raw, x.text, { numFmt: x.numFmt });
      if (v.kind === "date") v = applyDateOrder(v, dateOrderByCol.get(col.c));
      const item = { column: col.label, text: String(x.raw).trim(), ref: x.ref, value: v.kind === "date" ? v.value : null, flags: v.flags, comment: x.comment };
      if (col.role === "metric") rowDims.metric = item;
      else if (col.role === "notes") rowDims.notes.push(item);
      else rowDims[col.role].push(item);
      if (v.flags?.includes("ambiguous_date")) issues.push({ level: "warn", ref: x.ref, text: `Ambiguous date "${x.text}": day/month order unknown. Flagged for review.` });
      if (x.comment) rowDims.notes.push({ column: "comment", text: x.comment, ref: x.ref });
    }
    const condNotes = conditional.filter((cn) => {
      const x = at(g, d.r, cn.col.c);
      return x && String(x.raw).trim().toLowerCase() === cn.value;
    });

    for (const col of columns.filter((c) => c.role === "measure")) {
      const x = at(g, d.r, col.c);
      if (!x) continue;
      const v = normaliseValue(x.raw, x.text, { numFmt: x.numFmt, percentColumn: col.percent });
      if (v.kind === "none" && v.reason === "empty") continue;

      const colAud = parseAudience(col.label);
      const metricLabel = rowDims.metric?.text || (hasAudienceMeaning(colAud) && !/%|rate|share/i.test(col.name) ? (meta.metric || "value") : col.label);
      const audLabels = [];
      if (hasAudienceMeaning(colAud) && metricLabel !== col.label) audLabels.push({ text: col.label, ref: col.ref });
      for (const a of rowDims.audience) audLabels.push(a);
      const audience = mergeAudience(audLabels);

      const flags = [...(v.flags || [])];
      const notes = [...rowDims.notes];
      if (v.marker && markerNotes.has(v.marker)) notes.push({ column: "footnote", text: markerNotes.get(v.marker).meaning, ref: markerNotes.get(v.marker).ref });
      else if (v.marker) issues.push({ level: "warn", ref: x.ref, text: `"${x.text}" has a "${v.marker}" marker but no footnote explains it.` });
      if (x.comment) { notes.push({ column: "comment", text: x.comment, ref: x.ref }); }
      if (col.comment) notes.push({ column: "header comment", text: col.comment, ref: col.ref });
      for (const cn of condNotes) { notes.push({ column: "note", text: cn.note.text, ref: cn.note.ref }); if (cn.modelled) flags.push("modelled"); }
      if (v.flags?.includes("comma_decimal") && !commaNote) issues.push({ level: "warn", ref: x.ref, text: `"${x.text}" read as ${v.value} (comma as decimal point). No note in the file confirms this.` });
      if (v.kind === "text") issues.push({ level: "warn", ref: x.ref, text: `"${x.text}" in a number column ("${col.label}") can't be read as a number. Marked needs review.` });
      if (d.hidden) flags.push("hidden_row");
      if (col.hidden) flags.push("hidden_column");
      if (v.scale) flags.push("abbreviated");
      const scopedNotes = tableNotes.filter((n) => noteApplies(n.scope, { row: d.r, column: col.label, group: col.group }));
      const qualifiers = [];
      for (const n of [...notes, ...scopedNotes]) for (const q of n.qualifiers || qualifiersOf(n.text)) qualifiers.push({ key: q, text: n.text, ref: n.ref, scope: n.scope ? describeScope(n.scope) : "this row" });

      values.push({
        file, sheet: g.sheet, ref: x.ref, hidden: Boolean(d.hidden || col.hidden),
        original: v.original,
        kind: v.kind, value: v.value ?? null, min: v.min, max: v.max, currency: v.currency || col.currency, scale: v.scale,
        reason: v.reason || null,
        needsReview: v.kind === "text" || flags.includes("ambiguous_date") || Boolean(rowDims.period[0]?.flags?.includes("ambiguous_date")),
        metric: metricLabel,
        unit: (rowDims.unit[0] && UNIT_APPLIES.test(col.name) ? rowDims.unit[0].text : null) || col.unit || unitIn(metricLabel) || (metricLabel === meta.metric ? meta.unit : null) || (v.kind === "duration" ? "seconds" : null),
        column: col.label,
        audience,
        entity: rowDims.entity.map((e) => e.text).join(" / ") || null,
        attributes: Object.fromEntries(rowDims.attribute.map((a) => [a.column, a.text])),
        group: d.group?.text || null,
        period: rowDims.period[0] ? (rowDims.period[0].value || (rowDims.period[0].flags?.includes("ambiguous_date") ? null : rowDims.period[0].text)) : (d.group?.text || null),
        tablePeriod: null, // filled below
        flags, notes,
        tableNotes: scopedNotes.map((n) => n.text),
        qualifiers,
        table: tableRange,
      });
    }
  }

  harmoniseMoney(values, decisions);

  const period = resolvePeriod(meta, opts.fileDateOrder);
  for (const v of values) v.tablePeriod = period;
  if (period?.ambiguous) issues.push({ level: "warn", ref: period.ref, text: `Period "${period.original}" has dates whose day/month order can't be decided. Flagged.` });
  if (commaNote) decisions.push("A note in the file says commas are decimal points, which confirms reading \"5,38\" as 5.38");
  for (const n of noSum) decisions.push(`Note kept with every value in this table: "${n.text}"`);
  if (meta.unit) decisions.push(`Unit "${meta.unit}" and metric "${meta.metric}" taken from the title line and applied to the values`);

  return {
    next,
    table: {
      range: tableRange, columnPeriod: columnPeriodOf(values),
      headerRow, groupRow: group?.row || null,
      title: meta.title, period, unit: meta.unit, metric: meta.metric, source: meta.source,
      columns: columns.map(({ c, label, role, hidden, ref: cref, percent }) => ({ label, role, hidden, ref: cref, percent: Boolean(percent) })),
      rows: dataRows.length, groups: groupRows.map((x) => x.text),
      notes: tableNotes, preamble: meta.lines, decisions, values,
    },
  };
}

// One column with money written several ways ("£10,000", "10000", "£5k"):
// if a column holds money in one currency and otherwise only plain numbers,
// read the plain numbers as that currency too, and flag each one.
function harmoniseMoney(values, decisions) {
  const byCol = new Map();
  for (const v of values) { const a = byCol.get(v.column) || []; a.push(v); byCol.set(v.column, a); }
  for (const [col, vs] of byCol) {
    const money = vs.filter((v) => v.kind === "currency" || (v.kind === "range" && v.currency));
    const plain = vs.filter((v) => v.kind === "number");
    const currencies = new Set(money.map((v) => v.currency).filter(Boolean));
    if (!money.length || !plain.length || currencies.size !== 1 || vs.some((v) => v.kind === "percent")) continue;
    const cur = [...currencies][0];
    for (const v of plain) { v.kind = "currency"; v.currency = cur; v.flags.push("currency_from_column"); }
    const forms = [...new Set(vs.filter((v) => v.kind === "currency").map((v) => v.original))].slice(0, 4).map((o) => `"${o}"`).join(", ");
    decisions.push(`"${col}" writes money in different ways (${forms}). All read as ${cur}; the ${plain.length} figure(s) without a currency sign are flagged.`);
  }
}

function columnPeriodOf(values) {
  const ds = values.map((v) => v.period).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p || "")).sort();
  return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
}

function mergeAudience(labels) {
  const out = { labels: labels.map((l) => l.text), age: null, gender: null, type: null, qualifier: null, notAgeBand: false, unknownAge: false };
  for (const l of labels) {
    const a = parseAudience(l.text);
    if (a.unknown) { out.unknownAge = out.unknownAge || /age/i.test(l.column || "") || !out.age; continue; }
    if (a.age && !out.age) out.age = a.age;
    if (a.gender && !out.gender) out.gender = a.gender;
    if (a.type && !out.type) out.type = a.type;
    if (a.qualifier && !out.qualifier) out.qualifier = a.qualifier;
    if (a.basis) out.basis = a.basis;
  }
  // gender columns that say "Unknown"
  for (const l of labels) if (/^unknown$/i.test(l.text) && /gender|sex/i.test(l.column || "")) out.gender = "unknown";
  if (!out.age) out.notAgeBand = true;
  return out;
}

// A label/value pair: a text label, then a value, then optionally a note.
function looksLikePair(cells) {
  if (cells.length < 2 || cells.length > 3) return false;
  if (cells[1].c !== cells[0].c + 1 && cells[1].c !== cells[0].c + 2) return false;
  return normaliseValue(cells[0].raw, cells[0].text).kind === "text";
}

// Label/value lists with no header row: "Subscribers | 38,500 | as of Oct"
function readKeyValue(g, r0, file, preambleLines, issues) {
  const meta = readPreamble(preambleLines);
  const values = [], decisions = ["No header row: read as a list of labels and values"];
  const notes = meta.lines.slice(1).filter((l) => !isBoilerplate(l.text)).map((l) => ({ ...l, where: "above", scope: { kind: "table" }, qualifiers: qualifiersOf(l.text) }));
  const period = resolvePeriod(meta, null);
  let r = r0;
  for (; r <= g.rows; r++) {
    if (isBlank(g, r)) break;
    const cells = rowCells(g, r);
    if (!looksLikePair(cells)) break;
    const [k, x, extra] = cells;
    const label = String(k.raw).trim().replace(/\s*:\s*$/, "");
    const v = normaliseValue(x.raw, x.text, { numFmt: x.numFmt, percentColumn: /%|rate/i.test(label) && typeof x.raw === "number" && x.raw >= 0 && x.raw <= 1 });
    if (v.flags?.includes("fraction_read_as_percent")) decisions.push(`"${label}" = ${x.raw}, read as ${Math.round(v.value * 100) / 100}% because the label is a rate`);
    if (v.kind === "text") decisions.push(`"${label}" = "${v.value}" is a description, not a number. Kept as text.`);
    const rowNotes = [];
    if (x.comment) rowNotes.push({ column: "comment", text: x.comment, ref: x.ref });
    if (k.comment) rowNotes.push({ column: "comment", text: k.comment, ref: k.ref });
    if (extra) rowNotes.push({ column: "note", text: String(extra.raw).trim(), ref: extra.ref });
    const qualifiers = [...rowNotes, ...notes].flatMap((n) => (n.qualifiers || qualifiersOf(n.text)).map((q) => ({ key: q, text: n.text, ref: n.ref, scope: n.scope ? "every value in the list" : "this row" })));
    const flags = [...(v.flags || [])];
    if (v.scale) flags.push("abbreviated");
    values.push({
      file, sheet: g.sheet, ref: x.ref, hidden: g.hiddenRows.has(r) || g.hiddenCols.has(x.c), original: v.original,
      kind: v.kind, value: v.value ?? null, min: v.min, max: v.max, currency: v.currency, scale: v.scale, reason: v.reason || null,
      needsReview: false, metric: label, unit: unitIn(label), column: label, audience: mergeAudience([{ text: meta.title || "" }]),
      entity: meta.title || null, attributes: {}, group: null, period: null, tablePeriod: period,
      flags, notes: rowNotes, tableNotes: notes.map((n) => n.text), qualifiers, table: `${ref(r0, k.c)}:${ref(r, x.c)}`,
    });
  }
  if (!values.length) return null;
  // a list of words only (e.g. "Prepared by | Jo") is information, not data
  if (!values.some((v) => v.kind !== "text")) return null;
  for (const v of values) v.table = `${ref(r0, 1)}:${ref(r - 1, 3)}`;
  return { next: r, table: { range: `${ref(r0, 1)}:${ref(r - 1, values.some((v) => v.notes.some((n) => n.column === "note")) ? 3 : 2)}`, headerRow: null, title: meta.title, period, columns: [], rows: values.length, groups: [], notes, preamble: meta.lines, decisions, values, layout: "label_value" } };
}
