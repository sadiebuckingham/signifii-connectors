import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runChecks } from "../../../core/checks/engine.js";
import { readRulesSheet } from "../../../core/checks/rules-sheet.js";
import { evaluators, ruleTypeOf, weeksInWindow } from "../rules.js";

const RULES = fileURLToPath(new URL("../../../sample-data/media-plan/Media Plans/Rules/rules.xlsx", import.meta.url));
const src = { file: "brief.pdf", ref: "p1" };
const weeks = weeksInWindow("2026-11-09", "2026-12-20");
const plan = (over = {}) => ({
  budget: { value: 150000, source: src }, window: { start: "2026-11-09", end: "2026-12-20", source: src }, weeks,
  lines: [
    { channel: "Kids' TV", category: "TV", budget_gbp: 60000, weeks, audiences: [{ label: "4-9", age: { from: 4, to: 9 } }], rate: { kind: "currency", value: 12.5 } },
    { channel: "YouTube", category: "Online video", budget_gbp: 40000, weeks, audiences: [{ label: "6-8", age: { from: 6, to: 8 } }], rate: { kind: "currency", value: 7.5 } },
    { channel: "Social", category: "Social", budget_gbp: 50000, weeks, audiences: [{ label: "Parents", type: "parents" }], rate: { kind: "none", original: "POA", source: { file: "rates.xlsx", sheet: "Q4", ref: "F8" } } },
  ],
  audienceFigures: [{ label: "TV 4-9", value: 203, source: { file: "tv.xlsx", sheet: "Wk", ref: "B8" } }],
  ...over,
});
const rule = (type, extra = {}) => ({ id: type, type, on: true, severity: "fail", ...extra });
const one = (r, p) => runChecks({ rules: [r], evaluators, subject: p }).results[0];

test("the rules sheet is read exactly: ten rules, all known types", async () => {
  const { rules, problems } = await readRulesSheet(readFileSync(RULES), "rules.xlsx", ruleTypeOf);
  assert.deepEqual(problems, []);
  assert.equal(rules.length, 10);
  assert.ok(rules.every((r) => r.type && !r.problem));
});

test("nothing passes without running", () => {
  const empty = runChecks({ rules: [rule("budget_total"), rule("flighting_in_window"), rule("max_share_any", { limit: "50%" })], evaluators, subject: {} });
  assert.ok(empty.results.every((r) => r.status === "not_run"), JSON.stringify(empty.results.map((r) => r.status)));
  assert.equal(runChecks({ rules: [], evaluators, subject: plan() }).results[0].status, "not_run");
  const unknown = one({ id: "X", type: null, typeText: "Frequency cap", on: true, severity: "fail", problem: "Rule type \"Frequency cap\" isn't one of the fixed rule types." }, plan());
  assert.equal(unknown.status, "not_checked");
  const broken = runChecks({ rules: [rule("boom")], evaluators: { boom: () => { throw new Error("x"); } }, subject: plan() });
  assert.equal(broken.results[0].status, "not_run");
  assert.equal(one(rule("budget_total"), plan({ budget: { value: 150000, source: null } })).status, "not_run");
});

test("budget total: exact to the penny", () => {
  assert.equal(one(rule("budget_total"), plan()).status, "pass");
  const p = plan(); p.lines[0].budget_gbp = 59999.99;
  const r = one(rule("budget_total"), p);
  assert.equal(r.status, "fail"); assert.match(r.message, /under by £0.01/);
});

test("shares, named channel shares and allowed list", () => {
  assert.equal(one(rule("max_share_any", { limit: "50%" }), plan()).status, "pass");
  assert.equal(one(rule("max_share_any", { limit: "35%" }), plan()).status, "fail");
  assert.equal(one(rule("channel_share", { appliesTo: "Online video", limit: "min 30%" }), plan()).status, "fail");
  assert.equal(one(rule("channel_share", { appliesTo: "Online video", limit: "10%-30%" }), plan()).status, "pass");
  assert.equal(one(rule("channel_share", { appliesTo: "TV", limit: "lots" }), plan()).status, "not_checked");
  assert.equal(one(rule("allowed_channels", { limit: "TV, Online video" }), plan()).status, "fail");
});

test("weeks, audiences every week, window", () => {
  const p = plan(); p.lines[0].weeks = weeks.slice(0, 3);
  assert.equal(one(rule("channel_weeks", { appliesTo: "TV", limit: "last 2 weeks" }), p).status, "fail");
  assert.equal(one(rule("channel_weeks", { appliesTo: "TV", limit: "first 2 weeks" }), p).status, "pass");
  assert.equal(one(rule("audience_every_week", { appliesTo: "parents" }), plan()).status, "pass");
  const q = plan(); q.lines[2].weeks = weeks.slice(1);
  assert.equal(one(rule("audience_every_week", { appliesTo: "parents" }), q).status, "fail");
  const w = plan(); w.lines[1].weeks = [...weeks, "2026-12-21"];
  assert.equal(one(rule("flighting_in_window"), w).status, "fail");
  assert.equal(one(rule("flighting_in_window"), plan()).status, "pass");
});

test("under-13 lines and POA rates are warnings that need a tick", () => {
  const u = one(rule("under13_review", { severity: "warn" }), plan());
  assert.equal(u.status, "warn"); assert.ok(u.needsTick); assert.match(u.message, /YouTube/);
  const poa = one(rule("rate_placeholder", { severity: "warn" }), plan());
  assert.equal(poa.status, "warn"); assert.match(poa.message, /POA/);
  const ticked = runChecks({ rules: [rule("under13_review", { id: "R7" })], evaluators, subject: plan(), ticks: { R7: { by: "Jo" } } });
  assert.equal(ticked.results[0].ticked.by, "Jo");
  assert.equal(ticked.summary.untickedWarnings, 0);
});

test("audience figures need sources; export blocked by fails and unticked warnings", () => {
  const p = plan({ audienceFigures: [{ label: "x", value: 1, source: null }] });
  assert.equal(one(rule("audience_sourced"), p).status, "fail");
  const run = runChecks({ rules: [rule("audience_sourced"), rule("under13_review", { severity: "warn" })], evaluators, subject: p });
  assert.equal(run.summary.canExportFinal, false);
  assert.equal(run.summary.blockers.length, 2);
});

test("rule types by number, code or name; vague text isn't guessed", () => {
  assert.equal(ruleTypeOf("7 - Flag online video and social lines aimed at under-13s"), "under13_review");
  assert.equal(ruleTypeOf("budget_total"), "budget_total");
  assert.equal(ruleTypeOf("Frequency cap"), null);
});
