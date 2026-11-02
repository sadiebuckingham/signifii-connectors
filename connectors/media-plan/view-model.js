// Turns a plan into what the template shows: display strings plus, for every
// figure, where it came from (file · sheet · cell) or how it was calculated.
import { derive, fmtGBP, srcText } from "./engine.js";
import { canonicalBand, queryAudience } from "./engine.js";

const fmtDate = (iso) => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
const shortWeek = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtFigure = (f) => {
  const n = Number(f.value);
  const shown = Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return f.unit ? `${shown} (${f.unit})` : shown;
};

export function viewModel(plan, { checkRun, values = [] } = {}) {
  const d = derive(plan);
  const F = plan.brief.facts;
  const s = (f) => (f ? srcText(f.source) : null);
  const gaps = [];
  for (const b of plan.targetBands) {
    const want = canonicalBand(b);
    if (!want || want.type) continue;
    if (plan.figures.some((f) => f.ageLabel === want.label)) continue;
    try { const q = queryAudience(values, { band: b }); if (!q.exactCount) gaps.push(...q.messages.slice(0, 3)); } catch { /* unknown band: nothing to say */ }
  }
  return {
    planId: plan.id, version: plan.version, versionLabel: `v${plan.version ?? 1}`, status: plan.status,
    client: plan.client,
    campaign: F.campaign ? { text: F.campaign.value, src: s(F.campaign) } : null,
    window: F.window ? { text: `${fmtDate(F.window.start)} – ${fmtDate(F.window.end)}`, src: s(F.window) } : null,
    approvalBy: F.approvalBy ? { text: fmtDate(F.approvalBy.value), src: s(F.approvalBy) } : null,
    contact: F.contact ? { text: F.contact.value, src: s(F.contact) } : null,
    budget: F.budget ? { text: fmtGBP(Math.round(F.budget.value * 100)), src: s(F.budget) } : null,
    audienceText: F.audience ? { text: F.audience.value, src: s(F.audience) } : null,
    objective: plan.sections.objective ? { text: plan.sections.objective.text, src: `Written in Claude from the brief's objective${F.objective ? ` (${srcText(F.objective.source)})` : ""}` } : null,
    figures: plan.figures.map((f) => ({ entity: f.entity, audience: f.audienceLabel, metric: f.metric, period: f.period, value: fmtFigure(f), src: srcText(f.source) + (f.notes.length ? ` · Notes: ${f.notes.join(" | ")}` : "") })),
    gaps,
    lines: d.lines.map((l) => ({
      channel: l.channel, category: l.category,
      budget: fmtGBP(l.budgetP), budgetSrc: "Set by the planner in Claude",
      share: `${l.share.toFixed(1)}%`, shareSrc: `Calculated: ${fmtGBP(l.budgetP)} ÷ ${fmtGBP(d.totalP)} total`,
      delivery: l.delivery.text, deliverySrc: l.delivery.calc ? `Calculated: ${l.delivery.calc}` : null,
      rateText: l.rate ? `${l.rate.original}${l.rate.unit ? ` ${l.rate.unit}` : ""}` : l.rate === null ? "no rate" : null,
      rateSrc: l.rate ? `${srcText(l.rate.source)}${l.rate.notes.length ? ` · Notes: ${l.rate.notes.join(" | ")}` : ""}` : null,
    })),
    total: { budget: fmtGBP(d.totalP), share: d.totalP ? "100.0%" : "–", src: "Calculated: sum of channel budgets" },
    unallocated: d.unallocatedP == null || d.unallocatedP === 0 || !plan.lines.length ? null : d.unallocatedP > 0 ? `${fmtGBP(d.unallocatedP)} of the brief budget not yet allocated` : `${fmtGBP(-d.unallocatedP)} over the brief budget`,
    weeks: d.weeks.map(shortWeek),
    flight: d.lines.map((l) => ({ channel: l.channel, on: l.weeks ? d.weeks.map((w) => l.weeks.includes(w)) : null })),
    rationale: d.lines.map((l) => ({ channel: l.channel, text: plan.sections.rationale[l.id]?.text || null })),
    checkRun, signoff: plan.signoff ? `${plan.signoff.by}, ${fmtDate(plan.signoff.at.slice(0, 10))}` : null,
    missing: plan.brief.missing,
  };
}
