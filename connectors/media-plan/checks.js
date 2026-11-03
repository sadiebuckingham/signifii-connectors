// Run every check on a plan: the agency's rules sheet plus the built-in checks.
// A tick only counts if the warning it ticked still says the same thing.
import { runChecks } from "../../core/checks/engine.js";
import { evaluators, BUILT_IN_RULES } from "./rules.js";
import { checkModel } from "./engine.js";

export function runPlanChecks(plan, sheetRules, { drift } = {}) {
  const subject = { ...checkModel(plan), _drift: drift };
  const first = runChecks({ rules: [...sheetRules, ...BUILT_IN_RULES], evaluators, subject });
  const ticks = {};
  for (const r of first.results) {
    const t = plan.ticks?.[r.ruleId];
    if (t && r.status === "warn" && t.message === r.message) ticks[r.ruleId] = t;
  }
  return Object.keys(ticks).length ? runChecks({ rules: [...sheetRules, ...BUILT_IN_RULES], evaluators, subject, ticks }) : first;
}
