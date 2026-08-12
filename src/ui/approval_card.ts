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
   * Aborting this signal resolves the card as denied, with buttons disabled and
   * `data-resolved="denied"` — how a Stop control dismisses a pending approval.
   */
  signal?: AbortSignal;
  /** Localized strings; defaults to the English {@link DEFAULT_UI_STRINGS}. */
  strings?: UiStrings;
}

/**
 * A fully custom renderer for a server-side-tool approval, set via
 * `AgUiChat.approvalRenderer`. Receives the {@link ApprovalRequest} and an
 * `AbortSignal` that fires when the run is stopped, and resolves `true` to
 * approve or `false` to deny. Replaces the built-in {@link requestApproval}
 * card entirely, the host owning the DOM; to restyle the built-in card instead,
 * use the `strings` and `::part()` seams.
 */
export type ApprovalRenderer = (
  request: ApprovalRequest,
  options: { signal: AbortSignal },
) => Promise<boolean>;

/**
 * Append an inline approval card to `host` and resolve `true` to run a gated
 * server-side tool or `false` to deny it.
 *
 * Distinct from the client-tool confirmation card
 * ({@link requestConfirmation}): a gated server tool defers instead of
 * executing, so the run finishes on an AG-UI interrupt the client answers with
 * `resume[]`, and this is the browser half of that loop. Unlike the
 * confirmation card, this one stays in the transcript as a resolved record,
 * buttons disabled and `data-resolved` set.
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
