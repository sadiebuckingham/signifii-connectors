// Media plan engine. Claude passes references (channel names, value IDs,
// percentages the planner asked for); this code fetches, calculates, checks.
// Money is held in whole pence. Every figure shown carries its source or the
// calculation that produced it.
import { parseAudience, compareBand, bandsOverlap } from "../../core/sources/audience.js";
import { checkSlotText } from "../../core/checks/text.js";
import { weeksInWindow } from "./rules.js";
import { config } from "./config.js";
import { describeDecision } from "./decisions.js";

// An agreed alias: this value's audience label counts as one of the agency's audiences.
function aliasFor(v, want, decisions) {
  const labels = (v.audience?.labels || []).map((l) => l.toLowerCase());
  return decisions.find((d) => d.usable && d.type === "audience_alias" && canonicalBand(d.use)?.label?.toLowerCase() === String(want.label).toLowerCase()
    && labels.some((l) => l === d.appliesTo.toLowerCase() || l.endsWith(`› ${d.appliesTo.toLowerCase()}`))) || null;
}

export class PlanError extends Error {}
const fail = (msg) => { throw new PlanError(msg); };

export const valueId = (v) => `${v.file}::${v.sheet}::${v.ref}`;
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pence = (gbp) => Math.round(Number(gbp) * 100);
const gbp = (p) => p / 100;
export const fmtGBP = (p) => "£" + (p / 100).toLocaleString("en-GB", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const fmtCount = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n));
const pct1 = (x) => Math.round(x * 10) / 10;
const srcOf = (v) => ({ file: v.file, sheet: v.sheet, ref: v.ref, original: v.original });
export const srcText = (s) => !s ? "No source" : s.by === "planner" ? `Given by the planner in chat (${s.at?.slice(0, 10)}): "${s.quote}"` : [s.file, s.sheet, s.page, s.ref && !String(s.ref).startsWith(s.page || "\u0000") ? s.ref : null].filter(Boolean).join(" · ") + (s.original || s.quote ? ` · "${s.original || s.quote}"` : "");

const RATE_UNIT_PER_THOUSAND = /\b(cpm|cpt|cost per thousand|per thousand|per 000)\b/i;
const RATE_METRIC = /\b(rate|price|cost|cpm|cpt)\b/i;
const REACH_METRIC = /\b(reach|impacts|readership|users|viewers|listeners|audience|subscribers|circulation)\b/i;
const NOT_REACH = /\b(rate|cost|cpm|cpt|frequency|engagement|eng\.|clicks|views|impressions|time|share|%|per copy)\b/i;

// ---------------------------------------------------------------- create

export function createPlan({ id, client, briefDoc, facts, missing, linkToken }) {
  return {
    id, client, status: "DRAFT", createdAt: new Date().toISOString(),
    brief: { file: briefDoc.file, path: briefDoc.path, facts, missing },
    lines: [], figures: [], targetBands: [], sections: { objective: null, rationale: {} }, ticks: {}, signoff: null, linkToken,
  };
}

const fact = (plan, key) => plan.brief.facts[key] || null;

// ---------------------------------------------------------------- derived view

