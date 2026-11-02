# Client discovery notes: Little Lantern Media (FICTIONAL)

**Read this alongside `media-plan-connector-brief.md`.** The build brief says *what* to build. These notes say *who it's for and why*, so the build feels right for a real small agency. Everything here is invented for the demo; no real company or person.

---

## Who they are

- **Little Lantern Media**: independent UK kids' and family media agency, 14 staff, London.
- Plans media for toy, kids' entertainment and family food brands. Typical campaign budgets £50k–£500k.
- Also runs a small kids' recruitment arm (finding families for client panels and events). **Not part of this build.**
- Contact: **Head of Planning** ("Jo"). Holds the budget for tools jointly with the MD.

## The brief, in their words

> "We have lots of different types of messy information coming in, lots of different types of data, and we need a central place for it. Our director has been building a Claude tool but hasn't got very far. We don't want hallucinations. It needs to read lots of different types of data and pull the sources together. We need to split the data by age, e.g. kids aged 4 to 6. We need something the whole organisation can use friction-free, that goes into our documents, uses our documents, and makes us more efficient at media planning."

## Discovery questions and answers

### 1. Where do the plans and data live today?

> "Everything's in SharePoint, one folder per client, then a mess of subfolders. Rate cards come from media owners as Excel, nearly always with merged cells and notes in random columns. Audience data comes from two places: a syndicated kids' audience tool we export to CSV, and media owners' own reach figures, which come as PDFs or Excel. Past plans are a mix of Excel and PowerPoint, because the client-facing version is always PowerPoint. Briefs come in as PDF or Word."

**Implications for the build**
- Sources are Excel, CSV, PDF, Word and PowerPoint. The demo should include each type.
- The client-facing output must be PowerPoint. PDF is nice to have.
- SharePoint connection is a later phase. For the demo, upload is fine.

### 2. What does the director's Claude attempt get wrong?

> "Three things. First, it makes up numbers. We asked it for reach for 4–6s and it gave us a confident figure, but our data only has 4–9. It had just divided it. Second, the plan looks different every time: different columns, different order, sometimes it decides to do a chart, sometimes not. Third, when we asked it to move budget between channels, the totals stopped adding up and nobody noticed until the client did. That was embarrassing."

**Implications for the build**
- This is the demo story. The build must visibly handle all three:
  - **Refuse to split** 4–9 into 4–6, with a clear message.
  - **Fixed template**, identical structure every time.
  - **Totals calculated in code**, and a check that blocks export if they don't add up.

### 3. Who signs a plan off, and what do they check?

> "The Planning Director signs off every plan before it goes to a client. She checks: does the budget match the brief exactly; are all the dates inside the campaign window; is every number sourced. If she asks 'where's this from?' we need to answer in seconds. And for anything aimed at under-13s on YouTube or social, she checks the targeting is compliant. Last year a junior planner nearly booked a social line that would have targeted under-13s directly."

**Implications for the build**
- The checks in the build brief match her checklist. Name the checks panel *"Sign-off checks"*.
- Source markers must show file, sheet and row in one tap or hover. This is the "where's this from?" moment.
- The under-13s targeting rule is a must-have demo rule, shown as a warning that needs a tick.
- Add a simple **sign-off** step: Planning Director name, date, version. A plan can't be exported as "final" without it. Drafts can be exported, marked DRAFT.

### 4. Can they share two past plans?

> "Yes. I'll blank out client names and the real rates. One's a Christmas toy campaign in Excel, the other's a summer cinema release in PowerPoint. The PowerPoint one is the format clients see."

**Implications for the build**
- Build the template from the PowerPoint layout described below (no real file needed for the demo).
- Generate the two fictional past plans to match these descriptions.

## Their plan template (as described by Jo)

The client-facing plan is **eight slides**, always in this order:

1. **Cover**: client, campaign, dates, version, "Prepared by Little Lantern Media"
2. **The brief**: objective, audience, budget, campaign window
3. **Who we're reaching**: reach by channel for the target age bands, as a table
4. **Channel mix**: channel, budget, share, estimated impressions. Always a table, never a pie chart ("clients misread pies")
5. **When**: weekly flighting calendar
6. **Why these channels**: one short paragraph per channel
7. **Sign-off checks**: the checklist, all green before it goes out
8. **Next steps**: approval deadline and contact

**House style:** dark navy `#1B2A4A`, warm yellow `#F5B731`, off-white `#FAF7F0`. Headings in a rounded sans (e.g. Nunito); body in Inter. Fictional logo: a small lantern mark with the wordmark.

## How they'd want to use it

> "Planners live in Claude now, so it should start there. Someone says 'open the Bramble Bots plan' and it's just there. Then we'd talk through options with it: what if we pull back on TV, what does that do to reach for 4–6s? The Planning Director doesn't use Claude much. She'd rather open a link."

**Implications for the build**
- Claude is the main way in, through the MCP App.
- `compare_options` matters: planners want to see two or three scenarios side by side before choosing.
- The read-only web link is the Planning Director's view. Sign-off should be possible from the web view (password-protected admin action for the demo).

## Things they said they don't want

- "No pie charts."
- "Don't let it write anything about what kids *think* or *feel*. That's not our job in a plan, and it's where it makes things up."
- "We don't want another platform to log into every day. It has to sit where we already work."
- "Nothing with individual kids' data. We only ever plan on audience totals."

## Success, in their words

> "A planner gets a first draft in under 20 minutes instead of half a day, the numbers are right first time, and the Planning Director can check any figure in seconds."
