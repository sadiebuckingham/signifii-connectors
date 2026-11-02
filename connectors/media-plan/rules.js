// The fixed rule types for media plans. Anything in rules.xlsx that isn't one
// of these shows "not checked". Each evaluator returns pass/warn/fail only
// after looking at real plan data; if the data isn't there, "not_run".
//
// Plan shape these read (built by the plan engine):
//   plan.budget  { value, source }            brief budget, from the brief
//   plan.window  { start, end, source }       campaign window, from the brief
//   plan.weeks   ["2026-11-09", ...]          week-commencing dates in the window
//   plan.lines   [{ channel, category, budget_gbp, weeks: [...], audiences: [{label,type,age}],
//                   rate: { kind, value, original, source } | null, note }]
//   plan.audienceFigures [{ label, value, source }]
import { STATUS } from "../../core/checks/engine.js";

export const RULE_TYPES = [
  { n: 1, code: "budget_total", name: "Budget total must equal the brief's budget", words: /budget\s*total|equal.*budget|budget.*equal/i },
  { n: 2, code: "max_share_any", name: "Maximum share for any one channel", words: /max(imum)?\s*share.*any|any one channel/i },
  { n: 3, code: "channel_share", name: "Minimum or maximum share for a named channel", words: /(min|max)(imum)?\s*(or\s*max(imum)?\s*)?share.*(named|channel)|channel share/i },
  { n: 4, code: "channel_weeks", name: "A named channel must run in named weeks", words: /must run in|run in .*weeks|channel weeks/i },
  { n: 5, code: "audience_every_week", name: "A named audience must be reached in every week", words: /every week|each week/i },
  { n: 6, code: "allowed_channels", name: "Only channels from an allowed list", words: /allowed (list|channels)|only channels/i },
  { n: 7, code: "under13_review", name: "Flag online video and social lines aimed at under-13s", words: /under[- ]?13/i },
  { n: 8, code: "audience_sourced", name: "Every audience figure must have a source", words: /audience figure.*source|figure.*source/i },
  { n: 9, code: "flighting_in_window", name: "All flighting inside the campaign window", words: /flighting.*window|inside.*window/i },
  { n: 10, code: "rate_placeholder", name: "No rate marked POA/TBC used without a warning", words: /poa|tbc/i },
];

export function ruleTypeOf(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const num = t.match(/^(\d{1,2})\b/);
  if (num) return RULE_TYPES.find((r) => r.n === Number(num[1]))?.code || null;
  const byCode = RULE_TYPES.find((r) => r.code === t.toLowerCase());
  if (byCode) return byCode.code;
  const byName = RULE_TYPES.find((r) => r.name.toLowerCase() === t.toLowerCase());
  if (byName) return byName.code;
  const hits = RULE_TYPES.filter((r) => r.words.test(t));
  return hits.length === 1 ? hits[0].code : null; // ambiguous text -> not checked
}

// ---------- helpers
const pct = (s) => { const m = String(s ?? "").match(/(\d+(?:\.\d+)?)\s*%?/); return m ? Number(m[1]) : null; };
const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const fmt = (n) => "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const pence = (n) => Math.round(Number(n) * 100);
const notRun = (message) => ({ status: STATUS.NOT_RUN, message });
const pass = (message, evidence) => ({ status: STATUS.PASS, message, evidence });
const problem = (message, evidence) => ({ status: STATUS.FAIL, message, evidence });
const notChecked = (message) => ({ status: STATUS.NOT_CHECKED, message });
const hasLines = (p) => Array.isArray(p?.lines) && p.lines.length > 0;
const total = (p) => p.lines.reduce((a, l) => a + pence(l.budget_gbp || 0), 0) / 100;
const shareOf = (p, l) => { const t = total(p); return t ? (Number(l.budget_gbp || 0) / t) * 100 : 0; };
const srcText = (s) => (s ? `${s.file}${s.sheet ? `, ${s.sheet}` : ""}${s.ref ? `, ${s.ref}` : ""}` : "no source");

