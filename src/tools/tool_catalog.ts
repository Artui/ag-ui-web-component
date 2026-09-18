import type { Tool } from "@ag-ui/core";
import { READ_PAGE_TOOL, X_SUMMARY_KEY } from "../constants.js";
import { commaTokens } from "../core/utils.js";
import type { PendingDecision } from "../ui/interrupts/pending_decision.js";
import {
  type QuestionRenderer,
  type QuestionRequest,
  requestQuestion,
} from "../ui/interrupts/question_card.js";
import type { UiStrings } from "../ui/ui_strings.js";
import { type ChatSurface, createChatSurfaceTools } from "./chat_surface_tools.js";
import { type ClientTool, ClientToolRegistry } from "./client_tool_registry.js";
import { createPageActionTools, PAGE_ACTIONS } from "./page_action_tools.js";
import type { PageMap } from "./page_map.js";
import { createPageStateTools, type PageState } from "./page_state.js";
import { parseToolCatalog, type ToolCatalogEntry } from "./parse_tool_catalog.js";
import { createRouteTools, type RouteMap } from "./route_map.js";

/** What the tool catalog needs from the element that owns it. */
export interface ToolCatalogHost {
  /** The custom element: its tool attributes, and the surface the chat tools drive. */
  readonly element: HTMLElement & ChatSurface;
  /** The element's `routeMap`, read per call. */
  readonly routeMap: () => RouteMap;
  /** The element's `navigate`, read per call. */
  readonly navigate: () => ((path: string) => void) | null;
  /** The element's `getPageMap`, read per call. */
  readonly getPageMap: () => (() => PageMap) | null;
  /** The element's `resolvePageTarget`, called per target. */
  readonly resolvePageTarget: (target: string) => HTMLElement | null;
  /** The element's `getTools`, which a host may have replaced. */
  readonly getTools: () => Tool[];
  /** The element's `askUser` flag. */
  readonly askUser: () => boolean;
  /** The element's `askUserRenderer`. */
  readonly askUserRenderer: () => QuestionRenderer | null;
  /** The decision a run is suspended on, which a Stop abandons. */
  readonly decision: PendingDecision;
  /** The current answer group, opening one if none is open. */
  readonly ensureGroup: () => HTMLDivElement;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** Remove the pending indicator if shown. */
  readonly hidePending: () => void;
  /** Update the empty state after the transcript changed. */
  readonly updateEmptyState: () => void;
  /** Keep the transcript at its foot, if the reader is there. */
  readonly follow: () => void;
  /** The fetch options every request the element makes carries. */
  readonly fetchInit: (url: string) => RequestInit | undefined;
}

