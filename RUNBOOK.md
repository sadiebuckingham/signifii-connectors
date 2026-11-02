# RUNBOOK: Media Plan Connector (demo)

**FICTIONAL DEMO DATA ONLY.** Little Lantern Media and Bramble Bots are invented.

Status: **build step 1 (spike) deployed.** Nothing beyond the spike has been built, as the brief says.

| | |
|---|---|
| GitHub | `sadiebuckingham/media-plan-connector` (private), branch `main`, auto-deploys on push |
| Render | Web service `media-plan-connector` (`srv-dbk6p03bc2fs73ej4usg`), Frankfurt, Starter plan, workspace "My Workspace" |
| URL | https://media-plan-connector.onrender.com (`/healthz` for a health check) |
| Secrets | `CONNECTOR_TOKEN`, `PLAN_LINK_TOKEN`, `ADMIN_PASSWORD` are set in Render → service → Environment. Never commit them |

Created through the Render API rather than the Blueprint, so `render.yaml` describes the same settings but isn't linked. To-do in the dashboard: set **Health Check Path** to `/healthz` (Settings).

---

## Hard rules (read first)

1. **No personal data about any child, ever.** Aggregated audience totals only, now and for real clients later. A file that looks like row-level personal data (names, emails, dates of birth, IDs) is refused at ingest.
2. **No real client data until real auth is in place.** The current shared token is fine for fictional data only. See "Auth".
3. **Claude never types a number into a plan.** Numbers come from source files or from code.

---

## What's in the repo (spike)

| Path | What it does |
|---|---|
| `src/server.mjs` | Express server: remote MCP over Streamable HTTP (stateless) at `/mcp`, web view at `/p/<token>`, `/healthz`, `/spike/reports` |
| `src/auth.mjs` | The auth seam. All "may this request use the connector?" logic lives here |
| `ui/template.js` | **The one plan template** (8 slides). Used by the MCP App and the web view, so they always match |
| `ui/plan.css` | House style (navy `#1B2A4A`, yellow `#F5B731`, off-white `#FAF7F0`, Nunito / Inter) |
| `ui/app.js` | The MCP App view: inline summary card, full plan in fullscreen, diagnostics |
| `build.mjs` | Bundles the view into one self-contained `dist/plan-app.html` (no CDN scripts) |
| `data/dummy-plan.json` | Hand-typed dummy plan for the spike. **Not sourced.** Deleted in step 3 |
| `test/` | Local test host (mimics an MCP Apps host with the official `AppBridge`) and a Playwright runner |
| `render.yaml` | Render Blueprint, Frankfurt |

Tools in the spike:
- `open_plan(brief_id)` opens the dummy plan (`bramble-bots-q4`) in the plan view.
- `spike_report_host` is hidden from the model (`visibility: ["app"]`). The view calls it to report how the host is displaying it. Reports are logged as `SPIKE_HOST_REPORT {...}` and listed at `/spike/reports` (admin password).

## Run locally

```bash
npm ci
```

```bash
npm run dev
```

Server on `http://localhost:3000`. With no `CONNECTOR_TOKEN` set and `NODE_ENV` not `production`, `/mcp` is open (local only).

Test the view in a headless MCP Apps host (needs the server running on 3311 and Playwright):

```bash
PORT=3311 npm start &
node test/build-host.mjs && node test/run-host.mjs http://localhost:3311 ./shots
```

## Environment variables

| Name | Purpose |
|---|---|
| `CONNECTOR_TOKEN` | Shared secret for the connector (demo auth). Required in production |
| `PLAN_LINK_TOKEN` | Unguessable token for the `/p/<token>` web link. Change it to switch the link off |
| `ADMIN_PASSWORD` | Admin pages (`/spike/reports` now; sources/rules admin later) |
| `PUBLIC_URL` | Public base URL, used to build the web link |
| `PORT` | Set by Render |

---

## Spike findings: how an MCP App displays in Claude

Sources: Claude's MCP Apps docs (design guidelines, getting started, troubleshooting, custom connectors, authentication), the MCP Apps SDK (`@modelcontextprotocol/ext-apps` 1.7.5) and a local test in a headless host built on the SDK's own `AppBridge`. Rows marked **to confirm** need the deployed connector opened in claude.ai on each surface; the view reports what it sees automatically (see "Confirming on real surfaces").

### Where it shows

