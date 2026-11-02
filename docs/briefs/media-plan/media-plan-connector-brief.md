# Brief for Claude Code: Media Plan Connector (demo)

## What it is

A connector (MCP App) that lets a small kids' media agency build media plans inside Claude, in their own fixed template, from their own data, with no made-up numbers.

A planner types *"open a media plan for the Bramble Bots Q4 brief"*. The connector opens the agency's plan template in the conversation, fills it from the agency's own sources, and the planner chats it into shape: *"what if we move 10% from TV to YouTube?"*, *"show me reach for 4–6s only"*. The same plan can be opened as a web page and exported to PowerPoint or PDF.

**The rule that matters most:** every number comes from a source file or is calculated in code. Claude never types a number into the plan. Claude chooses, asks and writes words. The tool fetches, calculates, checks and lays out.

This is a **demo** for showing to small media agencies. It uses fictional data only. No real client data goes anywhere near it.

## The brief it answers (from a prospective client, paraphrased)

- Lots of messy information in lots of formats, coming from different places. They want one central place it all comes through.
- No hallucinations.
- They need to split the data by age, e.g. kids aged 4–6.
- Must be friction-free for the whole organisation, work with their existing documents, and make media planning more efficient.
- A director has tried building this as a Claude project and didn't get far.

## Who uses it

