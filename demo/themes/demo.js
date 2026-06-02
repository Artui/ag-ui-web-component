// Playground wiring for the live demo. Registers the admin-style frontend tools
// the mock agent drives (fill_field / select_option / toggle_checkbox /
// click_save) using the component's animated DOM primitives, seeds a skill
// catalog (chips + `/` palette), and wires the header controls so every
// config — theme / density / placement / text-animation / tool-display — flips
// live by setting an attribute on the element (no page reload).
import {
  defineAgUiChat,
  fillField,
  pressButton,
  selectControl,
  toggleCheckbox,
  X_DESTRUCTIVE_KEY,
} from "/bundle.js";

defineAgUiChat();

const $ = (id) => document.getElementById(id);
const chat = $("chat");

// ── Frontend tools (driven by the mock agent) ──────────────────────────────
chat.registerTool({
  name: "fill_field",
  description: "Fill a text input by id with a value.",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "string" } },
  },
  handler: async ({ field, value }) => {
    await fillField($(field), String(value), { charDelayMs: 45 });
    return "ok";
  },
});

chat.registerTool({
  name: "select_option",
  description: "Choose an option in a select by id (animated).",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "string" } },
  },
  handler: async ({ field, value }) => {
    await selectControl($(field), String(value));
    return "ok";
  },
});

chat.registerTool({
  name: "toggle_checkbox",
  description: "Set a checkbox by id (animated).",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "boolean" } },
  },
  handler: async ({ field, value }) => {
    await toggleCheckbox($(field), Boolean(value));
    return "ok";
  },
});

chat.registerTool({
  name: "click_save",
  description: "Save the article. Destructive — asks for confirmation.",
  parameters: {
    type: "object",
    properties: {},
    [X_DESTRUCTIVE_KEY]: true,
    "x-confirm": "Save this article?",
    "x-summary": "Save article",
  },
  handler: async () => {
    await pressButton($("save"));
    return "saved";
  },
});

// ── Skills (chips + `/` palette) ────────────────────────────────────────────
chat.setSkills([
  {
    name: "fill-article",
    title: "Fill the article",
    description: "Populate every field, then save.",
    prompt:
      'Create an article titled "Hello, AG-UI", slug hello-ag-ui, status published and featured, then save.',
    chip: true,
  },
  {
    name: "summarize-form",
    title: "Summarize the form",
    description: "Recap the current field values.",
    prompt: "Summarize the current values of the article form.",
    chip: true,
  },
  {
    // {topic} is filled from the Title field below; empty → blocked with a hint.
    name: "suggest-title",
    title: "Suggest a better title",
    description: "Uses the current Title as the topic.",
    prompt: "Suggest three catchy titles for an article about: {topic}.",
  },
]);
chat.skillContext = () => ({ topic: $("title").value.trim() });

// ── Live config controls ─────────────────────────────────────────────────────
const bind = (id, attr) => {
  $(id).addEventListener("change", (event) => {
    chat.setAttribute(attr, event.target.value);
  });
};
bind("cfg-theme", "theme");
bind("cfg-density", "density");
bind("cfg-placement", "placement");
bind("cfg-text", "data-text-animation");
bind("cfg-tools", "data-tool-display");

$("save").addEventListener("click", () => {
  $("banner").classList.add("show");
});
