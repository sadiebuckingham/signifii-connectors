import { test } from "node:test";
import assert from "node:assert/strict";

test("the OneDrive address asks for sign-in even when the older /mcp/<token> address exists", async () => {
  Object.assign(process.env, { PUBLIC_URL: "https://pub.example", MS_CLIENT_ID: "x", MS_CLIENT_SECRET: "y", OAUTH_SECRET: "z", CONNECTOR_TOKEN: "tok", NODE_ENV: "test" });
  const { createApp } = await import("../mcp/server.js");
  const conn = (await import("../../connectors/media-plan/index.js")).default;
  const { app } = createApp([conn]);
  const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await fetch(`${base}/mcp/media-plan-onedrive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate"), /oauth-protected-resource\/mcp\/media-plan-onedrive/);
    const h = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    assert.equal((await fetch(`${base}/mcp/media-plan/tok`, { method: "POST", headers: h, body })).status, 200);
    assert.equal((await fetch(`${base}/mcp/media-plan/wrong`, { method: "POST", headers: h, body })).status, 404);
  } finally { srv.close(); }
});
