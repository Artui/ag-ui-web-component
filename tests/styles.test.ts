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
});
