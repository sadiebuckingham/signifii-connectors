// Agreed decisions, kept in the client's folder as a spreadsheet people can read
// and edit (switch off, change, delete). Fixed columns, read deterministically.
// A connector defines which decision types exist and what each one does.
import ExcelJS from "exceljs";
import { xlsxToGrids, rowCells, at } from "../sources/grid.js";

export const DECISION_COLUMNS = ["Decision ID", "Type", "Applies to", "Use", "Agreed by", "Date", "Why", "On"];
const COL_RE = {
  id: /^decision\s*id$/i, type: /^type$/i, appliesTo: /^applies\s*to$/i, use: /^use$/i,
  agreedBy: /^agreed\s*by$/i, date: /^date$/i, why: /^(why|notes?|reason)$/i, on: /^(on|active|on\s*\/\s*off)$/i,
};

export async function readDecisions(buffer, fileName, typeOf) {
  const grids = await xlsxToGrids(buffer);
  for (const g of grids) {
    for (let r = 1; r <= Math.min(g.rows, 20); r++) {
      const map = {};
      for (const x of rowCells(g, r)) for (const [k, re] of Object.entries(COL_RE)) if (re.test(String(x.raw).trim()) && !map[k]) map[k] = x.c;
      if (!(map.type && map.appliesTo && map.use)) continue;
      const out = [], problems = [];
      for (let k = r + 1; k <= g.rows; k++) {
        const text = (f) => { const c = map[f] ? at(g, k, map[f]) : null; return c ? String(c.raw instanceof Date ? c.raw.toISOString().slice(0, 10) : c.raw).trim() : ""; };
        if (!text("type") && !text("appliesTo") && !text("use")) continue;
        const d = {
          id: text("id") || `D${k}`, typeText: text("type"), type: typeOf(text("type")),
          appliesTo: text("appliesTo"), use: text("use"), agreedBy: text("agreedBy"), date: text("date"), why: text("why"),
          on: text("on") === "" || /^(y|yes|on|true|1)$/i.test(text("on")),
          source: { file: fileName, sheet: g.sheet, ref: `row ${k}` },
        };
        if (!d.type) problems.push(`Row ${k}: type "${d.typeText}" isn't one of the decision types, so it isn't used.`);
        else if (!d.appliesTo || !d.use) problems.push(`Row ${k}: "Applies to" and "Use" are both needed, so it isn't used.`);
        out.push({ ...d, usable: Boolean(d.type && d.appliesTo && d.use && d.on) });
      }
      return { decisions: out, problems };
    }
  }
  return { decisions: [], problems: ["No header row with Type / Applies to / Use was found."] };
}

// Add one decision row; creates the workbook if there isn't one yet.
export async function appendDecision(existing, { id, typeLabel, appliesTo, use, agreedBy, date, why }, { title, typeLabels }) {
  const wb = new ExcelJS.Workbook();
  let ws;
  if (existing) { await wb.xlsx.load(existing); ws = wb.getWorksheet("Decisions") || wb.worksheets[0]; }
  else {
    ws = wb.addWorksheet("Decisions");
    ws.addRow([title]); ws.getRow(1).font = { bold: true, size: 14 };
    ws.addRow(["Decisions agreed in Claude. The connector applies these every time. Edit, switch off (On = No) or delete rows here."]);
    ws.addRow([]);
    ws.addRow(DECISION_COLUMNS);
    ws.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2A4A" } };
    [12, 34, 26, 26, 18, 12, 50, 6].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    const t = wb.addWorksheet("Types");
    typeLabels.forEach((l, i) => (t.getCell(i + 1, 1).value = l));
    t.getColumn(1).width = 60;
  }
  ws.addRow([id, typeLabel, appliesTo, use, agreedBy, date, why || "", "Yes"]);
  const last = ws.rowCount;
  ws.getCell(last, 2).dataValidation = { type: "list", allowBlank: false, formulae: ["=Types!$A$1:$A$" + typeLabels.length] };
  ws.getCell(last, 8).dataValidation = { type: "list", allowBlank: false, formulae: ['"Yes,No"'] };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