export function derive(plan) {
  const budget = fact(plan, "budget");
  const budgetP = budget ? pence(budget.value) : null;
  const win = fact(plan, "window");
  const weeks = win ? weeksInWindow(win.start, win.end) : [];
  const totalP = plan.lines.reduce((a, l) => a + l.budgetP, 0);
  const lines = plan.lines.map((l) => {
    const share = totalP ? (l.budgetP / totalP) * 100 : 0;
    return { ...l, share: pct1(share), shareExact: share, delivery: delivery(l) };
  });
  const allowed = new Set();
  const add = (...ns) => ns.forEach((n) => Number.isFinite(n) && allowed.add(n));
  if (budget) add(budget.value);
  add(gbp(totalP), budgetP != null ? gbp(budgetP - totalP) : NaN, lines.length, weeks.length);
  for (const l of lines) {
    add(gbp(l.budgetP), l.share, Math.round(l.shareExact), l.weeks?.length ?? NaN);
    if (l.rate?.value != null) add(l.rate.value);
    if (l.rate?.min != null) add(l.rate.min, l.rate.max);
    for (const d of [l.delivery.count, l.delivery.min, l.delivery.max]) if (Number.isFinite(d)) { add(d); const f = fmtCount(d); add(Number(f.replace(/[km]$/, ""))); }
  }
  for (const f of plan.figures) { add(f.value); if (f.scaleNote) add(f.value * 1000); }
  // dates and age bands are matched as whole phrases, not loose numbers
  const dates = new Set(), bands = new Set();
  const addDate = (iso) => { if (iso) { dates.add(iso.slice(5)); add(Number(iso.slice(0, 4))); } };
  weeks.forEach(addDate); if (win) { addDate(win.start); addDate(win.end); }
  addDate(fact(plan, "approvalBy")?.value);
  const addBands = (txt) => { for (const m of String(txt || "").matchAll(/(\d{1,2})\s?(?:-|–|to)\s?(\d{1,2})/g)) bands.add(`${Number(m[1])}-${Number(m[2])}`); };
  [...plan.targetBands, ...plan.figures.map((f) => f.audienceLabel), ...plan.lines.flatMap((l) => (l.audiences || []).map((a) => a.label))].forEach(addBands);
  for (const t of Object.values(plan.brief.facts)) if (typeof t.value === "string") { addBands(t.value); for (const m of t.value.replace(/(\d{1,2})\s?(?:-|–|to)\s?(\d{1,2})/g, " ").matchAll(/\d+(\.\d+)?/g)) add(Number(m[0])); }
  return { budgetP, totalP, unallocatedP: budgetP == null ? null : budgetP - totalP, weeks, lines, allowedNumbers: { numbers: allowed, dates, bands } };
}

// What a line's budget buys, from its rate. Never invented: no usable rate -> no figure.
export function delivery(line) {
  const r = line.rate;
  if (!r) return { kind: "none", text: "No rate chosen", calc: null };
  const budget = gbp(line.budgetP);
  const per1000 = RATE_UNIT_PER_THOUSAND.test(r.unit || "") || RATE_UNIT_PER_THOUSAND.test(r.metric || "");
  const noun = /cpt|impacts/i.test(`${r.unit} ${r.metric}`) ? "impacts" : "impressions";
  if (r.kind === "none") return { kind: "none", text: `Rate "${r.original}": can't calculate`, calc: null };
  if (!line.budgetP) return { kind: "none", text: "No budget set", calc: null };
  if (r.kind === "range" && per1000) {
    const min = Math.floor(budget / r.max * 1000), max = Math.floor(budget / r.min * 1000);
    return { kind: "range", min, max, noun, text: `${fmtCount(min)}–${fmtCount(max)} ${noun}`, calc: `${fmtGBP(line.budgetP)} ÷ rate range ${r.original} × 1,000` };
  }
  if ((r.kind === "currency" || r.kind === "number") && r.value > 0) {
    if (per1000) {
      const count = Math.floor(budget / r.value * 1000);
      return { kind: "count", count, noun, text: `${fmtCount(count)} ${noun}`, calc: `${fmtGBP(line.budgetP)} ÷ ${r.unit || "rate"} £${r.value.toFixed(2)} × 1,000 = ${count.toLocaleString("en-GB")} ${noun}` };
    }
    const units = Math.floor(budget / r.value);
    const unitName = (r.unit || "unit").replace(/^(cost\s+)?per\s+/i, "").replace(/^\s*/, "") || "unit";
    return { kind: "units", count: units, noun: unitName, text: `${units} × ${unitName}`, calc: `${fmtGBP(line.budgetP)} ÷ £${r.value.toLocaleString("en-GB")} ${r.unit || ""} = ${units} (whole units). Impressions can't be calculated from this rate.` };
  }
  return { kind: "none", text: `Rate "${r.original}" isn't usable for a calculation`, calc: null };
}

// ---------------------------------------------------------------- check model (what the rules read)

