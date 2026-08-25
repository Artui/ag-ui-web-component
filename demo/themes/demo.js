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

const $ = (id) => document.getElementById(id);
const chat = $("chat");

// A localized string table, which is also the quickest check that every label
// is sourced from UiStrings rather than hard-coded.
const DE = {
  title: "Assistent",
  argumentsLabel: "Argumente",
  resultLabel: "Ergebnis",
  errorLabel: "Fehler",
  details: "Einzelheiten",
  decisionApproved: "von dir bestätigt",
  decisionDeclined: "von dir abgelehnt",
  resizePanel: "Panelgröße ändern",
  toolRunning: "läuft…",
  toolDone: "✓ fertig",
  confirm: "Bestätigen",
  cancel: "Abbrechen",
};

// `data-strings` is read once while connecting, so it has to be on the element
// before the definition upgrades it. Hence the flag-then-reload dance in the
// toggle below rather than setting the attribute live.
const german = sessionStorage.getItem("demo:i18n") === "1";
if (german) {
  chat.setAttribute("data-strings", JSON.stringify(DE));
  $("cfg-i18n").checked = true;
}

defineAgUiChat();

// Charts, both routes. Opt-in by construction: nothing draws one unless a host
// asks, which is the point of the call rather than an accident of the demo.
chat.enableCharts(["tool", "activity"]);

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
  name: "break_something",
  description: "Always throws — shows a failed tool card.",
  parameters: { type: "object", properties: {}, "x-summary": "Flaky operation" },
  handler: async () => {
    throw new Error("the upstream service refused the request");
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
    // Pre-fills rather than sends, so the user can edit before committing.
    sendImmediately: false,
  },
  {
    // No prompt: server-resolved. Picking it sends "/triage" and the agent
    // decides what that means, so the wording never reaches this file.
    name: "triage",
    title: "Triage this article",
    description: "Server-resolved — the prompt never reaches the browser.",
    chip: true,
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

// The question card needs the built-in ask_user tool offered to the agent.
chat.askUser = true;

// The well is a boolean attribute (presence = on), so toggle rather than set.
$("cfg-well").addEventListener("change", (event) => {
  chat.toggleAttribute("data-answer-well", event.target.checked);
});

// Header control icons: the glyphs are slot fallbacks, so projecting light-DOM
// markup into `icon-*` replaces them without touching the shadow styles.
const HEADER_ICONS = {
  "icon-history": "🗂",
  "icon-new": "🆕",
  "icon-collapse": "🔽",
};
$("cfg-icons").addEventListener("change", (event) => {
  for (const [slot, glyph] of Object.entries(HEADER_ICONS)) {
    const existing = chat.querySelector(`[slot="${slot}"]`);
    if (!event.target.checked) {
      existing?.remove();
      continue;
    }
    if (existing === null) {
      const span = document.createElement("span");
      span.slot = slot;
      span.textContent = glyph;
      chat.appendChild(span);
    }
  }
});

$("cfg-i18n").addEventListener("change", (event) => {
  sessionStorage.setItem("demo:i18n", event.target.checked ? "1" : "0");
  window.location.reload();
});

// The unread badge is on by default; the checkbox writes the opt-out.
$("cfg-badge").addEventListener("change", (event) => {
  chat.setAttribute("data-unread-badge", event.target.checked ? "true" : "false");
});

// The badge only counts answers that land while the widget is *collapsed*,
// which is impossible to reach by hand — collapsing takes the composer with it.
// This collapses first, then sends, so the answer arrives behind the launcher.
// A slash token takes the server's short server-resolved branch rather than the
// long scripted tool run, so the badge ticks in about a second.
$("cfg-ping").addEventListener("click", () => {
  chat.setCollapsed(true);
  void chat.sendMessage("/ping");
});

// A dragged size persists per tab, which is confusing when you are flipping
// placements to compare handles.
$("cfg-reset-size").addEventListener("click", () => {
  chat.style.removeProperty("--ag-ui-width");
  chat.style.removeProperty("--ag-ui-height");
  sessionStorage.removeItem("ag-ui-chat:size:/agent/");
  sessionStorage.removeItem("ag-ui-chat:size");
});

$("save").addEventListener("click", () => {
  $("banner").classList.add("show");
});
