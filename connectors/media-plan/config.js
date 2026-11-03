// Media Plan connector settings. Configuration only: no engines here.
export const config = {
  folders: {
    sharedData: "Shared data",
    rulesFile: "Rules/rules.xlsx",
    decisionsFile: "Rules/decisions.xlsx",  // decisions agreed in Claude, editable by the agency
    clients: "Clients",            // Clients/<client>/Briefs and /Plans
  },
  // The agency's canonical age bands. A source band is used for one of these
  // only if it matches exactly (or the planner accepts a wider band, shown with its real label).
  canonicalBands: [
    { label: "4-6", from: 4, to: 6 },
    { label: "7-9", from: 7, to: 9 },
    { label: "10-12", from: 10, to: 12 },
    { label: "13-15", from: 13, to: 15 },
    { label: "parents", type: "parents" },
  ],
  // Channel categories used by the rules (names as planners say them).
  categories: ["TV", "Online video", "Social", "Print", "Digital", "Cinema", "Newsletter", "OOH"],
  limits: { objective: 140, rationale: 180 },
};
