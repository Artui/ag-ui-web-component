// Playground wiring for the live demo. Registers the admin-style frontend tools
// the mock agent drives (fill_field / select_option / toggle_checkbox /
// click_save) using the component's animated DOM primitives, seeds a skill
// catalog (chips + `/` palette), and wires the header controls so every
// config — theme / density / placement / text-animation / tool-display — flips
// live by setting an attribute on the element (no page reload).
import {
  THREAD_EVENT,
  defineAgUiChat,
  fillField,
  pressButton,
  selectControl,
  showHighlightOverlay,
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

// The rating pair is opt-in, and set before the definition upgrades the
// element so a reload draws the restored answers with it too -- rating one of
// those is half of what the readout is for.
const ratings = sessionStorage.getItem("demo:ratings") === "1";
if (ratings) {
  chat.setAttribute("data-message-actions", "copy,retry,feedback");
  $("cfg-ratings").checked = true;
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
// The theme attribute is two words, a name and a scheme, so the two pickers
// compose it. The header toggle flips the scheme word on its own, so the
// scheme picker follows the attribute back.
const SCHEMES = ["light", "dark", "auto"];
const applyTheme = () => {
  const value = [$("cfg-theme").value, $("cfg-scheme").value].filter(Boolean).join(" ");
  if (value === "") {
    chat.removeAttribute("theme");
  } else {
    chat.setAttribute("theme", value);
  }
};
$("cfg-theme").addEventListener("change", applyTheme);
$("cfg-scheme").addEventListener("change", applyTheme);
new MutationObserver(() => {
  const words = (chat.getAttribute("theme") ?? "").split(/\s+/);
  const scheme = words.find((word) => SCHEMES.includes(word)) ?? "";
  $("cfg-scheme").value = scheme === "light" ? "" : scheme;
  $("cfg-theme").value = words.find((word) => !SCHEMES.includes(word) && word !== "") ?? "";
}).observe(chat, { attributes: true, attributeFilter: ["theme"] });
bind("cfg-density", "density");
bind("cfg-placement", "placement");
bind("cfg-text", "data-text-animation");
bind("cfg-tools", "data-tool-display");
// How an opened group draws its calls; read only while Tool cards is grouped.
bind("cfg-group-tools", "data-tool-group-display");

// Absent is a value of its own here: it is what leaves the greeting to the
// placement's default, on for page and off everywhere else.
$("cfg-greeting").addEventListener("change", (event) => {
  if (event.target.value === "") {
    chat.removeAttribute("data-greeting");
  } else {
    chat.setAttribute("data-greeting", event.target.value);
  }
});

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

// The question card needs the built-in ask_user tool offered to the agent.
chat.askUser = true;

// This mock server honours `editedArgs` in the resume payload, so the approval
// cards offer the arguments for editing. Against a server that ignores them
// this stays off: the component cannot see the capability.
chat.approveWithEdits = true;

// The well is a boolean attribute (presence = on), so toggle rather than set.
$("cfg-well").addEventListener("change", (event) => {
  chat.toggleAttribute("data-answer-well", event.target.checked);
});

// The accent recipe from the README, set on the element as a host would. The
// header buttons follow the header text, and grouped tool names the tool token.
const ACCENT_RECIPE = {
  "--ag-ui-header-bg": "#3d5afe",
  "--ag-ui-header-fg": "#ffffff",
  "--ag-ui-launcher-bg": "#3d5afe",
  "--ag-ui-launcher-fg": "#ffffff",
  "--ag-ui-tool-fg": "#3d5afe",
};
$("cfg-accent-recipe").addEventListener("change", (event) => {
  for (const [token, value] of Object.entries(ACCENT_RECIPE)) {
    if (event.target.checked) {
      chat.style.setProperty(token, value);
    } else {
      chat.style.removeProperty(token);
    }
  }
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

$("cfg-ratings").addEventListener("change", (event) => {
  sessionStorage.setItem("demo:ratings", event.target.checked ? "1" : "0");
  window.location.reload();
});

// What a host files a rating under. The ids are shortened to their tails,
// which is where the mock server's fresh ids differ.
chat.addEventListener("ag-ui-feedback", (event) => {
  const { rating, messageId, threadId, runId } = event.detail;
  const tail = (id) => id.slice(-6);
  $("cfg-ratings-out").textContent =
    `${rating} msg ${tail(messageId)} thread ${tail(threadId)} ` +
    (runId === undefined ? "no run" : `run ${tail(runId)}`);
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

// A slow conversation store, for looking at what happens while a stored
// conversation loads. The built-in store answers in a microtask, so nothing a
// person does can land in that window; a server-backed one (data-threads-url)
// costs a round trip on every restore. With the box ticked, every load the
// element asks for -- reload(), a thread picked from the drawer -- waits three
// seconds first. Type and press Send in that time: the turn queues as "Waiting
// to send" and goes out under the restored conversation. Open the checkpoint
// panel and pick a run: the composer says it is still loading.
//
// Patched onto the store object the element holds now, and again whenever the
// element is handed a new one (a user-key change rebuilds it), so it is checked
// before each use rather than once.
let slowLoads = false;
const SLOW = Symbol("slow");
const slowStore = () => {
  const store = chat.conversationStore;
  if (store[SLOW]) {
    return;
  }
  const load = store.loadMessages.bind(store);
  store.loadMessages = async (threadId) => {
    if (slowLoads) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    return load(threadId);
  };
  store[SLOW] = true;
};
$("cfg-slow-store").addEventListener("change", (event) => {
  slowLoads = event.target.checked;
  slowStore();
});

// A host's prompt fired as a restore starts, as one fired on mount would be.
// It waits for the conversation, then sends under it, and says what
// sendMessage resolved to: true once it sent, false if New chat, a thread
// switch or another reload came while it waited.
$("cfg-restore-send").addEventListener("click", () => {
  slowStore();
  const out = $("cfg-restore-out");
  out.textContent = "waiting...";
  void chat.reload();
  void chat.sendMessage("/ping").then((sent) => {
    out.textContent = `sent: ${sent}`;
  });
});

// What a collapsed panel becomes. auto is the attribute's absence. Under none
// the widget is hidden while collapsed, so the page shows a toolbar of its own
// whose button drives the public API, and anchors the panel to that button.
// The connect-time ag-ui-toggle is what a real host labels its button from;
// switching here on a live element sends none, so the label is set directly.
const hostBar = $("host-bar");
const hostAgent = $("host-agent");
const labelHostAgent = () => {
  hostAgent.setAttribute("aria-pressed", String(!chat.collapsed));
};
$("cfg-collapse-to").addEventListener("change", (event) => {
  const value = event.target.value;
  // "none-corner" is none with no anchor: the panel stands in its own corner,
  // and the host bar's button is still the way back.
  const target = value === "none-corner" ? "none" : value;
  if (target === "") {
    chat.removeAttribute("collapse-to");
  } else {
    chat.setAttribute("collapse-to", target);
  }
  hostBar.hidden = target !== "none";
  const header = value === "none-header" || value === "none-header-left";
  hostBar.toggleAttribute("data-edge", header);
  if (header) {
    hostBar.setAttribute("data-edge", "top");
  }
  hostBar.toggleAttribute("data-align", value === "none-header-left");
  if (value === "none-header-left") {
    hostBar.setAttribute("data-align", "left");
  }
  if (value === "none" || header) {
    chat.setAttribute("anchor", "#host-agent");
  } else {
    chat.removeAttribute("anchor");
  }
  publishChatBar();
  labelHostAgent();
});
$("cfg-anchor-side").addEventListener("change", (event) => {
  const value = event.target.value;
  if (value === "") {
    chat.removeAttribute("anchor-side");
  } else {
    chat.setAttribute("anchor-side", value);
  }
});
$("cfg-min-page").addEventListener("change", (event) => {
  const value = event.target.value;
  if (value === "") {
    chat.style.removeProperty("--ag-ui-min-page-width");
  } else {
    chat.style.setProperty("--ag-ui-min-page-width", value);
  }
});
chat.addEventListener("ag-ui-maximize", (event) => {
  $("cfg-maximized").textContent = `maximized: ${event.detail.maximized}`;
});
hostAgent.addEventListener("click", () => {
  chat.toggleCollapsed();
});
chat.addEventListener("ag-ui-toggle", labelHostAgent);

// The page's share of the bottom edge: the widget's bar height under bar, and
// the host toolbar's own under none. The widget never pads the page itself.
const publishChatBar = () => {
  const atTop = hostBar.hasAttribute("data-edge");
  const height = hostBar.hidden
    ? chat.barHeight
    : atTop
      ? 0
      : hostBar.getBoundingClientRect().height;
  const top = !hostBar.hidden && atTop ? hostBar.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty("--chat-header-height", `${Math.ceil(top)}px`);
  document.documentElement.style.setProperty("--chat-bar-height", `${Math.ceil(height)}px`);
};
chat.addEventListener("ag-ui-bar-height", publishChatBar);

// A dragged size outlives the tab now, which is confusing when you are
// flipping placements to compare handles. resetSize() drops it and its stored
// copy from both stores; the drag no longer writes the public size tokens, so
// removing those inline would do nothing.
$("cfg-reset-size").addEventListener("click", () => {
  chat.resetSize();
});

// The host's own move, beside what the report says about it. Under bar or
// none a corner panel moves on a wide viewport, and Reset size above sends it
// back to the dock; on a phone-width window it reports movable: false.
$("cfg-move").addEventListener("click", () => {
  const moved = chat.moveTo("top-left");
  const { movable, draggable } = chat.describeSurface();
  $("cfg-move-out").textContent = `moved: ${moved}, movable: ${movable}, draggable: ${draggable}`;
});

// Extend the transcript's select-then-quote gesture to the whole page, so the
// article copy and the form labels can be asked about the same way an answer
// can. One call: the guards that make it bearable -- no offer for a selection
// inside a form field, none for the widget's own transcript, and it retires
// itself on scroll -- are the component's, not the demo's.
chat.offerQuoteInPage();

$("save").addEventListener("click", () => {
  $("banner").classList.add("show");
});

// The config bar is sticky chrome the widget knows nothing about, and it wraps
// to two rows at narrow widths, so its height is not a constant the stylesheet
// could carry. Publish it and let the placement rules subtract it: without
// this, the fixed placements start at the top of the viewport and the bar sits
// on the chat's own header -- the widget still works, but its title and
// controls are behind the thing that is meant to be driving it.
//
// A real host with fixed chrome has the same problem and, for now, the same
// answer: measure your own bar and hand the widget what is left.
const bar = document.querySelector("header.bar");
const publishBarHeight = () => {
  document.documentElement.style.setProperty("--bar-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
};
new ResizeObserver(publishBarHeight).observe(bar);
publishBarHeight();

// The overlay highlight, which is the one affordance you cannot judge from a
// test: whether a dimmed page with a hole in it reads as "look here" or as a
// modal nobody opened. Inert, so the form underneath stays usable while it is
// up -- try typing into the title field without dismissing it.
$("cfg-spotlight").addEventListener("click", () => {
  const dismiss = showHighlightOverlay(document.querySelector(".card"), {
    scrim: true,
    gradient: true,
  });
  setTimeout(dismiss, 4000);
});

// ── The 0.47.0 additions card ────────────────────────────────────────────────

// The above-composer slot: host markup, filled and emptied live. It is a real
// control rather than static markup so the "takes no space when empty" half of
// the contract can be looked at too.
let aboveStrip = null;
$("cfg-above").addEventListener("change", (event) => {
  if (event.target.checked) {
    aboveStrip = document.createElement("div");
    aboveStrip.slot = "above-composer";
    aboveStrip.className = "context-strip";
    aboveStrip.innerHTML =
      "<span>Context: <b>Create Article</b>, 4 fields</span><button type=\"button\">Attach form</button>";
    aboveStrip.querySelector("button").addEventListener("click", () => {
      void chat.sendMessage("Summarize the current values of the article form.");
    });
    chat.append(aboveStrip);
    $("cfg-above-out").textContent = "filled";
  } else {
    aboveStrip?.remove();
    aboveStrip = null;
    $("cfg-above-out").textContent = "empty";
  }
});

// The place chip. The select stands in for the host's router: changing it
// changes what getPlace returns and calls refreshPlace(), as an app would
// after a pushState. A page map rides too, so withholding the place can be
// seen to withhold the page in the mock agent's answer.
const PLACES = {
  article: { label: "Create Article", detail: "Articles", href: "/articles/add/" },
  billing: { label: "Billing settings", detail: "Account", href: "/settings/billing/" },
  long: {
    label:
      "Purchase order #48213 for Northwind Traders International Holdings, shipping to Rotterdam",
    detail: "Procurement, awaiting approval",
    href: "/procurement/orders/48213/",
  },
  none: null,
};
chat.getPlace = () => PLACES[$("cfg-place").value] ?? null;
chat.getPageMap = () => ({ form: "article", fields: ["title", "slug", "status", "featured"] });
const syncPlaceReadout = () => {
  const place = chat.getPlace();
  $("cfg-place-out").textContent = place === null ? "no chip" : place.label;
};
$("cfg-place").addEventListener("change", () => {
  chat.refreshPlace();
  syncPlaceReadout();
});
$("cfg-place-ask").addEventListener("click", () => {
  void chat.sendMessage("Where am I?");
});
// Set after the element connected, so the first read is asked for here.
chat.refreshPlace();
syncPlaceReadout();

// The thread API. threadId and running are read off the element on every
// event and on a short tick (running changes with no thread event), the
// picker lists what the conversation store holds, and the log shows the last
// few ag-ui-thread events as they fire.
const tail = (value) => (value === null || value === undefined ? "null" : String(value).slice(-6));
const syncThreadReadout = () => {
  $("thr-id").textContent = chat.threadId === null ? "null" : tail(chat.threadId);
  $("thr-running").textContent = String(chat.running);
};
// Rebuilt only when what it lists changed: replacing the options of a select
// that is open closes it under the pointer.
let pickerSignature = "";
const refreshThreadPicker = async () => {
  const pick = $("thr-pick");
  const threads = await chat.conversationStore.listThreads();
  const signature = JSON.stringify([chat.threadId, threads.map((t) => [t.threadId, t.title, t.preview])]);
  if (signature === pickerSignature) {
    return;
  }
  pickerSignature = signature;
  pick.replaceChildren(new Option("(stored threads)", ""));
  for (const thread of threads) {
    const label = `${tail(thread.threadId)} ${thread.title ?? thread.preview ?? ""}`.trim();
    pick.append(new Option(thread.threadId === chat.threadId ? `${label} (on screen)` : label, thread.threadId));
  }
};
chat.addEventListener(THREAD_EVENT, (event) => {
  const { threadId, previousThreadId, reason } = event.detail;
  const item = document.createElement("li");
  item.textContent = `${reason}: ${tail(previousThreadId)} -> ${tail(threadId)}`;
  const log = $("thr-log");
  log.prepend(item);
  while (log.children.length > 5) {
    log.lastElementChild.remove();
  }
  syncThreadReadout();
  void refreshThreadPicker();
});
$("thr-new").addEventListener("click", () => {
  chat.newChat();
});
$("thr-pick").addEventListener("change", (event) => {
  const target = event.target.value;
  if (target !== "") {
    void chat.switchThread(target);
  }
});
$("thr-reload").addEventListener("click", () => {
  void chat.reload();
});
// Messages sent land a thread in the store without a thread event, and
// running changes with none either, so both readouts also tick.
setInterval(() => {
  syncThreadReadout();
  void refreshThreadPicker();
}, 600);
syncThreadReadout();
void refreshThreadPicker();

// The tool status parts. ::part() takes no attribute selector, so each status
// is its own part name, and one rule per name is the whole of the host's side.
// The sheet is added to and removed from this document, which is where a host's
// ::part() rules live.
const CARD_STATUSES = {
  pending: "#2563eb",
  deferred: "#d97706",
  done: "#059669",
  error: "#dc2626",
  declined: "#7c3aed",
  interrupted: "#6b7280",
};
const GROUP_STATES = {
  waiting: "#d97706",
  running: "#2563eb",
  done: "#059669",
  error: "#dc2626",
};
const statusSheet = () =>
  [
    ...Object.entries(CARD_STATUSES).flatMap(([name, color]) => [
      `ag-ui-chat::part(tool-card-${name}) { outline: 2px solid ${color}; outline-offset: -2px; }`,
      `ag-ui-chat::part(tool-card-status-${name}) { background: ${color}; color: #fff; border-radius: 999px; }`,
    ]),
    ...Object.entries(GROUP_STATES).map(
      ([name, color]) =>
        `ag-ui-chat::part(tool-group-${name}) { box-shadow: inset 4px 0 0 ${color}; }`,
    ),
  ].join("\n");
const legend = $("status-legend");
for (const [name, color] of Object.entries(CARD_STATUSES)) {
  legend.append(Object.assign(document.createElement("span"), { textContent: `card ${name}` }));
  legend.lastElementChild.style.setProperty("--swatch", color);
}
for (const [name, color] of Object.entries(GROUP_STATES)) {
  legend.append(Object.assign(document.createElement("span"), { textContent: `group ${name}` }));
  legend.lastElementChild.style.setProperty("--swatch", color);
}
let statusStyle = null;
$("cfg-status-parts").addEventListener("change", (event) => {
  if (event.target.checked) {
    statusStyle = document.createElement("style");
    statusStyle.textContent = statusSheet();
    document.head.append(statusStyle);
  } else {
    statusStyle?.remove();
    statusStyle = null;
  }
});

// What the transcript carries right now, counted from the parts themselves:
// the census is the readout, so a card that lost its status part shows up here
// rather than only as a missing colour.
const census = () => {
  const counts = new Map();
  for (const el of chat.shadowRoot.querySelectorAll("[part]")) {
    for (const name of el.getAttribute("part").split(/\s+/)) {
      const card = /^tool-card-status-(\w+)$/.exec(name);
      const group = /^tool-group-(waiting|running|done|error)$/.exec(name);
      const key = card ? `card ${card[1]}` : group ? `group ${group[1]}` : null;
      if (key !== null) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  $("status-census").textContent =
    counts.size === 0
      ? "no tool cards yet"
      : [...counts].map(([key, count]) => `${key} ${count}`).join(", ");
};
new MutationObserver(census).observe(chat.shadowRoot, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["part"],
});
census();

// The focus ring token. It is set on the element, which is where a host sets
// it; the readout reads the value back and says whether a head is showing it.
const applyRing = () => {
  if ($("cfg-ring-on").checked) {
    chat.style.setProperty("--ag-ui-ring", $("cfg-ring").value);
    $("cfg-ring-out").textContent = $("cfg-ring").value;
  } else {
    chat.style.removeProperty("--ag-ui-ring");
    $("cfg-ring-out").textContent = "default";
  }
};
$("cfg-ring-on").addEventListener("change", applyRing);
$("cfg-ring").addEventListener("input", () => {
  $("cfg-ring-on").checked = true;
  applyRing();
});
$("cfg-ring-focus").addEventListener("click", () => {
  const head = chat.shadowRoot.querySelector(".tool-group-head");
  if (head === null) {
    $("cfg-ring-out").textContent = "no step group yet: run Fill the article";
    return;
  }
  chat.setCollapsed(false);
  head.focus({ focusVisible: true });
  const outline = getComputedStyle(head).outlineStyle;
  $("cfg-ring-out").textContent = `${$("cfg-ring-on").checked ? $("cfg-ring").value : "default"}, outline ${outline}`;
});

// The header buttons' hover square, set on the element as a host would.
const applyHeaderHover = () => {
  if ($("cfg-hover-on").checked) {
    chat.style.setProperty("--ag-ui-header-btn-hover", $("cfg-hover").value);
    $("cfg-hover-out").textContent = $("cfg-hover").value;
  } else {
    chat.style.removeProperty("--ag-ui-header-btn-hover");
    $("cfg-hover-out").textContent = "default";
  }
};
$("cfg-hover-on").addEventListener("change", applyHeaderHover);
$("cfg-hover").addEventListener("input", () => {
  $("cfg-hover-on").checked = true;
  applyHeaderHover();
});
