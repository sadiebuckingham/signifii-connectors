# Changelog

## Wed 4 Nov 2026 (started Tue)

**Decided (Sadie, 3 Nov):** everything is saved in the client's own folder. Signifii handles data but doesn't hold it. No database.

**Changed**
- Plans are saved as files in `Clients/<client>/Plans/<plan id>/`: one file per version (with a note of what changed) and a readable copy of the plan as a web page. The demo uses a working copy of the sample folder; OneDrive uses the same code from Thursday.
- Re-check against the folder: every time a plan is shown, each figure and rate is re-read from its file. If the file has changed, the plan uses the file's current value and flags it ("999 (was 203)", needs a tick); if the cell or file has gone, it shows "Source missing" and the new built-in check B4 fails.
- Agreed decisions are saved as rules in `Rules/decisions.xlsx` (who agreed, when, why), next to `rules.xlsx`. Two types: use a named wider age band when the exact one isn't reported (always labelled as itself; never narrower or overlapping), and treat a source's audience label as one of the agency's audiences. Applied automatically in every plan until someone switches them off in the sheet. New tools: `record_decision`, `list_decisions`.
- The brief's own objective is shown, and passed to Claude, until the short version is written.
- Source data is held in memory for at most 2 minutes, then read from the folder again.
- Reset demo: `/admin/media-plan/reset` (admin password) puts the demo folder back to the original sample files.
- Web link: **Print or save as PDF** (one slide per A4 landscape page, a DRAFT watermark until signed off) and **Planning Director sign-off** (admin password). Sign-off is only possible when no check fails, nothing is "not run" and every warning is ticked. Any later change to the plan clears the sign-off and makes it a draft again.
- Slides grow to fit their content instead of clipping it.
- 54 tests, including a complete plan that passes every check, is signed off, then changes back to draft.

