# Changelog

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
