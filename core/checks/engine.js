// Rules engine. Shared by every connector.
//
// A rule is a row: { id, type, description, appliesTo, limit, severity, on, source }.
// A connector registers one evaluator per rule type it understands.
//
// Statuses, and when each is allowed:
//   pass         the evaluator ran on real data and found nothing wrong
//   warn / fail  the evaluator ran and found a problem (rule's severity)
//   not_run      the rule is known but the data it needs isn't there yet
//   not_checked  the rule type is unknown, or its limit can't be read
//   off          the rule is switched off in the rules sheet
// "pass" can only come from an evaluator that returned it explicitly. Errors,
// missing data and unknown rules never turn into "pass".

export const STATUS = Object.freeze({ PASS: "pass", WARN: "warn", FAIL: "fail", NOT_RUN: "not_run", NOT_CHECKED: "not_checked", OFF: "off" });

export function runChecks({ rules, evaluators, subject, context = {}, ticks = {} }) {
  const ranAt = new Date().toISOString();
  const results = [];
  if (!rules || !rules.length) {
    return {
      ranAt, rulesSnapshot: [],
      results: [{ ruleId: null, status: STATUS.NOT_RUN, title: "No rules loaded", message: "No rules file was found, so no checks have run.", evidence: [] }],
      summary: summarise([{ status: STATUS.NOT_RUN }]),
    };
  }
  for (const rule of rules) {
    const base = { ruleId: rule.id, type: rule.type, title: rule.description || rule.type, severity: rule.severity, source: rule.source };
    if (!rule.on) { results.push({ ...base, status: STATUS.OFF, message: "Switched off in the rules sheet.", evidence: [] }); continue; }
    if (rule.problem) { results.push({ ...base, status: STATUS.NOT_CHECKED, message: rule.problem, evidence: [] }); continue; }
    const ev = evaluators[rule.type];
    if (!ev) { results.push({ ...base, status: STATUS.NOT_CHECKED, message: `Rule type "${rule.typeText ?? rule.type}" isn't one the connector knows, so it wasn't checked.`, evidence: [] }); continue; }
    let out;
    try { out = ev(rule, subject, context); }
    catch (e) { out = { status: STATUS.NOT_RUN, message: `The check couldn't run: ${e.message}` }; }
    if (!out || !Object.values(STATUS).includes(out.status)) out = { status: STATUS.NOT_RUN, message: "The check returned no result." };
    if (out.status === STATUS.FAIL || out.status === STATUS.WARN) {
      // a rule's severity decides how serious a problem is, unless the evaluator insists on warn-with-tick
      if (!out.forceStatus) out.status = rule.severity === "warn" ? STATUS.WARN : STATUS.FAIL;
    }
    const tickKey = `${rule.id}`;
    const r = { ...base, status: out.status, message: out.message, evidence: out.evidence || [], needsTick: Boolean(out.needsTick) };
    if (r.status === STATUS.WARN && r.needsTick !== false) {
      r.needsTick = true;
      if (ticks[tickKey]) r.ticked = ticks[tickKey];
    }
    results.push(r);
  }
  return { ranAt, rulesSnapshot: rules.map(({ problem, ...r }) => r), results, summary: summarise(results) };
}

export function summarise(results) {
  const count = (s) => results.filter((r) => r.status === s).length;
  const fails = count(STATUS.FAIL);
  const unticked = results.filter((r) => r.status === STATUS.WARN && !r.ticked).length;
  const notRun = count(STATUS.NOT_RUN), notChecked = count(STATUS.NOT_CHECKED);
  return {
    pass: count(STATUS.PASS), warn: count(STATUS.WARN), fail: fails, notRun, notChecked, off: count(STATUS.OFF),
    untickedWarnings: unticked,
    // Export as final needs: no fails, every warning ticked, and nothing that couldn't run.
    canExportFinal: fails === 0 && unticked === 0 && notRun === 0,
    blockers: [
      ...(fails ? [`${fails} check(s) failed`] : []),
      ...(unticked ? [`${unticked} warning(s) need a planner's tick`] : []),
      ...(notRun ? [`${notRun} check(s) couldn't run yet`] : []),
    ],
  };
}
