import { MESSAGE_ROLE, SUBMIT_EVENT } from "./constants.js";
import { STYLES } from "./styles.js";

/** The role a rendered chat message takes. */
export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];

/** `detail` shape of the {@link SUBMIT_EVENT} CustomEvent. */
export interface SubmitDetail {
  readonly content: string;
}

/**
 * `<ag-ui-chat>` — a framework-free chat sidebar Web Component.
 *
 * This skeleton owns the Shadow DOM shell (header, scrolling message list,
 * input row) and emits a {@link SUBMIT_EVENT} when the user sends a message.
 * Later phases attach the AG-UI client, a pluggable tool registry, a DOM
 * driver, and a confirmation modal — all behind this same element.
 *
 * The DOM is built imperatively (no `innerHTML` + `querySelector`) so the
 * element holds direct, always-present references to its parts.
 */
export class AgUiChat extends HTMLElement {
  readonly #root: ShadowRoot;
  readonly #messages: HTMLDivElement;
  readonly #input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#messages = document.createElement("div");
    this.#input = document.createElement("textarea");
    this.#send = document.createElement("button");
  }

  /** The AG-UI endpoint URL, read from the `endpoint` attribute. */
  get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }

  connectedCallback(): void {
    this.#render();
  }

  /** Append a message bubble and return it. */
  appendMessage(role: MessageRole, content: string): HTMLDivElement {
    const bubble = document.createElement("div");
    bubble.className = `message message--${role}`;
    bubble.textContent = content;
    this.#messages.appendChild(bubble);
    this.#messages.scrollTop = this.#messages.scrollHeight;
    return bubble;
  }

  #render(): void {
    const style = document.createElement("style");
    style.textContent = STYLES;

    const chat = document.createElement("div");
    chat.className = "chat";

    const header = document.createElement("div");
    header.className = "header";
    header.textContent = this.getAttribute("title-text") ?? "Assistant";

    this.#messages.className = "messages";

    const inputRow = document.createElement("div");
    inputRow.className = "input-row";

    this.#input.className = "input";
    this.#input.rows = 2;
    this.#input.placeholder = "Ask anything…";
    this.#input.addEventListener("keydown", (event) => this.#onKeydown(event));

    this.#send.className = "send";
    this.#send.type = "button";
    this.#send.textContent = "Send";
    this.#send.addEventListener("click", () => this.#submit());

    inputRow.append(this.#input, this.#send);
    chat.append(header, this.#messages, inputRow);
    this.#root.append(style, chat);
  }

  #onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.#submit();
    }
  }

  #submit(): void {
    const content = this.#input.value.trim();
    if (content === "") {
      return;
    }
    this.appendMessage(MESSAGE_ROLE.USER, content);
    this.#input.value = "";
    this.dispatchEvent(
      new CustomEvent<SubmitDetail>(SUBMIT_EVENT, {
        detail: { content },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
