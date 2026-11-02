// Checks for words Claude writes into a template slot. Shared by every connector.
//  - length limits (never shrink text to fit: reject instead)
//  - every number in the text must match a figure already in the document
//  - no [placeholders]

// Numbers as written: "£150,000", "40%", "4.1m", "203k", "6-8", "2026".
export function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/[£$€]?\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn|million|thousand)?\b%?/gi)) {
    const raw = m[0].trim();
    let t = raw.replace(/[£$€\s,%]/g, "");
    let mult = 1;
    const sm = t.match(/(k|m|bn|million|thousand)$/i);
    if (sm) { t = t.slice(0, -sm[1].length); mult = /^k|thousand$/i.test(sm[1]) ? 1e3 : /^bn$/i.test(sm[1]) ? 1e9 : 1e6; }
    const n = Number(t);
    if (Number.isFinite(n)) out.push({ raw, value: n * mult, base: n });
  }
  return out;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";

/**
 * Numbers in text that aren't in the document. Dates and age bands are checked
 * as whole phrases (so "30" can't pass just because 30 Nov is a campaign week).
 * allowed: { numbers: Iterable<number>, dates: Set<"MM-DD">, bands: Set<"4-9"> } or just Iterable<number>.
 */
export function unsourcedNumbers(text, allowed) {
  const a = allowed && allowed.numbers ? allowed : { numbers: allowed, dates: new Set(), bands: new Set() };
  const bad = [];
  let t = String(text);
  // dates: "9 November", "20 Dec 2026", "November 9"
  const dateRes = [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?:\\s+(\\d{4}))?`, "gi"), new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "gi")];
  for (const [i, re] of dateRes.entries()) t = t.replace(re, (m, x, y, yr) => {
    const [d, mon] = i === 0 ? [x, y] : [y, x];
    const key = `${String(MONTHS[mon.slice(0, 3).toLowerCase()]).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!a.dates?.has(key)) bad.push({ raw: m.trim(), value: NaN });
    return yr ? ` ${yr} ` : " ";
  });
  // age bands: "4-9", "4–9", "4 to 9"
  t = t.replace(/\b(\d{1,2})\s?(?:-|–|to)\s?(\d{1,2})\b(?!\s?%)/g, (m, x, y) => {
    if (!a.bands?.has(`${Number(x)}-${Number(y)}`)) bad.push({ raw: m, value: NaN });
    return " ";
  });
  const set = [...(a.numbers || [])].filter((x) => Number.isFinite(x));
  const near = (p, q) => Math.abs(p - q) <= Math.max(0.005, Math.abs(q) * 0.0005);
  for (const n of numbersIn(t)) if (!set.some((x) => near(n.value, x) || near(n.base, x))) bad.push(n);
  return bad;
}

export const hasPlaceholder = (text) => /\[[^\]]*\]|\[|\]|\{\{|\}\}|\bTODO\b|\bXXX\b|\blorem ipsum\b/i.test(String(text));

export function checkSlotText({ slot, text, limit, allowedNumbers, banned = [] }) {
  const problems = [];
  const t = String(text ?? "").trim();
  if (!t) problems.push(`${slot} is empty.`);
  if (limit && t.length > limit) problems.push(`${slot} is ${t.length} characters, max ${limit}. Shorten it; text is never shrunk to fit.`);
  if (hasPlaceholder(t)) problems.push(`${slot} contains a placeholder ("[", "]" or similar). Write the real words.`);
  const bad = unsourcedNumbers(t, allowedNumbers);
  if (bad.length) problems.push(`${slot} contains ${bad.map((b) => `"${b.raw}"`).join(", ")}, which ${bad.length === 1 ? "doesn't" : "don't"} match any figure in the plan. Use only figures shown in the plan, or no figures.`);
  for (const b of banned) if (b.re.test(t)) problems.push(`${slot}: ${b.why}`);
  return problems;
}