/**
 * The frontend tools the agent is offered: the host's registered tools, the
 * built-in ones the element's configuration switches on, what the current round
 * advertised, and the server's catalog of labels for the tools it runs itself.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class ToolCatalog {
  readonly #host: ToolCatalogHost;
  /**
   * The server tool catalog fetched from `data-tools-url`, keyed by tool
   * name. Cards label themselves from each entry's `summary`, the base
   * layer behind `toolSummaries`: an explicit entry in `toolSummaries`
   * wins, this fills the rest. Held as whole entries rather than labels so a
   * field the server sent is not lost on the way in. Populated once on connect.
   */
  #toolCatalog: Record<string, ToolCatalogEntry> = {};
  /**
   * The tool names the current round handed the agent, captured as the catalog
   * went out.
   *
   * The registry is mount-wide but `getTools` is per-run, so a host is
   * free to scope what a given page offers — and a call naming a tool this run
   * withheld must not reach the handler that is merely still registered.
   * Snapshotted rather than re-asked at dispatch: a provider is a function, and
   * calling it again asks a question the run already answered, which is exactly
   * the window a scoped catalog exists to close.
   *
   * Empty until the first round advertises, which cannot precede a call: the
   * client builds `RunAgentInput.tools` at the top of every round, before the
   * calls that round produces are executed.
   */
  #advertisedTools: ReadonlySet<string> = new Set();
  readonly #toolRegistry = new ClientToolRegistry();

  constructor(host: ToolCatalogHost) {
    this.#host = host;
  }

  /** The registration behind `AgUiChat.registerTool`, whose doc is the contract. */
  register(tool: ClientTool): void {
    this.#toolRegistry.register(tool);
  }

  /** The binding behind `AgUiChat.registerPageState`, whose doc is the contract. */
  registerPageState(binding: PageState): void {
    for (const tool of createPageStateTools(binding)) {
      this.#toolRegistry.register(tool);
    }
  }

  /** Whether a tool of this name is registered, built-ins aside. */
  has(name: string): boolean {
    return this.#toolRegistry.has(name);
  }

  /** The catalog behind the default `AgUiChat.getTools`, whose doc is the contract. */
  defaultTools(): Tool[] {
    return [
      ...this.#builtinTools().map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      ...this.#toolRegistry.tools(),
    ];
  }

  /**
   * The catalog for the round about to start, remembering what it offered.
   *
   * Every path to a frontend tool goes through here first — the client asks
   * for `RunAgentInput.tools` at the top of each round — so this is the one
   * place that can know what the agent was actually told about.
   */
  advertise(): Tool[] {
    const tools = this.#host.getTools();
    this.#advertisedTools = new Set(tools.map((tool) => tool.name));
    return tools;
  }

  /** Whether the current round offered a tool of this name. */
  wasAdvertised(name: string): boolean {
    return this.#advertisedTools.has(name);
  }

  /** Resolve a tool by name: built-in tools first, then the registry. */
  resolve(name: string): ClientTool | null {
    const builtin = this.#builtinTools().find((t) => t.name === name);
    if (builtin !== undefined) {
      return builtin;
    }
    return this.#toolRegistry.has(name) ? this.#toolRegistry.get(name) : null;
  }

  /** The server catalog's label for a tool, if it sent one. */
  summary(name: string): string | undefined {
    return this.#toolCatalog[name]?.summary;
  }

  /** Fetch the server tool-label catalog from `data-tools-url`, if set. */
  async fetchCatalog(): Promise<void> {
    const url = this.#host.element.getAttribute("data-tools-url");
    if (url === null) {
      return;
    }
    try {
      const response = await fetch(url, this.#host.fetchInit(url));
      this.#toolCatalog = parseToolCatalog(await response.json());
    } catch {
      // Network/parse failure: cards fall back to toolSummaries / raw names.
    }
  }

  /** The built-in `route.*` tools, present only when a route map is set. */
  #routeTools(): ClientTool[] {
    if (this.#host.routeMap().length === 0) {
      return [];
    }
    return createRouteTools(
      () => this.#host.routeMap(),
      () => this.#host.navigate(),
    );
  }

  /**
   * The built-in `read_page` tool, present only when a `getPageMap`
   * provider is set. A *pull* the agent can call mid-turn to see the page after
   * it has acted (the auto-injected context is a send-time snapshot).
   */
  #pageTools(): ClientTool[] {
    const getPageMap = this.#host.getPageMap();
    if (getPageMap === null) {
      return [];
    }
    return [
      {
        name: READ_PAGE_TOOL,
        description:
          "Read the current page's structure (fields, buttons, route). Call after " +
          "acting to observe the result within the same turn.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          [X_SUMMARY_KEY]: "Read the page",
        },
        handler: () => getPageMap(),
      },
    ];
  }

  /**
   * Opt-in page-action tools (`scroll_to` / `drag_and_drop`), enabled per token
   * via the `data-page-actions` attribute (e.g. `"scroll,drag"`). Targets resolve
   * through `resolvePageTarget` so a host controls the agent's interaction
   * surface; absent attribute ⇒ no tools registered.
   */
  #pageActionTools(): ClientTool[] {
    const attr = this.#host.element.getAttribute("data-page-actions");
    if (attr === null) {
      return [];
    }
    const enabled = new Set(commaTokens(attr));
    return [
      ...createPageActionTools(enabled, (target) => this.#host.resolvePageTarget(target)),
      ...(enabled.has(PAGE_ACTIONS.CHAT) ? createChatSurfaceTools(this.#host.element) : []),
    ];
  }

  /** All built-in (route + page + page-action + ask_user) frontend tools. */
  #builtinTools(): ClientTool[] {
    return [
      ...this.#routeTools(),
      ...this.#pageTools(),
      ...this.#pageActionTools(),
      ...this.#askUserTool(),
    ];
  }

  /**
   * The built-in `ask_user` frontend tool, or `[]` when `askUser` is off.
   *
   * The agent calls it, the client executes it locally through the normal
   * frontend-tool path by rendering a {@link requestQuestion} card, and the
   * answer flows back as the tool result. No new protocol.
   */
  #askUserTool(): ClientTool[] {
    if (!this.#host.askUser()) {
      return [];
    }
    return [
      {
        name: "ask_user",
        description:
          "Ask the user a question and wait for their answer. Provide `options` for a " +
          "multiple-choice prompt; set `allow_custom` to also accept a free-text answer.",
        parameters: {
          type: "object",
          properties: {
            question: { type: "string", description: "The question to ask the user." },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Preset choices offered as radio buttons.",
            },
            allow_custom: {
              type: "boolean",
              description: "Allow a free-text answer in addition to any options.",
            },
          },
          required: ["question"],
        },
        handler: (args, callId) => this.#askUser(args, callId),
      },
    ];
  }

  /** Render the `ask_user` question card and resolve with the user's answer. */
  async #askUser(args: Record<string, unknown>, callId: string | undefined): Promise<string> {
    const question = typeof args["question"] === "string" ? args["question"] : "";
    const request: QuestionRequest = { question };
    const rawOptions = args["options"];
    if (Array.isArray(rawOptions)) {
      request.options = rawOptions.filter((option): option is string => typeof option === "string");
    }
    if (args["allow_custom"] === true) {
      request.allowCustom = true;
    }
    // The run is suspended on the card; a Stop aborts the controller, resolving
    // it with an empty answer (the run is then cancelled).
    const signal = this.#host.decision.open();
    this.#host.hidePending();
    // The built-in inline card renders into the current answer group.
    const builtIn = (): Promise<string> =>
      requestQuestion(this.#host.ensureGroup(), request, {
        signal,
        strings: this.#host.strings(),
      });
    // A host-supplied renderer takes full control of the UI.
    const renderer = this.#host.askUserRenderer();
    let answer: string;
    if (renderer === null) {
      answer = await builtIn();
    } else {
      // Awaited here rather than inside a helper, so an answering renderer
      // takes exactly as many turns to be heard as it always did.
      try {
        // Called on the element, as `this.askUserRenderer(...)` always was.
        answer = await renderer.call(this.#host.element, request, { signal });
      } catch (error) {
        answer = await this.#afterRendererFailed(error, signal, callId, builtIn);
      }
    }
    this.#host.decision.close();
    this.#host.updateEmptyState();
    this.#host.follow();
    return answer;
  }

  /**
   * Answer an `ask_user` call whose host renderer threw or rejected instead of
   * answering: put the question to the built-in card.
   *
   * The same answer `approvalRenderer` gets for the same failure, and for the
   * same reason: a renderer is presentation, not a policy. It decides how the
   * question looks, never whether the agent's question is put to the user.
   * Uncaught, the throw escaped the handler, so the call's card settled as an
   * error quoting the host's message, that message went on to the agent as the
   * tool result -- a detail of the host's page, never written for the model --
   * and the pending decision was never closed, so the next Stop, in whatever
   * round, aborted the signal of a wait that had already ended rather than
   * finding nothing open. The built-in card still asks,
   * and the run carries on as if no renderer had been set. Reported the way a
   * failed `render` is, and for the same reason: survived is not the same as
   * findable.
   *
   * Except when the wait was already abandoned. A renderer honouring its signal
   * rejects once a Stop fires it, which is the signal working rather than the
   * renderer failing, and a card drawn then would ask about a run the user just
   * ended. So it resolves with the empty answer the built-in card resolves with
   * on the same abort, and says nothing.
   */
  #afterRendererFailed(
    error: unknown,
    signal: AbortSignal,
    callId: string | undefined,
    builtIn: () => Promise<string>,
  ): Promise<string> {
    if (signal.aborted) {
      return Promise.resolve("");
    }
    // Named by call rather than by question: the model can ask the same thing
    // twice in one turn, and the id is the one thing that tells them apart.
    console.warn(
      `ag-ui-chat: askUserRenderer failed for tool call ${callId}, so the built-in question card asks instead`,
      error,
    );
    return builtIn();
  }
}
