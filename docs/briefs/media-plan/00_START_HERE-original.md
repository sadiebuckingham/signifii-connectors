# Start here

This folder contains everything for building the Media Plan Connector demo.

## Read in this order

1. `media-plan-connector-brief.md` is the spec: what to build.
2. `media-plan-connector-discovery.md` is the (fictional) client's brief and answers. Where it adds detail (the 8-slide template, house style, sign-off step), follow it.
3. `media-plan-connector-sources.md` covers how to read the incoming data. It replaces section 1 of the brief.

## The five spreadsheets

`01` to `05` are examples of the messy data that arrives. **Don't hard-code to them.** They'll be swapped for different files later, and the connector must still read those.

They replace the rate card and audience sources listed under "Fictional demo setup" in the brief. Still generate the other demo files listed there: the client brief (PDF), the agency's planning rules (Word) and the two past plans.

## First job

Do the spike in the brief's build order (step 1): a hello-world MCP App that opens a dummy plan in claude.ai. Report back what you find about how it displays before building anything else.
