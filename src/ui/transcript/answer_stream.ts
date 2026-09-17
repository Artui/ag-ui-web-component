import { renderMarkdown } from "./render_markdown.js";

/** What the streamed answer needs from the element that owns it. */
export interface AnswerStreamHost {
  /** Append an empty assistant bubble to the transcript, and return it. */
  readonly openBubble: () => HTMLDivElement;
  /** The element's `allowImages`, read per render. */
  readonly allowImages: () => boolean;
  /** Keep the transcript at its foot, if the reader is there. */
  readonly follow: () => void;
}

/**
 * The assistant answer currently streaming: the bubble it streams into, the
 * text the next frame will draw, and how many deltas it arrived in.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class AnswerStream {
  readonly #host: AnswerStreamHost;
  #streamingBubble: HTMLDivElement | null = null;
  // Text deltas applied to the current streaming bubble. >1 ⇒ the message
  // revealed progressively as it streamed, so the word reveal must not re-animate
  // it; ≤1 ⇒ it arrived at once and the word reveal is appropriate.
  #streamDeltas = 0;
  // The accumulated answer the next render will draw. Deltas overwrite it
  // (each one carries the whole answer), so a frame always draws the latest.
  #streamBuffer = "";
  // The frame that render is queued on, or `null` when nothing is queued —
  // also the flag saying a delta is still undrawn.
  #streamFrame: number | null = null;

  constructor(host: AnswerStreamHost) {
    this.#host = host;
  }

  /** Text deltas the current answer has arrived in so far. */
  get deltas(): number {
    return this.#streamDeltas;
  }

  /**
   * Count one delta received. Counted per delta received, not per render: the
   * word reveal asks whether the answer *arrived* progressively, which
   * coalescing renders must not change the answer to.
   */
  countDelta(): void {
    this.#streamDeltas += 1;
  }

  /**
   * Queue a render of the answer so far, at most one per frame.
   *
   * Each `TEXT_MESSAGE_CONTENT` event carries the *whole* accumulated answer,
   * and drawing it means marked + DOMPurify over the entire document and a
   * wholesale replacement of the bubble's subtree. Once per token that is
   * quadratic in the answer's length — a long answer is agent-controlled, so
   * an ordinary run becomes a progressively stalling tab — and every rebuild
   * takes any selection or focus inside the bubble with it.
   *
   * A frame is the right grain: it is the fastest anything on screen can
   * change anyway, so a burst of tokens costs one parse and the text still
   * appears to flow rather than in visible chunks.
   */
  queue(buffer: string): void {
    this.#streamBuffer = buffer;
    this.#open();
    if (this.#streamFrame !== null) {
      return;
    }
    this.#streamFrame = requestAnimationFrame(() => {
      this.#streamFrame = null;
      this.into(this.#streamBuffer);
    });
  }

  /** Render `buffer` into the streaming bubble now, dropping any queued frame. */
  into(buffer: string): HTMLDivElement {
    // A frame still queued would otherwise fire after this and repaint the
    // bubble with whatever the last delta held — behind the buffer just drawn.
    if (this.#streamFrame !== null) {
      cancelAnimationFrame(this.#streamFrame);
      this.#streamFrame = null;
    }
    this.#streamBuffer = buffer;
    const bubble = this.#open();
    bubble.innerHTML = renderMarkdown(buffer, { allowImages: this.#host.allowImages() });
    this.#host.follow();
    return bubble;
  }

  /**
   * Close the current answer's streaming bubble.
   *
   * Draws a queued render first. A run that ends without a text end — a
   * cancel, an error, a round boundary — leaves the last delta sitting in the
   * queue, and simply dropping the bubble here would strand it: the partial
   * answer the user stopped mid-sentence would lose its final tokens, or be an
   * empty bubble above the stopped note.
   */
  end(): void {
    if (this.#streamFrame !== null) {
      this.into(this.#streamBuffer);
    }
    this.#streamingBubble = null;
  }

  /**
   * The bubble the current answer streams into, opening it on first sight.
   *
   * Opened the moment a token arrives rather than on the frame that draws it,
   * so the answer's container replaces the pending dots straight away and the
   * turn never shows a gap while the first render waits for a frame.
   */
  #open(): HTMLDivElement {
    if (this.#streamingBubble === null) {
      this.#streamingBubble = this.#host.openBubble();
      this.#streamDeltas = 0;
    }
    return this.#streamingBubble;
  }
}