- **Microsoft sign-in and OneDrive (Thursday's work, done early).** A second connector address, `/mcp/media-plan-onedrive`, asks for Microsoft sign-in and then uses the person's own OneDrive `Media Plans` folder, with exactly the same code as the demo folder. The sign-in service follows Claude's standard (discovery, automatic registration, PKCE) and stores nothing: each person's Microsoft keys travel sealed inside the token only Claude holds. OneDrive plans have no public web link (we can't and don't serve them); a readable copy is saved next to the plan in OneDrive. `set_up_demo_folder` copies the fictional sample files into a new OneDrive folder for testing. Switched on once `MS_CLIENT_ID` and `MS_CLIENT_SECRET` are in Render (`OAUTH_SECRET` is set).
- 59 tests (sign-in tested against a pretend Microsoft; a full plan built and saved in a pretend OneDrive).

- Ready to send to prospects: renamed **Signifii Media Planner (demo)**, with a short data note built in (fictional demo data; use files without personal data on OneDrive; nothing kept). **One link per prospect** (`PROSPECT_LINKS`), each switchable off, with last-used shown at `/admin/links`.
- The server logs at start-up whether Microsoft sign-in is on, and which setting is missing.
- Microsoft sign-in confirmed working (app "Signifii" in the signifii.com directory, multitenant + personal accounts). The signifii.com account itself has no OneDrive licence, so OneDrive testing uses a personal account.
- 60 tests.

**Fixed (3 Nov):** own address `https://demos.signifii.com` (Squarespace DNS → Render), `PUBLIC_URL` switched. Chrome had flagged `signifii-demos.onrender.com` as a "Dangerous site" (likely because it sends people to a Microsoft sign-in from a shared hosting address). Fix: own domain (e.g. `demos.signifii.com`) on Render, then update `PUBLIC_URL` and add the new return address in the Microsoft app.

**To do after the trial:** replace the Microsoft client secret (Entra → Signifii → Certificates & secrets → new secret, update `MS_CLIENT_SECRET` in Render, delete the old one): the current one was shared in a chat on 3 Nov.

**To delete (Sadie):** Render Postgres `signifii-demos-db` (not used) and the old `media-plan-connector` service.

## Tue 3 Nov 2026 (started Mon evening)

**Changed**
- Plan engine. A plan starts from the client's brief: budget, campaign window, approval date, client, campaign, objective, audience and contact are read from the PDF by pattern, each with page and line. Anything unclear is asked for, never guessed.
- New shared document reader (PDF, Word, PowerPoint) and pattern extractors in `core/sources`.
- Fictional brief added: `Clients/Bramble Bots/Briefs/Bramble Bots - Q4 Christmas 2026 media brief.pdf`.
- Tools to build a plan in Claude (see RUNBOOK). Money in whole pence; shares and delivery calculated; "move 10%" asks what the 10% is of; weeks outside the window refused; hidden rates need the planner's say-so; 4-6 refused clearly where sources only have 4-9; wider bands only with the planner's agreement and labelled with their real band.
- Written text is refused if too long, if it has a figure or date or age band that isn't in the plan, a placeholder, or a claim about what children think or feel.
- Built-in checks on every plan: all sections filled in, figures in text match the plan, no placeholders. Ticks lapse if a warning's wording changes.
- Compare options side by side (nothing changed). Versions with notes; restore.
- One unguessable web link per plan. The spike plan is gone.
- Sentry on (server and in-Claude view), project `signifii-demos` in the EU region.
- Microsoft sign-in setup steps for Sadie: `docs/microsoft-sign-in-setup.md`.
- 48 tests.

**Known gap**: plans are saved on the server's disk until Wednesday's Postgres work, so a redeploy clears them.

## Mon 2 Nov 2026 (later)

**Changed** (reader, general rules; nothing file-specific)
- Notes that change what a figure means (VAT, commission, uplift/discount, card/indicative/estimate, not yet confirmed) are found wherever they are: above the table, below it, in a notes column or a cell comment. Each is kept with exactly the values it covers: the whole table, one column or column group, or named rows ("rows 8 & 11"). Lines above the table are now kept too.
- A column that writes money several ways ("£5k", "10000", "£10,000") is read as money throughout; figures without a currency sign are flagged.
- Percentage splits (boys/girls, male/female, age bands) that don't add up to 100% are reported, never corrected.
- Tabs that cover different reporting periods are flagged so they're never combined. Periods are also read from "Q4 2026" / "October 2026" titles, ISO dotted dates and two-digit years (flagged).
- Label/value lists can have a third note column and labels ending in ":"; lists of words only are kept as information, not data.
- More non-age audiences recognised (mums, carers, guardians, homemakers, buyers).
- GitHub repo renamed to `signifii-connectors`.
- 35 tests.

## Mon 2 Nov 2026

**Changed**
- Repo restructured into a shared `core/` and `connectors/media-plan/` (see `CLAUDE.md`). Media Plan is this week's priority; Canva Guides after (`00_START_HERE.md`).
- New general source reader with provenance on every value, and a reading report per file. All five sample files read; every tricky item is listed under "Check these", nothing guessed. Files with personal data are refused.
- New rules engine. Checks only say "pass" when they actually ran; otherwise "not run yet", "not checked" or "off". The ten fixed rule types are read from `Media Plans/Rules/rules.xlsx`. The spike plan's two hand-typed "pass" checks are gone: it now shows 3 pass, 2 fail, 5 not run.
- New tool `list_sources`; admin reading-report page.
- Render: new service `signifii-demos` and Postgres `signifii-demos-db` (Frankfurt). The old `media-plan-connector` service still runs the same code at its old address.
- 29 automated tests.

**Next (Tuesday)**
- Plan engine: start a plan from the brief (generated fictional PDF brief; budget and dates pulled out by pattern, asked for if not found), audience lookup with the 4–6 refusal, allocation and totals, compare options, checks rerun after every change. Plan in chat + web link.
- Microsoft app registration walkthrough for `sadie@signifii.com`.
- Sentry.

**Waiting on Sadie**
- Delete the old `media-plan-connector` service in Render (the connector already uses `signifii-demos`, confirmed 2 Nov).
