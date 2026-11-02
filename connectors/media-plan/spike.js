// Turns the spike's dummy plan into the plan shape the rules read, so the
// checks run for real on it. Replaced by the plan engine on Tuesday.
// Nothing in the dummy plan has a source, and the model says so (source: null),
// so checks that need sourced data report "not run" instead of passing.
import { weeksInWindow } from "./rules.js";

const CATEGORY = [[/tv/i, "TV"], [/youtube|online video|pre-roll/i, "Online video"], [/social/i, "Social"], [/print|magazine/i, "Print"], [/cinema/i, "Cinema"], [/newsletter/i, "Newsletter"]];
const categoryOf = (channel) => (CATEGORY.find(([re]) => re.test(channel)) || [null, null])[1];

export function spikePlanModel(d) {
  const weeks = weeksInWindow(d.window.start, d.window.end);
  return {
    budget: { value: d.budget_gbp, source: null },
    window: { start: d.window.start, end: d.window.end, source: null },
    weeks,
    lines: d.mix.map((m) => {
      const fl = d.flighting.rows.find((r) => r.channel === m.channel);
      return {
        channel: m.channel, category: categoryOf(m.channel), budget_gbp: m.budget_gbp,
        weeks: fl ? weeks.filter((_, i) => fl.on[i]) : null,
        audiences: null, // not set in the spike
        rate: undefined, // no rate chosen in the spike
      };
    }),
    audienceFigures: d.reach.rows.flatMap((r) => r.values.map((v, i) => (v == null ? null : { label: `${r.channel} ${d.reach.columns[i]}`, value: v, source: null }))).filter(Boolean),
  };
}
