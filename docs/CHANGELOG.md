# Changelog

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
- Rename the GitHub repo to `signifii-connectors`.
- Re-add the connector with the `signifii-demos` address, then delete the old `media-plan-connector` service.
