# Source data spec: Media Plan Connector (demo)

**Read with `media-plan-connector-brief.md` and `media-plan-connector-discovery.md`.** Where this doc covers sources and ingestion, it replaces section 1 of the build brief.

Five example spreadsheets come with this doc, all **FICTIONAL DEMO DATA**:

| File | What it is | Typical of |
|---|---|---|
| `01_tv_audiences_wk42-45.xlsx` | Weekly TV audiences by channel and demographic | A TV audience panel export |
| `02_online_video_export_oct26.xlsx` | Campaign export by age band and gender | An online video ad platform export |
| `03_social_parents_q3.xlsx` | Two tabs from two social platforms, parents and 18-34 targeting | Social ad manager exports |
| `04_media_owner_audience_pack.xlsx` | A publisher's audience profile, print and digital | A media owner's sales pack |
| `05_rate_card_q4_2026.xlsx` | Agency's consolidated rate card | An in-house planning sheet |

## The most important instruction

**Do not hard-code anything to these five files.** They are examples of the *kinds* of mess that arrive. After the build, I will replace them with five different files that have different layouts, column names and age bands, and the connector must still read them, or say clearly what it couldn't read.

Build a general reader, tested against these files. Never a parser per file.

## Where the files come from

- The connector reads from **one sources folder**. For the demo, that's a folder on the Render service, filled by dragging the whole folder (or several files) into the admin page.
- Replacing the files and pressing **Re-read sources** re-ingests everything from scratch.
- Leave a clear seam for reading from a OneDrive/SharePoint folder later. Not in scope now.

## The kinds of mess to handle (general rules)

**Layout**
- Title, notes and date lines above the real header row. Find the header row; don't assume row 1.
- Two-row headers with merged group labels above (e.g. "CHILDREN" over three columns). Combine them into one column name.
- Group label rows inside the data (e.g. a "Wk 43" row before that week's channels). Carry the label down as a column.
- Blank rows between blocks, total rows mixed in with data, footnotes under the table.
- Transposed tables: metrics as rows, age bands as columns.
- Several tables or tabs in one workbook, with different conventions on each tab.
- Hidden columns or rows (e.g. last quarter's rates). Read them, record that they were hidden, and **never use hidden data in a plan unless the planner explicitly chooses it.**
- Comments attached to cells. Keep them with the value; they often change its meaning.

**Values**
- Numbers stored as text: `"12,345"`, `"£1,150"`, `"48.2k"`, `"3.2 %"`, `"5,6"` (comma decimal).
- Percentages as fractions (`0.41`) and as strings (`"41%"`). Normalise both, but keep the original.
- Ranges (`"£6.20 - £7.10"`): store as a range, never pick a point in it.
- Placeholders: `"n/a"`, `"TBC"`, `"POA"`, `"--"`, `"<1"`, empty. These are **not zero**. Store them as "no value" with the original text kept.
- Flagged values like `"12.4*"`, with the meaning of `*` in a footnote. Strip the marker, attach the footnote to the value.
- Dates in UK (`13/10/2026`), US (`10/15/2026`), dotted (`15.08.2026`) and written (`1 Jul 2026`) formats. When a date is ambiguous, use the file's other dates to decide; if still ambiguous, flag it.
- Durations as text (`"0:00:14"`).
- Units stated in a title line, not the header (e.g. "Figures: Average Impacts (000s)"). Carry the unit onto every value.

**Audience definitions**
- Age bands differ across and within sources: 4-9, 5-9, 6-8, 7-11, 9-12, 10-15, 13-17, 18-24, 25-34, 35+, "All 4-12", "Unknown".
- Bands can **overlap** in the same table (5-9 and 7-11). Never add overlapping bands together.
- Audiences that aren't age bands at all: "HWC (Housewives w/ children)", "Parents of children 5-9 (interest)", "Parent accounts", "Toy shoppers (behaviour)".
- Gender is labelled differently everywhere: Boys/Girls, Male/Female, Men/Women, female/male, "% boys", "Unknown", "other/unknown".
- Metrics with similar names that are not comparable: TV impacts, readership, monthly users, unique reach, impressions, views. Never treat one as another.
- Reach that's de-duplicated per row only, and a note saying not to sum it. **Respect notes like this.**
- Modelled demographics (e.g. age shown for made-for-kids content where targeting is contextual). Mark these as modelled.

## What the reader produces

For every value, store:

- source file, tab, cell reference, and whether it was hidden
- the original text, exactly as it appeared
- the normalised value (number, percentage, range or "no value")
- unit, metric name and period
- audience: age band (from/to, or "not an age band"), gender, and any other audience description
- any footnote, cell comment or note that applies

And for every file, a **reading report** in admin: what was read, what was skipped and why, anything ambiguous, and the overall status (*read*, *read with warnings*, *couldn't read*). Anything uncertain is flagged for review, never silently guessed.

## Age bands: the planning rule

- The agency's canonical bands are set in admin (demo: 4-6, 7-9, 10-12, 13-15, parents).
- A source band can be used for a canonical band **only if it matches exactly**, or if the planner explicitly accepts a wider band, which is then shown with its real label (e.g. "4-9, used for 4-6 at planner's request").
- **Never split, scale, interpolate or average** a band to make it fit. The answer to "reach for 4-6s" from a 4-9-only source is: "This source reports 4-9 only. It can't be split to 4-6."
- When sources disagree, show both with their sources.

## Children's data

All sources are audience totals. The connector must never store or ask for data about an individual child. If a file ever looks like row-level personal data (names, emails, dates of birth, IDs), it must stop, refuse to ingest it, and say why.

## Tests

1. All five files ingest, with a reading report each. The tricky items are flagged, not guessed.
2. "Reach for 4-6s" refuses with the clear message. "Reach for 4-9s on TV" answers with sources.
3. No placeholder ("POA", "TBC", "n/a", "<1") ever becomes a number in a plan.
4. Swap test: I replace the files with five new ones. Nothing in the code changes. The connector reads them or reports exactly what it couldn't.
