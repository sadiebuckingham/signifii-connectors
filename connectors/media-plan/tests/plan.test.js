import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FsStore } from "../../../core/storage/fs-store.js";
import { SourceLibrary } from "../../../core/sources/library.js";
import { cpSync, existsSync, readdirSync } from "node:fs";
import ExcelJS from "exceljs";
import { readDocument } from "../../../core/sources/documents.js";
import { createService } from "../service.js";
import { readBriefFacts } from "../brief.js";
import { PlanError } from "../engine.js";

const SAMPLE = fileURLToPath(new URL("../../../sample-data/media-plan/Media Plans", import.meta.url));
// a throwaway copy of the client folder, so tests can see what gets saved into it
const ROOT = path.join(mkdtempSync(path.join(os.tmpdir(), "client-")), "Media Plans");
cpSync(SAMPLE, ROOT, { recursive: true });
let svc, id, rates;
const store = new FsStore(ROOT);
const library = new SourceLibrary(store, "Shared data");
before(async () => {
  svc = createService({ store, library, renderFile: (vm) => `<html>${vm.client}</html>` });
  const r = await svc.startPlan({ client: "Bramble Bots" });
  id = r.plan.id;
  rates = await svc.rates();
});
const rate = (q) => rates.find((r) => (r.entity || "").includes(q)).rates[0].id;
const apply = (op, a) => svc.apply(id, op, a);
const rejects = (p, re) => assert.rejects(p, (e) => e instanceof PlanError && re.test(e.message));

test("the brief's budget, dates and details are read from the PDF with their page and line", async () => {
  const p = await svc.getPlan(id);
  assert.equal(p.brief.facts.budget.value, 150000);
  assert.equal(p.brief.facts.window.start, "2026-11-09");
  assert.equal(p.brief.facts.window.end, "2026-12-20");
  assert.match(p.brief.facts.budget.source.ref, /page 1, line \d+/);
  assert.deepEqual(p.brief.missing, []);
});

test("brief details that aren't there are asked for, never guessed", async () => {
  const doc = await readDocument("b.txt", Buffer.from("Client: Acme Toys\nWe'd like a plan for spring.\nBudget: £40k or maybe £50k depending on Q1.\n"));
  const { facts, missing } = readBriefFacts(doc);
  assert.equal(facts.client.value, "Acme Toys");
  assert.ok(missing.some((m) => m.key === "budget" && /more than one way/.test(m.why)));
  assert.ok(missing.some((m) => m.key === "window"));
});

