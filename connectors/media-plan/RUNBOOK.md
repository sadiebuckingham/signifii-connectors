# RUNBOOK: Media Plan connector (demo)

**FICTIONAL DEMO DATA ONLY.** Little Lantern Media and Bramble Bots are invented.

Target: a demo sent to an external person on **Friday 6 Nov 2026**, added to their own Claude. Plan for the week: `docs/media-plan-demo-week-plan.md`. Where everything lives: `docs/WHERE-THINGS-LIVE.md`.

## Hard rules

1. **No personal data about any child, ever.** Audience totals only. A file that looks like row-level personal data (names, emails, dates of birth, IDs) is refused at ingest and nothing from it is stored.
2. **Real client files are read on demand and never copied** to our side.
3. **Claude never types a number into a plan.** Numbers come from source files or are calculated in code.
4. **Checks never say "pass" unless they actually ran.** Otherwise: *not run yet*, *not checked* (unknown rule) or *off*.
5. **No real client data until real sign-in is in place** (Microsoft sign-in, Thursday).

## Status (Mon 2 Nov, end of day)

| Piece | State |
|---|---|
| Spike: plan shown in Claude (inline card + fullscreen) | Done, tested on claude.ai web |
| Shared core + `connectors/media-plan` layout | Done |
| Source reader + reading reports (the five files) | Done, 29 tests |
| Checks engine + the ten rule types, rules from `rules.xlsx` | Done; the spike plan's checks now run for real |
| Plan engine (brief reading, allocation, audience with 4–6 refusal, compare, versions) | Done Tue; plans are kept on the server's disk, so they're lost on redeploy until Postgres (Wednesday) |
| Save/open plans in client folder, Postgres folders, reset demo | Wednesday |
| Microsoft sign-in + OneDrive, swap test | Thursday |
| PDF via print-to-PDF from web link, final test | Friday |

## How it fits together

| Path | What it does |
|---|---|
| `server.js` | Entry point. `CONNECTOR=media-plan` picks which connectors run |
| `core/mcp/server.js` | Shared server: each connector at `/mcp/<name>`, its view as a `ui://` resource, its web routes |
| `core/mcp/app-shell/` | The in-Claude view shell (theme, inline card, fullscreen, diagnostics) |
| `core/sources/` | General file reader: `grid.js` (xlsx/csv → cells), `tables.js` (find tables, label values), `values.js` (numbers, %, ranges, placeholders, dates), `audience.js` (age bands, gender, non-age audiences), `reader.js` (one file → values + reading report), `library.js` (a folder of files), `report-html.js` (report page) |
| `core/checks/` | `engine.js` (run rules; statuses), `rules-sheet.js` (read `rules.xlsx` with fixed columns) |
| `core/storage/fs-store.js` | Folder store (disk). Postgres and OneDrive stores plug in behind the same interface |
| `core/auth/index.js` | Auth seam (shared token now; Microsoft sign-in Thursday) |
| `connectors/media-plan/index.js` | Tools and routes for this connector (wiring only) |
| `connectors/media-plan/rules.js` | The ten rule types |
| `connectors/media-plan/config.js` | Folder names, canonical age bands, categories, text limits |
| `connectors/media-plan/template/` | The fixed 8-slide plan template + house style |
| `sample-data/media-plan/Media Plans/` | Demo folders: `Shared data/`, `Rules/rules.xlsx`, `Clients/Bramble Bots/{Briefs,Plans}` |

### Tools in Claude
Shown as the plan view (card in chat, full plan fullscreen): `start_plan(client)`, `open_plan(plan or client)`, `set_allocation`, `move_budget`.
Plain tools: `record_decision`, `list_decisions`, `list_clients`, `list_sources`, `get_rates`, `get_audience(band)`, `add_channel`, `remove_channel`, `set_line_audiences`, `set_flighting`, `add_audience_figure`, `remove_audience_figure`, `set_target_bands`, `set_brief_detail`, `write_section`, `compare_options`, `check_plan`, `tick_warning`, `plan_versions`, `restore_version`, `get_plan_link`.

Claude passes references only: channel names, rate and figure IDs, and the planner's own amounts or percentages. The engine (`connectors/media-plan/engine.js`) does the sums in whole pence, calculates shares and delivery from the rate card, refuses weeks outside the campaign window, refuses to split age bands, and checks written text (length, figures not in the plan, placeholders, claims about what children think or feel). Every change is saved as a version with a note, and the checks rerun.

### Web pages
- `/p/<plan link token>` – read-only plan, one unguessable link per plan (`get_plan_link`).
- `/admin/media-plan/sources` – reading reports (admin password; add `?reread=1` to re-read the folder).
- `/admin/host-reports` – how Claude displayed the view on each device (admin password).
- `/admin/media-plan/reset` – reset the demo: deletes all plans and decisions and restores the sample files (admin password).

