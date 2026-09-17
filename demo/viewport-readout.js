// A live readout of the numbers an on-screen keyboard changes, for checking a
// placement on a real phone. Off unless the URL carries `?readout`, so the demo
// looks as it always did; open `/?readout` or `/page/?readout` on the device.
//
// Why it exists: a keyboard shrinks and pans the *visual* viewport while every
// viewport-percentage unit stays put, and mobile browsers draw their own bars
// over part of what is left. None of that is visible from a desktop, and a
// simulator only approximates it, so the only trustworthy numbers are the
// phone's own. The overlay shows them next to what the eye sees, and every
// settled reading is also posted to the demo server, which prints it as one
// line, so a session reading the server log gets the numbers without anyone
// transcribing a screenshot.
//
// Demo only. Nothing here ships: the package publishes dist/ and src/.

const params = new URLSearchParams(location.search);

if (params.has("readout")) {
  start();
}

function start() {
  const chat = document.querySelector("ag-ui-chat");
  const visual = window.visualViewport;

  const box = document.createElement("pre");
  box.setAttribute("aria-hidden", "true");
  Object.assign(box.style, {
    position: "fixed",
    top: "0",
    left: "0",
    margin: "0",
    padding: "4px 6px",
    font: "10px/1.35 ui-monospace, Menlo, monospace",
    color: "#e8ffe8",
    background: "rgba(0, 0, 0, 0.72)",
    // Above the widget, which sits at 2147483000, and never in the way of a
    // tap: the point is to look at the layout while using it.
    zIndex: "2147483647",
    pointerEvents: "none",
    whiteSpace: "pre",
    transformOrigin: "0 0",
  });

  // env() is only readable through a property that takes a length, so a
  // zero-sized fixed probe carries the safe-area insets as padding.
  const probe = document.createElement("div");
  Object.assign(probe.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "0",
    height: "0",
    visibility: "hidden",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
  });
  document.body.append(box, probe);

  let lastEvent = "load";
  let lastPosted = "";
  let postTimer = 0;

  const round = (n) => (typeof n === "number" ? Math.round(n * 10) / 10 : n);
  const rect = (el) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { top: round(r.top), bottom: round(r.bottom), height: round(r.height) };
  };

  const read = () => {
    const root = chat?.shadowRoot;
    const style = chat ? getComputedStyle(chat) : null;
    const probeStyle = getComputedStyle(probe);
    const active = root?.activeElement ?? document.activeElement;
    return {
      route: location.pathname,
      event: lastEvent,
      placement: chat?.getAttribute("placement") ?? "(floating)",
      focused: active ? `${active.tagName.toLowerCase()}.${active.className || ""}` : null,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientHeight: document.documentElement.clientHeight,
      scrollY: round(window.scrollY),
      visual: visual
        ? {
            height: round(visual.height),
            offsetTop: round(visual.offsetTop),
            pageTop: round(visual.pageTop),
            scale: round(visual.scale),
          }
        : null,
      safeArea: {
        top: probeStyle.paddingTop,
        bottom: probeStyle.paddingBottom,
      },
      written: {
        visualViewportHeight: chat?.style.getPropertyValue("--ag-ui-visual-viewport-height") || "",
        visualViewportInsetBottom:
          chat?.style.getPropertyValue("--ag-ui-visual-viewport-inset-bottom") || "",
      },
      panel: rect(root?.querySelector(".chat")),
      header: rect(root?.querySelector(".header")),
      composer: rect(root?.querySelector(".input-row")),
      send: rect(root?.querySelector(".send")),
      hostPosition: style?.position ?? null,
    };
  };

  const render = (r) => {
    const v = r.visual ?? {};
    const line = (label, box) =>
      box ? `${label} top ${box.top}  bottom ${box.bottom}  h ${box.height}` : `${label} -`;
    return [
      `${r.route}  ${r.placement}  on ${r.event}`,
      `inner ${r.innerWidth}x${r.innerHeight}  client h ${r.clientHeight}  scrollY ${r.scrollY}`,
      `visual h ${v.height}  offsetTop ${v.offsetTop}  pageTop ${v.pageTop}  scale ${v.scale}`,
      `safe-area top ${r.safeArea.top}  bottom ${r.safeArea.bottom}`,
      `written vv-height ${r.written.visualViewportHeight || "-"}  inset-bottom ${r.written.visualViewportInsetBottom || "-"}`,
      line("panel   ", r.panel),
      line("header  ", r.header),
      line("composer", r.composer),
      line("send    ", r.send),
      `focus ${r.focused ?? "-"}`,
    ].join("\n");
  };

  const post = (r) => {
    // Only settled readings, and only when something changed: a keyboard
    // animation fires a burst of resize and scroll events, and the log is
    // for the state the eye ends up judging, not the frames on the way.
    const { event: _event, ...state } = r;
    const key = JSON.stringify(state);
    if (key === lastPosted) {
      return;
    }
    lastPosted = key;
    fetch("/viewport-readout/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(r),
    }).catch(() => {});
  };

  const update = (event) => {
    if (event) {
      lastEvent = event.type === "focusin" || event.type === "focusout"
        ? `${event.type}`
        : `${event.target === visual ? "visualViewport." : ""}${event.type}`;
    }
    const r = read();
    // Pinned to the top of the part of the screen that is visible, so it stays
    // readable while the browser pans the page to show the focused field.
    box.style.transform = `translate(${visual?.offsetLeft ?? 0}px, ${visual?.offsetTop ?? 0}px)`;
    box.textContent = render(r);
    clearTimeout(postTimer);
    postTimer = setTimeout(() => post(read()), 400);
  };

  visual?.addEventListener("resize", update);
  visual?.addEventListener("scroll", update);
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", update);
  // A keyboard can finish settling without a final event, and a panel can move
  // after one (the widget re-lays out on its own listener). A slow poll catches
  // the resting state; it is a demo, so the cost does not matter.
  setInterval(() => update(), 700);
  customElements.whenDefined("ag-ui-chat").then(() => update());
}
