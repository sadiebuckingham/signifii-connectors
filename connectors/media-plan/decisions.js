// Decision types a planner can agree in Claude and save to Rules/decisions.xlsx.
// Each one is applied by code, every time, until someone switches it off.
// None of them changes a figure: they only decide which real figure is used
// and how it's labelled.
import { canonicalBand } from "./engine.js";
import { compareBand } from "../../core/sources/audience.js";

export const DECISION_TYPES = [
  { n: 1, code: "band_substitute", label: "1 - Use a wider age band when the exact one isn't reported",
    help: 'Applies to: the band asked for (e.g. "4-6"). Use: a wider band that contains it (e.g. "4-9"). Figures stay labelled with their real band.' },
  { n: 2, code: "audience_alias", label: "2 - Treat a source's audience label as one of our audiences",
    help: 'Applies to: the label exactly as the source writes it (e.g. "HWC (Housewives w/ children)"). Use: our audience (e.g. "parents").' },
];

export function decisionTypeOf(text) {
  const t = String(text || "").trim().toLowerCase();
  const n = t.match(/^(\d+)\b/);
  return DECISION_TYPES.find((d) => (n && d.n === Number(n[1])) || d.code === t || d.label.toLowerCase() === t)?.code || null;
}

// Check a proposed decision before it's saved. Returns a problem message or null.
export function validateDecision({ type, applies_to, use }, existing) {
  if (type === "band_substitute") {
    const a = canonicalBand(applies_to), u = canonicalBand(use);
    if (!a?.label || a.type || !u?.label || u.type) return 'Both "applies to" and "use" must be age bands, e.g. "4-6" and "4-9".';
    if (!compareBand({ from: u.from, to: u.to }, { from: a.from, to: a.to }).wider) return `${u.label} doesn't contain ${a.label}, so it can't stand in for it. A decision can only use a wider band, never a narrower or overlapping one.`;
  } else if (type === "audience_alias") {
    if (!String(applies_to || "").trim()) return 'Give the label exactly as the source writes it.';
    if (!canonicalBand(use)) return `"${use}" isn't one of the agency's audiences.`;
  } else return `Unknown decision type. Use one of: ${DECISION_TYPES.map((d) => d.code).join(", ")}.`;
  const same = existing.find((d) => d.usable && d.type === type && d.appliesTo.toLowerCase() === String(applies_to).trim().toLowerCase());
  if (same) return `Decision ${same.id} already covers this (${same.appliesTo} → ${same.use}, agreed by ${same.agreedBy || "unknown"}). Change or switch it off in Rules/decisions.xlsx first.`;
  return null;
}

export const describeDecision = (d) => `decision ${d.id}${d.agreedBy ? `, agreed by ${d.agreedBy}` : ""}${d.date ? ` on ${d.date}` : ""}`;
