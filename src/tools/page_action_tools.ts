import { X_SUMMARY_KEY } from "../constants.js";
import { scrollIntoCenterView } from "../dom/animations.js";
import type { ClientTool } from "./client_tool_registry.js";

/**
 * Resolve a page-action target string to a host-page element, or `null` when it
 * matches nothing. The default (`document.querySelector`) treats the string as a
 * CSS selector; a host with a page map overrides it to map its own element ids,
 * the same way host packages wrap the DOM-driver primitives with environment-
 * aware lookups.
 */
export type ResolvePageTarget = (target: string) => HTMLElement | null;

/** The built-in page-action tool tokens, opted in via `data-page-actions`. */
export const PAGE_ACTIONS = {
  SCROLL: "scroll",
  DRAG: "drag",
} as const;

/**
 * The opt-in page-action tools selected by `enabled` (a set of
 * {@link PAGE_ACTIONS} tokens), bound to a {@link ResolvePageTarget}.
 *
 * - `scroll_to` — scroll a target (`top` / `bottom` / a resolver target) into
 *   view. Benign; no confirmation.
 * - `drag_and_drop` — drag one element onto another, firing the standard HTML5
 *   drag sequence so the host page's own drop handler reacts. Not stamped
 *   destructive: a drag rearranges transient state and the durable change
 *   happens at the page's explicit commit. A host whose page persists *on drop*
 *   gates it with the element's `confirmPredicate`.
 *
 * Both report a clean, model-readable error when a target resolves to nothing,
 * rather than throwing an opaque crash.
 */
export function createPageActionTools(
  enabled: ReadonlySet<string>,
  resolveTarget: ResolvePageTarget,
): ClientTool[] {
  const tools: ClientTool[] = [];
  if (enabled.has(PAGE_ACTIONS.SCROLL)) {
    tools.push(scrollTool(resolveTarget));
  }
  if (enabled.has(PAGE_ACTIONS.DRAG)) {
    tools.push(dragTool(resolveTarget));
  }
  return tools;
}

function scrollTool(resolveTarget: ResolvePageTarget): ClientTool {
  return {
    name: "scroll_to",
    description:
      "Scroll a target into view. `target` is `top`, `bottom`, or a CSS " +
      "selector / page-map element id. Read-only: it changes nothing on the page.",
    parameters: {
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"],
      [X_SUMMARY_KEY]: "Scroll into view",
    },
    handler: (args) => {
      const target = String(args["target"] ?? "");
      if (target === "top" || target === "bottom") {
        const top = target === "top" ? 0 : document.body.scrollHeight;
        window.scrollTo({ top, behavior: "smooth" });
        return { scrolled: true, target };
      }
      const element = resolveTarget(target);
      if (element === null) {
        throw new Error(`no element matching "${target}"`);
      }
      scrollIntoCenterView(element);
      return { scrolled: true, target };
    },
  };
}

function dragTool(resolveTarget: ResolvePageTarget): ClientTool {
  return {
    name: "drag_and_drop",
    description:
      "Drag the `from` element onto the `to` element (CSS selectors or page-map " +
      "element ids), firing the page's native drag-and-drop. Use for reordering " +
      "sortable lists. The page decides what the drop commits.",
    parameters: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
      required: ["from", "to"],
      [X_SUMMARY_KEY]: "Drag and drop",
    },
    handler: (args) => {
      const fromTarget = String(args["from"] ?? "");
      const toTarget = String(args["to"] ?? "");
      const from = resolveTarget(fromTarget);
      if (from === null) {
        throw new Error(`no element matching "${fromTarget}"`);
      }
      const to = resolveTarget(toTarget);
      if (to === null) {
        throw new Error(`no element matching "${toTarget}"`);
      }
      dispatchDragSequence(from, to);
      return { dragged: true, from: fromTarget, to: toTarget };
    },
  };
}

/**
 * Fire the standard HTML5 drag sequence — `dragstart` on the source, then
 * `dragenter` / `dragover` / `drop` on the target, then `dragend` on the source —
 * sharing one {@link DataTransfer}. Dispatched as typed, bubbling events (the
 * `dataTransfer` is attached explicitly so a drop handler reads it in every
 * environment).
 */
function dispatchDragSequence(from: HTMLElement, to: HTMLElement): void {
  const dataTransfer = new DataTransfer();
  fire(from, "dragstart", dataTransfer);
  fire(to, "dragenter", dataTransfer);
  fire(to, "dragover", dataTransfer);
  fire(to, "drop", dataTransfer);
  fire(from, "dragend", dataTransfer);
}

function fire(target: HTMLElement, type: string, dataTransfer: DataTransfer): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer: DataTransfer;
  };
  event.dataTransfer = dataTransfer;
  target.dispatchEvent(event);
}
