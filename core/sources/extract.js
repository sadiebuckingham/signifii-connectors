// Pull labelled facts out of document text by pattern. No AI, no guessing:
// a fact is "found" only when the text states it clearly; if it's missing or
// stated two different ways, it's returned as missing/conflicting so a person
// is asked. Every found fact carries its source (file, page, line, quote).
import { parseDateText, parseNumberText, resolveDateOrder, applyDateOrder } from "./values.js";

const MONEY = /([£$€])\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|million|thousand)?\b/gi;
const DATE = /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4}|\d{1,2}[/.]\d{1,2}[/.]\d{4}|\d{4}-\d{2}-\d{2})\b/gi;

function* lines(doc) {
  for (const p of doc.pages) for (let i = 0; i < p.lines.length; i++) yield { page: p, i, text: p.lines[i] };
}
const src = (doc, l, quote) => ({ file: doc.file, page: l.page.label, ref: `${l.page.label}, line ${l.i + 1}`, quote: quote ?? l.text });

export function moneyIn(text) {
  return [...String(text).matchAll(MONEY)].map((m) => {
    const n = parseNumberText(m[2]); if (!n) return null;
    const mult = /^(k|thousand)$/i.test(m[3] || "") ? 1e3 : /^(m|million)$/i.test(m[3] || "") ? 1e6 : 1;
    return { value: Math.round(n.value * mult * 100) / 100, currency: { "£": "GBP", "$": "USD", "€": "EUR" }[m[1]], original: m[0].trim() };
  }).filter(Boolean);
}

export function datesIn(text, order) {
  return [...String(text).matchAll(DATE)].map((m) => {
    let v = parseDateText(m[1].replace(/(\d)(st|nd|rd|th)/i, "$1"));
    if (!v) return null;
    if (v.parts) v = applyDateOrder(v, order);
    return v.value ? { value: v.value, original: m[1] } : { value: null, original: m[1], ambiguous: true };
  }).filter(Boolean);
}

function docDateOrder(doc) {
  const parts = [];
  for (const l of lines(doc)) for (const m of l.text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) parts.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  return resolveDateOrder(parts);
}

// The text after a label on the same line, plus following lines until a heading or blank.
export function labelled(doc, labelRe, { follow = false, stopRe = /^(\d+\.\s|[A-Z][A-Za-z ]{2,30}:)/ } = {}) {
  for (const l of lines(doc)) {
    const m = l.text.match(new RegExp(`^\\s*(?:${labelRe.source})\\s*[:\\-–]?\\s*(.*)$`, "i"));
    const rest = m ? m[m.length - 1] : null;
    if (!rest || !rest.trim()) continue;
    let text = rest.split(/\s\|\s/)[0].trim();
    if (follow) {
      for (let k = l.i + 1; k < l.page.lines.length; k++) {
        const nxt = l.page.lines[k];
        if (stopRe.test(nxt) || /^[•\-*]\s/.test(nxt)) break;
        text += " " + nxt;
        if (/[.!?]$/.test(nxt)) break;
      }
    }
    return { value: text.replace(/\s+/g, " ").trim(), source: src(doc, l) };
  }
  return null;
}

// One money amount stated in lines that match `contextRe`. Conflicting amounts -> conflict.
export function money(doc, contextRe) {
  const found = [];
  for (const l of lines(doc)) if (contextRe.test(l.text)) for (const m of moneyIn(l.text)) found.push({ ...m, source: src(doc, l, m.original) });
  const distinct = [...new Set(found.map((f) => f.value))];
  if (!found.length) return { status: "missing" };
  if (distinct.length > 1) return { status: "conflict", options: found.map((f) => ({ value: f.value, original: f.original, source: f.source })) };
  return { status: "found", value: found[0].value, currency: found[0].currency, original: found[0].original, source: found[0].source, alsoAt: found.slice(1).map((f) => f.source.ref) };
}

// A start and end date stated together in lines that match `contextRe`.
export function dateRange(doc, contextRe) {
  const order = docDateOrder(doc);
  const found = [];
  for (const l of lines(doc)) {
    if (!contextRe.test(l.text)) continue;
    const ds = datesIn(l.text, order);
    if (ds.some((d) => d.ambiguous)) return { status: "ambiguous", original: l.text, source: src(doc, l) };
    if (ds.length >= 2) found.push({ start: ds[0].value, end: ds[1].value, original: `${ds[0].original} to ${ds[1].original}`, source: src(doc, l) });
  }
  if (!found.length) return { status: "missing" };
  const distinct = [...new Set(found.map((f) => `${f.start}|${f.end}`))];
  if (distinct.length > 1) return { status: "conflict", options: found };
  if (found[0].start > found[0].end) return { status: "conflict", options: found, reason: "The end date is before the start date." };
  return { status: "found", ...found[0], alsoAt: found.slice(1).map((f) => f.source.ref) };
}

// A single date in lines that match `contextRe`.
export function singleDate(doc, contextRe) {
  const order = docDateOrder(doc);
  const found = [];
  for (const l of lines(doc)) if (contextRe.test(l.text)) for (const d of datesIn(l.text, order)) found.push({ ...d, source: src(doc, l, d.original) });
  if (!found.length) return { status: "missing" };
  if (found.some((f) => f.ambiguous)) return { status: "ambiguous", original: found[0].original, source: found[0].source };
  const distinct = [...new Set(found.map((f) => f.value))];
  if (distinct.length > 1) return { status: "conflict", options: found };
  return { status: "found", value: found[0].value, original: found[0].original, source: found[0].source };
}
