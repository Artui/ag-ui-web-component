// Wiring for the page-context prototype. Every look comes from the URL, so the
// screenshot script visits one address per cell:
//   ?theme=classic&scheme=dark&placement=sidebar&pos=tools&run=where
import { defineAgUiChat } from "/bundle.js";

const params = new URLSearchParams(window.location.search);
const $ = (id) => document.getElementById(id);
const chat = $("chat");

const theme = params.get("theme") ?? "";
const scheme = params.get("scheme") ?? "light";
const placement = params.get("placement") ?? "floating";
document.documentElement.dataset.scheme = scheme;
document.body.dataset.placement = placement;

const words = [theme, scheme === "light" ? "" : scheme].filter((word) => word !== "");
if (words.length > 0) {
  chat.setAttribute("theme", words.join(" "));
}
chat.setAttribute("placement", placement);
chat.setAttribute("data-place-position", params.get("pos") ?? "tools");
if (placement === "embedded") {
  document.querySelector("main").append(chat);
}
if (params.get("collapsed") === "1") {
  chat.removeAttribute("data-start-open");
  chat.setAttribute("collapsed", "");
}
// A host's own content in the above-composer slot, to judge the two together.
if (params.get("slot") === "1") {
  const banner = document.createElement("div");
  banner.slot = "above-composer";
  banner.className = "host-banner";
  banner.textContent = "Read-only: this order has shipped.";
  chat.append(banner);
}
try {
  sessionStorage.clear();
  localStorage.clear();
} catch {
  // happy to run without storage
}

// The host's notion of where the user is: the record and the tab on screen.
let tab = "Shipping";
const long = params.get("long") === "1";
function place() {
  return {
    label: long ? "Order #4821 for Ada Lovelace, Analytical Engines Ltd" : "Order #4821",
    detail: `${tab} tab`,
    href: `/orders/4821/${tab.toLowerCase()}`,
  };
}

defineAgUiChat();
if (params.get("source") === "route") {
  // No place provider: the route map's matching route stands in.
  history.replaceState(null, "", `/orders/4821/${window.location.search}`);
  chat.routeMap = [
    { id: "order", path: "/orders/:pk/", title: "Order detail", group: "Orders" },
    { id: "orders", path: "/orders/", title: "Orders" },
  ];
} else if (params.get("source") !== "none") {
  chat.getPlace = place;
}
chat.refreshPlace();

// Switching tabs is an in-page navigation the element cannot see: the host
// says so, as a router would after it moves.
for (const button of document.querySelectorAll("[data-tab]")) {
  button.addEventListener("click", () => {
    tab = button.dataset.tab;
    for (const other of document.querySelectorAll("[data-tab]")) {
      other.setAttribute("aria-selected", String(other === button));
    }
    chat.refreshPlace();
  });
}

// Show what actually rode in the run's context, beside the chip.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("/agent/") && typeof init?.body === "string") {
    const body = JSON.parse(init.body);
    const entry = (body.context ?? []).find((c) => /Where in the application/.test(c.description));
    $("told").textContent = entry === undefined ? "no place entry" : JSON.stringify(JSON.parse(entry.value), null, 2);
  }
  return realFetch(input, init);
};

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

(async () => {
  await settle();
  const root = chat.shadowRoot;
  if (params.get("excluded") === "1") {
    root.querySelector(".place-toggle")?.click();
  }
  const run = params.get("run");
  if (run === "where") {
    await chat.sendMessage("Where am I?");
  }
  document.body.dataset.ready = "1";
})();
