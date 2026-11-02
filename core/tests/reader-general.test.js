// The reader on layouts it has never seen: general rules, not file-specific ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { readSource } from "../sources/reader.js";

async function workbook() {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("Station rates");
  a.addRow(["HAPPY HOUR RADIO - RATE CARD Q1 2027"]);
  a.addRow(["All prices exclude VAT and agency commission. Card rates before negotiation."]);
  a.addRow([]);
  a.addRow(["Station", "Audience", "Spot rate", "Min spend", "% Male", "% Female"]);
  a.addRow(["Happy FM", "Mums 25-44", "£420", "£5k", "38%", "61%"]);
  a.addRow(["Happy FM Kids", "Children 6-11", "380", "10000", "50%", "50%"]);
  a.addRow(["Happy Gold", "HWC", "£1,050", "£10,000", "45%", "55%"]);
  a.addRow([]);
  a.addRow(["Rows 6 & 7: rates include a 10% Q1 uplift."]);
  const b = wb.addWorksheet("Podcast");
  b.addRow(["Podcast listeners"]);
  b.addRow(["Survey dates 02.11.2026 - 29.11.2026"]);
  b.addRow([]);
  b.addRow(["Downloads per episode:", "48.2k", "estimated, not audited"]);
  b.addRow(["Listener share 4-6", "0.25"]);
  b.addRow(["Price per episode", "POA"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("money written three ways in one column is all read as money, and flagged", async () => {
  const { values, report } = await readSource("radio.xlsx", await workbook());
  const min = values.filter((v) => v.column === "Min spend");
  assert.deepEqual(min.map((v) => [v.original, v.kind, v.value, v.currency]), [["£5k", "currency", 5000, "GBP"], ["10000", "currency", 10000, "GBP"], ["£10,000", "currency", 10000, "GBP"]]);
  assert.ok(min[1].flags.includes("currency_from_column"));
  assert.ok(report.checkThese.some((g) => g.key === "currency_from_column"));
  assert.equal(values.find((v) => v.column === "Spot rate" && v.original === "380").currency, "GBP");
});

test("notes above and below the table that change meaning are kept with the right values", async () => {
  const { values } = await readSource("radio.xlsx", await workbook());
  const r5 = values.find((v) => v.ref === "C5"), r6 = values.find((v) => v.ref === "C6");
  const texts = (v) => v.qualifiers.map((q) => q.text);
  assert.ok(texts(r5).some((t) => /exclude VAT/.test(t)), "VAT note above the table applies to every value");
  assert.ok(new Set(r5.qualifiers.map((q) => q.key)).has("commission"));
  assert.ok(texts(r6).some((t) => /uplift/.test(t)), "row 6 is named in the uplift note");
  assert.ok(!texts(r5).some((t) => /uplift/.test(t)), "row 5 isn't");
});

test("percentage splits that don't add to 100 are reported, never changed", async () => {
  const { values, report } = await readSource("radio.xlsx", await workbook());
  const g = report.checkThese.find((x) => x.key === "splits");
  assert.ok(g, "split group present");
  assert.equal(g.count, 1);
  assert.match(g.details[0], /38% \+ .*61% = 99%/);
  assert.equal(values.find((v) => v.ref === "F5").value, 61);
});

test("audiences that aren't age bands", async () => {
  const { values } = await readSource("radio.xlsx", await workbook());
  const hwc = values.find((v) => v.ref === "C7"), mums = values.find((v) => v.ref === "C5"), kids = values.find((v) => v.ref === "C6");
  assert.equal(hwc.audience.type, "parents"); assert.equal(hwc.audience.age, null);
  assert.equal(mums.audience.type, "parents"); assert.equal(mums.audience.age.label, "25-44");
  assert.equal(kids.audience.age.label, "6-11");
});

test("second tab: label/value list with a note column, colon labels, dotted dates; tabs with different periods", async () => {
  const { values, report } = await readSource("radio.xlsx", await workbook());
  const dl = values.find((v) => v.sheet === "Podcast" && v.metric === "Downloads per episode");
  assert.equal(dl.value, 48200); assert.ok(dl.flags.includes("abbreviated"));
  assert.ok(dl.qualifiers.some((q) => q.key === "basis"), "\"estimated\" note kept with the value");
  assert.equal(dl.tablePeriod.from, "2026-11-02"); assert.equal(dl.tablePeriod.to, "2026-11-29");
  assert.equal(values.find((v) => v.metric === "Price per episode").kind, "none");
  const periods = report.checkThese.find((g) => g.key === "periods");
  assert.ok(periods && periods.details.some((d) => /Station rates: 2027-01-01 to 2027-03-31/.test(d)) && periods.details.some((d) => /Podcast: 2026-11-02 to 2026-11-29/.test(d)));
});

test("numbers stored as text in a number column are converted and listed by column", async () => {
  const { report } = await readSource("radio.xlsx", await workbook());
  const g = report.checkThese.find((x) => x.key === "number_stored_as_text");
  assert.ok(g.details.some((d) => /Spot rate/.test(d)));
});
