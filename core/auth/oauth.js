// Sign-in for connectors, using Microsoft accounts. Claude talks standard MCP
// OAuth to us (discovery, dynamic client registration, PKCE); we pass the person
// through to Microsoft to sign in, then give Claude our own token.
//
// Stateless: nothing about anyone's sign-in is stored on our side. Codes and
// tokens are sealed (AES-256-GCM, key from OAUTH_SECRET) and carry the Microsoft
// tokens inside them, so only the holder (Claude, for that person) has them.
import crypto from "node:crypto";
import express from "express";

const B64 = (b) => Buffer.from(b).toString("base64url");
const keyOf = (secret) => crypto.createHash("sha256").update(String(secret)).digest();

export function sealer(secret) {
  const key = keyOf(secret);
  return {
    seal(obj, purpose, ttlSeconds) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([c.update(JSON.stringify({ ...obj, p: purpose, exp: Math.floor(Date.now() / 1000) + ttlSeconds }), "utf8"), c.final()]);
      return B64(Buffer.concat([iv, c.getAuthTag(), body]));
    },
    open(token, purpose) {
      try {
        const raw = Buffer.from(String(token), "base64url");
        const d = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
        d.setAuthTag(raw.subarray(12, 28));
        const obj = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"));
        if (obj.p !== purpose || obj.exp < Math.floor(Date.now() / 1000)) return null;
        return obj;
      } catch { return null; }
    },
  };
}

