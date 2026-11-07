import { afterEach, describe, expect, it } from "vitest";
import { ringColor } from "../src/dom/ring_color.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ringColor without a canvas to measure on", () => {
  it("draws the chat's resolved accent as it is, unmeasured", () => {
    // happy-dom gives no 2d context. With nothing to paint the colours on,
    // contrast cannot be judged, so the ring keeps the accent rather than
    // guessing at a variant.
    const chat = document.createElement("div");
    chat.attachShadow({ mode: "open" });
    chat.style.setProperty("--_accent", "rgb(240, 240, 242)");
    const target = document.createElement("div");
    document.body.append(chat, target);

    expect(document.createElement("canvas").getContext("2d")).toBeNull();
    expect(ringColor(target, chat)).toBe("rgb(240, 240, 242)");
  });
});