export function checkModel(plan) {
  const d = derive(plan);
  const b = fact(plan, "budget"), w = fact(plan, "window");
  return {
    budget: b ? { value: b.value, source: b.source } : null,
    window: w ? { start: w.start, end: w.end, source: w.source } : null,
    weeks: d.weeks,
    lines: plan.lines.map((l) => ({
      channel: l.channel, category: l.category, budget_gbp: gbp(l.budgetP), weeks: l.weeks, note: l.note,
      audiences: l.audiences,
      rate: l.rate === undefined ? undefined : l.rate ? { kind: l.rate.kind, value: l.rate.value, original: l.rate.original, source: l.rate.source } : null,
    })),
    audienceFigures: plan.figures.map((f) => ({ label: `${f.entity || ""} ${f.audienceLabel}`.trim(), value: f.value, source: f.source })),
    _plan: plan, _derived: d,
  };
}

// ---------------------------------------------------------------- brief facts the planner gives

export function setFact(plan, { key, value, quote }) {
  const allowedKeys = ["budget", "window", "approvalBy", "client", "campaign", "objective", "audience", "contact"];
  if (!allowedKeys.includes(key)) fail(`Unknown brief detail "${key}". Use one of: ${allowedKeys.join(", ")}.`);
  const src = { by: "planner", at: new Date().toISOString(), quote: quote || String(value) };
  let f;
  if (key === "budget") { const n = Number(String(value).replace(/[£,\s]/g, "")); if (!(n > 0)) fail(`Budget "${value}" isn't an amount. Ask the planner for the total budget in pounds.`); f = { status: "found", value: n, currency: "GBP", source: src }; }
  else if (key === "window") {
    const [s, e] = Array.isArray(value) ? value : String(value).split(/\s*(?:to|–|-{1,2}|until)\s*(?=\d{4}-)/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "") || !/^\d{4}-\d{2}-\d{2}$/.test(e || "")) fail("Give the window as two dates in YYYY-MM-DD form, exactly as the planner stated them.");
    if (s > e) fail("The end date is before the start date.");
    f = { status: "found", start: s, end: e, source: src };
  } else if (key === "approvalBy") { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) fail("Give the date as YYYY-MM-DD."); f = { status: "found", value: String(value), source: src }; }
  else f = { status: "found", value: String(value).trim(), source: src };
  const next = structuredClone(plan);
  next.brief.facts[key] = f;
  next.brief.missing = next.brief.missing.filter((m) => m.key !== key);
  return { plan: next, message: `Recorded ${key} as given by the planner.` };
}

// ---------------------------------------------------------------- channels and money

function findLine(plan, name) {
  const s = slug(name);
  const l = plan.lines.find((x) => x.id === s) || plan.lines.find((x) => slug(x.channel).includes(s) || s.includes(slug(x.channel)));
  if (!l) fail(`There's no "${name}" line in the plan. Lines: ${plan.lines.map((x) => x.channel).join(", ") || "none yet"}.`);
  return l;
}

export function addChannel(plan, { name, category, rate_id, use_hidden = false, audiences }, ctx) {
  if (!name) fail("Give the channel a name as the plan should show it.");
  if (!config.categories.includes(category)) fail(`Category must be one of: ${config.categories.join(", ")}.`);
  if (plan.lines.some((l) => l.id === slug(name))) fail(`"${name}" is already in the plan.`);
  let rate = undefined;
  if (rate_id) {
    const v = ctx.valuesById.get(rate_id);
    if (!v) fail(`No source value with ID "${rate_id}". Use get_rates to find rate IDs.`);
    if (!RATE_METRIC.test(v.metric) && !v.unit) fail(`"${rate_id}" is ${v.metric}, not a rate.`);
    if (v.hidden && !use_hidden) fail(`That rate is in a hidden column/row of ${v.file} (${v.ref}). Hidden data is only used if the planner explicitly chooses it: ask them, then pass use_hidden=true.`);
    rate = { id: rate_id, kind: v.kind, value: v.value, min: v.min, max: v.max, original: v.original, unit: v.unit, metric: v.metric, currency: v.currency, entity: v.entity, hidden: v.hidden,
      source: srcOf(v), notes: [...new Set([...(v.qualifiers || []).map((q) => q.text), ...v.notes.map((n) => n.text)])], audienceBasis: v.audience?.labels?.join(" / ") || null };
  }
  const line = { id: slug(name), channel: name, category, budgetP: 0, weeks: null, rate: rate ?? undefined, audiences: null, note: null };
  if (audiences?.length) line.audiences = audiences.map(audienceOf);
  else if (rate && rate.audienceBasis) { const a = parseAudience(rate.audienceBasis); if (a.age || a.type) line.audiences = [{ label: rate.audienceBasis, type: a.type, age: a.age, from: "rate card" }]; }
  const next = structuredClone(plan); next.lines.push(line);
  return { plan: next, message: `Added ${name} (${category})${rate ? ` with rate ${rate.original} ${rate.unit || ""} from ${rate.source.file} ${rate.source.ref}` : " with no rate yet"}.` };
}

