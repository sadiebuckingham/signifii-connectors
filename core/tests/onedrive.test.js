import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OneDriveStore, StoreAuthError } from "../storage/onedrive-store.js";
import { SourceLibrary } from "../sources/library.js";
import { createService } from "../../connectors/media-plan/service.js";

// A pretend OneDrive (Microsoft Graph by path), held in memory.
function fakeGraph() {
  const files = new Map();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push(url);
    if (init.headers?.Authorization !== "Bearer GOOD") return new Response("", { status: 401 });
    const m = String(url).match(/root:\/(.+?)(?::(\/.*))?$/);
    const p = decodeURIComponent(m[1].split("/").map(decodeURIComponent).join("/"));
    const op = m[2] || "";
    if (op.startsWith("/children")) {
      const prefix = p + "/";
      const names = new Map();
      for (const k of files.keys()) if (k.startsWith(prefix)) { const rest = k.slice(prefix.length).split("/"); names.set(rest[0], rest.length > 1); }
      if (!names.size) return new Response("", { status: 404 });
      return Response.json({ value: [...names].map(([name, isFolder]) => (isFolder ? { name, folder: {} } : { name, file: {}, size: files.get(prefix + name).length, lastModifiedDateTime: "2026-11-03T10:00:00Z" })) });
    }
    if (op === "/content" && init.method === "PUT") { files.set(p, Buffer.from(init.body)); return Response.json({}, { status: 201 }); }
    if (op === "/content") return files.has(p) ? new Response(files.get(p)) : new Response("", { status: 404 });
    const isFolder = [...files.keys()].some((k) => k.startsWith(p + "/"));
    return files.has(p) || isFolder ? Response.json({}) : new Response("", { status: 404 });
  };
  return { files, calls, fetchImpl };
}

const SAMPLE = fileURLToPath(new URL("../../sample-data/media-plan/Media Plans", import.meta.url));
function copyInto(store) {
  const walk = async (rel) => {
    for (const n of readdirSync(path.join(SAMPLE, rel))) {
      if (n.startsWith(".")) continue;
      const r = rel ? `${rel}/${n}` : n;
      if (statSync(path.join(SAMPLE, r)).isDirectory()) await walk(r); else await store.write(r, readFileSync(path.join(SAMPLE, r)));
    }
  };
  return walk("");
}

test("a whole plan can be built, re-checked and saved in someone's OneDrive, through the same code as the demo folder", async () => {
  const g = fakeGraph();
  const store = new OneDriveStore("GOOD", { fetchImpl: g.fetchImpl });
  await copyInto(store);
  const svc = createService({ store, library: new SourceLibrary(store, "Shared data"), webLinks: false });
  const lib = await svc.library.load();
  assert.equal(lib.reports.length, 5);
  const r = await svc.startPlan({ client: "Bramble Bots" });
  assert.equal(r.plan.brief.facts.budget.value, 150000);
  assert.equal(r.link, null, "no public web link for a OneDrive plan");
  const fig = (await svc.audience({ band: "4-9", search: "Pip TV" })).rows[0];
  await svc.apply(r.plan.id, "add_audience_figure", { value_id: fig.id, for_band: "4-9" });
  const saved = [...g.files.keys()].filter((k) => k.includes(`Clients/Bramble Bots/Plans/${r.plan.id}/`));
  assert.ok(saved.some((k) => k.endsWith("v0002.json")));
  await svc.recordDecision({ type: "band_substitute", applies_to: "4-6", use: "4-9", agreed_by: "Jo" });
  assert.ok(g.files.has("Media Plans/Rules/decisions.xlsx"), "decision saved in their OneDrive");
  const open = await svc.open(r.plan.id);
  assert.equal(open.checkRun.results.find((c) => c.ruleId === "B4").status, "pass");
});

test("an expired Microsoft sign-in gives a clear message", async () => {
  const g = fakeGraph();
  const store = new OneDriveStore("EXPIRED", { fetchImpl: g.fetchImpl });
  await assert.rejects(store.list("Clients"), (e) => e instanceof StoreAuthError && /expired/.test(e.message));
});
