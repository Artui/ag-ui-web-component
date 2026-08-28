import { beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The stylesheet reaches the shadow root without an inline `<style>`.
 *
 * A host with a strict `style-src` and no `'unsafe-inline'` -- a bank, a health
 * or government deployment, anyone who has been through a CSP audit -- drops an
 * injected `<style>` element silently. The component mounted, functioned, and
 * rendered completely unstyled, with nothing in the console to point at.
 * `adoptedStyleSheets` carries no inline-style origin and is unaffected.
 *
 * These live in the Chromium project because happy-dom cannot decide either
 * assertion: it neither enforces an inline-style origin nor resolves the
 * cascade, so a green run there would be compatible with the shadow root having
 * no styles at all. Same reason as the sanitisation and host-theming tests.
 *
 * The CSP header itself is not asserted -- a meta policy applied after the
 * runner's own page has loaded would not apply retroactively, and would take the
 * runner down with it. What is asserted is the property the policy acts on: no
 * inline `<style>` exists to be dropped, and the rules that replaced it are
 * live in the cascade rather than merely attached.
 */

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  document.body.append(el);
  return el;
}

describe("the shadow stylesheet under a strict style-src", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  it("injects no inline style element", () => {
    const el = mount();

    // querySelectorAll, not children: a <style> nested anywhere in the tree is
    // dropped by the same policy as one at the root.
    expect(el.shadowRoot?.querySelectorAll("style")).toHaveLength(0);
  });

  it("carries the stylesheet on adoptedStyleSheets instead", () => {
    const el = mount();

    const sheets = el.shadowRoot?.adoptedStyleSheets ?? [];
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.cssRules.length).toBeGreaterThan(0);
  });

  it("resolves those rules in the cascade, not merely attaches them", () => {
    // Attaching a sheet and having it apply are different claims, and only the
    // second is what a user sees. Read a resolved value off a real element.
    const el = mount();

    const panel = el.shadowRoot?.querySelector(".chat");
    expect(panel).not.toBeNull();
    expect(getComputedStyle(panel as Element).position).not.toBe("static");
  });

  it("gives each instance its own sheet, so two mounts cannot share state", () => {
    // The package forbids module-level singletons precisely so instances cannot
    // interfere. A shared sheet would be the cheaper implementation.
    const first = mount();
    const second = mount();

    expect(first.shadowRoot?.adoptedStyleSheets[0]).not.toBe(
      second.shadowRoot?.adoptedStyleSheets[0],
    );
  });
});
