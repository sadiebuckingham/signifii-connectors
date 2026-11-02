# Signifii Connectors: house rules for Claude Code

Read this first, every session. It applies to everything in this repo.

## What this repo is

Signifii builds **connectors (MCP Apps) that put a team's own approved content and data into the team's own fixed templates, inside Claude**, with checks in code so nothing is made up and nothing changes shape.

Every connector in this repo is the same product with different data and a different template. So there is **one shared core** and a thin folder per connector. Build it once, reuse it everywhere, so two connectors never end up behaving slightly differently.

## Repo layout

```
signifii-connectors/
  CLAUDE.md                  ← this file
  core/                      ← shared engine, used by every connector
    mcp/                     ← MCP server + MCP App shell, tool registration
    templates/               ← fixed-template renderer (HTML/CSS → in-Claude view, web page, PDF, PPTX)
    checks/                  ← rules engine + checks (on/off, versioned, snapshotted per run)
    sources/                 ← general file reader with provenance (xlsx, csv, pdf, docx, pptx)
    ai/                      ← one AI wrapper; provider swappable via one env var
    auth/                    ← auth seam (simple token for demos; OAuth later)
    versions/                ← versioning and restore
  connectors/
    media-plan/              ← one folder per connector: config, template, tool definitions, tests, RUNBOOK.md
    canva-guides/
  docs/briefs/               ← the briefs each connector was built from
  sample-data/               ← fictional or permitted test data, one folder per connector
```

## The rules

1. **Never duplicate core logic inside a connector.** If a connector needs something that another connector could use, add it to `core/` and use it from there.
2. **A connector folder is mostly configuration**: its template, its fields and limits, its rules, its tools' wiring. If a connector folder starts growing its own engine, stop and move that into `core/`.
3. **Numbers, dates and prices never come from the AI.** They come from a source or are calculated in code.
4. **Claude never decides layout.** Templates are fixed. Claude supplies references and words for named slots; code checks them and lays them out.
5. **Every value keeps its provenance**: source file, tab or page, cell or field, original text.
6. **Checks run in code after every change.** Anything that fails blocks export; warnings need a human tick.
7. **Never guess.** Anything unreadable, ambiguous or too long is flagged, not fixed silently.
8. **No personal data about children, ever.** Audience totals only.
9. **Don't change the Guide-Modifier repo.** It's a live client system in its own repo. Connectors may read from it or from its exports; they never write to it.

## Deployment (Render)

- One repo. Each Render service deploys this repo with an environment variable `CONNECTOR=<name>` choosing which connector runs.
- **Demos** run together on one service: `signifii-demos`, Frankfurt, with each connector at its own MCP URL (e.g. `/mcp/media-plan`, `/mcp/canva-guides`).
- **Real clients** each get their own Render service and their own Postgres, deployed from the same repo, so client data is never shared.
- Sentry on, server and browser, for every service.
- Secrets live in Render environment variables and Sadie's password manager. Never in the repo, never in docs.

## Documentation you must keep up to date

- `connectors/<name>/RUNBOOK.md`: how to run, deploy, roll back, where it lives, what it costs, what's next. Written for someone picking it up cold.
- `docs/WHERE-THINGS-LIVE.md`: one table of every service, URL, database, Sentry project and repo. Update it whenever you create or change anything on Render.
- At the end of every working session, write a short entry at the top of `docs/CHANGELOG.md`: date, what changed, what's next.

## Working style

- Sadie isn't an engineer. Explain decisions in plain English, briefly.
- For each new connector, do the spike in its brief first and report back before building further.
- Prefer boring, well-supported libraries. Fewer moving parts beats clever.
