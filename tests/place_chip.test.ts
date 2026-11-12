import { describe, expect, it } from "vitest";
import { PlaceChip } from "../src/ui/place/place_chip.js";
import { DEFAULT_UI_STRINGS, mergeUiStrings } from "../src/ui/ui_strings.js";

/** The chip on its own: what it draws, what it sends, and the exclusion's key. */

function mounted(): PlaceChip {
  const chip = new PlaceChip();
  chip.mount(new AbortController().signal, DEFAULT_UI_STRINGS);
  return chip;
}

function toggle(chip: PlaceChip): HTMLButtonElement {
  return chip.element.querySelector(".place-toggle") as HTMLButtonElement;
}

describe("PlaceChip", () => {
  it("is hidden and sends nothing until a place is read", () => {
    const chip = mounted();
    expect(chip.element.hidden).toBe(true);
    expect(chip.context()).toEqual([]);
    expect(chip.withheld).toBe(false);
  });

  it("ignores a press with no place to withhold", () => {
    const chip = mounted();
    toggle(chip).click();
    chip.update({ label: "Orders" });
    expect(chip.withheld).toBe(false);
    expect(chip.element.hasAttribute("data-excluded")).toBe(false);
  });

  it("draws a pin without an icon, and the host's image with one", () => {
    const chip = mounted();
    chip.update({ label: "Orders" });
    const icon = chip.element.querySelector(".place-icon");
    expect(icon?.querySelector("svg")).not.toBeNull();
    chip.update({ label: "Orders", icon: "/static/orders.svg" });
    expect(icon?.querySelector("img")?.getAttribute("src")).toBe("/static/orders.svg");
    expect(icon?.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("sends the label, and the detail and href only when set, never the icon", () => {
    const chip = mounted();
    chip.update({ label: "Orders", icon: "/static/orders.svg" });
    expect(chip.context()).toEqual([{ description: "place", value: '{"label":"Orders"}' }]);
    chip.update({ label: "Order", detail: "Sales", href: "/orders/7/" });
    expect(JSON.parse(chip.context()[0]?.value ?? "null")).toEqual({
      label: "Order",
      detail: "Sales",
      href: "/orders/7/",
    });
  });

  it("titles itself and its toggle from the strings it was mounted with", () => {
    const chip = new PlaceChip();
    chip.mount(
      new AbortController().signal,
      mergeUiStrings({ placeShared: "Sent: {label}", placeWithheld: "Kept: {label}" }),
    );
    chip.update({ label: "Orders" });
    expect(chip.element.title).toBe("Sent: Orders");
    expect(toggle(chip).title).toBe("Stop sharing this page");
    toggle(chip).click();
    expect(chip.element.title).toBe("Kept: Orders");
    expect(toggle(chip).getAttribute("aria-label")).toBe("Share this page again");
  });

  it("keeps the exclusion across a read of no place", () => {
    const chip = mounted();
    chip.update({ label: "Orders", href: "/orders/" });
    toggle(chip).click();
    chip.update(null);
    expect(chip.withheld).toBe(false);
    expect(chip.element.hidden).toBe(true);
    chip.update({ label: "Orders", href: "/orders/" });
    expect(chip.withheld).toBe(true);
  });

  it("keys on the href when there is one, whatever the label says", () => {
    const chip = mounted();
    chip.update({ label: "Order #7", href: "/orders/7/" });
    toggle(chip).click();
    chip.update({ label: "Order #7 (edited)", href: "/orders/7/" });
    expect(chip.withheld).toBe(true);
    chip.update({ label: "Order #7 (edited)", href: "/orders/8/" });
    expect(chip.withheld).toBe(false);
  });

  it("stops answering the toggle once its connection ends", () => {
    const connection = new AbortController();
    const chip = new PlaceChip();
    chip.mount(connection.signal, DEFAULT_UI_STRINGS);
    chip.update({ label: "Orders" });
    connection.abort();
    toggle(chip).click();
    expect(chip.withheld).toBe(false);
  });
});