const MS = (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
const MS_SCOPES = "offline_access openid profile email User.Read Files.ReadWrite";
const okRedirect = (u) => { try { const x = new URL(u); return x.protocol === "https:" || (x.protocol === "http:" && ["localhost", "127.0.0.1"].includes(x.hostname)); } catch { return false; } };
const userFromIdToken = (idt) => { try { const p = JSON.parse(Buffer.from(String(idt).split(".")[1], "base64url").toString("utf8")); return { name: p.name || null, email: p.preferred_username || p.email || null }; } catch { return { name: null, email: null }; } };

/**
 * @param {object} o
 * @param {string} o.publicUrl        e.g. https://signifii-demos.onrender.com
 * @param {string} o.secret           OAUTH_SECRET
 * @param {string} o.clientId         MS_CLIENT_ID
 * @param {string} o.clientSecret     MS_CLIENT_SECRET
 * @param {string} [o.tenant]         "common" (any work, school or personal account)
 * @param {typeof fetch} [o.fetchImpl]
 */
export function microsoftOAuth({ publicUrl, secret, clientId, clientSecret, tenant = "common", fetchImpl = fetch }) {
  const s = sealer(secret);
  const callback = `${publicUrl}/auth/microsoft/callback`;
  const router = express.Router();
  const form = express.urlencoded({ extended: false });
  const json = express.json();
  const oauthError = (res, code, error, description) => res.status(code).json({ error, error_description: description });

  async function msToken(params) {
    const r = await fetchImpl(`${MS(tenant)}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: MS_SCOPES, ...params }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.access_token) throw Object.assign(new Error(body.error_description || body.error || `Microsoft token request failed (${r.status})`), { msError: body.error || "invalid_grant" });
    return body;
  }
  function issue(ms, user) {
    const ttl = Math.max(60, Number(ms.expires_in || 3600) - 120);
    return {
      access_token: s.seal({ at: ms.access_token, user }, "access", ttl),
      refresh_token: s.seal({ rt: ms.refresh_token, user }, "refresh", 90 * 24 * 3600),
      token_type: "Bearer", expires_in: ttl, scope: "files",
    };
  }

  router.get("/.well-known/oauth-authorization-server", (_req, res) => res.json({
    issuer: publicUrl,
    authorization_endpoint: `${publicUrl}/oauth/authorize`,
    token_endpoint: `${publicUrl}/oauth/token`,
    registration_endpoint: `${publicUrl}/oauth/register`,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["files"],
  }));

  // Dynamic client registration: the client's details are sealed into its client_id (nothing stored).
  router.post("/oauth/register", json, (req, res) => {
    const uris = req.body?.redirect_uris;
    if (!Array.isArray(uris) || !uris.length || !uris.every(okRedirect)) return oauthError(res, 400, "invalid_redirect_uri", "redirect_uris must be https (or http on localhost).");
    const client_id = s.seal({ r: uris }, "client", 10 * 365 * 24 * 3600);
    res.status(201).json({ client_id, client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: uris, client_name: req.body.client_name || null,
      token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
  });

  router.get("/oauth/authorize", (req, res) => {
    const q = req.query;
    const client = s.open(q.client_id, "client");
    if (!client) return res.status(400).type("text").send("Unknown client. Remove the connector in Claude and add it again.");
    if (!client.r.includes(q.redirect_uri)) return res.status(400).type("text").send("That return address isn't registered for this client.");
    const back = (params) => { const u = new URL(q.redirect_uri); for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v); return res.redirect(u.toString()); };
    if (q.response_type !== "code") return back({ error: "unsupported_response_type", state: q.state });
    if (!q.code_challenge || q.code_challenge_method !== "S256") return back({ error: "invalid_request", error_description: "PKCE (S256) is required.", state: q.state });
    const state = s.seal({ ru: q.redirect_uri, st: q.state ?? null, cc: q.code_challenge, ci: q.client_id }, "authz", 15 * 60);
    const ms = new URL(`${MS(tenant)}/authorize`);
    for (const [k, v] of Object.entries({ client_id: clientId, response_type: "code", redirect_uri: callback, response_mode: "query", scope: MS_SCOPES, state, prompt: "select_account" })) ms.searchParams.set(k, v);
    res.redirect(ms.toString());
  });

  router.get("/auth/microsoft/callback", async (req, res) => {
    const st = s.open(req.query.state, "authz");
    if (!st) return res.status(400).type("text").send("This sign-in link has expired. Go back to Claude and try connecting again.");
    const back = (params) => { const u = new URL(st.ru); for (const [k, v] of Object.entries({ ...params, state: st.st })) if (v != null) u.searchParams.set(k, v); return res.redirect(u.toString()); };
    if (req.query.error) return back({ error: "access_denied", error_description: String(req.query.error_description || req.query.error).slice(0, 300) });
    try {
      const ms = await msToken({ grant_type: "authorization_code", code: String(req.query.code), redirect_uri: callback });
      const code = s.seal({ ms: { access_token: ms.access_token, refresh_token: ms.refresh_token, expires_in: ms.expires_in }, user: userFromIdToken(ms.id_token), cc: st.cc, ci: st.ci, ru: st.ru }, "code", 5 * 60);
      back({ code });
    } catch (e) { back({ error: "server_error", error_description: e.message.slice(0, 300) }); }
  });

  router.post("/oauth/token", form, json, async (req, res) => {
    const b = req.body || {};
    if (b.grant_type === "authorization_code") {
      const c = s.open(b.code, "code");
      if (!c) return oauthError(res, 400, "invalid_grant", "The code is invalid or has expired.");
      if (b.client_id && b.client_id !== c.ci) return oauthError(res, 400, "invalid_grant", "The code was issued to a different client.");
      if (b.redirect_uri && b.redirect_uri !== c.ru) return oauthError(res, 400, "invalid_grant", "redirect_uri doesn't match.");
      const challenge = crypto.createHash("sha256").update(String(b.code_verifier || "")).digest("base64url");
      if (challenge !== c.cc) return oauthError(res, 400, "invalid_grant", "PKCE check failed.");
      return res.json(issue(c.ms, c.user));
    }
    if (b.grant_type === "refresh_token") {
      const r = s.open(b.refresh_token, "refresh");
      if (!r) return oauthError(res, 400, "invalid_grant", "The refresh token is invalid or has expired. Sign in again.");
      try { const ms = await msToken({ grant_type: "refresh_token", refresh_token: r.rt }); return res.json(issue({ ...ms, refresh_token: ms.refresh_token || r.rt }, r.user)); }
      catch { return oauthError(res, 400, "invalid_grant", "Microsoft didn't accept the refresh. Sign in again."); }
    }
    return oauthError(res, 400, "unsupported_grant_type", "Use authorization_code or refresh_token.");
  });

  // Protect a resource path: no valid token -> 401 pointing Claude at the sign-in metadata.
  function protect(resourcePath) {
    const metaPath = `/.well-known/oauth-protected-resource${resourcePath}`;
    router.get([metaPath, "/.well-known/oauth-protected-resource"], (_req, res) => res.json({
      resource: `${publicUrl}${resourcePath}`, authorization_servers: [publicUrl], scopes_supported: ["files"], bearer_methods_supported: ["header"],
    }));
    return (req, res, next) => {
      const h = req.get("authorization") || "";
      const t = h.startsWith("Bearer ") ? s.open(h.slice(7), "access") : null;
      if (!t) {
        res.set("WWW-Authenticate", `Bearer resource_metadata="${publicUrl}${metaPath}"`);
        return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Sign in with Microsoft to use your OneDrive." }, id: null });
      }
      req.auth = { msAccessToken: t.at, user: t.user || {} };
      next();
    };
  }

  return { router, protect, callback };
}