export const evaluators = {
  budget_total(rule, plan) {
    if (!plan?.budget || plan.budget.value == null) return notRun("The brief's budget hasn't been read yet.");
    if (!plan.budget.source) return notRun("The brief's budget has no source, so it can't be checked against.");
    if (!hasLines(plan)) return notRun("No channel budgets set yet.");
    const t = total(plan);
    if (pence(t) === pence(plan.budget.value)) return pass(`Channel budgets total ${fmt(t)}, exactly the brief's ${fmt(plan.budget.value)}.`, [srcText(plan.budget.source)]);
    const diff = t - plan.budget.value;
    return problem(`Channel budgets total ${fmt(t)}; the brief says ${fmt(plan.budget.value)} (${diff > 0 ? "over" : "under"} by ${fmt(Math.abs(diff))}).`, [srcText(plan.budget.source)]);
  },

  max_share_any(rule, plan) {
    const limit = pct(rule.limit);
    if (limit == null) return notChecked(`Limit "${rule.limit}" isn't a percentage.`);
    if (!hasLines(plan) || total(plan) === 0) return notRun("No channel budgets set yet.");
    const over = plan.lines.filter((l) => shareOf(plan, l) > limit + 1e-9);
    if (!over.length) return pass(`No channel is above ${limit}% of the budget.`);
    return problem(over.map((l) => `${l.channel} is ${shareOf(plan, l).toFixed(1)}% (max ${limit}%)${l.note ? "; note given" : ""}`).join("; "));
  },

  channel_share(rule, plan) {
    if (!rule.appliesTo) return notChecked("No channel named in \"Applies to\".");
    const s = String(rule.limit || "");
    const min = s.match(/min(?:imum)?\s*(\d+(?:\.\d+)?)/i), max = s.match(/max(?:imum)?\s*(\d+(?:\.\d+)?)/i);
    const between = s.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
    const lo = min ? Number(min[1]) : between ? Number(between[1]) : null;
    const hi = max ? Number(max[1]) : between ? Number(between[2]) : null;
    if (lo == null && hi == null) return notChecked(`Limit "${rule.limit}" should look like "min 10%", "max 30%" or "10%-30%".`);
    if (!hasLines(plan) || total(plan) === 0) return notRun("No channel budgets set yet.");
    const lines = plan.lines.filter((l) => same(l.channel, rule.appliesTo) || same(l.category, rule.appliesTo));
    const share = lines.reduce((a, l) => a + shareOf(plan, l), 0);
    const ok = (lo == null || share >= lo - 1e-9) && (hi == null || share <= hi + 1e-9);
    const range = lo != null && hi != null ? `${lo}%–${hi}%` : lo != null ? `at least ${lo}%` : `at most ${hi}%`;
    return ok ? pass(`${rule.appliesTo} is ${share.toFixed(1)}% (${range}).`) : problem(`${rule.appliesTo} is ${share.toFixed(1)}%; the rule says ${range}.`);
  },

  channel_weeks(rule, plan) {
    if (!rule.appliesTo) return notChecked("No channel named in \"Applies to\".");
    if (!plan?.weeks?.length) return notRun("The campaign weeks aren't known yet.");
    const want = weeksFromLimit(rule.limit, plan.weeks);
    if (!want) return notChecked(`Limit "${rule.limit}" should look like "last 2 weeks", "first 3 weeks", "weeks 4-6" or a list of w/c dates.`);
    const lines = (plan.lines || []).filter((l) => same(l.channel, rule.appliesTo) || same(l.category, rule.appliesTo));
    if (!lines.length) return problem(`${rule.appliesTo} isn't in the plan, so it doesn't run in ${describeWeeks(want)}.`);
    if (lines.every((l) => !l.weeks)) return notRun(`No flighting set for ${rule.appliesTo} yet.`);
    const live = new Set(lines.flatMap((l) => l.weeks || []));
    const missing = want.filter((w) => !live.has(w));
    return missing.length ? problem(`${rule.appliesTo} isn't live in w/c ${missing.join(", ")}.`) : pass(`${rule.appliesTo} runs in ${describeWeeks(want)}.`);
  },

  audience_every_week(rule, plan) {
    if (!rule.appliesTo) return notChecked("No audience named in \"Applies to\".");
    if (!plan?.weeks?.length) return notRun("The campaign weeks aren't known yet.");
    if (!hasLines(plan)) return notRun("No channel lines yet.");
    if (plan.lines.some((l) => !l.audiences)) return notRun("Some lines don't have their audiences set yet.");
    if (plan.lines.every((l) => !l.weeks)) return notRun("No flighting set yet.");
    const reaches = (l) => l.audiences.some((a) => same(a.type, rule.appliesTo) || same(a.label, rule.appliesTo));
    const gaps = plan.weeks.filter((w) => !plan.lines.some((l) => reaches(l) && (l.weeks || []).includes(w)));
    return gaps.length ? problem(`No live line reaches "${rule.appliesTo}" in w/c ${gaps.join(", ")}.`) : pass(`"${rule.appliesTo}" reached in all ${plan.weeks.length} weeks.`);
  },

  allowed_channels(rule, plan) {
    const allowed = String(rule.limit || rule.appliesTo || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (!allowed.length) return notChecked("No allowed list given in \"Limit\".");
    if (!hasLines(plan)) return notRun("No channel lines yet.");
    const bad = plan.lines.filter((l) => !allowed.some((a) => same(a, l.channel) || same(a, l.category)));
    return bad.length ? problem(`Not on the allowed list: ${bad.map((l) => l.channel).join(", ")}.`) : pass(`All ${plan.lines.length} channels are on the allowed list.`);
  },

  under13_review(rule, plan) {
    if (!hasLines(plan)) return notRun("No channel lines yet.");
    const cats = new Set(["online video", "social"]);
    const target = plan.lines.filter((l) => cats.has(String(l.category || "").toLowerCase()));
    if (target.some((l) => !l.audiences)) return notRun("Some online video or social lines don't have their audiences set yet.");
    const flagged = target.filter((l) => l.audiences.some((a) => a.age && a.age.from < 13));
    if (!flagged.length) return pass(target.length ? "No online video or social line is aimed at under-13s." : "No online video or social lines in the plan.");
    return { status: STATUS.WARN, forceStatus: true, needsTick: true,
      message: `Targeting review needed (contextual / made-for-kids only): ${flagged.map((l) => l.channel).join(", ")}.` };
  },

  audience_sourced(rule, plan) {
    const figs = plan?.audienceFigures;
    if (!figs) return notRun("No audience figures in the plan yet.");
    if (!figs.length) return pass("The plan shows no audience figures, so none are unsourced.");
    const bad = figs.filter((f) => !f.source || !f.source.file || !f.source.ref);
    return bad.length ? problem(`${bad.length} audience figure(s) have no source: ${bad.slice(0, 3).map((f) => f.label).join("; ")}.`) : pass(`All ${figs.length} audience figures have a source.`);
  },

  flighting_in_window(rule, plan) {
    if (!plan?.window?.start || !plan?.window?.end) return notRun("The campaign window hasn't been read from the brief yet.");
    if (!plan.window.source) return notRun("The campaign window has no source.");
    if (!hasLines(plan) || plan.lines.every((l) => !l.weeks)) return notRun("No flighting set yet.");
    // a week is inside if its w/c date is within the window (weeks are Monday starts)
    const outside = plan.lines.flatMap((l) => (l.weeks || []).filter((w) => w < weekStart(plan.window.start) || w > plan.window.end).map((w) => `${l.channel} w/c ${w}`));
    return outside.length ? problem(`Outside the campaign window: ${outside.join(", ")}.`) : pass(`All flighting is inside ${plan.window.start} to ${plan.window.end}.`, [srcText(plan.window.source)]);
  },

  rate_placeholder(rule, plan) {
    if (!hasLines(plan)) return notRun("No channel lines yet.");
    if (plan.lines.some((l) => l.rate === undefined)) return notRun("Some lines don't have a rate chosen yet.");
    const ph = plan.lines.filter((l) => l.rate && l.rate.kind === "none");
    if (!ph.length) return pass("No line uses a POA/TBC rate.");
    return { status: STATUS.WARN, forceStatus: true, needsTick: true,
      message: ph.map((l) => `${l.channel} uses a "${l.rate.original}" rate (${srcText(l.rate.source)}), so its cost isn't confirmed`).join("; ") + "." };
  },
};

// ---------- week helpers
export function weekStart(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}
export function weeksInWindow(start, end) {
  const out = [];
  for (let w = weekStart(start); w <= end; ) {
    out.push(w);
    const d = new Date(w + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 7); w = d.toISOString().slice(0, 10);
  }
  return out;
}
function weeksFromLimit(limit, weeks) {
  const s = String(limit || "").trim();
  let m = s.match(/^(last|final|first)\s+(\d+)\s*weeks?$/i);
  if (m) { const n = Number(m[2]); return /first/i.test(m[1]) ? weeks.slice(0, n) : weeks.slice(-n); }
  m = s.match(/^weeks?\s*(\d+)\s*(?:-|–|to)\s*(\d+)$/i);
  if (m) return weeks.slice(Number(m[1]) - 1, Number(m[2]));
  m = s.match(/^weeks?\s*(\d+)$/i);
  if (m) return weeks.slice(Number(m[1]) - 1, Number(m[1]));
  const dates = [...s.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((x) => weekStart(x[0]));
  return dates.length ? dates : null;
}
const describeWeeks = (ws) => (ws.length === 1 ? `w/c ${ws[0]}` : `w/c ${ws[0]} to ${ws[ws.length - 1]}`);

// ---------- built-in checks (always on; not from the rules sheet)
// From the original brief: written text may only contain figures that are in the
// plan, and no [placeholders] anywhere; plus every section of the template filled in.
import { unsourcedNumbers, hasPlaceholder } from "../../core/checks/text.js";

export const BUILT_IN_RULES = [
  { id: "B1", type: "sections_complete", description: "Every section of the plan is filled in", severity: "fail", on: true, source: { file: "built-in" } },
  { id: "B2", type: "text_numbers", description: "Figures in written text match figures in the plan", severity: "fail", on: true, source: { file: "built-in" } },
  { id: "B3", type: "no_placeholders", description: "No [placeholders] left anywhere", severity: "fail", on: true, source: { file: "built-in" } },
];

const writtenTexts = (plan) => [
  ...(plan.sections?.objective ? [["Objective", plan.sections.objective.text]] : []),
  ...Object.entries(plan.sections?.rationale || {}).map(([id, r]) => [`Rationale for ${plan.lines.find((l) => l.id === id)?.channel || id}`, r.text]),
];

Object.assign(evaluators, {
  sections_complete(rule, m) {
    const plan = m._plan; if (!plan) return notRun("No plan.");
    const missing = [];
    if (!m.budget) missing.push("budget"); if (!m.window) missing.push("campaign window");
    if (!plan.sections?.objective) missing.push("objective");
    if (!plan.lines.length) missing.push("channels");
    for (const l of plan.lines) if (!plan.sections?.rationale?.[l.id]) missing.push(`rationale for ${l.channel}`);
    for (const l of plan.lines) if (!l.weeks) missing.push(`flighting for ${l.channel}`);
    if (!plan.figures.length) missing.push("audience figures");
    return missing.length ? problem(`Not filled in yet: ${missing.join(", ")}.`) : pass("Every section is filled in.");
  },
  text_numbers(rule, m) {
    const plan = m._plan; if (!plan) return notRun("No plan.");
    const texts = writtenTexts(plan);
    if (!texts.length) return notRun("No written text in the plan yet.");
    const bad = texts.flatMap(([where, t]) => unsourcedNumbers(t, m._derived.allowedNumbers).map((n) => `${where}: "${n.raw}"`));
    return bad.length ? problem(`Unsourced figure: ${bad.join("; ")}.`) : pass(`All figures in ${texts.length} written section(s) match the plan.`);
  },
  no_placeholders(rule, m) {
    const plan = m._plan; if (!plan) return notRun("No plan.");
    const all = [...writtenTexts(plan), ...plan.lines.map((l) => ["Channel name", l.channel])];
    const bad = all.filter(([, t]) => hasPlaceholder(t)).map(([w]) => w);
    return bad.length ? problem(`Placeholder found in: ${bad.join(", ")}.`) : pass("No placeholders.");
  },
});
