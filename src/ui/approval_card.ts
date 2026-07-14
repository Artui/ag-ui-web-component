import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** What the inline approval card displays for one server-side-tool interrupt. */
export interface ApprovalRequest {
  /**
   * Human-readable prompt from the AG-UI interrupt (e.g.
   * `Approve delete_thing({…})?`). Falls back to the generic
   * {@link UiStrings.approvalPrompt} when the interrupt carries no message.
   */
  message?: string;
  /** Tool name, surfaced as a `data-tool-name` attribute for styling/tests. */
  toolName?: string;
}

/** Build a labelled action button. */
function actionButton(modifier: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `approval-btn approval-btn--${modifier}`;
  button.setAttribute("part", `approval-button approval-${modifier}`);
  button.textContent = label;
  return button;
}

/** Options for {@link requestApproval}. */
export interface ApprovalOptions {
  /**
   * Aborting this signal resolves the card as **denied** (buttons disabled,
   * `data-resolved="denied"`) — the hook a Stop control uses to dismiss a
   * pending approval when the user cancels the whole run.
   */
  signal?: AbortSignal;
  /** Localized strings; defaults to the English {@link DEFAULT_UI_STRINGS}. */
  strings?: UiStrings;
}

/**
 * Append an inline **approval** card to ``host`` and resolve when the user
 * decides whether a gated *server-side* tool may run.
 *
 * The server-side approval gate is distinct from the client-tool confirmation
 * card ({@link requestConfirmation}): a destructive server tool defers instead
 * of executing, and the run finishes on an AG-UI *interrupt* the client answers
 * with `resume[]`. This card is the browser half of that loop — it reads
 * naturally after the tool-call card whose execution it gates, and resolves
 * ``true`` to approve (run the tool) or ``false`` to deny. The card stays in the
 * transcript as a resolved record (buttons disabled, `data-resolved` set)
 * rather than vanishing.
 */
export function requestApproval(
  host: Node & ParentNode,
  request: ApprovalRequest,
  options: ApprovalOptions = {},
): Promise<boolean> {
  const strings = options.strings ?? DEFAULT_UI_STRINGS;
  return new Promise<boolean>((resolve) => {
    const card = document.createElement("div");
    card.className = "approval";
    card.setAttribute("part", "approval");
    if (request.toolName !== undefined) {
      card.setAttribute("data-tool-name", request.toolName);
    }
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", strings.approveAction);

    const body = document.createElement("div");
    body.className = "approval-body";
    body.setAttribute("part", "approval-body");
    body.textContent = request.message ?? strings.approvalPrompt;

    const actions = document.createElement("div");
    actions.className = "approval-actions";
    actions.setAttribute("part", "approval-actions");

    const deny = actionButton("deny", strings.deny);
    const approve = actionButton("approve", strings.approve);

    let settled = false;
    const close = (approved: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      deny.disabled = true;
      approve.disabled = true;
      card.setAttribute("data-resolved", approved ? "approved" : "denied");
      resolve(approved);
    };

    deny.addEventListener("click", () => close(false));
    approve.addEventListener("click", () => close(true));
    options.signal?.addEventListener("abort", () => close(false), { once: true });

    actions.append(deny, approve);
    card.append(body, actions);
    host.appendChild(card);
    if (options.signal?.aborted === true) {
      // The run was cancelled before the card could ask; record the denial.
      close(false);
      return;
    }
    approve.focus();
  });
}
