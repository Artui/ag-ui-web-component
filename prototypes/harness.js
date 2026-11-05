// Wiring for the design-prototype harness. Every look is chosen from the URL,
// so the screenshot script can visit one address per cell of the matrix:
//   ?theme=proto-quiet&scheme=dark&placement=sidebar&steps=group&collapsed=1
import { defineAgUiChat, fillField, pressButton, selectControl, toggleCheckbox, X_DESTRUCTIVE_KEY } from "/bundle.js";

const params = new URLSearchParams(window.location.search);
const $ = (id) => document.getElementById(id);
const chat = $("chat");

const theme = params.get("theme") ?? "light";
const scheme = params.get("scheme") ?? "light";
const placement = params.get("placement") ?? "floating";
document.documentElement.dataset.scheme = scheme;
document.body.dataset.placement = placement;

// The baseline keeps its own two theme names; a prototype direction takes the
// scheme as a second word, which its stylesheet matches with ~=.
if (theme === "light" || theme === "dark") {
  chat.setAttribute("theme", scheme);
} else {
  chat.setAttribute("theme", `${theme} ${scheme}`);
}
chat.setAttribute("placement", placement);
chat.setAttribute("data-tool-display", params.get("display") ?? "compact");
if (params.get("steps") === "group") {
  chat.setAttribute("data-tool-group", "");
}
if (params.get("collapsed") === "1") {
  chat.removeAttribute("data-start-open");
  chat.setAttribute("collapsed", "");
}

// Every run starts from nothing, so the matrix is the same conversation each time.
try {
  sessionStorage.clear();
  localStorage.clear();
} catch {
  // happy to run without storage
}

defineAgUiChat();
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

if (params.get("run") === "1") {
  void chat.sendMessage("Prepare the launch article from last week's signups and publish it.");
}
