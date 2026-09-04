import { X_SUMMARY_KEY } from "../constants.js";
import type { ClientTool } from "./client_tool_registry.js";

/** Every corner the panel can be sent to, in the order the schema states them. */
export const CHAT_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

/** A corner the panel can be sent to. */
export type ChatCorner = (typeof CHAT_CORNERS)[number];

/** What the agent is told about the surface it is speaking from. */
export interface ChatSurfaceReport {
  /** The placement in force, or `null` when the host set none. */
  readonly placement: string | null;
  /** Whether the panel is currently at its launcher. */
  readonly collapsed: boolean;
  /** Whether this placement has a collapsed state at all. */
  readonly collapsible: boolean;
  /** Whether the panel can be moved, or the placement owns its position. */
  readonly movable: boolean;
  /**
   * Whether this page allows the panel to be moved at all.
   *
   * Reported apart from {@link ChatSurfaceReport.movable} only because the two
   * reasons a move is refused call for different sentences: a host that turned
   * dragging off is not the placement owning the position, and telling the
   * user the second when the first is true is a plain falsehood.
   */
  readonly draggable: boolean;
  /** Whether the panel currently covers the whole viewport. */
  readonly fullBleed: boolean;
  /** The panel's box, in viewport coordinates. */
  readonly box: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  /**
   * The part of the viewport the panel may rest in.
   *
   * With an origin, because it is not always the screen's: a host can reserve
   * the edges its own chrome occupies, and an agent reasoning about the room
   * to the left of `box.left` would otherwise be mixing two coordinate frames
   * without being told there were two.
   */
  readonly viewport: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
}

/** Whether a string names one of the four corners. */
export function isChatCorner(value: string): value is ChatCorner {
  return (CHAT_CORNERS as readonly string[]).includes(value);
}

/**
 * The part of the widget these tools drive.
 *
 * A narrow port rather than the element itself, because the element imports
 * this module to build its own tools and importing it back would be a cycle.
 * It also says exactly what the agent is allowed to reach, which is a shorter
 * list than the element's public surface.
 */
export interface ChatSurface {
  describeSurface(): ChatSurfaceReport;
  /**
   * `announce` writes a notice into the transcript with an undo beside it.
   * The tools always pass it: a panel that rearranges itself mid-conversation
   * has to say so, and a host driving the same method is arranging its own
   * page and needs no telling.
   */
  moveTo(corner: ChatCorner, options?: { readonly announce?: boolean }): boolean;
  setCollapsed(collapsed: boolean, options?: { readonly announce?: boolean }): void;
}

/**
 * Tools that let the agent move the panel it is speaking from.
 *
 * This is the affordance nobody else can offer: every other assistant's chat
 * is a surface of its own, so there is nothing for it to be in the way *of*.
 * Ours is mounted in the page the user is working in, which is what makes
 * "let me move this aside so you can see the table" a sentence the agent can
 * act on rather than apologise for.
 *
 * **They report what happened, not what was asked.** A full-bleed panel on a
 * phone has nowhere to move to, and a placement that places itself owns its
 * position -- so `move_chat` answers `moved: false` with the reason and what
 * would work instead, rather than returning success on a panel that did not
 * budge. The same rule the page actions already follow: a tool reports that it
 * fired, not that it worked.
 *
 * `read_chat_surface` exists so the agent can ask before it acts rather than
 * discovering the answer through a failure. It is deliberately a tool and not
 * ambient context: a snapshot the agent chose to take is honest about being
 * one, and it needs no channel that does not already exist.
 */
export function createChatSurfaceTools(surface: ChatSurface): ClientTool[] {
  return [
    {
      name: "read_chat_surface",
      description:
        "Describe the chat panel you are speaking from: its placement, whether it is " +
        "collapsed, whether it can be moved, and the box it occupies. Read this before " +
        "moving or minimising yourself, since a full-screen panel has nowhere to move to. " +
        "Read-only.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        [X_SUMMARY_KEY]: "Read the chat's own position",
      },
      handler: () => surface.describeSurface(),
    },
    {
      name: "move_chat",
      description:
        "Move your own panel to a corner, to uncover something the user needs to see. " +
        "`corner` is top-left, top-right, bottom-left or bottom-right. Answers " +
        "`moved: false` with a reason when the placement owns its position or the panel " +
        "fills the screen; check `read_chat_surface` first, and prefer minimise_chat when " +
        "there is nowhere to move to.",
      parameters: {
        type: "object",
        properties: {
          corner: {
            type: "string",
            enum: [...CHAT_CORNERS],
          },
        },
        required: ["corner"],
        [X_SUMMARY_KEY]: "Move the chat out of the way",
      },
      handler: (args) => {
        const asked = String(args["corner"] ?? "");
        const report = surface.describeSurface();
        // Checked, not cast. `required` is advisory and a model can answer
        // with a corner that does not exist; `moveTo` would then match none of
        // its edge tests, send the panel bottom-right, and this would report
        // success for the corner it was asked for -- so the agent tells the
        // user it moved the chat somewhere it did not.
        if (!isChatCorner(asked)) {
          return {
            moved: false,
            reason: `"${asked}" is not a corner; use one of ${CHAT_CORNERS.join(", ")}`,
          };
        }
        if (!report.movable) {
          // Named rather than thrown: this is a fact about the surface the
          // agent can act on -- minimise instead -- not a malformed call.
          return {
            moved: false,
            reason: report.fullBleed
              ? "the panel fills the screen, so there is nowhere to move it to"
              : report.draggable === false
                ? "this page has turned off moving the panel"
                : `the "${report.placement ?? ""}" placement owns the panel's position`,
            suggestion: report.collapsible ? "minimise_chat" : null,
          };
        }
        return { moved: surface.moveTo(asked, { announce: true }), corner: asked };
      },
    },
    {
      name: "minimise_chat",
      description:
        "Collapse your own panel to its launcher, so the user can see the whole page. " +
        "The launcher stays visible and reopens it. Answers `minimised: false` when the " +
        "placement has no collapsed state, which is the case for a full-page chat.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        [X_SUMMARY_KEY]: "Minimise the chat",
      },
      handler: () => {
        const report = surface.describeSurface();
        if (!report.collapsible) {
          return {
            minimised: false,
            reason: "this placement has no collapsed state, so there is no launcher to return to",
          };
        }
        surface.setCollapsed(true, { announce: true });
        return { minimised: true };
      },
    },
    {
      name: "restore_chat",
      description: "Open your own panel again after minimising it.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        [X_SUMMARY_KEY]: "Restore the chat",
      },
      handler: () => {
        // No notice: the user can see the panel come back, and a notice about
        // something visibly happening is noise.
        surface.setCollapsed(false);
        return { restored: true };
      },
    },
  ];
}
