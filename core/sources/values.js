// Value normalisation. Turns one cell's original text into a normalised value,
// keeping the original. Never guesses: anything it can't read cleanly comes
// back as kind "text" or "none" with a reason, never as a made-up number.
//
// Result shape:
//   { kind: "number" | "percent" | "currency" | "range" | "none" | "date" | "duration" | "text" | "boolean",
//     value, min, max, currency, scale, marker, original, flags: [], reason }

const PLACEHOLDERS = new Map([
  ["n/a", "not available"], ["na", "not available"], ["n.a.", "not available"],
  ["tbc", "to be confirmed"], ["tba", "to be announced"], ["poa", "price on application"],
  ["--", "no value"], ["-", "no value"], ["–", "no value"], ["—", "no value"],
  ["x", "no value"], ["nil", "no value"], ["none", "no value"], ["?", "unknown"],
]);

const CURRENCY = { "£": "GBP", "$": "USD", "€": "EUR" };

function none(original, reason) {
  return { kind: "none", value: null, original, reason, flags: [] };
}

// Parse a bare numeric string (no currency, no %). Handles "12,345", "48.2k",
// "5,6" (comma decimal), "1.234,5" (EU). Returns { value, scale, flags } or null.
export function parseNumberText(s) {
  let t = s.trim().replace(/\s+/g, "");
  const flags = [];
  let scale = 1, scaleLabel = null;
  const sm = t.match(/^(.*\d)([kKmMbB])$/);
  if (sm) {
    t = sm[1];
    const k = sm[2].toLowerCase();
    scale = k === "k" ? 1e3 : k === "m" ? 1e6 : 1e9;
    scaleLabel = k;
  }
  if (!/^[+-]?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  let n;
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) n = Number(t.replace(/,/g, ""));          // 12,345.6
  else if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) { n = Number(t.replace(/\./g, "").replace(",", ".")); flags.push("eu_number_format"); } // 1.234,5
  else if (/^[+-]?\d+,\d{1,2}$/.test(t)) { n = Number(t.replace(",", ".")); flags.push("comma_decimal"); }                                 // 5,38
  else if (/^[+-]?\d*\.?\d+$/.test(t)) n = Number(t);
  else return null;
  if (!Number.isFinite(n)) return null;
  return { value: n * scale, scale: scaleLabel, flags };
}

// Durations like 0:00:17 or 1:23 (m:ss).
function parseDuration(s) {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] != null ? Number(m[3]) : null];
  const seconds = c == null ? a * 60 + b : a * 3600 + b * 60 + c;
  return { kind: "duration", value: seconds, unit: "seconds", flags: [] };
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

// Date text. Returns { kind: "date", parts: [a, b, y], style } for numeric dates
// (order resolved later by resolveDateOrder using the file's other dates),
// or a resolved ISO date for written / dotted / ISO dates.
export function parseDateText(s) {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { kind: "date", value: `${m[1]}-${m[2]}-${m[3]}`, style: "iso", flags: [] };
  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  const mo = m ? (MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()]) : null;
  if (m && mo && validDate(Number(m[3]), mo, Number(m[1]))) {
    return { kind: "date", value: iso(Number(m[3]), mo, Number(m[1])), style: "written", flags: [] };
  }
  m = t.match(/^(\d{1,2})([/.])(\d{1,2})\2(\d{4})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[3]), y = Number(m[4]);
    if (m[2] === ".") return validDate(y, b, a) ? { kind: "date", value: iso(y, b, a), style: "dotted_dmy", flags: [] } : null;
    return { kind: "date", parts: [a, b, y], style: "slash", value: null, flags: [] };
  }
  return null;
}

function validDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
function iso(y, mo, d) { return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }

// Decide day/month order for slash dates using all slash dates seen together
// (a column, or a whole file). Returns "dmy", "mdy" or null (still ambiguous).
export function resolveDateOrder(partsList) {
  let dmy = false, mdy = false;
  for (const [a, b] of partsList) { if (a > 12) dmy = true; if (b > 12) mdy = true; }
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  return null;
}
export function applyDateOrder(v, order) {
  if (v.kind !== "date" || v.value || !v.parts) return v;
  if (!order) return { ...v, flags: [...v.flags, "ambiguous_date"], reason: "Day/month order can't be decided from this file's other dates" };
  const [a, b, y] = v.parts;
  const [d, mo] = order === "dmy" ? [a, b] : [b, a];
  if (!validDate(y, mo, d)) return { ...v, kind: "text", value: null, reason: "Not a valid date" };
  return { ...v, value: iso(y, mo, d), flags: [...v.flags, order === "dmy" ? "uk_date_order" : "us_date_order"] };
}

