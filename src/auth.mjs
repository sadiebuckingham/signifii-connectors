// Auth seam. Everything that decides "may this request use the connector?"
// lives here, so swapping the demo token for OAuth later touches one file.
//
// DEMO ONLY: a single shared secret (CONNECTOR_TOKEN), accepted either as
//   Authorization: Bearer <token>   (claude.ai "Request headers", beta for some orgs)
// or as a secret path segment
//   /mcp/<token>                     (works on every plan; the URL is the secret)
// Before any real client data: replace with OAuth (see RUNBOOK, "Auth").
import crypto from "node:crypto";

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkConnectorAuth(req, res, next, pathToken) {
  const expected = process.env.CONNECTOR_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") return res.status(503).json({ error: "CONNECTOR_TOKEN not set" });
    return next(); // local dev only
  }
  const header = req.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (safeEqual(bearer, expected) || safeEqual(pathToken, expected)) return next();
  // Future OAuth seam: return 401 + WWW-Authenticate: Bearer resource_metadata="..."
  return res.status(pathToken ? 404 : 401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorised" }, id: null });
}

export function checkAdmin(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  const header = req.get("authorization") || "";
  const given = header.startsWith("Basic ") ? Buffer.from(header.slice(6), "base64").toString().split(":").slice(1).join(":") : null;
  if (pw && safeEqual(given, pw)) return next();
  res.set("WWW-Authenticate", 'Basic realm="admin"').status(401).send("Admin password required");
}