### Where things are saved
Everything is saved in the client's folder, never on our side: plans in `Clients/<client>/Plans/<plan id>/` (a version file per change plus a readable copy), agreed decisions in `Rules/decisions.xlsx`. For the demo the "client folder" is a working copy on the server, wiped on every deploy. Every time a plan is shown, each figure is re-read from its source file; changes are flagged, missing sources fail check B4.

## The reader: rules it follows

General rules only, nothing per file. Finds the header row (not assuming row 1); combines merged group labels with the column names under them; carries label rows like "Wk 43" down; skips total rows (reported); keeps footnotes, cell comments and notes with the values they apply to; reads transposed tables; reads hidden rows/columns and marks them hidden; numbers stored as text, `48.2k`, `£1,150`, `5,38`, `0.41` in a rate column, durations; ranges stay ranges; `n/a`, `TBC`, `POA`, `--`, `<1` are *no value*, never zero; UK/US date order decided from the file's other dates, otherwise flagged. Age bands are read as written; audiences like parents, accounts or shoppers are kept separate and never mapped onto child bands.

## Rules sheet (`Media Plans/Rules/rules.xlsx`)

Columns: **Rule ID · Rule type · Description · Applies to · Limit · Severity · On · Notes**. The *Rule type* cell must be one of the ten fixed types (dropdown in the sheet; the number alone, e.g. `4`, also works). Anything else shows *not checked*. Limits: `50%`; `min 10%` / `max 30%` / `10%-30%`; `last 2 weeks` / `first 3 weeks` / `weeks 4-6` / w/c dates; allowed list comma-separated.

## Run locally

```bash
npm ci
```

```bash
npm test
```

```bash
npm run dev
```

Server on `http://localhost:3000`. Without `CONNECTOR_TOKEN` (and not in production) `/mcp/media-plan` is open, for local use only. To see the view in a headless MCP Apps host: start the server on port 3322, then `node core/mcp/test-host/build-host.mjs && node core/mcp/test-host/run-host.mjs http://localhost:3322 ./shots`.

## Environment variables (Render → service → Environment)

| Name | Purpose |
|---|---|
| `CONNECTOR` | Which connectors run (`media-plan`) |
| `CONNECTOR_TOKEN` | Shared secret for the connector link (demo auth) |
| `PLAN_LINK_TOKEN` | Token in the web plan link. Change it to switch the link off |
| `ADMIN_PASSWORD` | Admin pages (any username) |
| `PUBLIC_URL` | Public base URL |
| `MEDIA_PLANS_ROOT` | Optional: another "Media Plans" folder on disk |
| `OAUTH_SECRET` | Key that seals sign-in tokens (set; changing it signs everyone out) |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Microsoft app registration (switches on the OneDrive address) |
| `DATA_DIR` | Where the demo client folder's working copy lives (default `.data`) |

## Auth

Now (fictional data only): one shared secret. Add the connector in Claude as `https://signifii-demos.onrender.com/mcp/media-plan/<CONNECTOR_TOKEN>` with no sign-in (works on every plan), or as `…/mcp/media-plan` with header `Authorization: Bearer <token>` where the organisation has request headers (beta). Wrong path token → 404; missing/wrong header → 401.

OneDrive (built 3 Nov): `/mcp/media-plan-onedrive` asks for Microsoft sign-in (standard MCP OAuth: discovery, dynamic registration, PKCE; stateless, nothing stored) and then uses the person's own OneDrive `Media Plans` folder. The demo address keeps working with no login. Code: `core/auth/oauth.js`, `core/storage/onedrive-store.js`. App registration under `sadie@signifii.com` (Microsoft 365), walked through on Tuesday once the sign-in return address exists.

## Deploy and roll back

Push to `main` → Render auto-deploys `signifii-demos`. Roll back: Render → `signifii-demos` → Events → pick the last good deploy → Rollback (or revert the commit and push). Cut access fast: change `CONNECTOR_TOKEN` and/or `PLAN_LINK_TOKEN`; the service restarts with the new values.

## Costs (Render, monthly, approximate)

| Item | Plan | Cost |
|---|---|---|
| `signifii-demos` web service | Starter | ~$7 |
| `signifii-demos-db` Postgres | not used, to delete | ~$6–7 until deleted |
| Old `media-plan-connector` service | Starter | ~$7 until deleted |

## Spike findings (claude.ai web, 2 Nov)

The view renders as an inline card (734 px wide on Sadie's screen, max height 5,000 px); Claude offers **inline and fullscreen only** (no side panel, no pip); the host supplies its own fonts and 76 style variables; it opened in dark theme with 12 px safe-area insets. Not yet confirmed: desktop app, iOS, Android, fullscreen on mobile, and whether our brand fonts load (the first check ran before they'd finished loading). The view keeps reporting this to `/admin/host-reports`.
