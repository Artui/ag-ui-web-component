/** What the confirmation modal displays. */
export interface ConfirmationRequest {
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Render a confirmation modal into ``host`` and resolve when the user decides.
 *
 * Resolves ``true`` if the user confirms, ``false`` if they cancel or dismiss
 * via the backdrop. The modal is appended to ``host`` (the chat container
 * inside the element's shadow root) and removed once resolved.
 */
export function requestConfirmation(
  host: Node & ParentNode,
  request: ConfirmationRequest,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const dialog = document.createElement("div");
    dialog.className = "modal";

    const title = document.createElement("div");
    title.className = "modal-title";
    title.textContent = "Confirm action";

    const body = document.createElement("div");
    body.className = "modal-body";
    body.textContent = `Run “${request.toolName}”?`;

    const args = document.createElement("pre");
    args.className = "modal-args";
    args.textContent = JSON.stringify(request.args, null, 2);

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const cancel = document.createElement("button");
    cancel.className = "modal-btn modal-btn--cancel";
    cancel.type = "button";
    cancel.textContent = "Cancel";

    const confirm = document.createElement("button");
    confirm.className = "modal-btn modal-btn--confirm";
    confirm.type = "button";
    confirm.textContent = "Run";

    const close = (accepted: boolean): void => {
      overlay.remove();
      resolve(accepted);
    };

    cancel.addEventListener("click", () => close(false));
    confirm.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close(false);
      }
    });

    actions.append(cancel, confirm);
    dialog.append(title, body, args, actions);
    overlay.append(dialog);
    host.appendChild(overlay);
    confirm.focus();
  });
}
