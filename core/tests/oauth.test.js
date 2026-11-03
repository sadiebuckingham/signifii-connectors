import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { microsoftOAuth, sealer } from "../auth/oauth.js";

// A pretend Microsoft token endpoint.
const fakeMs = async (url, init) => {
  const p = new URLSearchParams(init.body);
  if (!String(url).endsWith("/token")) throw new Error("unexpected " + url);
  const idt = "x." + Buffer.from(JSON.stringify({ name: "Jo Planner", preferred_username: "jo@example.com" })).toString("base64url") + ".y";
  if (p.get("grant_type") === "authorization_code" && p.get("code") === "ms-code") return new Response(JSON.stringify({ access_token: "MS-AT-1", refresh_token: "MS-RT-1", expires_in: 3600, id_token: idt }), { status: 200 });
  if (p.get("grant_type") === "refresh_token" && p.get("refresh_token") === "MS-RT-1") return new Response(JSON.stringify({ access_token: "MS-AT-2", refresh_token: "MS-RT-2", expires_in: 3600 }), { status: 200 });
  return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
};

async function start() {
  const app = express();
  let base;
  const oauth = microsoftOAuth({ publicUrl: "http://pub.example", secret: "s3cret", clientId: "ms-client", clientSecret: "ms-secret", fetchImpl: fakeMs });
  app.use(oauth.router);
  app.post("/mcp/x", oauth.protect("/mcp/x"), (req, res) => res.json({ ok: true, at: req.auth.msAccessToken, user: req.auth.user }));
  const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${srv.address().port}`;
  return { base, close: () => srv.close() };
}

test("full sign-in: discovery, registration, PKCE, Microsoft, token, protected call, refresh", async () => {
  const { base, close } = await start();
  try {
    let r = await fetch(`${base}/mcp/x`, { method: "POST" });
    assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate"), /resource_metadata="http:\/\/pub\.example\/\.well-known\/oauth-protected-resource\/mcp\/x"/);
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp/x`)).json();
    assert.equal(prm.resource, "http://pub.example/mcp/x");
    const asm = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    assert.deepEqual(asm.code_challenge_methods_supported, ["S256"]);
    const reg = await (await fetch(`${base}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }) })).json();
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const auth = new URL(`${base}/oauth/authorize`);
    Object.entries({ client_id: reg.client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", response_type: "code", state: "claude-state", code_challenge: challenge, code_challenge_method: "S256" }).forEach(([k, v]) => auth.searchParams.set(k, v));
    r = await fetch(auth, { redirect: "manual" });
    const toMs = new URL(r.headers.get("location"));
    assert.equal(toMs.host, "login.microsoftonline.com");
    assert.equal(toMs.searchParams.get("redirect_uri"), "http://pub.example/auth/microsoft/callback");
    // Microsoft sends the person back to us
    r = await fetch(`${base}/auth/microsoft/callback?code=ms-code&state=${encodeURIComponent(toMs.searchParams.get("state"))}`, { redirect: "manual" });
    const toClaude = new URL(r.headers.get("location"));
    assert.equal(toClaude.origin + toClaude.pathname, "https://claude.ai/api/mcp/auth_callback");
    assert.equal(toClaude.searchParams.get("state"), "claude-state");
    const code = toClaude.searchParams.get("code");
    const tok = (body) => fetch(`${base}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
    r = await tok({ grant_type: "authorization_code", code, code_verifier: "wrong", redirect_uri: "https://claude.ai/api/mcp/auth_callback" });
    assert.equal(r.status, 400); assert.equal((await r.json()).error, "invalid_grant");
    const t = await (await tok({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: "https://claude.ai/api/mcp/auth_callback", client_id: reg.client_id })).json();
    assert.ok(t.access_token && t.refresh_token);
    assert.ok(!t.access_token.includes("MS-AT-1"), "Microsoft's token is sealed, not visible");
    r = await fetch(`${base}/mcp/x`, { method: "POST", headers: { Authorization: `Bearer ${t.access_token}` } });
    assert.deepEqual(await r.json(), { ok: true, at: "MS-AT-1", user: { name: "Jo Planner", email: "jo@example.com" } });
    const t2 = await (await tok({ grant_type: "refresh_token", refresh_token: t.refresh_token })).json();
    r = await fetch(`${base}/mcp/x`, { method: "POST", headers: { Authorization: `Bearer ${t2.access_token}` } });
    assert.equal((await r.json()).at, "MS-AT-2");
    // a tampered token is refused
    const bad = t.access_token.slice(0, -4) + "AAAA";
    assert.equal((await fetch(`${base}/mcp/x`, { method: "POST", headers: { Authorization: `Bearer ${bad}` } })).status, 401);
  } finally { close(); }
});

test("registration refuses unsafe return addresses; sealed values expire and can't be reused for another purpose", async () => {
  const { base, close } = await start();
  try {
    const r = await fetch(`${base}/oauth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: ["http://evil.example/cb"] }) });
    assert.equal(r.status, 400);
  } finally { close(); }
  const s = sealer("k");
  const v = s.seal({ a: 1 }, "access", 60);
  assert.equal(s.open(v, "refresh"), null);
  assert.equal(s.open(s.seal({ a: 1 }, "access", -1), "access"), null);
  assert.equal(sealer("other").open(v, "access"), null);
});