export function removeChannel(plan, { channel }) {
  const l = findLine(plan, channel);
  const next = structuredClone(plan); next.lines = next.lines.filter((x) => x.id !== l.id);
  return { plan: next, message: `Removed ${l.channel}${l.budgetP ? `; its ${fmtGBP(l.budgetP)} is now unallocated` : ""}.` };
}

const audienceOf = (label) => { const a = parseAudience(label); return { label, type: a.type || (/^parents?$/i.test(label) ? "parents" : null), age: a.age, from: "planner" }; };

export function setLineAudiences(plan, { channel, audiences }) {
  const l = findLine(plan, channel);
  if (!audiences?.length) fail("Give at least one audience, e.g. \"4-9\" or \"parents\".");
  const next = structuredClone(plan); next.lines.find((x) => x.id === l.id).audiences = audiences.map(audienceOf);
  return { plan: next, message: `${l.channel} is aimed at ${audiences.join(", ")}.` };
}

export function setAllocation(plan, { channel, amount_gbp, share_pct }) {
  if ((amount_gbp == null) === (share_pct == null)) fail("Give either amount_gbp or share_pct, not both.");
  const l = findLine(plan, channel);
  let p;
  if (amount_gbp != null) { if (!(amount_gbp >= 0)) fail("amount_gbp must be 0 or more."); p = pence(amount_gbp); }
  else {
    const b = fact(plan, "budget"); if (!b) fail("The brief's budget isn't known yet, so a share can't be turned into pounds. Ask for the budget first.");
    if (!(share_pct >= 0 && share_pct <= 100)) fail("share_pct must be between 0 and 100.");
    p = Math.round(pence(b.value) * share_pct / 100);
  }
  const next = structuredClone(plan); next.lines.find((x) => x.id === l.id).budgetP = p;
  return { plan: next, message: `${l.channel} set to ${fmtGBP(p)}${share_pct != null ? ` (${share_pct}% of the brief budget)` : ""}.` };
}

// Move money between lines. Totals are unchanged by construction.
export function moveBudget(plan, { from, to, amount_gbp, share_pct, basis }) {
  if ((amount_gbp == null) === (share_pct == null)) fail("Give either amount_gbp or share_pct, not both.");
  const a = findLine(plan, from), b = findLine(plan, to);
  if (a.id === b.id) fail("From and to are the same line.");
  let p;
  if (amount_gbp != null) p = pence(amount_gbp);
  else {
    if (basis !== "of_total_budget" && basis !== "of_from_line") fail('Say what the percentage is of: basis "of_total_budget" (e.g. 10% of £150,000) or "of_from_line" (10% of the line\'s own budget). If the planner didn\'t say, ask.');
    const baseP = basis === "of_from_line" ? a.budgetP : pence(fact(plan, "budget")?.value ?? fail("The brief's budget isn't known yet."));
    p = Math.round(baseP * share_pct / 100);
  }
  if (p > a.budgetP) fail(`${a.channel} only has ${fmtGBP(a.budgetP)}; can't move ${fmtGBP(p)}.`);
  const next = structuredClone(plan);
  next.lines.find((x) => x.id === a.id).budgetP -= p;
  next.lines.find((x) => x.id === b.id).budgetP += p;
  return { plan: next, message: `Moved ${fmtGBP(p)} from ${a.channel} to ${b.channel}${share_pct != null ? ` (${share_pct}% ${basis === "of_from_line" ? `of ${a.channel}'s budget` : "of the total budget"})` : ""}. Total unchanged.` };
}

