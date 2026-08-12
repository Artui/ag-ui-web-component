import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** What the inline confirmation card displays. */
export interface ConfirmationRequest {
  toolName: string;
  args: Record<string, unknown>;
  /**
   * Human-readable prompt (from the tool's `x-confirm` metadata), e.g.
   * "Activate this project?". Falls back to the generic `confirmRun` template.
   */
  message?: string;
}

/** Build a labelled action button. */
function actionButton(modifier: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `confirm-btn confirm-btn--${modifier}`;
  button.setAttribute("part", `confirm-button confirm-${modifier}`);
  button.textContent = label;
  return button;
}

/** Options for {@link requestConfirmation}. */
export interface ConfirmationOptions {
  /**
   * Aborting this signal resolves the card as declined, with buttons disabled
   * and `data-resolved="declined"` — how a Stop control dismisses a pending
   * confirmation.
   */
  signal?: AbortSignal;
  /** Localized strings; defaults to the English {@link DEFAULT_UI_STRINGS}. */
  strings?: UiStrings;
}

/**
 * Append an inline confirmation card to `host` (the chat message list) and
 * resolve `true` on confirm, `false` on cancel.
 *
 * The card lives in the transcript rather than in a modal overlay, so it reads
 * after the assistant's explanation and never steals focus from the page.
 *
 * Answering it removes it: the record of the decision belongs to the tool card
 * this gates, which settles to `done` or `declined` and carries it. A spent
 * form left in place reads as still outstanding.
 */
export function requestConfirmation(
  host: Node & ParentNode,
  request: ConfirmationRequest,
  options: ConfirmationOptions = {},
): Promise<boolean> {
  const strings = options.strings ?? DEFAULT_UI_STRINGS;
  return new Promise<boolean>((resolve) => {
    const card = document.createElement("div");
    card.className = "confirm";
    card.setAttribute("part", "confirm");
    card.setAttribute("data-tool-name", request.toolName);
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", strings.confirmAction);

    const body = document.createElement("div");
    body.className = "confirm-body";
    body.setAttribute("part", "confirm-body");
    body.textContent = request.message ?? strings.confirmRun.replace("{tool}", request.toolName);

    const args = document.createElement("pre");
    args.className = "confirm-args";
    args.setAttribute("part", "confirm-args");
    args.textContent = JSON.stringify(request.args, null, 2);
    // A call with no arguments rendered the string "{}" in a box of its own.
    args.hidden = Object.keys(request.args).length === 0;

    const actions = document.createElement("div");
    actions.className = "confirm-actions";
    actions.setAttribute("part", "confirm-actions");

    const cancel = actionButton("cancel", strings.cancel);
    const confirm = actionButton("confirm", strings.confirm);

    let settled = false;
    const close = (accepted: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      // The prompt leaves once it has been answered. What stays is the tool
      // card next to it, which settles to the outcome and scrolls with the rest
      // of the transcript -- a record of the action rather than a spent form
      // sitting there as a standing reminder of one.
      card.remove();
      resolve(accepted);
    };

    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    options.signal?.addEventListener("abort", () => close(false), { once: true });

    actions.append(cancel, confirm);
    card.append(body, args, actions);
    host.appendChild(card);
    if (options.signal?.aborted === true) {
      // The run was cancelled before the card could ask; record the decline.
      close(false);
      return;
    }
    confirm.focus();
  });
}
