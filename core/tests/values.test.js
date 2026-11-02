import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseValue, resolveDateOrder, applyDateOrder, parseDateText } from "../sources/values.js";

const n = (raw, hints) => normaliseValue(raw, typeof raw === "string" ? raw : String(raw), hints);

test("numbers stored as text", () => {
  assert.equal(n("12,345").value, 12345);
  assert.equal(n("48.2k").value, 48200);
  assert.equal(n("£1,150").value, 1150);
  assert.equal(n("£1,150").kind, "currency");
  assert.equal(n("£5k").value, 5000);
  assert.equal(n("10000").value, 10000);
});

test("percentages, both kinds, original kept", () => {
  assert.deepEqual([n("41%").kind, n("41%").value], ["percent", 41]);
  assert.equal(n("3.2 %").value, 3.2);
  const f = n(0.41, { percentColumn: true });
  assert.equal(f.kind, "percent"); assert.equal(Math.round(f.value), 41); assert.equal(f.original, "0.41");
  assert.equal(n(9.8, { percentColumn: false }).kind, "number");
});

test("comma decimal is flagged", () => {
  const v = n("5,38");
  assert.equal(v.value, 5.38); assert.ok(v.flags.includes("comma_decimal"));
  assert.equal(n("5,6").value, 5.6);
});

test("placeholders are never zero", () => {
  for (const p of ["n/a", "TBC", "POA", "--", "<1", "N/A", "tba"]) {
    const v = n(p);
    assert.equal(v.kind, "none", p); assert.equal(v.value, null, p); assert.equal(v.original, p);
  }
});

test("ranges stay ranges", () => {
  const v = n("£6.20 - £7.10");
  assert.equal(v.kind, "range"); assert.equal(v.value, null); assert.equal(v.min, 6.2); assert.equal(v.max, 7.1);
  assert.equal(n("6-8").kind, "text", "an age band is not a range of money");
});

test("footnote markers are stripped and kept", () => {
  const v = n("12.4*");
  assert.equal(v.value, 12.4); assert.equal(v.marker, "*");
});

test("dates: UK, US, dotted, written; ambiguity flagged", () => {
  assert.equal(parseDateText("15.08.2026").value, "2026-08-15");
  assert.equal(parseDateText("1 Jul 2026").value, "2026-07-01");
  const parts = ["10/01/2026", "10/15/2026"].map((d) => parseDateText(d).parts);
  assert.equal(resolveDateOrder(parts), "mdy");
  assert.equal(applyDateOrder(parseDateText("10/01/2026"), "mdy").value, "2026-10-01");
  assert.equal(resolveDateOrder([parseDateText("13/10/2026").parts]), "dmy");
  const amb = applyDateOrder(parseDateText("03/04/2026"), resolveDateOrder([parseDateText("03/04/2026").parts]));
  assert.ok(amb.flags.includes("ambiguous_date")); assert.equal(amb.value, null);
});

test("durations", () => { assert.equal(n("0:00:14").value, 14); assert.equal(n("0:00:14").kind, "duration"); });
