// Auth seam. Everything that decides "may this request use the connector?"
// lives here, so swapping the demo token for OAuth later touches one file.
//
// DEMO: secret links (CONNECTOR_TOKEN and one per prospect in PROSPECT_LINKS), each accepted either as
//   Authorization: Bearer <token>   (claude.ai "Request headers", beta for some orgs)
// or as a secret path segment
//   /mcp/<token>                     (works on every plan; the URL is the secret)
// Before any real client data: replace with OAuth (see RUNBOOK, "Auth").
import crypto from "node:crypto";

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Every link that may use the connector: Sadie's own (CONNECTOR_TOKEN) plus one per
// prospect (PROSPECT_LINKS, JSON {"Name": "token"}), so each can be seen and switched off.
export function connectorLinks() {
  const links = [];
  if (process.env.CONNECTOR_TOKEN) links.push({ name: "Signifii (Sadie)", token: process.env.CONNECTOR_TOKEN });
  try { for (const [name, token] of Object.entries(JSON.parse(process.env.PROSPECT_LINKS || "{}"))) if (token) links.push({ name, token: String(token) }); }
  catch { console.error("PROSPECT_LINKS isn't valid JSON; prospect links are off"); }
  return links;
}
export const linkUse = new Map(); // name -> { lastUsed, calls } (in memory only; no content)

export function checkConnectorAuth(req, res, next, pathToken) {
  const links = connectorLinks();
  if (!links.length) {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "CONNECTOR_TOKEN not set" });
    return next(); // local dev only
  }
  const header = req.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const hit = links.find((l) => safeEqual(bearer, l.token) || safeEqual(pathToken, l.token));
  if (hit) {
    req.linkName = hit.name;
    const u = linkUse.get(hit.name) || { calls: 0 };
    linkUse.set(hit.name, { lastUsed: new Date().toISOString(), calls: u.calls + 1 });
    return next();
  }
  return res.status(pathToken ? 404 : 401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorised" }, id: null });
}

export function checkAdmin(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  const header = req.get("authorization") || "";
  const given = header.startsWith("Basic ") ? Buffer.from(header.slice(6), "base64").toString().split(":").slice(1).join(":") : null;
  if (pw && safeEqual(given, pw)) return next();
  res.set("WWW-Authenticate", 'Basic realm="admin"').status(401).send("Admin password required");
}