export function setFlighting(plan, { channel, weeks }) {
  const l = findLine(plan, channel);
  const w = fact(plan, "window"); if (!w) fail("The campaign window isn't known yet. Ask for it first.");
  const all = weeksInWindow(w.start, w.end);
  let chosen;
  if (weeks === "all") chosen = all;
  else if (Array.isArray(weeks)) chosen = weeks.map((x) => typeof x === "number" ? (all[x - 1] ?? fail(`Week ${x} is outside the campaign window, which has ${all.length} weeks (${w.start} to ${w.end}).`)) : String(x));
  else fail('weeks must be "all", a list of week numbers (1 = first week of the campaign) or a list of w/c dates (YYYY-MM-DD).');
  const outside = chosen.filter((x) => !all.includes(x));
  if (outside.length) fail(`${outside.map((x) => `w/c ${x}`).join(", ")} ${outside.length === 1 ? "is" : "are"} outside the campaign window (${w.start} to ${w.end}). Campaign weeks start: ${all.join(", ")}.`);
  const next = structuredClone(plan); next.lines.find((x) => x.id === l.id).weeks = [...new Set(chosen)].sort();
  return { plan: next, message: `${l.channel} live in ${chosen.length} of ${all.length} weeks.` };
}

// ---------------------------------------------------------------- audience

export function canonicalBand(label) {
  const c = config.canonicalBands.find((b) => b.label.toLowerCase() === String(label).toLowerCase().replace(/\s+/g, "").replace("–", "-"));
  if (c) return c;
  const a = parseAudience(label);
  return a.age ? { label: a.age.label, from: a.age.from, to: a.age.to } : a.type ? { label, type: a.type } : null;
}

