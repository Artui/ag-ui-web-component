import { describe, expect, it } from "vitest";
import { STYLES } from "../src/ui/styles.js";

/**
 * The defaults block never declares a public token on :host — that would set it
 * on the host element and beat anything inherited from an ancestor, which is
 * the bug tests/browser/styles_host_theming.browser.test.ts pins. It declares a
 * private alias that *reads* the public token, with the old default as the
 * var() fallback. So "the token exists" is spelled as "its alias reads it".
 */
function aliasDeclaration(token: string): string {
  return `--_${token.slice("--ag-ui-".length)}: var(${token},`;
}

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
      expect(STYLES).toContain(aliasDeclaration(name));
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
      expect(STYLES).toContain(aliasDeclaration(name));
    }
  });

  it("keeps the default floating bottom-right 380x560 widget", () => {
    expect(STYLES).toContain("--_width: var(--ag-ui-width, 380px);");
    expect(STYLES).toContain("--_height: var(--ag-ui-height, 560px);");
    // The floating margins are added to whatever edges the host reserved, so
    // the default is an expression rather than a literal. The gutter itself is
    // a token because the size cap has to subtract the same one the inset
    // spends -- stating 24 twice is how those two came apart.
    expect(STYLES).toContain("--_edge-gutter: var(--ag-ui-edge-gutter, 24px);");
    expect(STYLES).toContain("auto calc(var(--_edge-gutter) + var(--_viewport-inset-right))");
    expect(STYLES).toContain("--_radius: var(--ag-ui-radius, 12px);");
  });

  it("drives the layout box from the custom properties", () => {
    expect(STYLES).toContain("inset: var(--_inset);");
    expect(STYLES).toContain("width: var(--_width);");
    expect(STYLES).toContain("height: var(--_height);");
    expect(STYLES).toContain("max-width: var(--_max-width);");
    expect(STYLES).toContain("max-height: var(--_max-height);");
  });

  it("themes the input and tool-call surfaces (so dark themes work)", () => {
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-input-bg"));
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-tool-bg"));
    expect(STYLES).toContain("background: var(--_input-bg);");
    expect(STYLES).toContain("background: var(--_tool-bg);");
  });

  it("themes the tool-call card status accents", () => {
    for (const name of ["--ag-ui-tool-fg", "--ag-ui-success", "--ag-ui-danger", "--ag-ui-muted"]) {
      expect(STYLES).toContain(aliasDeclaration(name));
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
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-header-bg"));
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-header-fg"));
    expect(STYLES).toContain("background: var(--_header-bg);");
    expect(STYLES).toContain("color: var(--_header-fg);");
    // Shadow can be dropped for a flush panel.
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-shadow"));
    expect(STYLES).toContain("box-shadow: var(--_shadow);");
    // Typography inherits the host by default.
    expect(STYLES).toContain("--_font: var(--ag-ui-font, inherit);");
    expect(STYLES).toContain("font-family: var(--_font);");
    // Positioning can switch from floating overlay to in-flow embed.
    expect(STYLES).toContain("--_position: var(--ag-ui-position, fixed);");
    expect(STYLES).toContain("position: var(--_position);");
  });

  it("ships dark / auto / code themes that re-set the colour variables", () => {
    expect(STYLES).toContain(':host([theme="dark"])');
    expect(STYLES).toContain("@media (prefers-color-scheme: dark)");
    expect(STYLES).toContain(':host([theme="auto"])');
    expect(STYLES).toContain(':host([theme="code"])');
    // The code theme switches to the monospace font stack.
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-code-font"));
    expect(STYLES).toContain("--_font: var(--ag-ui-font, var(--_code-font));");
  });

  it("drives spacing from variables a density preset overrides", () => {
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-space"));
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-pad"));
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-msg-pad"));
    expect(STYLES).toContain("padding: var(--_pad);");
    expect(STYLES).toContain("gap: var(--_space);");
    expect(STYLES).toContain("padding: var(--_msg-pad);");
    expect(STYLES).toContain(':host([density="compact"])');
  });

  it("collapses to the floating launcher, panel and button morphing as one", () => {
    // The panel leaves on transform + opacity only (no layout animates), and
    // visibility is what takes it out of the tab order once it has gone.
    expect(STYLES).toContain(":host([collapsed]) .chat");
    expect(STYLES).toContain("visibility: hidden;");
    expect(STYLES).toContain(":host([collapsed]) .launcher");
    // The collapsed host box stops swallowing clicks; the launcher takes them.
    expect(STYLES).toContain(":host([collapsed]) {\n  pointer-events: none;");
    expect(STYLES).toContain("pointer-events: auto;");
    // Both halves stay laid out and hide with visibility, so each can animate
    // in *and* out — display:none can do neither.
    expect(STYLES).toContain("visibility: visible;");
  });

  it("keeps the header-bar collapse for the one in-flow placement", () => {
    // A floating circle would escape an embedded widget's host layout, so that
    // placement hides the body and keeps the bar instead.
    const inFlow = ':host([collapsed][placement="embedded"])';
    expect(STYLES).toContain(`${inFlow} .skill-chips`);
    expect(STYLES).toContain(`${inFlow} .skill-palette`);
    expect(STYLES).toContain(`${inFlow} .input-row`);
  });

  it("gives the page placement no collapsed rendering to fall into", () => {
    // The control is hidden, but an attribute written straight onto the element
    // never passes through the guards that hide it -- so the placement has to
    // neutralise the state here, or it would inherit the generic collapse that
    // scales the panel away, under the one placement that hides the launcher.
    expect(STYLES).toContain(':host([placement="page"]) .header-btn--collapse');
    expect(STYLES).toContain(':host([placement="page"][collapsed]) {\n  pointer-events: auto;');
    expect(STYLES).toContain(':host([placement="page"][collapsed]) .chat');
    // And it must not have been left in the in-flow list it used to share.
    // Stated as the shared selector rather than one of its rules: the page
    // placement still has an .input-row rule of its own for the reading column,
    // so the loose form of this assertion passes against the wrong thing.
    expect(STYLES).not.toContain(':is([placement="embedded"], [placement="page"])');
  });

  it("slides the sidebar panel out through the edge it docks against", () => {
    expect(STYLES).toContain(':host([placement="sidebar"][collapsed]) .chat');
    expect(STYLES).toContain("transform: translateX(100%);");
    expect(STYLES).toContain(':host([placement="sidebar"][data-side="left"][collapsed]) .chat');
    expect(STYLES).toContain("transform: translateX(-100%);");
  });

  it("times every transition from one motion token, which reduced motion zeroes", () => {
    expect(STYLES).toContain("--_motion: var(--ag-ui-motion, 0.28s);");
    expect(STYLES).toContain("--_motion: var(--ag-ui-motion, 0.001s);");
  });

  it("animates the chat-history drawer in and out from its hidden attribute", () => {
    // The closed drawer keeps its box so both halves stay transitionable;
    // visibility is what takes the subtree out of hit testing and the a11y tree.
    expect(STYLES).toContain("transition: visibility var(--_motion) var(--_ease);");
    expect(STYLES).toContain(".drawer[hidden] .drawer-panel");
    expect(STYLES).toContain(".drawer[hidden] .drawer-backdrop");
  });

  it("badges the launcher with what arrived while it was collapsed", () => {
    expect(STYLES).toContain(".launcher-badge {");
    expect(STYLES).toContain(".launcher-badge[hidden]");
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-badge-bg"));
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-badge-size"));
    // A ring in the widget's own background is what separates the badge from
    // the launcher under it, whatever the host themes either one to be.
    expect(STYLES).toContain("box-shadow: 0 0 0 2px var(--_bg);");
  });

  it("builds the composer as one surface with a circular send button", () => {
    expect(STYLES).toContain(".composer {");
    expect(STYLES).toContain(".composer:focus-within");
    expect(STYLES).toContain(".composer-tools");
    // Icon-only send: a circle sized by its own token, glyph swapped by state.
    expect(STYLES).toContain("width: var(--_send-size);");
    expect(STYLES).toContain('.send[data-state="idle"] .send-stop');
    expect(STYLES).toContain('.send[data-state="running"] .send-send');
    // The field grows with its content up to a ceiling, then scrolls.
    expect(STYLES).toContain("max-height: var(--_composer-max-height);");
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
    expect(STYLES).toContain("--_z-index: var(--ag-ui-z-index, auto);");
    expect(STYLES).toContain("--_position: var(--ag-ui-position, static);");
  });

  it("page placement centres a reading column capped by a content-width var", () => {
    expect(STYLES).toContain(':host([placement="page"])');
    expect(STYLES).toContain(aliasDeclaration("--ag-ui-content-max-width"));
    // The column is produced by symmetric auto padding on the scroll area.
    expect(STYLES).toContain("max(var(--_pad), calc((100% - var(--_content-max-width)) / 2))");
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
      expect(STYLES).toContain(aliasDeclaration(name));
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
      expect(STYLES).toContain(aliasDeclaration(name));
    }
    expect(STYLES).toContain("content: var(--_tool-icon-done)");
    // The spinner speed is driven by the tunable duration var.
    expect(STYLES).toContain("ag-ui-tool-spin var(--_tool-spin-duration)");
    // The spin honours reduced motion.
    expect(STYLES).toContain("prefers-reduced-motion: reduce");
  });

  it("selects tool-display modes from the host attribute, not a per-card copy", () => {
    // This is what makes data-tool-display reactive the way data-answer-well
    // is: flip it on the host and cards already on screen re-read it. Selecting
    // on a value stamped onto each card at construction reached only the ones
    // built afterwards.
    expect(STYLES).toContain(':host([data-tool-display="inline"]) .tool-call');
    expect(STYLES).toContain(':host([data-tool-display="compact"]) .tool-call');
    expect(STYLES).toContain(':host([data-tool-display="minimal"]) .tool-call');
    // Default (no attribute) is the full mode: args visible, result collapsed.
    expect(STYLES).toContain('.tool-call[data-expanded="false"] .tool-call-section--result');
  });

  it("labels and separates the two payload regions on a tool card", () => {
    expect(STYLES).toContain(".tool-call-section-label");
    expect(STYLES).toContain(".tool-call-body");
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

/**
 * Structural guards on the public-token → private-alias indirection.
 *
 * The conversion was ~180 mechanical rewrites in one 1800-line template
 * literal, and a missed one does not error: the public name resolves to
 * nothing, the whole declaration is dropped, and a colour quietly goes
 * missing. These assertions are what makes that failure loud, and what keeps a
 * new rule from reaching for a public name out of habit.
 */
describe("STYLES token indirection", () => {
  /** The stylesheet with CSS comments stripped, so prose is not mistaken for code. */
  const code = STYLES.replace(/\/\*[\s\S]*?\*\//g, "");
  /** The base defaults block: everything up to the end of the first :host rule. */
  const defaults = code.slice(code.indexOf(":host {"), code.indexOf("}", code.indexOf(":host {")));

  it("never declares a public token, which is what broke ancestor theming", () => {
    // A :host declaration sets the property on the host element, and an
    // element's own value always beats one inherited from an ancestor. Every
    // token declared here is a token a host page cannot theme from a wrapper.
    const declared = [...code.matchAll(/^\s*(--ag-ui-[a-z0-9-]+):/gm)].map((m) => m[1]);
    expect(declared).toEqual([]);
  });

  it("reads every public token only inside its own alias declaration", () => {
    const stray = code
      .split("\n")
      .filter((line) => line.includes("var(--ag-ui-"))
      // The internal per-word channel is written by reveal_words as an inline
      // style on each span; it is plumbing, not a theming token, and has no
      // alias by design.
      .filter((line) => !line.includes("var(--ag-ui-word-index"))
      .filter((line) => !/^\s*--_([a-z0-9-]+): var\(--ag-ui-\1[,)]/.test(line));
    expect(stray).toEqual([]);
  });

  it("declares every alias it uses in the defaults block", () => {
    // Aliases inherit like any custom property. An alias used but not declared
    // on :host would pick up a same-named property from the host page's own
    // CSS; declaring it here shields the shadow tree from that.
    const used = new Set([...code.matchAll(/var\(\s*(--_[a-z0-9-]+)/g)].map((m) => m[1]));
    const declared = new Set([...defaults.matchAll(/^\s*(--_[a-z0-9-]+):/gm)].map((m) => m[1]));
    expect([...used].filter((name) => !declared.has(name))).toEqual([]);
    expect([...declared].filter((name) => !used.has(name))).toEqual([]);
  });

  it("gives every alias, wherever it is set, a public token to read", () => {
    // Including the theme, density and placement blocks. If one of those set
    // its alias directly, the built-in preset would outrank an explicit page
    // rule — the opposite of today's cascade, where a shadow :host rule loses
    // to any outer-tree rule regardless of specificity.
    const direct = [...code.matchAll(/^\s*(--_[a-z0-9-]+): (.*);$/gm)]
      .map(([, name, value]) => `${name}: ${value}`)
      .filter((declaration) => {
        const [name, value] = declaration.split(": ", 2);
        return !value?.startsWith(`var(--ag-ui-${name?.slice(3)},`);
      });
    expect(direct).toEqual([]);
  });
});