- **Planners** at the agency, inside Claude (claude.ai web or desktop), via a custom connector.
- **Admin (me)** sets up the agency's template, sources and rules.
- **Read-only viewers** (the agency's client) can open a published plan from an unguessable link. No login.

## Fictional demo setup

Create believable, clearly fictional seed data. Label every file **FICTIONAL DEMO DATA**.

- Agency: **Little Lantern Media**, a small UK kids' and family media agency.
- Client: **Bramble Bots**, a toy brand. Q4 Christmas campaign, budget £150,000.
- Sources (deliberately messy, mixed formats):
  - Rate card: `.xlsx` with merged header cells and a notes column
  - Audience reach by channel and age band: `.csv`. One source uses bands 4–6 / 7–9 / 10–12; another uses 4–9 / 10–15 (deliberately mismatched)
  - Two past plans: one `.xlsx`, one `.pptx`
  - The client brief: `.pdf`
  - The agency's planning rules: `.docx`

## Stack

Same shape as Guide-Modifier and the proposal builder, so there's only one way of working:

- GitHub repo → Render web service (Frankfurt), Render Postgres, Sentry (server and browser)
- **Remote MCP server** over Streamable HTTP, served from the same Render service
- **MCP App** (interactive UI) rendering the plan template inside Claude
- The same template also served as a normal web page at `/p/<token>`
- AI calls (if any server-side) through one small wrapper module, so the provider can be swapped by changing one file and one environment variable
- Admin protected by a password held in Render environment variables
- `RUNBOOK.md` so I can pick it up cold

**Auth:** for the demo with fictional data, a simple per-connector secret token is acceptable. Real clients will need proper OAuth sign-in. Leave a clear seam for it and note it in the RUNBOOK as the first job before any real data. (Flag for the AI engineer conversation.)

## Build order

1. **Spike first (half a day max).** A hello-world MCP App with one tool that opens a dummy plan in claude.ai. Confirm exactly how it displays (inline in the conversation, expandable, side panel?) and what works on web vs desktop vs mobile. Write the findings into the RUNBOOK. Do not build further until this is confirmed.
2. Source library and parsing.
3. Plan engine, template and checks.
4. MCP tools and App.
5. Web view and export.

## 1. Source library ("one place it all comes through")

- Upload sources in admin (later: pull from a connected Drive/SharePoint folder; out of scope for now).
- Each file is parsed into **normalised tables** stored in Postgres. Every row keeps: source file, sheet/page, original row or cell reference, upload date.
- **Parsing never guesses.** If a value can't be read cleanly (merged cells, text in a number column, missing header), it's marked *needs review* and shown in admin, not silently fixed or dropped.
- A sources page shows each file, what was extracted, and what needs review.

## 2. Age bands (the 4–6 problem)

- The agency defines its canonical age bands in admin (demo: 4–6, 7–9, 10–12, 13–15, parents).
- Each source's bands are mapped to the canonical ones in admin.
- **The tool never interpolates.** If a source only has 4–9, asking for 4–6 returns: *"This source reports 4–9 only. It can't be split to 4–6."* It may show the 4–9 figure labelled as 4–9. It never estimates a share.
- Where two sources disagree for the same band and channel, show both with their sources. Don't average.

## 3. The plan template (fixed)

One HTML template with CSS, used for the MCP App view, the web page and the export, so all three always match. Every element has a fixed place. Text never resizes to fit; limits are enforced instead.

| Section | Content | Who fills it |
|---|---|---|
| Cover | Client, campaign, dates, version | Brief (code), dates from brief |
| Brief summary | Objective, audience, budget, window | Budget and dates from brief (code); objective wording AI-drafted, 140 chars |
| Audience | Reach by channel for selected age bands | Sources only (code) |
| Channel mix | Channel, budget £, share %, est. impressions, source | Budget/share set via tool, calculated in code; impressions from rate card |
| Flighting | Weekly calendar per channel | Set via tool, validated against campaign window |
| Rationale | One per channel, 180 chars each | AI-drafted, editable |
| Checks | Pass / warn / fail list | Code |
| Sign-off | Planner, date, version | Admin / user |

Every number displayed carries a small source marker. Hover or tap shows file, sheet and row.

## 4. MCP tools

Claude passes **references** (IDs, channel names, age bands, percentages the user asked for), never figures it read itself.

- `list_sources()` – what's in the library and its status
- `get_audience(channels, age_bands)` – reach figures with source refs, or a clear "can't split" message
- `get_rates(channels)` – rate card values with source refs
- `open_plan(brief_id)` / `create_plan(brief_id)` – opens the plan in the MCP App
- `set_allocation(plan_id, channel, amount_gbp | share_pct)` – code recalculates all totals and shares
- `set_flighting(plan_id, channel, weeks)`
- `write_section(plan_id, slot, text)` – rejected if over the limit or if it contains a number that doesn't match a sourced value in the plan
- `compare_options(plan_id, scenarios)` – side-by-side totals for 2–3 allocations, calculated in code
- `check_plan(plan_id)` – runs all checks
- `export_plan(plan_id, format)` – PPTX or PDF, from the same template
- `publish_plan(plan_id)` – returns the `/p/<token>` link

Tool errors are written for Claude to act on, e.g. *"Rationale for YouTube is 212 chars, max 180."*

## 5. Checks (in code, after every change)

1. Channel budgets add up exactly to the brief budget.
2. All flighting falls inside the campaign window.
3. Every number in the plan has a source or is a calculation from sourced numbers.
4. Any number in AI-written text must match a sourced value in the plan; otherwise flag *unsourced figure*.
5. No `[` or `]` placeholders left anywhere.
6. Agency rules from the rules doc, stored as rules (on/off, versioned, snapshotted per plan). **Reuse the rules engine pattern from Guide-Modifier.** Demo rules should include kids-specific ones, e.g. "flag YouTube and social lines aimed at under-13s for targeting review", "no channel above X% without a note".
7. Plan can't be published or exported with any *fail*. *Warn* items need a tick from the planner.

## 6. Versions

Each change saves a version. Planners can see and restore earlier ones. Each version snapshots the rules in force and the source files used.

## Data and safety

- Demo stores only fictional data.
- Even for real clients later: **aggregated audience data only.** No personal data about any child, ever. Note this in the RUNBOOK as a hard rule.
- Proposal and plan links unguessable and switch-off-able. Full delete available.

## Not in scope (yet)

- Real client data
- OAuth / multi-user accounts (seam only)
- Pulling from Drive/SharePoint
- Buying, trafficking, or integrations with planning platforms
- Multi-tenancy (one deployment per agency, as with Guide-Modifier)
- Any audience insight or research analysis. This presents the agency's planning data; it does not interpret research.

## Done means

- In claude.ai, *"open a media plan for the Bramble Bots brief"* opens the template filled from the fictional sources.
- *"Move 10% from TV to YouTube"* updates the plan with totals still correct.
- *"Show me reach for 4–6s"* works where the data allows, and refuses clearly where it doesn't.
- An unsourced number typed into a rationale is flagged.
- The PPTX/PDF export matches the in-Claude view.
- Deployed on Render with Sentry on; RUNBOOK covers the spike findings, auth next steps and rollback.