| Question | Finding | Basis |
|---|---|---|
| Inline in the conversation? | **Yes.** It renders as a card under the tool call, full width of the chat column. Height auto-fits content; the host caps inline height and clips anything taller | Docs |
| Expandable? | **Yes, to fullscreen.** The app supplies its own "expand" button and calls `requestDisplayMode("fullscreen")`. Claude adds a close button in its header. The chat composer stays visible over fullscreen, so you can keep talking ("move 10% from TV to YouTube") while the plan is open | Docs; button and mode switch tested locally |
| Side panel? | **No.** Claude's modes are inline card, inline carousel and fullscreen. The SDK also defines `pip`, but Claude's docs don't list it for Claude. The view asks for it and reports whether the host grants it | Docs; **to confirm** |
| Needs a permission click? | Yes, first time: Claude asks to display the app; **Always allow** stops the prompt | Docs |
| Web vs desktop vs mobile | Same app on all three. Web and desktop: sandboxed iframe. iOS/Android: native WebView. **The connector must be added on web or desktop first**; it then appears on mobile. Mobile has no camera/mic/location (not needed). On mobile, vertical swipes inside an inline app scroll the chat, not the app | Docs; **to confirm** on each |
| Theme | Host passes light/dark theme and its style variables. Plan slides keep the agency's brand colours in both themes (they are the client document); the chrome around them uses Claude's tokens | Built that way |
| Fonts | Nunito and Inter load from Google Fonts, allowed via the resource's CSP (`resourceDomains`). All other external origins are blocked by default | Docs; **to confirm** fonts actually load in Claude (the view reports `fonts.nunito` / `fonts.inter`) |
| Size limits | Tool results over ~150,000 characters get written to a file instead of reaching the app, and the app never fills. Keep plan payloads lean (the dummy plan is ~4 KB) | Docs |
| Caching of the view | Hosts can cache the `ui://` resource. The URI carries a version (`plan-v1.html`); bump it when the HTML changes | Precaution |

### What this means for the design (proposed, before step 3)

- **Inline = summary card** (client, campaign, budget, window, status, "Open full plan"). Claude's guidance is that inline cards stay small (about 4–5 data points, at most 2 actions).
- **Fullscreen = the full 8-slide plan.** This is where planners will work and where the composer sits alongside. In fullscreen the app must scroll internally (today the 8 slides stack to ~5,100 px). Next step: slide navigation (tabs 1–8) so a slide fits the screen, which also matches how PowerPoint shows it.
- No menus, popovers or pie charts. Source markers show on hover (desktop) and tap (touch).
- The web view `/p/<token>` uses the same `renderPlan()` and CSS. Confirmed visually against the in-app fullscreen view in the local test.

### Confirming on real surfaces

After deploying, open the plan once on each surface. Every time the view loads or changes mode it reports `platform`, `displayMode`, `availableDisplayModes`, container size, safe-area insets, theme, fonts loaded and the result of any mode request. Read them at:

```bash
curl -u admin:$ADMIN_PASSWORD https://<service>.onrender.com/spike/reports
```

or search the Render logs for `SPIKE_HOST_REPORT`. Then fill this table:

| Surface | Renders inline? | Fullscreen works? | `availableDisplayModes` | Fonts load? | Notes |
|---|---|---|---|---|---|
| claude.ai web (Chrome) | | | | | |
| Claude Desktop (Mac/Win) | | | | | |
| Claude iOS | | | | | |
| Claude Android | | | | | |

The "Show diagnostics" button on the card shows the same data on screen.

---

## Auth

**Now (demo, fictional data only):** one shared secret, `CONNECTOR_TOKEN`, accepted two ways:

1. `Authorization: Bearer <token>` header. In claude.ai this is set under the custom connector's **Request headers**. **Caveat:** Claude's docs say request-header auth is **beta and only available to some organisations**. If the dialog has no "Request headers" section, use option 2.
2. Secret in the URL path: add the connector as `https://<service>.onrender.com/mcp/<token>`, with **No sign-in**. Works on every plan. The URL itself is the secret, so treat it like a password. (Claude's docs advise against tokens in query strings; a path segment has the same logging risk, which is acceptable for fictional data only.)

A wrong path token gets a 404; a missing/wrong header gets a 401.

**Before any real client data (first job):** replace with OAuth 2.1. Claude supports Dynamic Client Registration and Client ID Metadata Documents for custom connectors. The server needs to return `401` with `WWW-Authenticate: Bearer resource_metadata="…"`, serve protected resource metadata, and accept the redirect URI `https://claude.ai/api/mcp/auth_callback`. All of that plugs into `src/auth.mjs`. Flag for the AI engineer conversation: which identity provider (e.g. Microsoft Entra, since the agency is on SharePoint).

Admin: HTTP Basic with `ADMIN_PASSWORD` (any username).

## Deploy (Render, Frankfurt)

1. Push the repo to GitHub.
2. Render → New → Blueprint → pick the repo. `render.yaml` creates the web service in Frankfurt and generates `CONNECTOR_TOKEN` and `PLAN_LINK_TOKEN`.
3. Set `ADMIN_PASSWORD` and `PUBLIC_URL` in the service's environment.
4. Check `https://<service>.onrender.com/healthz` returns `{"ok":true}`.
5. In claude.ai: **Customize → Connectors → Add custom connector**, URL `https://<service>.onrender.com/mcp/<CONNECTOR_TOKEN>`, no sign-in. Start a chat, turn the connector on, and say *"open a media plan for the Bramble Bots Q4 brief"*.

Postgres and Sentry (server and browser) arrive in build step 2.

## Rollback

Render → the service → **Events** → pick the last good deploy → **Rollback**. Or revert the commit and push. To cut off access fast: change `CONNECTOR_TOKEN` (connector stops working) and/or `PLAN_LINK_TOKEN` (web link stops working), then redeploy.

## Not done yet (build order)

2. Source library and parsing (general reader, reading reports, Postgres, Sentry)
3. Plan engine, template and checks (replace dummy plan)
4. Full MCP tool set and App
5. Web view sign-off and PPTX/PDF export