test("reach for 4-6 refuses clearly; 4-9 on TV answers with sources", async () => {
  const q = await svc.audience({ band: "4-6" });
  assert.equal(q.exactCount, 0);
  assert.ok(q.messages.some((m) => /reports 4-9 only\. It can't be split to 4-6\./.test(m)));
  const tv = await svc.audience({ band: "4-9", search: "Pip TV" });
  assert.ok(tv.exactCount > 0);
  assert.match(tv.rows[0].source, /01_tv_audiences.*B8/);
});

test("a wider band is only used with the planner's agreement, and keeps its real label", async () => {
  const fig = (await svc.audience({ band: "4-9", search: "Pip TV" })).rows[0].id;
  await rejects(apply("add_audience_figure", { value_id: fig, for_band: "4-6" }), /can't be split to 4-6/);
  const r = await apply("add_audience_figure", { value_id: fig, for_band: "4-6", accept_wider: true });
  assert.match(r.plan.figures[0].audienceLabel, /4-9, used for 4-6 at planner's request/);
  await apply("remove_audience_figure", { value_id: fig });
});

test("hidden rates need the planner's say-so", async () => {
  const hidden = (await svc.rates({ include_hidden: true })).flatMap((r) => r.rates).find((x) => x.hidden).id;
  await rejects(apply("add_channel", { name: "Old rate", category: "TV", rate_id: hidden }), /hidden/);
});

test("allocation and moving budget: totals exact to the penny, shares calculated", async () => {
  await apply("add_channel", { name: "Kids TV", category: "TV", rate_id: rate("Pip TV") });
  await apply("add_channel", { name: "YouTube", category: "Online video", rate_id: rate("made for kids"), audiences: ["4-9"] });
  await apply("add_channel", { name: "Parents social", category: "Social", rate_id: rate("Social Platform A"), audiences: ["parents"] });
  await apply("set_allocation", { channel: "Kids TV", share_pct: 33.333 });
  await apply("set_allocation", { channel: "YouTube", amount_gbp: 50000.01 });
  let r = await apply("set_allocation", { channel: "Parents social", amount_gbp: 150000 - 49999.5 - 50000.01 });
  const before = r.vm.total.budget;
  await rejects(apply("move_budget", { from: "Kids TV", to: "YouTube", share_pct: 10 }), /what the percentage is of/);
  r = await apply("move_budget", { from: "Kids TV", to: "YouTube", share_pct: 10, basis: "of_total_budget" });
  assert.equal(r.vm.total.budget, before);
  const tv = r.plan.lines.find((l) => l.channel === "Kids TV");
  assert.equal(tv.budgetP, 4999950 - 1500000);
  await rejects(apply("move_budget", { from: "Kids TV", to: "YouTube", amount_gbp: 999999 }), /only has/);
});

test("delivery is calculated from the rate, never typed; POA rates can't be calculated", async () => {
  const r = await svc.open(id);
  const yt = r.vm.lines.find((l) => l.channel === "YouTube");
  assert.match(yt.deliverySrc, /Calculated: .* ÷ CPM £7\.50 × 1,000/);
  await apply("add_channel", { name: "Starling", category: "TV", rate_id: rate("Starling") });
  const s = (await svc.open(id)).vm.lines.find((l) => l.channel === "Starling");
  assert.match(s.delivery, /can't calculate|No budget/);
  await apply("remove_channel", { channel: "Starling" });
});

test("flighting outside the campaign window is refused", async () => {
  await rejects(apply("set_flighting", { channel: "YouTube", weeks: ["2026-12-21"] }), /outside the campaign window/);
  await rejects(apply("set_flighting", { channel: "YouTube", weeks: [7] }), /outside the campaign window/);
  const r = await apply("set_flighting", { channel: "YouTube", weeks: "all" });
  assert.equal(r.plan.lines.find((l) => l.channel === "YouTube").weeks.length, 6);
});

test("written text: length limit, unsourced figures, placeholders, claims about children", async () => {
  await rejects(apply("write_section", { slot: "objective", text: "x".repeat(141) }), /141 characters, max 140/);
  await rejects(apply("write_section", { slot: "objective", text: "Reach 30% more families before Christmas." }), /"30%".*doesn't match any figure/);
  await rejects(apply("write_section", { slot: "objective", text: "Live from 2 November for kids 3-5." }), /"2 November".*"3-5"/);
  await apply("write_section", { slot: "objective", text: "Live 9 November to 20 December 2026 for kids 4-9 and parents." });
  await rejects(apply("write_section", { slot: "rationale:YouTube", text: "Kids love unboxing, so [add stat]." }), /placeholder/);
  await rejects(apply("write_section", { slot: "rationale:YouTube", text: "Children adore unboxing videos." }), /think, feel or want/);
  const r = await apply("write_section", { slot: "objective", text: "Put Bramble Bots on wish lists with kids 4-9 and parents before Christmas, within the £150,000 budget." });
  assert.ok(r.plan.sections.objective);
});

test("checks rerun after every change and nothing passes without running", async () => {
  const r = await svc.open(id);
  const byId = Object.fromEntries(r.checkRun.results.map((c) => [c.ruleId, c]));
  assert.equal(byId.R1.status, "pass");
  assert.equal(byId.R4.status, "not_run", "TV has no weeks set yet, so the TV-weeks rule can't run");
  assert.equal(byId.R7.status, "warn");
  assert.ok(r.checkRun.results.every((c) => c.status !== "pass" || c.message));
  assert.equal(r.checkRun.summary.canExportFinal, false);
});

test("a tick lapses when the warning changes", async () => {
  let r = await svc.tick(id, { rule_id: "R7", name: "Jo" });
  assert.equal(r.checkRun.results.find((c) => c.ruleId === "R7").ticked.by, "Jo");
  await apply("add_channel", { name: "Kids social", category: "Social", rate_id: rate("Social Platform B"), audiences: ["7-9"] });
  r = await svc.open(id);
  const r7 = r.checkRun.results.find((c) => c.ruleId === "R7");
  assert.equal(r7.status, "warn"); assert.equal(r7.ticked, undefined);
  await apply("remove_channel", { channel: "Kids social" });
});

test("compare options changes nothing", async () => {
  const v = (await svc.getPlan(id)).version;
  const rows = await svc.compare(id, [{ name: "TV heavy", allocations: [{ channel: "Kids TV", share_pct: 60 }] }]);
  assert.equal(rows.length, 2);
  assert.match(rows[1].fails.join(" "), /R1: .*over by/);
  assert.equal((await svc.getPlan(id)).version, v);
});

test("versions are kept and can be restored", async () => {
  const vs = await svc.versions(id);
  assert.ok(vs.length > 5);
  const r = await svc.restore(id, 1);
  assert.equal(r.plan.lines.length, 0);
  assert.equal(r.plan.version, vs.length + 1);
});

test("plans are saved as files in the client's own Plans folder, with every version and a readable copy", async () => {
  const folder = path.join(ROOT, "Clients", "Bramble Bots", "Plans", id);
  const files = readdirSync(folder);
  assert.ok(files.includes("v0001.json"));
  assert.ok(files.filter((f) => /^v\d{4}\.json$/.test(f)).length > 5);
  assert.ok(files.some((f) => f.endsWith(".html")), "readable copy of the plan saved next to the versions");
  assert.ok(!existsSync(path.join(SAMPLE, "Clients", "Bramble Bots", "Plans", id)), "the original sample folder is untouched");
});

test("the brief's own objective is shown, and passed to Claude, until the short version is written", async () => {
  const fresh = await svc.startPlan({ client: "Bramble Bots" });
  assert.equal(fresh.vm.objective.fromBrief, true);
  assert.match(fresh.vm.objective.text, /wish lists/);
});

test("a decision agreed once is saved in the folder and reused automatically", async () => {
  await assert.rejects(svc.recordDecision({ type: "band_substitute", applies_to: "4-6", use: "6-8", agreed_by: "Jo" }), /doesn't contain 4-6/);
  const r = await svc.recordDecision({ type: "band_substitute", applies_to: "4-6", use: "4-9", agreed_by: "Jo", why: "No source reports 4-6" });
  assert.equal(r.decision.id, "D1");
  assert.ok(existsSync(path.join(ROOT, "Rules", "decisions.xlsx")));
  await assert.rejects(svc.recordDecision({ type: "band_substitute", applies_to: "4-6", use: "4-9", agreed_by: "Jo" }), /already covers/);
  const q = await svc.audience({ band: "4-6", search: "Pip TV" });
  assert.ok(q.messages.some((m) => /Agreed decision D1, agreed by Jo/.test(m)));
  assert.match(q.rows[0].match, /allowed by decision D1/);
  // a new plan uses it without asking again, and labels the band honestly
  const p2 = (await svc.startPlan({ client: "Bramble Bots" })).plan.id;
  const add = await svc.apply(p2, "add_audience_figure", { value_id: q.rows[0].id, for_band: "4-6" });
  assert.match(add.plan.figures[0].audienceLabel, /4-9, used for 4-6 by decision D1, agreed by Jo/);
});

test("a decision switched off in the sheet stops applying", async () => {
  const f = path.join(ROOT, "Rules", "decisions.xlsx");
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
  const ws = wb.getWorksheet("Decisions"); ws.getCell(ws.rowCount, 8).value = "No"; await wb.xlsx.writeFile(f);
  const q = await svc.audience({ band: "4-6", search: "Pip TV" });
  assert.ok(!q.messages.some((m) => /D1/.test(m)));
  assert.match(q.rows[0].match, /only with the planner's agreement/);
});

test("every figure is re-read from its file when the plan is shown; changes and missing sources are flagged", async () => {
  const p = (await svc.startPlan({ client: "Bramble Bots" })).plan.id;
  const tv = (await svc.audience({ band: "4-9", search: "Pip TV" })).rows[0];
  await svc.apply(p, "add_audience_figure", { value_id: tv.id, for_band: "4-9" });
  let r = await svc.open(p);
  assert.equal(r.checkRun.results.find((c) => c.ruleId === "B4").status, "pass");
  // someone edits the source spreadsheet
  const file = path.join(ROOT, "Shared data", "01_tv_audiences_wk42-45.xlsx");
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const ref = tv.id.split("::")[2];
  const before = wb.worksheets[0].getCell(ref).value;
  wb.worksheets[0].getCell(ref).value = 999; await wb.xlsx.writeFile(file);
  r = await svc.open(p);
  const b4 = r.checkRun.results.find((c) => c.ruleId === "B4");
  assert.equal(b4.status, "warn"); assert.match(b4.message, new RegExp(`was "${before}", now "999"`));
  assert.match(r.vm.figures[0].value, /999 .*\(was 203\)/);
  // the cell is emptied
  wb.worksheets[0].getCell(ref).value = null; await wb.xlsx.writeFile(file);
  r = await svc.open(p);
  assert.equal(r.checkRun.results.find((c) => c.ruleId === "B4").status, "fail");
  assert.equal(r.vm.figures[0].value, "Source missing");
  wb.worksheets[0].getCell(ref).value = before; await wb.xlsx.writeFile(file);
});

test("a complete plan passes every check, can be signed off, and any change makes it a draft again", async () => {
  const p = (await svc.startPlan({ client: "Bramble Bots" })).plan.id;
  const go = (op, a) => svc.apply(p, op, a);
  await assert.rejects(svc.signOff(p, { name: "Ana" }), /Can't sign off yet/);
  await go("add_channel", { name: "Kids TV", category: "TV", rate_id: rate("Pip TV") });
  await go("add_channel", { name: "YouTube", category: "Online video", rate_id: rate("made for kids"), audiences: ["4-9"] });
  await go("add_channel", { name: "Parents social", category: "Social", rate_id: rate("Social Platform A"), audiences: ["parents"] });
  for (const [c, s] of [["Kids TV", 50], ["YouTube", 25], ["Parents social", 25]]) await go("set_allocation", { channel: c, share_pct: s });
  for (const c of ["Kids TV", "YouTube", "Parents social"]) await go("set_flighting", { channel: c, weeks: "all" });
  const fig = (await svc.audience({ band: "4-9", search: "Pip TV" })).rows.find((r) => r.audience.includes("Children 4-9"));
  await go("add_audience_figure", { value_id: fig.id, for_band: "4-9" });
  await go("write_section", { slot: "objective", text: "Put Bramble Bots on Christmas wish lists with kids 4-9 and their parents." });
  await go("write_section", { slot: "rationale:Kids TV", text: "Broad family reach across the whole campaign, including the final two weeks." });
  await go("write_section", { slot: "rationale:YouTube", text: "Made-for-kids placements only: contextual, with no personalised targeting." });
  await go("write_section", { slot: "rationale:Parents social", text: "Reaches the parents who buy, every week of the campaign." });
  let r = await svc.open(p);
  const open = r.checkRun.results.filter((c) => c.status !== "pass");
  assert.deepEqual(open.map((c) => c.ruleId), ["R7"], JSON.stringify(open.map((c) => [c.ruleId, c.status, c.message])));
  await svc.tick(p, { rule_id: "R7", name: "Ana" });
  r = await svc.signOff(p, { name: "Ana Okafor" });
  assert.equal(r.plan.status, "FINAL"); assert.equal(r.plan.signoff.by, "Ana Okafor");
  r = await go("move_budget", { from: "Kids TV", to: "YouTube", amount_gbp: 1000 });
  assert.equal(r.plan.status, "DRAFT"); assert.equal(r.plan.signoff, null);
});