// Notes worth showing with a figure: its own notes, notes that change meaning, and cautions.
const keyNotes = (v) => [...new Set([...(v.notes || []).map((n) => n.text), ...(v.qualifiers || []).map((q) => q.text),
  ...(v.tableNotes || []).filter((t) => /caution|do not|don't|not comparable|may not|modell?ed|sample|estimate|overlap|only/i.test(t))])];
const isReach = (v) => REACH_METRIC.test(v.metric) && !NOT_REACH.test(v.metric) && (v.kind === "number" || v.kind === "none");
const matchesSearch = (v, s) => !s || `${v.file} ${v.sheet} ${v.entity || ""} ${v.column} ${v.metric} ${(v.audience?.labels || []).join(" ")} ${Object.values(v.attributes || {}).join(" ")}`.toLowerCase().includes(String(s).toLowerCase());

// Find audience figures for a band. Never splits, scales or averages.
export function queryAudience(values, { band, search }, decisions = []) {
  const want = canonicalBand(band);
  if (!want) fail(`"${band}" isn't an age band or audience the connector knows. Try e.g. "4-6", "7-9", "4-9" or "parents".`);
  const pool = values.filter((v) => !v.hidden && isReach(v) && matchesSearch(v, search));
  const exact = [], wider = [], partial = [], typeMatch = [];
  for (const v of pool) {
    const a = v.audience;
    if (want.type) { if (a?.type === want.type || aliasFor(v, want, decisions)) typeMatch.push(v); continue; }
    if (!a?.age || a.type === "parents") continue;
    const c = compareBand(a.age, want);
    if (c.exact) exact.push(v); else if (c.wider) wider.push(v); else if (bandsOverlap(a.age, want)) partial.push(v);
  }
  const bySource = (list) => {
    const g = new Map();
    for (const v of list) { const k = `${v.file} › ${v.sheet}`; const arr = g.get(k) || []; arr.push(v); g.set(k, arr); }
    return [...g].map(([k, vs]) => ({ source: k, bands: [...new Set(vs.map((v) => v.audience?.age?.label || v.audience?.labels?.join(" ")))], count: vs.length }));
  };
  const messages = [];
  // an agreed decision: when this band isn't reported, use a named wider band (labelled as itself)
  const sub = !want.type && !exact.length ? decisions.find((d) => d.usable && d.type === "band_substitute" && canonicalBand(d.appliesTo)?.label === want.label) : null;
  if (sub) {
    const use = canonicalBand(sub.use);
    const agreed = wider.filter((v) => v.audience?.age && compareBand(v.audience.age, use).exact);
    messages.push(`Agreed ${describeDecision(sub)}: when ${want.label} isn't reported, use ${use.label}, shown as ${use.label}.`);
    wider.splice(0, wider.length, ...agreed);
  }
  if (!want.type && !exact.length) {
    for (const s of bySource(wider)) messages.push(`${s.source} reports ${s.bands.join(", ")} only. It can't be split to ${want.label}.`);
    for (const s of bySource(partial)) messages.push(`${s.source} reports ${s.bands.join(", ")}, which overlap ${want.label} but aren't the same band. Not used.`);
    if (!wider.length && !partial.length) messages.push(`No source reports ${want.label}.`);
  }
  const rows = (want.type ? typeMatch : exact.length ? exact : wider).slice(0, 60).map((v) => ({
    id: valueId(v), source: `${v.file} › ${v.sheet} ${v.ref}`, entity: v.entity, metric: v.metric, unit: v.unit, audience: v.audience?.labels?.join(" › "),
    band: v.audience?.age?.label || null, period: v.period || v.tablePeriod?.original || null, value: v.kind === "none" ? null : v.value, original: v.original,
    match: want.type ? (aliasFor(v, want, decisions) ? `audience, by ${describeDecision(aliasFor(v, want, decisions))}` : "audience") : exact.length ? "exact" : sub ? `wider band, allowed by ${describeDecision(sub)}` : "wider band, only with the planner's agreement",
    notes: keyNotes(v).slice(0, 3), flags: v.flags,
  }));
  return { band: want.label, exactCount: exact.length, widerCount: wider.length, messages, rows, total: (want.type ? typeMatch : exact.length ? exact : wider).length };
}

export function addAudienceFigure(plan, { value_id, for_band, accept_wider = false }, ctx) {
  const decisions = ctx.decisions || [];
  const v = ctx.valuesById.get(value_id);
  if (!v) fail(`No source value with ID "${value_id}". Use get_audience to find figure IDs.`);
  if (v.hidden) fail(`${value_id} is hidden in its file and isn't used in plans.`);
  if (!isReach(v)) fail(`${value_id} is "${v.metric}", which isn't an audience figure.`);
  if (v.kind === "none") fail(`${value_id} has no value ("${v.original}": ${v.reason}). It can't go in the plan as a figure.`);
  let usedFor = null, decisionUsed = null;
  if (for_band) {
    const want = canonicalBand(for_band);
    if (want?.age || want?.from != null) {
      const c = compareBand(v.audience?.age, want);
      const sub = c.wider ? decisions.find((d) => d.usable && d.type === "band_substitute" && canonicalBand(d.appliesTo)?.label === want.label && canonicalBand(d.use)?.label === v.audience.age.label) : null;
      if (sub) decisionUsed = sub;
      if (!c.exact && !(c.wider && (accept_wider || sub))) fail(c.wider ? `This figure is for ${v.audience.age.label}, not ${want.label}. It can't be split to ${want.label}. Use it only if the planner agrees to show the wider band: then pass accept_wider=true and it will be labelled "${v.audience.age.label}, used for ${want.label} at planner's request".` : `This figure is for ${v.audience?.age?.label || "a different audience"}, which doesn't contain ${want.label}.`);
      if (c.wider) usedFor = want.label;
    }
  }
  if (plan.figures.some((f) => f.id === value_id)) fail("That figure is already in the plan.");
  const audienceLabel = (v.audience?.labels || []).join(" › ") + (usedFor ? ` (${v.audience.age.label}, used for ${usedFor} ${decisionUsed ? `by ${describeDecision(decisionUsed)}` : "at planner's request"})` : "");
  const f = { id: value_id, entity: v.entity || v.sheet, metric: v.metric, unit: v.unit, audienceLabel, ageLabel: v.audience?.age?.label || null, value: v.value, original: v.original, period: v.period || v.tablePeriod?.original || null,
    source: srcOf(v), notes: keyNotes(v).slice(0, 4), flags: v.flags, usedFor, scaleNote: /000s?/.test(v.unit || "") };
  const next = structuredClone(plan); next.figures.push(f);
  if (for_band && !next.targetBands.includes(for_band)) next.targetBands.push(for_band);
  return { plan: next, message: `Added ${f.entity} · ${f.metric} · ${audienceLabel}: ${f.original}${f.unit ? ` (${f.unit})` : ""}.` };
}

export function removeAudienceFigure(plan, { value_id }) {
  if (!plan.figures.some((f) => f.id === value_id)) fail(`${value_id} isn't in the plan.`);
  const next = structuredClone(plan); next.figures = next.figures.filter((f) => f.id !== value_id);
  return { plan: next, message: "Removed." };
}

export function setTargetBands(plan, { bands }) {
  for (const b of bands) if (!canonicalBand(b)) fail(`"${b}" isn't an age band or audience the connector knows.`);
  const next = structuredClone(plan); next.targetBands = bands;
  return { plan: next, message: `Target audiences: ${bands.join(", ")}.` };
}

// ---------------------------------------------------------------- words

const BANNED = [
  { re: /\b(kids?|children|child|boys|girls|youngsters)\b[^.]{0,40}\b(love|loves|feel|feels|think|thinks|want|wants|adore|adores|enjoy|enjoys|prefer|prefers|obsessed|can't get enough|crave|dream)\b/i, why: "says what children think, feel or want. Plans don't make claims about children's feelings; describe the channel and audience instead." },
];

export function writeSection(plan, { slot, text }) {
  const d = derive(plan);
  let limit, target;
  if (slot === "objective") { limit = config.limits.objective; target = ["objective"]; }
  else if (slot.startsWith("rationale:")) { const l = findLine(plan, slot.slice(10)); limit = config.limits.rationale; target = ["rationale", l.id]; }
  else fail('slot must be "objective" or "rationale:<channel>".');
  const problems = checkSlotText({ slot: slot === "objective" ? "Objective" : `Rationale for ${slot.slice(10)}`, text, limit, allowedNumbers: d.allowedNumbers, banned: BANNED });
  if (problems.length) fail(problems.join(" "));
  const next = structuredClone(plan);
  if (target[0] === "objective") next.sections.objective = { text: text.trim(), by: "Claude (planner-approved)", at: new Date().toISOString() };
  else next.sections.rationale[target[1]] = { text: text.trim(), at: new Date().toISOString() };
  return { plan: next, message: `${slot === "objective" ? "Objective" : `Rationale for ${slot.slice(10)}`} written (${text.trim().length}/${limit} characters).` };
}

export function tickWarning(plan, { rule_id, name }, currentMessage) {
  if (!name) fail("Give the name of the person ticking it.");
  const next = structuredClone(plan); next.ticks[rule_id] = { by: name, at: new Date().toISOString(), message: currentMessage };
  return { plan: next, message: `Ticked by ${name}.` };
}

// ---------------------------------------------------------------- re-check against the folder
// A saved plan keeps references (file · sheet · cell) and the value seen when it
// was added. Every time the plan is shown, each reference is read again from the
// folder: the plan uses what the file says now, and any difference is flagged.
export function refreshFromSources(plan, valuesById) {
  const p = structuredClone(plan);
  const drift = [];
  const where = (s) => `${s.file} · ${s.sheet} · ${s.ref}`;
  for (const f of p.figures) {
    const v = valuesById.get(f.id);
    if (!v || v.kind === "none") { drift.push({ kind: "missing", what: `${f.entity} ${f.metric}`, where: where(f.source), was: f.original }); f.sourceStatus = "missing"; continue; }
    if (String(v.original) !== String(f.original)) {
      drift.push({ kind: "changed", what: `${f.entity} ${f.metric}`, where: where(f.source), was: f.original, now: v.original });
      f.changedFrom = f.original; f.value = v.value; f.original = v.original; f.sourceStatus = "changed";
    } else f.sourceStatus = "same";
  }
  for (const l of p.lines) {
    if (!l.rate?.id) continue;
    const v = valuesById.get(l.rate.id);
    if (!v) { drift.push({ kind: "missing", what: `${l.channel} rate`, where: where(l.rate.source), was: l.rate.original }); l.rate = { ...l.rate, kind: "none", value: null, original: "source missing", sourceStatus: "missing" }; continue; }
    if (String(v.original) !== String(l.rate.original)) {
      drift.push({ kind: "changed", what: `${l.channel} rate`, where: where(l.rate.source), was: l.rate.original, now: v.original });
      l.rate = { ...l.rate, kind: v.kind, value: v.value, min: v.min, max: v.max, original: v.original, changedFrom: l.rate.original, sourceStatus: "changed" };
    }
  }
  return { plan: p, drift };
}
