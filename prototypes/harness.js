// Wiring for the design-prototype harness. Every look is chosen from the URL,
// so the screenshot script can visit one address per cell of the matrix:
//   ?theme=proto-quiet&scheme=dark&placement=sidebar&steps=group&collapsed=1
import { defineAgUiChat, fillField, pressButton, selectControl, toggleCheckbox, X_DESTRUCTIVE_KEY } from "/bundle.js";

const params = new URLSearchParams(window.location.search);
const $ = (id) => document.getElementById(id);
const chat = $("chat");

const theme = params.get("theme") ?? "";
const scheme = params.get("scheme") ?? "light";
const placement = params.get("placement") ?? "floating";
document.documentElement.dataset.scheme = scheme;
document.body.dataset.placement = placement;

// theme="<name> <scheme>". No name is the default theme (Quiet); light is the
// default scheme, so the plain default carries no attribute at all.
const words = [theme, scheme === "light" ? "" : scheme].filter((word) => word !== "");
if (words.length > 0) {
  chat.setAttribute("theme", words.join(" "));
}
chat.setAttribute("placement", placement);
chat.setAttribute("data-tool-display", params.get("display") ?? "compact");
const steps = params.get("steps");
if (steps !== null) {
  chat.setAttribute("data-tool-group", steps === "cards" ? "off" : "");
}
if (params.get("collapsed") === "1") {
  chat.removeAttribute("data-start-open");
  chat.setAttribute("collapsed", "");
}
// Override layers, for the review page: each one a host stylesheet rule, a
// part rule, a custom theme word, or an extraStyles sheet.
const override = params.get("override");
if (override !== null) {
  document.body.dataset.override = override;
}
// Every run starts from nothing, so the matrix is the same conversation each time.
try {
  sessionStorage.clear();
  localStorage.clear();
} catch {
  // happy to run without storage
}

defineAgUiChat();
// After the definition: set on the plain element before it upgrades, these
// would shadow the element's own setters and do nothing.
chat.askUser = true;
chat.approveWithEdits = true;
if (override === "extra") {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    .header { border-top: 3px solid #0f766e; }
    .header-title { font-size: 15px; letter-spacing: 0.01em; }
    .message--assistant { padding: 10px 12px; border-radius: 10px; background: color-mix(in oklch, #0f766e 6%, transparent); }
    .tool-group-head { font-variant: small-caps; }
  `);
  chat.extraStyles = [sheet];
}
chat.enableCharts(["tool"]);

chat.registerTool({
  name: "fill_field",
  description: "Fill a text input by id.",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "string" } },
    "x-summary": "Fill field",
  },
  handler: async ({ field, value }) => {
    await fillField($(field), String(value), { charDelayMs: 0 });
    return "ok";
  },
});
chat.registerTool({
  name: "select_option",
  description: "Choose an option in a select by id.",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "string" } },
    "x-summary": "Choose option",
  },
  handler: async ({ field, value }) => {
    await selectControl($(field), String(value));
    return "ok";
  },
});
chat.registerTool({
  name: "toggle_checkbox",
  description: "Set a checkbox by id.",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "boolean" } },
    "x-summary": "Tick checkbox",
  },
  handler: async ({ field, value }) => {
    await toggleCheckbox($(field), Boolean(value));
    return "ok";
  },
});
chat.registerTool({
  name: "check_links",
  description: "Check every link in the article body.",
  parameters: { type: "object", properties: {}, "x-summary": "Check links" },
  handler: async () => {
    throw new Error("link checker timed out after 10s");
  },
});
chat.registerTool({
  name: "click_save",
  description: "Save the article.",
  parameters: {
    type: "object",
    properties: {},
    [X_DESTRUCTIVE_KEY]: true,
    "x-confirm": "Publish this article to the live site?",
    "x-summary": "Save article",
  },
  handler: async () => {
    await pressButton($("save"));
    return "saved";
  },
});

chat.setSkills([
  { name: "fill-article", title: "Fill the article", description: "Populate every field.", prompt: "Fill the article.", chip: true },
  { name: "summarize", title: "Summarize the form", description: "Recap the values.", prompt: "Summarize the form.", chip: true },
  { name: "triage", title: "Triage this article", description: "Server-resolved.", chip: true },
]);

// run=1 is the scripted turn; run=<word> sends that prompt to the mock
// instead (import: three approvals, ask: a question, delegate: sub-agents).
const run = params.get("run");
if (run === "1") {
  void chat.sendMessage("Prepare the launch article from last week's signups and publish it.");
} else if (run === "import") {
  void chat.sendMessage("Import three rows onto the board.");
} else if (run === "ask") {
  void chat.sendMessage("Ask me something before you publish.");
} else if (run === "delegate") {
  void chat.sendMessage("Delegate this to the sub-agents.");
}
