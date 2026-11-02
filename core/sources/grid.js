// Turns a spreadsheet file (xlsx or csv) into plain grids of cells, one per
// sheet, keeping everything the reader needs for provenance: cell reference,
// stored value, displayed text, number format, comment, hidden row/column,
// merged ranges. Nothing is interpreted here.
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import JSZip from "jszip";
import path from "node:path";

export function colLetter(c) {
  let s = "";
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const ref = (r, c) => `${colLetter(c)}${r}`;

function rangeOf(a1) {
  const m = a1.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  const col = (L) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { top: Number(m[2]), left: col(m[1]), bottom: Number(m[4]), right: col(m[3]), ref: a1 };
}

function cellRaw(v) {
  if (v == null) return null;
  if (v instanceof Date || typeof v !== "object") return v;
  if (v.richText) return v.richText.map((t) => t.text).join("");
  if ("result" in v) return v.result ?? null;           // formula: keep the computed result
  if ("text" in v) return v.text;                        // hyperlink
  if (v.error) return null;
  return null;
}

function noteText(n) {
  if (!n) return null;
  if (typeof n === "string") return n;
  if (n.texts) return n.texts.map((t) => t.text).join("").trim();
  return null;
}

const XML_ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (t) => t.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(1).replace(/^x/i, ""), e[1] === "x" || e[1] === "X" ? 16 : 10)) : (XML_ENT[e] ?? m));
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];

// Read cell comments straight from the file (sheet name -> cell ref -> text).
// Excel files written by different tools store comments in different valid
// layouts, and libraries disagree on which they understand, so do it directly.
async function readComments(zip) {
  const out = new Map();
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wbXml || !wbRels) return out;
  const relTarget = new Map([...wbRels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unxml(attr(m[0], "name") || "");
    const target = relTarget.get(attr(m[0], "r:id"));
    if (!target) continue;
    const sheetPath = target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join("xl", target));
    const relsPath = path.posix.join(path.posix.dirname(sheetPath), "_rels", path.posix.basename(sheetPath) + ".rels");
    const rels = await zip.file(relsPath)?.async("string");
    if (!rels) continue;
    for (const r of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (!/\/comments$/.test(attr(r[0], "Type") || "")) continue;
      const t = attr(r[0], "Target");
      const cPath = t.startsWith("/") ? t.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(sheetPath), t));
      const xml = await zip.file(cPath)?.async("string");
      if (!xml) continue;
      const map = out.get(name) || new Map();
      for (const c of xml.matchAll(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g)) {
        const text = [...c[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => unxml(x[1])).join("").trim();
        if (text) map.set(attr(c[0], "ref"), text);
      }
      out.set(name, map);
    }
  }
  return out;
}

// Remove comment/VML parts before handing the file to ExcelJS (comments are
// read separately above), so unusual comment layouts can't break loading.
async function stripCommentParts(zip) {
  for (const relPath of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/_rels\/.+\.rels$/.test(n))) {
    const xml = await zip.file(relPath).async("string");
    const cleaned = xml.replace(/<Relationship\b[^>]*Type="[^"]*\/(comments|vmlDrawing)"[^>]*\/>/g, "");
    if (cleaned !== xml) zip.file(relPath, cleaned);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function xlsxToGrids(buffer, warnings = []) {
  const zip = await JSZip.loadAsync(buffer);
  let comments = new Map();
  try { comments = await readComments(zip); }
  catch { warnings.push("Cell comments in this file couldn't be read, so values were read without their comments. Check the file's comments by hand."); }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await stripCommentParts(zip));
  const grids = [];
  wb.eachSheet((ws) => {
    const merges = (ws.model.merges || []).map(rangeOf);
    const sheetComments = comments.get(ws.name) || new Map();
    const rows = ws.rowCount, cols = ws.columnCount;
    const cells = new Map();
    for (let r = 1; r <= rows; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= cols; c++) {
        const cell = row.getCell(c);
        const isSlave = cell.isMerged && cell.master && cell.master.address !== cell.address;
        const raw = isSlave ? null : cellRaw(cell.value);
        const comment = sheetComments.get(ref(r, c)) || noteText(cell.note);
        if (raw == null && !comment) continue;
        cells.set(`${r},${c}`, {
          ref: ref(r, c), r, c, raw,
          text: raw == null ? "" : (cell.text ?? String(raw)),
          numFmt: cell.numFmt || null,
          comment,
          formula: Boolean(cell.value && typeof cell.value === "object" && "formula" in cell.value),
        });
      }
    }
    const hiddenRows = new Set(), hiddenCols = new Set();
    for (let r = 1; r <= rows; r++) if (ws.getRow(r).hidden) hiddenRows.add(r);
    for (let c = 1; c <= cols; c++) if (ws.getColumn(c).hidden) hiddenCols.add(c);
    grids.push({ sheet: ws.name, sheetHidden: ws.state !== "visible", rows, cols, cells, merges, hiddenRows, hiddenCols });
  });
  return grids;
}

export function csvToGrids(buffer, name = "csv") {
  let text = buffer.toString("utf8").replace(/^﻿/, "");
  const first = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const delimiter = [",", ";", "\t", "|"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const records = parseCsv(text, { delimiter, relax_column_count: true, skip_empty_lines: false, bom: true });
  const cells = new Map();
  let cols = 0;
  records.forEach((rec, i) => {
    cols = Math.max(cols, rec.length);
    rec.forEach((v, j) => {
      if (v == null || String(v).trim() === "") return;
      cells.set(`${i + 1},${j + 1}`, { ref: ref(i + 1, j + 1), r: i + 1, c: j + 1, raw: String(v), text: String(v), numFmt: null, comment: null });
    });
  });
  return [{ sheet: name, sheetHidden: false, rows: records.length, cols, cells, merges: [], hiddenRows: new Set(), hiddenCols: new Set(), delimiter }];
}

export const at = (g, r, c) => g.cells.get(`${r},${c}`) || null;
export const rowCells = (g, r) => {
  const out = [];
  for (let c = 1; c <= g.cols; c++) { const x = at(g, r, c); if (x && x.raw != null) out.push(x); }
  return out;
};
