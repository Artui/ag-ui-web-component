import { describe, expect, it } from "vitest";
import { STYLES } from "../src/ui/styles.js";

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

  it("themes the tool-call card status accents", () => {
    for (const name of ["--ag-ui-tool-fg", "--ag-ui-success", "--ag-ui-danger", "--ag-ui-muted"]) {
      expect(STYLES).toContain(`${name}:`);
    }
    // Status pill colour keys off the card's data-status attribute.
    expect(STYLES).toContain('.tool-call[data-status="done"] .tool-call-status');
    expect(STYLES).toContain('.tool-call[data-status="error"] .tool-call-status');
    // Collapsible result body and its disclosure toggle exist.
    expect(STYLES).toContain(".tool-call-result");
    expect(STYLES).toContain(".tool-call-toggle");
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

  it("ships dark / auto / code themes that re-set the colour variables", () => {
    expect(STYLES).toContain(':host([theme="dark"])');
    expect(STYLES).toContain("@media (prefers-color-scheme: dark)");
    expect(STYLES).toContain(':host([theme="auto"])');
    expect(STYLES).toContain(':host([theme="code"])');
    // The code theme switches to the monospace font stack.
    expect(STYLES).toContain("--ag-ui-code-font:");
    expect(STYLES).toContain("--ag-ui-font: var(--ag-ui-code-font);");
  });

  it("drives spacing from variables a density preset overrides", () => {
    expect(STYLES).toContain("--ag-ui-space:");
    expect(STYLES).toContain("--ag-ui-pad:");
    expect(STYLES).toContain("--ag-ui-msg-pad:");
    expect(STYLES).toContain("padding: var(--ag-ui-pad);");
    expect(STYLES).toContain("gap: var(--ag-ui-space);");
    expect(STYLES).toContain("padding: var(--ag-ui-msg-pad);");
    expect(STYLES).toContain(':host([density="compact"])');
  });

  it("collapses to just the header — hiding the body incl. skill surfaces", () => {
    expect(STYLES).toContain(":host([collapsed]) .skill-chips");
    expect(STYLES).toContain(":host([collapsed]) .skill-palette");
    expect(STYLES).toContain(":host([collapsed]) .input-row");
    // Edge-docked placements unpin the bottom so they shrink when collapsed.
    expect(STYLES).toContain(':host([collapsed][placement="side"])');
  });

  it("animates incoming text (fade + word) and respects reduced motion", () => {
    expect(STYLES).toContain(':host([data-text-animation="fade"]) .message--assistant');
    expect(STYLES).toContain(".message--assistant .word");
    expect(STYLES).toContain("--ag-ui-word-index");
    expect(STYLES).toContain("prefers-reduced-motion: reduce");
    // Rehydrated history is excluded from the fade entrance animation.
    expect(STYLES).toContain(".message--assistant:not(.message--restored)");
  });

  it("offers placement presets, with embedded dropping the stacking context", () => {
    expect(STYLES).toContain(':host([placement="bottom-left"])');
    expect(STYLES).toContain(':host([placement="side"])');
    expect(STYLES).toContain(':host([placement="full"])');
    expect(STYLES).toContain(':host([placement="embedded"])');
    // Embedded fixes the z-index overlay clash.
    expect(STYLES).toContain("--ag-ui-z-index: auto;");
    expect(STYLES).toContain("--ag-ui-position: static;");
  });

  it("page placement centres a reading column capped by a content-width var", () => {
    expect(STYLES).toContain(':host([placement="page"])');
    expect(STYLES).toContain("--ag-ui-content-max-width:");
    // The column is produced by symmetric auto padding on the scroll area.
    expect(STYLES).toContain(
      "max(var(--ag-ui-pad), calc((100% - var(--ag-ui-content-max-width)) / 2))",
    );
    // In page mode the assistant well uses the full column width.
    expect(STYLES).toContain(':host([placement="page"]) .message--assistant');
    // The skill chips, palette/hint, and upload tray align to the same column.
    expect(STYLES).toContain(':host([placement="page"]) .skill-chips');
    expect(STYLES).toContain(':host([placement="page"]) .attachment-tray');
    expect(STYLES).toContain(':host([placement="page"]) .skill-palette');
    expect(STYLES).toContain(':host([placement="page"]) .skill-hint');
  });

  it("groups each assistant turn in an .answer well that is opt-in", () => {
    // The grouping container always exists…
    expect(STYLES).toContain(".answer {");
    // …but the bordered well only draws under the data-answer-well opt-in.
    expect(STYLES).toContain(":host([data-answer-well]) .answer");
    for (const name of ["--ag-ui-well-bg", "--ag-ui-well-border"]) {
      expect(STYLES).toContain(`${name}:`);
    }
  });

  it("draws the tool-call status icon from CSS (spinner + themeable glyphs)", () => {
    // The icon element is styled, not text — a spinning ring while pending.
    expect(STYLES).toContain(".tool-call-icon");
    expect(STYLES).toContain('.tool-call[data-status="pending"] .tool-call-icon');
    expect(STYLES).toContain("@keyframes ag-ui-tool-spin");
    // Settled glyphs come from overridable vars.
    for (const name of [
      "--ag-ui-tool-icon-done",
      "--ag-ui-tool-icon-error",
      "--ag-ui-tool-icon-declined",
      "--ag-ui-tool-spin-duration",
    ]) {
      expect(STYLES).toContain(`${name}:`);
    }
    expect(STYLES).toContain("content: var(--ag-ui-tool-icon-done)");
    // The spinner speed is driven by the tunable duration var.
    expect(STYLES).toContain("ag-ui-tool-spin var(--ag-ui-tool-spin-duration)");
    // The spin honours reduced motion.
    expect(STYLES).toContain("prefers-reduced-motion: reduce");
  });

  it("strips the box chrome in inline tool-display mode", () => {
    expect(STYLES).toContain('.tool-call[data-display="inline"]');
  });

  it("styles the collapsible thoughts region and pulses it while streaming", () => {
    expect(STYLES).toContain(".thoughts");
    expect(STYLES).toContain(".thoughts-toggle");
    expect(STYLES).toContain(".thoughts-body");
    // The streaming pulse keys off data-streaming and respects reduced motion.
    expect(STYLES).toContain(".thoughts[data-streaming] .thoughts-label");
    expect(STYLES).toContain("@keyframes ag-ui-thoughts-pulse");
    expect(STYLES).toContain("prefers-reduced-motion: reduce");
  });

  it("styles the mic button with a recording state that respects reduced motion", () => {
    expect(STYLES).toContain(".voice-btn");
    expect(STYLES).toContain('.voice-btn[data-state="recording"]');
    expect(STYLES).toContain("@keyframes ag-ui-voice-pulse");
  });
});
