import { renderOrWarn } from "../ui/transcript/render_or_warn.js";
import type { ActivityRegistration } from "./activity_registration.js";

/** What the activity registry needs from the element that owns it. */
export interface ActivityRegistryHost {
  /** The current answer group, opening one if none is open. */
  readonly ensureGroup: () => HTMLDivElement;
  /** Update the empty state and follow the foot after the transcript grew. */
  readonly afterTranscriptGrew: () => void;
  /** Append an ambient run notice to the current group. */
  readonly appendNotice: (icon: string, text: string, kind: string) => void;
}

/**
 * The AG-UI activities this element can draw, and the blocks it drew: which
 * `activity_type`s have a renderer, which arrived with none, and the node each
 * drawn activity is on screen as.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class ActivityRegistry {
  readonly #host: ActivityRegistryHost;
  /**
   * Which `activity_type`s this element can draw, by name.
   *
   * A registry rather than a branch because `activity_type` is an open string
   * the protocol does not enumerate. The two built-ins go through it like any
   * host registration, which is the test that the seam is real.
   */
  readonly #activityRenderers = new Map<string, ActivityRegistration>();
  /** Types that arrived with nobody registered to draw them. See {@link unhandledTypes}. */
  readonly #unhandledActivityTypes = new Set<string>();
  /** Chart blocks by activity message id, so an update redraws in place. */
  readonly #activityBlocks = new Map<string, HTMLElement>();

  constructor(host: ActivityRegistryHost) {
    this.#host = host;
  }

  /** The registration behind `AgUiChat.registerActivityRenderer`, whose doc is the contract. */
  register(registration: ActivityRegistration): void {
    this.#activityRenderers.set(registration.type, registration);
    this.#unhandledActivityTypes.delete(registration.type);
  }

  /** Whether a renderer is registered for `activityType`. */
  has(activityType: string): boolean {
    return this.#activityRenderers.has(activityType);
  }

  /** The set behind `AgUiChat.unhandledActivityTypes`, whose doc is the contract. */
  unhandledTypes(): readonly string[] {
    return [...this.#unhandledActivityTypes];
  }

  /** Forget the drawn blocks, with the transcript they were drawn into. */
  clearBlocks(): void {
    this.#activityBlocks.clear();
  }

  /**
   * Draw, replace or remove one activity, whatever kind it is.
   *
   * The single path for all three routes an activity arrives by -- pushed
   * (`onActivity`), patched (`onActivityChanged`) and replayed from history --
   * which is why the renderer contract has to be pure: the same content is
   * drawn again on every thread load.
   *
   * An unregistered type draws nothing and says nothing. That is the protocol's
   * own answer -- a client that does not know a name ignores the event -- and a
   * warning here would fire on every well-behaved forward-compatible server,
   * while a placeholder would put the protocol's growth in the user's face.
   * {@link unhandledTypes} is the way to find out what arrived.
   */
  draw(messageId: string, activityType: string, content: unknown): void {
    const registration = this.#activityRenderers.get(activityType);
    if (registration === undefined) {
      this.#unhandledActivityTypes.add(activityType);
      return;
    }
    const node = renderOrWarn(() => registration.render(content), `activity ${activityType}`);
    if (node === null) {
      this.#remove(messageId, activityType, registration.removedNotice, content);
      return;
    }
    const existing = this.#activityBlocks.get(messageId);
    if (existing === undefined) {
      this.#host.ensureGroup().appendChild(node as HTMLElement);
    } else {
      // Replaced rather than appended: a server redrawing under the same id
      // means *this one changed*, and a second copy below the first would read
      // as two measurements instead of one that moved.
      existing.replaceWith(node);
    }
    this.#activityBlocks.set(messageId, node as HTMLElement);
    this.#host.afterTranscriptGrew();
  }

  /**
   * Take away an activity whose content stopped being drawable.
   *
   * Leaving the old one up is the worst available answer: it shows values that
   * have been retracted, reading as current, and a reload drops it anyway
   * because the *stored* content is the version that could not be drawn. Live
   * and reload should agree, and both should say "gone".
   *
   * Removing is right; doing it in silence was not. A chart that had been drawn
   * simply disappeared, with no `console` call anywhere on the path -- which
   * nobody reports as a bug, they report as "the charts are flaky".
   */
  #remove(
    messageId: string,
    activityType: string,
    notice: string | undefined,
    content: unknown,
  ): void {
    const had = this.#activityBlocks.has(messageId);
    this.#activityBlocks.get(messageId)?.remove();
    this.#activityBlocks.delete(messageId);
    console.warn(
      `ag-ui-chat: activity ${messageId} (${activityType}) was not drawable and has been ` +
        "removed. A chart's points must each be a finite JSON number; a numeric column " +
        "serialised as a string (a Decimal, typically) is rejected rather than coerced.",
      content,
    );
    // Only when something was on screen: content that never drew has no
    // disappearance to explain, and a notice for every rejected push is noise.
    if (had && notice !== undefined) {
      this.#host.appendNotice("\u{1F4C9}", notice, "chart-undrawable");
    }
  }
}
