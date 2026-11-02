# Media Plan connector: plan to send Lauren by Friday 6 Nov 2026

## The goal

Lauren adds the connector to her own Claude, says *"start a new media plan for Bramble Bots"*, and is impressed. Then she asks *"can I put my own files in here?"* and the honest answer is **yes**, because we've already tested it with a second set of files we'd never seen, in a real OneDrive folder.

## What "done" means on Friday

1. She adds it with one link and three simple steps.
2. It finds the clients, reads the brief and the shared data, and shows a reading report.
3. *"Reach for 4–6s?"* gets an honest "the data doesn't split that way", never an invented number.
4. The plan appears in the chat in the fixed eight-slide format, and as a web link.
5. Moving budget updates the totals, and the checks rerun **for real**.
6. Saving puts the plan into the client's `Plans` folder.
7. **Swap test passed:** a second folder with five different messy files and a new brief works with no code changes.
8. **Own-files test passed:** the connector reads from a real OneDrive folder with Microsoft sign-in.
9. **Rules from a folder:** the agency's rules live in a simple spreadsheet in a `Rules` folder that they can edit themselves. The connector checks against whatever's in it.

## Folder design

```
Media Plans/
  Shared data/            ← all source files, used for every client
  Rules/
    rules.xlsx            ← one row per rule; the agency edits this
  Clients/
    <client>/
      Briefs/
      Plans/              ← saved plans go here
```

Rules as a spreadsheet keeps it reliable: the connector reads fixed columns (rule, applies to, limit, severity), so no AI is needed to interpret them. Writing rules by chatting comes later, as a separate step that proposes rows for a person to approve.

## The week

| Day | Claude Code builds |
|---|---|
| **Mon** | Restructure into shared core + `connectors/media-plan`. Source library reads the five files. Reading reports. |
| **Tue** | Planning tools: start plan, audience, allocation, compare options, real checks. Plan shown in chat + web link. |
| **Wed** | Save/open plans in the client folder. Rules read from `rules.xlsx`. Fixes from Tuesday's test. |
| **Thu** | Microsoft sign-in, reading and writing a real OneDrive folder. Swap test with a second set of files. |
| **Fri** | PDF export (PPTX if time). Final fixes. Deploy. Full test as an outside user would. |

## Cut list (if the week slips, cut in this order)

1. PPTX export: send with the web link and PDF.
2. `compare_options`: show one scenario change at a time instead.
3. OneDrive reading: only if Thursday fails.

**Never cut:** real checks, the 4–6 refusal, the fixed template, and the swap test.
