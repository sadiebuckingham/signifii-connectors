// What a media brief must give us, and where to look for it. Configuration
// for the core pattern extractors: nothing is invented, missing facts are asked for.
import { labelled, money, dateRange, singleDate } from "../../core/sources/extract.js";

export function readBriefFacts(doc) {
  const facts = {};
  const missing = [];
  const take = (key, r, ask) => {
    if (r?.status === "found") { facts[key] = r; return; }
    const why = r?.status === "conflict" ? `The brief states it more than one way: ${r.options.map((o) => `"${o.original}" (${o.source.ref})`).join(", ")}${r.reason ? ` ${r.reason}` : ""}`
      : r?.status === "ambiguous" ? `"${r.original}" could be read as UK or US date order.` : "The brief doesn't state it clearly.";
    missing.push({ key, ask, why });
  };

  take("budget", money(doc, /\bbudget\b/i), "What's the total media budget?");
  take("window", dateRange(doc, /\b(campaign window|campaign runs|runs from|live|on air|flight(ing)? dates|campaign dates|window)\b/i), "What are the campaign start and end dates?");
  take("approvalBy", singleDate(doc, /\bapprov/i), "When does the plan need approving by?");

  const client = labelled(doc, /client(?! contact)/);
  const campaign = labelled(doc, /campaign(?! window| dates| runs)/);
  const objective = labelled(doc, /(campaign\s+)?objectives?/, { follow: true });
  const audience = labelled(doc, /target audience|audience/, { follow: true });
  const contact = labelled(doc, /client contact|contact/);
  for (const [k, v, ask] of [["client", client, "Who is the client?"], ["campaign", campaign, "What's the campaign called?"], ["objective", objective, "What's the campaign objective?"], ["audience", audience, "Who is the target audience?"], ["contact", contact, "Who is the client contact?"]]) {
    if (v) facts[k] = { status: "found", ...v };
    else missing.push({ key: k, ask, why: "The brief doesn't state it clearly." });
  }
  return { facts, missing };
}
