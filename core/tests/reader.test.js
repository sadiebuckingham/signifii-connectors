import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ExcelJS from "exceljs";
import { readSource } from "../sources/reader.js";

const DIR = fileURLToPath(new URL("../../sample-data/media-plan/Media Plans/Shared data/", import.meta.url));
const read = async (f) => readSource(f, readFileSync(DIR + f));
const at = (values, ref, sheet) => values.find((v) => v.ref === ref && (!sheet || v.sheet === sheet));

test("every sample file is read, with a report, and nothing is 'couldn't read'", async () => {
  for (const f of readdirSync(DIR)) {
    const { report } = await read(f);
    assert.ok(["read", "read with warnings"].includes(report.status), `${f}: ${report.status} ${report.summary}`);
    assert.ok(report.counts.values > 0);
  }
});

test("no placeholder ever becomes a number", async () => {
  for (const f of readdirSync(DIR)) {
    const { values } = await read(f);
    for (const v of values) if (/^(n\/a|tbc|poa|--|<\s*\d.*)$/i.test(String(v.original).trim())) {
      assert.equal(v.kind, "none", `${f} ${v.ref} "${v.original}"`); assert.equal(v.value, null);
    }
  }
});

test("TV file: header under merged group labels, week rows carried down, unit from title", async () => {
  const { values } = await read("01_tv_audiences_wk42-45.xlsx");
  const b8 = at(values, "B8");
  assert.equal(b8.value, 203); assert.equal(b8.unit, "000s"); assert.equal(b8.group, "Wk 42"); assert.equal(b8.entity, "Pip TV");
  assert.deepEqual(b8.audience.age && [b8.audience.age.from, b8.audience.age.to], [4, 9]);
  assert.match(b8.column, /CHILDREN › Children 4-9/);
  const g22 = at(values, "G22");
  assert.equal(g22.value, 12.4); assert.ok(g22.notes.some((n) => /low sample/i.test(n.text)));
  assert.ok(!values.some((v) => v.ref.startsWith("A")), "labels aren't values");
});

test("video export: US dates decided from the file, totals skipped, made-for-kids rows marked modelled", async () => {
  const { report, values } = await read("02_online_video_export_oct26.xlsx");
  assert.equal(at(values, "F2").period, "2026-10-01");
  assert.equal(at(values, "F2").value, 80504);
  assert.ok(at(values, "F2").flags.includes("modelled"));
  assert.ok(!at(values, "F11").flags.includes("modelled"));
  assert.equal(report.skipped.filter((s) => /total/i.test(s.text)).length, 4);
});

test("audience pack: transposed, comment kept, TBC is no value, overlap flagged", async () => {
  const { report, values } = await read("04_media_owner_audience_pack.xlsx");
  const e6 = at(values, "E6", "Audience profile");
  assert.equal(e6.metric, "Readership / monthly users (000s)"); assert.equal(e6.unit, "000s");
  assert.ok(e6.notes.some((n) => /not comparable/i.test(n.text)));
  assert.equal(at(values, "E10", "Audience profile").kind, "none");
  assert.ok(report.checkThese.some((g) => g.key === "overlap"));
  assert.equal(Math.round(at(values, "B4", "Parents").value), 41);
});

test("rate card: hidden column read and marked, POA no value, range kept, buying unit only on rates", async () => {
  const { values } = await read("05_rate_card_q4_2026.xlsx");
  assert.ok(at(values, "E5").hidden);
  assert.equal(at(values, "F8").kind, "none");
  assert.equal(at(values, "F12").kind, "range");
  assert.equal(at(values, "F5").unit, "CPT");
  assert.notEqual(at(values, "G5").unit, "CPT");
});

// ---- files the reader has never seen
async function xlsx(build) { const wb = new ExcelJS.Workbook(); build(wb); return Buffer.from(await wb.xlsx.writeBuffer()); }

test("new layout: transposed table with a hidden row, cell comment and UK dates", async () => {
  const buf = await xlsx((wb) => {
    const ws = wb.addWorksheet("Kids radio");
    ws.addRow(["KIDS RADIO REACH"]); ws.addRow(["Survey period 03/09/2026 to 28/09/2026"]); ws.addRow([]);
    ws.addRow(["Measure", "Kids 7-9", "Kids 10-12", "Mums"]);
    ws.addRow(["Weekly reach (000s)", 55, "61.5", "n/a"]);
    ws.addRow(["Old reach (000s)", 40, 44, 90]);
    ws.addRow(["Share of listening", "12%", "9%", "4%"]);
    ws.getRow(6).hidden = true;
    ws.getCell("C5").note = "Includes catch-up listening";
  });
  const { report, values } = await readSource("radio.xlsx", buf);
  assert.ok(report.status.startsWith("read"));
  const c5 = values.find((v) => v.ref === "C5");
  assert.equal(c5.value, 61.5); assert.equal(c5.metric, "Weekly reach (000s)"); assert.equal(c5.audience.age.label, "10-12");
  assert.ok(c5.notes.some((n) => /catch-up/.test(n.text)));
  assert.equal(values.find((v) => v.ref === "D5").kind, "none");
  assert.ok(values.find((v) => v.ref === "B6").hidden);
  assert.equal(values.find((v) => v.ref === "D5").audience.type, "parents");
  assert.equal(report.sheets[0].tables[0].period.from, "2026-09-03");
});

test("CSV with semicolons and comma decimals", async () => {
  const csv = "Platform;Age;Reach;CPM\nPlatform C;13-17;12,5k;4,20\nPlatform C;18-24;30000;3,10\n";
  const { values } = await readSource("c.csv", Buffer.from(csv));
  assert.equal(values.find((v) => v.ref === "C2").value, 12500);
  assert.equal(values.find((v) => v.ref === "D2").value, 4.2);
});

test("ambiguous dates are flagged, not guessed", async () => {
  const csv = "Week,Channel,Impacts\n03/04/2026,Pip TV,120\n05/06/2026,Pip TV,130\n";
  const { values, report } = await readSource("amb.csv", Buffer.from(csv));
  assert.equal(values[0].period, null);
  assert.ok(report.issues.some((i) => /ambiguous date/i.test(i.text)));
});

test("row-level personal data is refused and nothing is stored", async () => {
  const csv = "Child name,Date of birth,Postcode,Minutes watched\nAmy,2019-04-02,AB1 2CD,30\n";
  const r = await readSource("panel.csv", Buffer.from(csv));
  assert.equal(r.report.status, "refused"); assert.equal(r.values.length, 0);
  const emails = "Contact,Reach\nparent1@example.com,10\nparent2@example.com,12\n";
  assert.equal((await readSource("e.csv", Buffer.from(emails))).report.status, "refused");
});

test("unsupported or broken files say so", async () => {
  assert.equal((await readSource("old.xls", Buffer.from("x"))).report.status, "couldn't read");
  assert.equal((await readSource("fake.xlsx", Buffer.from("not a zip"))).report.status, "couldn't read");
});
