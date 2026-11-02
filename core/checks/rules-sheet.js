// Reads a rules spreadsheet with fixed columns. Deterministic: no AI, no
// guessing. A row the code can't read becomes a rule that shows "not checked"
// with the reason, never a silently dropped or "passed" rule.
import { xlsxToGrids, csvToGrids, rowCells, at } from "../sources/grid.js";

// Column names accepted for each field (case-insensitive).
const COLS = {
  id: /^(rule\s*)?(id|no\.?|number|#)$/i,
  type: /^(rule\s*)?type$/i,
  description: /^(rule|description|rule description)$/i,
  appliesTo: /^applies\s*to$/i,
  limit: /^(limit|value|threshold)$/i,
  severity: /^severity$/i,
  on: /^(on|active|enabled|on\s*\/\s*off)$/i,
  note: /^(notes?|comments?)$/i,
};

/**
 * @param {Buffer} buffer  rules.xlsx (or .csv)
 * @param {string} fileName
 * @param {(text:string)=>string|null} typeOf  maps the sheet's "Rule type" text to a known type code (or null)
 */
export async function readRulesSheet(buffer, fileName, typeOf) {
  const grids = /\.csv$/i.test(fileName) ? csvToGrids(buffer, fileName) : await xlsxToGrids(buffer);
  const problems = [];
  for (const g of grids) {
    for (let r = 1; r <= Math.min(g.rows, 20); r++) {
      const cells = rowCells(g, r);
      const map = {};
      for (const x of cells) for (const [k, re] of Object.entries(COLS)) if (re.test(String(x.raw).trim()) && !map[k]) map[k] = x.c;
      if (!(map.type && map.limit !== undefined || map.type && map.appliesTo)) continue;
      // header found
      const rules = [];
      for (let k = r + 1; k <= g.rows; k++) {
        const get = (f) => (map[f] ? at(g, k, map[f]) : null);
        const typeCell = get("type");
        const anything = Object.keys(map).some((f) => get(f));
        if (!anything) continue;
        if (!typeCell) { problems.push(`Row ${k} has no rule type, skipped.`); continue; }
        const text = (f) => { const c = get(f); return c ? String(c.raw).trim() : ""; };
        const typeText = text("type");
        const type = typeOf(typeText);
        const sev = text("severity").toLowerCase();
        const onText = text("on").toLowerCase();
        const rule = {
          id: text("id") || `R${k}`,
          type, typeText,
          description: text("description") || typeText,
          appliesTo: text("appliesTo") || null,
          limit: text("limit") || null,
          severity: /warn/.test(sev) ? "warn" : /fail|block|error/.test(sev) ? "fail" : null,
          on: onText === "" ? true : /^(y|yes|on|true|1|✓|x)$/i.test(onText),
          note: text("note") || null,
          source: { file: fileName, sheet: g.sheet, ref: `row ${k}`, row: k },
        };
        if (!rule.severity) { rule.severity = "fail"; if (sev) rule.problem = `Severity "${text("severity")}" isn't "warn" or "fail".`; }
        if (!type) rule.problem = `Rule type "${typeText}" isn't one of the fixed rule types.`;
        rules.push(rule);
      }
      return { rules, problems, sheet: g.sheet, headerRow: r };
    }
  }
  return { rules: [], problems: ["No header row with a \"Rule type\" column was found."], sheet: null, headerRow: null };
}
