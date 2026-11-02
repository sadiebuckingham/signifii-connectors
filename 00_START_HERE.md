# Start here

1. Read `CLAUDE.md`. It's the house rules for everything in this repo: one shared core, one thin folder per connector.
2. There are two connectors to build, both on the same core:
   - **Canva Guides**: `docs/briefs/canva-guides/canva-guides-brief.md`
   - **Media Plan**: `docs/briefs/media-plan/` (read `media-plan-connector-brief.md`, then `-discovery.md`, then `-sources.md`). The sources doc replaces section 1 of the brief. The five spreadsheets in `sample-data/media-plan/` replace the rate card and audience sources listed in the brief; still generate its other demo files.

## Priority this week (decided 2 Nov 2026)

**Media Plan first, Canva Guides after.** The Media Plan demo goes to an external person on Friday 6 Nov 2026 and must be fully tested by then. The plan for the week is `docs/media-plan-demo-week-plan.md`. Canva Guides (including its API spike) starts once the Media Plan demo has shipped.

## Order (original; see the priority note above)

1. Set up the repo layout from `CLAUDE.md` with an empty `core/`, and create `docs/WHERE-THINGS-LIVE.md` and `docs/CHANGELOG.md`.
2. **One shared spike** covering both briefs: a hello-world MCP App in claude.ai, plus the Canva API spike (OAuth, brand template dataset, one autofill, one PDF export, Welsh characters). Report back before building further.
3. Build the shared core pieces as the first connector needs them.
4. **Canva Guides prototype first.** It's smaller and has a real client waiting.
5. **Media Plan demo second**, reusing the core.

Don't hard-code anything to the sample files. Never put secrets in the repo.
