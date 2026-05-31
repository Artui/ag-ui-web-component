import { describe, expect, it } from "vitest";
import { STYLES } from "../src/styles.js";

describe("STYLES", () => {
  it("defines the color custom properties on :host", () => {
    for (const name of [
      "--ag-ui-bg",
      "--ag-ui-fg",
      "--ag-ui-accent",
      "--ag-ui-user-bg",
      "--ag-ui-user-fg",
      "--ag-ui-assistant-bg",
      "--ag-ui-border",
      "--ag-ui-radius",
    ]) {
      expect(STYLES).toContain(`${name}:`);
    }
  });

  it("exposes layout as themeable custom properties", () => {
    for (const name of [
      "--ag-ui-width",
      "--ag-ui-height",
      "--ag-ui-inset",
      "--ag-ui-max-width",
      "--ag-ui-max-height",
    ]) {
      expect(STYLES).toContain(`${name}:`);
    }
  });

  it("keeps the default floating bottom-right 380x560 widget", () => {
    expect(STYLES).toContain("--ag-ui-width: 380px;");
    expect(STYLES).toContain("--ag-ui-height: 560px;");
    expect(STYLES).toContain("--ag-ui-inset: auto 24px 24px auto;");
    expect(STYLES).toContain("--ag-ui-radius: 12px;");
  });

  it("drives the layout box from the custom properties", () => {
    expect(STYLES).toContain("inset: var(--ag-ui-inset);");
    expect(STYLES).toContain("width: var(--ag-ui-width);");
    expect(STYLES).toContain("height: var(--ag-ui-height);");
    expect(STYLES).toContain("max-width: var(--ag-ui-max-width);");
    expect(STYLES).toContain("max-height: var(--ag-ui-max-height);");
  });

  it("themes the input and tool-call surfaces (so dark themes work)", () => {
    expect(STYLES).toContain("--ag-ui-input-bg:");
    expect(STYLES).toContain("--ag-ui-tool-bg:");
    expect(STYLES).toContain("background: var(--ag-ui-input-bg);");
    expect(STYLES).toContain("background: var(--ag-ui-tool-bg);");
  });

  it("exposes the surface + embed knobs that make it feel native", () => {
    // Header matches the host surface instead of an accent titlebar.
    expect(STYLES).toContain("--ag-ui-header-bg:");
    expect(STYLES).toContain("--ag-ui-header-fg:");
    expect(STYLES).toContain("background: var(--ag-ui-header-bg);");
    expect(STYLES).toContain("color: var(--ag-ui-header-fg);");
    // Shadow can be dropped for a flush panel.
    expect(STYLES).toContain("--ag-ui-shadow:");
    expect(STYLES).toContain("box-shadow: var(--ag-ui-shadow);");
    // Typography inherits the host by default.
    expect(STYLES).toContain("--ag-ui-font: inherit;");
    expect(STYLES).toContain("font-family: var(--ag-ui-font);");
    // Positioning can switch from floating overlay to in-flow embed.
    expect(STYLES).toContain("--ag-ui-position: fixed;");
    expect(STYLES).toContain("position: var(--ag-ui-position);");
  });
});
