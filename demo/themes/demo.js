// Shared tool registration for the theme demos. Reuses the same DOM-driver
// primitives as demo/index.html: fill_field / select_option / toggle_checkbox /
// click_save, wired to the live mock server's /agent/ endpoint.
import {
  clickElement,
  defineAgUiChat,
  fillField,
  setControlValue,
  X_DESTRUCTIVE_KEY,
} from "/bundle.js";

defineAgUiChat();

const $ = (id) => document.getElementById(id);
const chat = document.querySelector("ag-ui-chat");

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
  description: "Choose an option in a select by id.",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "string" } },
  },
  handler: ({ field, value }) => {
    setControlValue($(field), String(value));
    return "ok";
  },
});

chat.registerTool({
  name: "toggle_checkbox",
  description: "Set a checkbox by id.",
  parameters: {
    type: "object",
    properties: { field: { type: "string" }, value: { type: "boolean" } },
  },
  handler: ({ field, value }) => {
    setControlValue($(field), Boolean(value));
    return "ok";
  },
});

chat.registerTool({
  name: "click_save",
  description: "Save the article. Destructive — asks for confirmation.",
  parameters: { type: "object", properties: {}, [X_DESTRUCTIVE_KEY]: true },
  handler: async () => {
    await clickElement($("save"), { highlightMs: 400 });
    return "saved";
  },
});

$("save").addEventListener("click", () => {
  $("banner").classList.add("show");
});
