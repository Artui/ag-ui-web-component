/** What the inline confirmation card displays. */
export interface ConfirmationRequest {
  toolName: string;
  args: Record<string, unknown>;
  /**
   * Human-readable prompt (from the tool's `x-confirm` metadata), e.g.
   * "Activate this project?". Falls back to a generic `Run "<tool>"?`.
   */
  message?: string;
}

/** Build a labelled action button. */
function actionButton(modifier: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `confirm-btn confirm-btn--${modifier}`;
  button.textContent = label;
  return button;
}

/** Options for {@link requestConfirmation}. */
export interface ConfirmationOptions {
  /**
   * Aborting this signal resolves the card as declined (buttons disabled,
   * `data-resolved="declined"`) — the hook a Stop control uses to dismiss a
   * pending confirmation when the user cancels the whole run.
   */
  signal?: AbortSignal;
}

/**
 * Append an inline confirmation card to ``host`` (the chat message list) and
 * resolve when the user decides.
 *
 * Unlike a modal overlay, the card lives in the transcript right where the
 * action is — it reads naturally after the assistant's explanation and never
 * steals focus from the page. Resolves ``true`` on confirm, ``false`` on
 * cancel. The card stays in the transcript as a resolved record (buttons
 * disabled, `data-resolved` set) rather than vanishing.
 */
export function requestConfirmation(
  host: Node & ParentNode,
  request: ConfirmationRequest,
  options: ConfirmationOptions = {},
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const card = document.createElement("div");
    card.className = "confirm";
    card.setAttribute("data-tool-name", request.toolName);
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", "Confirm action");

    const body = document.createElement("div");
    body.className = "confirm-body";
    body.textContent = request.message ?? `Run “${request.toolName}”?`;

    const args = document.createElement("pre");
    args.className = "confirm-args";
    args.textContent = JSON.stringify(request.args, null, 2);

    const actions = document.createElement("div");
    actions.className = "confirm-actions";

    const cancel = actionButton("cancel", "Cancel");
    const confirm = actionButton("confirm", "Confirm");

    let settled = false;
    const close = (accepted: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      cancel.disabled = true;
      confirm.disabled = true;
      card.setAttribute("data-resolved", accepted ? "confirmed" : "declined");
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