// Main entry. `raw` is the cell's stored value (number, string, Date, boolean),
// `text` the text as displayed, `hints` = { percentColumn, numFmt }.
export function normaliseValue(raw, text, hints = {}) {
  const original = text ?? (raw == null ? "" : String(raw));
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) return none(original, "empty");

  if (raw instanceof Date) {
    return { kind: "date", value: raw.toISOString().slice(0, 10), original, flags: [] };
  }
  if (typeof raw === "boolean") return { kind: "boolean", value: raw, original, flags: [] };
  if (typeof raw === "number") {
    const fmt = hints.numFmt || "";
    if (fmt.includes("%")) return { kind: "percent", value: raw * 100, original, flags: ["stored_as_fraction"] };
    if (/[£$€]/.test(fmt)) return { kind: "currency", value: raw, currency: CURRENCY[fmt.match(/[£$€]/)[0]], original, flags: [] };
    if (hints.percentColumn && raw >= 0 && raw <= 1) {
      return { kind: "percent", value: raw * 100, original, flags: ["fraction_read_as_percent"] };
    }
    return { kind: "number", value: raw, original, flags: [] };
  }

  let s = String(raw).trim();
  const lower = s.toLowerCase();
  if (PLACEHOLDERS.has(lower)) return none(original, PLACEHOLDERS.get(lower));
  if (/^<\s*\d/.test(s)) return none(original, "below reporting threshold");
  if (/^>\s*\d/.test(s)) return none(original, "above reporting threshold (no exact value)");

  // Footnote marker: "12.4*", "45†"
  let marker = null;
  const mk = s.match(/^(.*?\d)\s*([*†‡#]+)$/);
  if (mk) { s = mk[1]; marker = mk[2]; }

  const withMarker = (v) => (marker ? { ...v, marker, flags: [...(v.flags || []), "footnote_marker"] } : v);

  // Range: "£6.20 - £7.10", "10-12k"
  const rg = s.match(/^([£$€]?\s*[\d.,]+[kKmM]?)\s*(?:-|–|to)\s*([£$€]?\s*[\d.,]+[kKmM]?)$/);
  if (rg && /\d/.test(rg[1]) && /\d/.test(rg[2]) && !/^\d{1,2}$/.test(rg[1].trim())) {
    const cur = (rg[1].match(/[£$€]/) || rg[2].match(/[£$€]/) || [])[0];
    const lo = parseNumberText(rg[1].replace(/[£$€\s]/g, "")), hi = parseNumberText(rg[2].replace(/[£$€\s]/g, ""));
    if (lo && hi) return withMarker({ kind: "range", value: null, min: lo.value, max: hi.value, currency: cur ? CURRENCY[cur] : undefined, original, flags: ["range_not_a_point"] });
  }

  // Currency: "£1,150", "£5k"
  const cm = s.match(/^([£$€])\s*(.+)$/) || s.match(/^(.+?)\s*(GBP|USD|EUR)$/i);
  if (cm) {
    const sym = cm[1].length === 1 ? cm[1] : null;
    const num = parseNumberText(sym ? cm[2] : cm[1]);
    if (num) return withMarker({ kind: "currency", value: num.value, currency: sym ? CURRENCY[sym] : cm[2].toUpperCase(), scale: num.scale, original, flags: num.flags });
  }

  // Percent: "41%", "3.2 %", "5,38 %"
  const pm = s.match(/^(.+?)\s*%$/);
  if (pm) {
    const num = parseNumberText(pm[1]);
    if (num) return withMarker({ kind: "percent", value: num.value, original, flags: num.flags });
  }

  const dur = parseDuration(s);
  if (dur) return { ...dur, original };

  const dt = parseDateText(s);
  if (dt) return { ...dt, original };

  const num = parseNumberText(s);
  if (num) {
    if (hints.percentColumn) return withMarker({ kind: "percent", value: num.value, original, flags: [...num.flags, "percent_from_header"] });
    return withMarker({ kind: "number", value: num.value, scale: num.scale, original, flags: [...num.flags, "number_stored_as_text"] });
  }

  return { kind: "text", value: s, original, flags: [] };
}

export const isNumericKind = (k) => k === "number" || k === "percent" || k === "currency" || k === "range" || k === "duration";
