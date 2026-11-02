import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAudience, bandsOverlap, compareBand } from "../sources/audience.js";

test("age bands, genders and audiences that aren't age bands", () => {
  assert.deepEqual(parseAudience("Boys 4-9").age, { from: 4, to: 9, label: "4-9", all: false });
  assert.equal(parseAudience("Boys 4-9").gender, "male");
  assert.equal(parseAudience("35+").age.label, "35+");
  assert.equal(parseAudience("All 4-12").age.all, true);
  const p = parseAudience("Parents of children 5-9 (interest)");
  assert.equal(p.type, "parents"); assert.equal(p.age, null, "5-9 is the children's age, not the parents'"); assert.match(p.qualifier, /children 5-9/);
  const a = parseAudience("Adults 16-34 w/ child 0-15");
  assert.equal(a.age.label, "16-34"); assert.equal(a.type, "adults");
  assert.equal(parseAudience("HWC (Housewives w/ children)").type, "parents");
  assert.equal(parseAudience("other/unknown").gender, "other_or_unknown");
  assert.equal(parseAudience("Unknown").unknown, true);
});

test("overlap and the exact-match planning rule", () => {
  assert.ok(bandsOverlap({ from: 5, to: 9 }, { from: 7, to: 11 }));
  assert.ok(!bandsOverlap({ from: 4, to: 9 }, { from: 10, to: 15 }));
  assert.deepEqual(compareBand({ from: 4, to: 9 }, { from: 4, to: 6 }), { exact: false, wider: true, narrower: false });
  assert.equal(compareBand({ from: 4, to: 6 }, { from: 4, to: 6 }).exact, true);
});
