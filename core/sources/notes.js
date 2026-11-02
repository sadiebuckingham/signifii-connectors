// Notes found in a file (title lines, footnotes, notes columns, cell comments):
// where each one applies, and whether it changes what a figure means.
// General rules only. A note is never used to change a value, only kept with it.

// Notes that change a value's meaning. Each match is reported under
// "Notes that change what a figure means" and kept on every value it covers.
export const QUALIFIERS = [
  { key: "tax", label: "Tax basis (VAT included or excluded)", re: /\b(vat|gst|sales tax)\b/i },
  { key: "commission", label: "Commission or fees included or excluded", re: /\b(commission|agency fees?|fees?\s+(not\s+)?(included|excluded|extra)|production costs?)\b/i },
  { key: "adjustment", label: "Uplift, discount or surcharge", re: /\b(uplift|discount|surcharge|premium|loading|mark-?up)\b|(^|\s)[+−-]\s?\d+(\.\d+)?\s?%|\balready applied\b/i },
  { key: "basis", label: "Price or figure basis (card rate, net/gross, indicative, estimate)", re: /\b(card rates?|vs card|pre-?negotiation|negotiated|net of|\bnet\b|\bgross\b|indicative|estimates?|estimated|provisional|auction)\b/i },
  { key: "unconfirmed", label: "Not yet confirmed", re: /\b(to (be )?confirm(ed)?|still to confirm|awaiting|waiting on|tbc|subject to (change|availability|confirmation))\b/i },
];

export function qualifiersOf(text) {
  const t = String(text || "");
  return QUALIFIERS.filter((q) => q.re.test(t)).map((q) => q.key);
}

const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9+%.-]+/g) || [];

/**
 * Decide which values a table-level note applies to.
 * Returns { kind: "rows", rows:[...] } | { kind: "column", label } | { kind: "group", label } | { kind: "table" }.
 * Only clear, explicit mentions narrow the scope; anything else applies to the whole table.
 */
export function noteScope(text, columns) {
  const t = String(text || "");
  // "rows 8 & 11", "row 12", "rows 8, 9 and 11" (spreadsheet row numbers)
  const m = t.match(/\brows?\s+(\d+(?:\s*(?:,|&|and)\s*\d+)*)/i);
  if (m) return { kind: "rows", rows: m[1].split(/\s*(?:,|&|and)\s*/i).map(Number).filter(Boolean) };
  const lower = t.toLowerCase();
  // a group label mentioned by its first word, e.g. "Digital figures are…" for "Digital (site + app)"
  const groups = [...new Set(columns.map((c) => c.group).filter(Boolean))];
  const gHits = groups.filter((gl) => { const w = words(gl)[0]; return w && w.length >= 4 && new RegExp(`\\b${w.replace(/[.+%-]/g, "\\$&")}\\b`, "i").test(lower); });
  if (gHits.length === 1) return { kind: "group", label: gHits[0] };
  // a column named in full, e.g. "Eng. rate = engagements / impressions"
  const cHits = columns.filter((c) => c.name && c.name.length >= 4 && lower.includes(c.name.toLowerCase()));
  if (cHits.length === 1) return { kind: "column", label: cHits[0].label };
  return { kind: "table" };
}

export function noteApplies(scope, { row, column, group }) {
  if (!scope || scope.kind === "table") return true;
  if (scope.kind === "rows") return scope.rows.includes(row);
  if (scope.kind === "column") return scope.label === column;
  if (scope.kind === "group") return scope.label === group;
  return true;
}

export function describeScope(scope) {
  if (!scope || scope.kind === "table") return "every value in the table";
  if (scope.kind === "rows") return `rows ${scope.rows.join(", ")} only`;
  if (scope.kind === "column") return `the "${scope.label}" column only`;
  return `the "${scope.label}" columns only`;
}

// Lines that are labels, not information.
export const isBoilerplate = (text) => /^\s*notes?\s*:?\s*$/i.test(text) || /^fictional demo data\b/i.test(String(text).trim());
