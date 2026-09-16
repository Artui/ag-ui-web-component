// The full-page route: the chat as a host's dedicated chat page, which is the
// layout the greeting exists for. The playground can switch its panel to
// `placement="page"` too, but there the chat covers an article form it was
// built to drive; here nothing else is on the route, so what you see is what a
// host's /chat page shows.
//
// Only prompts the mock agent answers without the playground's form tools are
// offered as starters: a chart, three approvals, a delegation and a question.
import { defineAgUiChat } from "/bundle.js";

const $ = (id) => document.getElementById(id);
const chat = $("page-chat");

defineAgUiChat();
chat.enableCharts(["tool", "activity"]);
chat.askUser = true;

// Live, like the attribute: every keystroke re-greets, and an empty field is
// the nameless greeting rather than an empty name.
$("cfg-user-name").addEventListener("input", (event) => {
  const name = event.target.value;
  if (name.trim() === "") {
    chat.removeAttribute("user-name");
  } else {
    chat.userName = name;
  }
});

$("cfg-greeting").addEventListener("change", (event) => {
  if (event.target.value === "") {
    chat.removeAttribute("data-greeting");
  } else {
    chat.setAttribute("data-greeting", event.target.value);
  }
});

$("cfg-theme").addEventListener("change", (event) => {
  chat.setAttribute("theme", event.target.value);
});

// A host's own greeting through the slot: a mark beside the text, which is the
// documented place for one. It replaces the greeting text and nothing else, so
// the starters stay beneath it. Built from the same name field, because a
// slotted greeting is the host's markup and filling it is the host's job.
let slotted = null;
const syncSlot = () => {
  if (slotted === null) {
    return;
  }
  const name = $("cfg-user-name").value.trim();
  slotted.querySelector(".greeting-text").textContent =
    name === "" ? "Good to see you" : `Good to see you, ${name}`;
};
$("cfg-slot").addEventListener("change", (event) => {
  if (event.target.checked) {
    slotted = document.createElement("span");
    slotted.slot = "greeting";
    slotted.className = "greeting-mark";
    slotted.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg><span class="greeting-text"></span>';
    chat.append(slotted);
    syncSlot();
  } else {
    slotted?.remove();
    slotted = null;
  }
});
$("cfg-user-name").addEventListener("input", syncSlot);

// The bar is fixed chrome the widget knows nothing about, and it wraps at
// narrow widths, so publish its height for the placement to subtract -- the
// same answer the playground gives, for the same reason.
const bar = document.querySelector("header.bar");
const publishBarHeight = () => {
  document.documentElement.style.setProperty("--bar-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
};
new ResizeObserver(publishBarHeight).observe(bar);
publishBarHeight();
