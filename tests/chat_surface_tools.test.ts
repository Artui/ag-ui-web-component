import { beforeEach, describe, expect, it } from "vitest";
import { X_DESTRUCTIVE_KEY } from "../src/constants.js";
import {
  CHAT_CORNERS,
  type ChatCorner,
  type ChatSurface,
  type ChatSurfaceReport,
  createChatSurfaceTools,
} from "../src/tools/chat_surface_tools.js";

/**
 * The tools the agent uses to move the panel it is speaking from.
 *
 * Driven against a stand-in surface rather than a mounted element, because
 * what is under test here is the decision each tool makes -- whether to act,
 * and what to say when it does not -- not the geometry underneath it. The
 * element's own half is measured in the browser project, where it can be.
 *
 * The stand-in mirrors the element's real contract: `moveTo` reports whether
 * it moved. A double that always answered true would make every test here
 * agree with a tool that claims a move it never made, which is the exact
 * failure these are written to prevent.
 */

function makeSurface(overrides: Partial<ChatSurfaceReport> = {}) {
  const calls: string[] = [];
  const report: ChatSurfaceReport = {
    placement: "floating",
    collapsed: false,
    collapsible: true,
    movable: true,
    draggable: true,
    fullBleed: false,
    box: { left: 100, top: 100, width: 380, height: 560 },
    viewport: { left: 0, top: 0, width: 1280, height: 800 },
    ...overrides,
  };
  const surface: ChatSurface = {
    describeSurface: () => report,
    // The options are recorded, not discarded. `announce` is what separates a
    // move the agent made -- which owes the user a notice and a way back --
    // from the same call by a host arranging its own page, and a double that
    // drops the argument leaves that distinction held by nothing at all.
    moveTo: (corner: ChatCorner, options) => {
      calls.push(`moveTo:${corner}:${options?.announce === true}`);
      return report.movable;
    },
    setCollapsed: (collapsed: boolean, options) => {
      calls.push(`setCollapsed:${collapsed}:${options?.announce === true}`);
    },
  };
  return { surface, calls, tools: createChatSurfaceTools(surface) };
}

function tool(tools: ReturnType<typeof createChatSurfaceTools>, name: string) {
  const found = tools.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`no ${name} tool`);
  }
  return found;
}

describe("chat surface tools", () => {
  let built: ReturnType<typeof makeSurface>;

  beforeEach(() => {
    built = makeSurface();
  });

  it("offers exactly the four the agent needs, and no writer it did not ask for", () => {
    expect(built.tools.map((t) => t.name)).toEqual([
      "read_chat_surface",
      "move_chat",
      "minimise_chat",
      "restore_chat",
    ]);
  });

  it("reports the surface without touching it", async () => {
    const result = await tool(built.tools, "read_chat_surface").handler({});

    expect(result).toMatchObject({ placement: "floating", movable: true, fullBleed: false });
    expect(built.calls).toEqual([]);
  });

  it("moves to the corner it was asked for", async () => {
    const result = await tool(built.tools, "move_chat").handler({ corner: "top-left" });

    expect(result).toEqual({ moved: true, corner: "top-left" });
    // With `announce`, because a move the agent made owes the user a notice
    // and a way back; a host calling the same method is arranging its own page.
    expect(built.calls).toEqual(["moveTo:top-left:true"]);
  });

  it("refuses honestly when the panel fills the screen, and says what would work", async () => {
    const full = makeSurface({ movable: false, fullBleed: true });
    const result = (await tool(full.tools, "move_chat").handler({ corner: "top-left" })) as Record<
      string,
      unknown
    >;

    // The half that matters: it did not try, and it did not claim to have
    // moved. A phone has nowhere to move to, which is why the mobile layout
    // and this tool could not be designed apart.
    expect(result["moved"]).toBe(false);
    expect(String(result["reason"])).toContain("nowhere to move");
    expect(result["suggestion"]).toBe("minimise_chat");
    expect(full.calls).toEqual([]);
  });

  it("names the placement when that is what owns the position", async () => {
    const docked = makeSurface({ movable: false, placement: "sidebar" });
    const result = (await tool(docked.tools, "move_chat").handler({
      corner: "bottom-right",
    })) as Record<string, unknown>;

    expect(result["moved"]).toBe(false);
    expect(String(result["reason"])).toContain("sidebar");
    expect(docked.calls).toEqual([]);
  });

  it("says so plainly when the host named no placement at all", async () => {
    // The default. The reason still has to read as a sentence rather than
    // trailing off into an empty pair of quotes.
    const unnamed = makeSurface({ movable: false, placement: null });
    const result = (await tool(unnamed.tools, "move_chat").handler({
      corner: "top-left",
    })) as Record<string, unknown>;

    expect(result["moved"]).toBe(false);
    expect(String(result["reason"])).toContain("owns the panel's position");
  });

  it("passes the surface's own answer through rather than assuming success", async () => {
    // describeSurface can say movable while the move still fails -- a viewport
    // that changed between the two calls. The tool reports what happened.
    const surface: ChatSurface = {
      describeSurface: () => makeSurface().surface.describeSurface(),
      moveTo: () => false,
      setCollapsed: () => undefined,
    };
    const result = await tool(createChatSurfaceTools(surface), "move_chat").handler({
      corner: "top-right",
    });

    expect(result).toEqual({ moved: false, corner: "top-right" });
  });

  it("refuses a corner that is not one, rather than moving somewhere else", async () => {
    // `required` in a schema is advisory, and a model can answer with a corner
    // that does not exist. `moveTo` matches none of its edge tests for such a
    // value and falls through to bottom-right -- so without this the tool
    // reports success for a corner it did not go to, and the agent tells the
    // user it moved the chat somewhere it did not.
    for (const asked of [{}, { corner: "middle" }, { corner: "right" }]) {
      const result = (await tool(built.tools, "move_chat").handler(asked)) as Record<
        string,
        unknown
      >;

      expect(result["moved"]).toBe(false);
      expect(String(result["reason"])).toContain("not a corner");
      expect(built.calls).toEqual([]);
    }
  });

  it("names the four corners once, and the schema reads them from there", () => {
    const parameters = tool(built.tools, "move_chat").parameters as Record<string, unknown>;
    const properties = parameters["properties"] as Record<string, { enum: string[] }>;

    // Restated in the description and the schema, so they are taken from the
    // same list the validator uses rather than typed out a third time.
    expect(properties["corner"]?.enum).toEqual([...CHAT_CORNERS]);
    for (const corner of CHAT_CORNERS) {
      expect(String(tool(built.tools, "move_chat").description)).toContain(corner);
    }
  });

  it("says which reason a move was refused for", async () => {
    // The two refusals call for different sentences, and the wrong one is a
    // plain falsehood the agent relays to the user in its own words.
    const off = makeSurface({ movable: false, draggable: false, placement: "floating" });
    const owned = makeSurface({ movable: false, draggable: true, placement: "sidebar" });

    const first = (await tool(off.tools, "move_chat").handler({ corner: "top-left" })) as Record<
      string,
      unknown
    >;
    const second = (await tool(owned.tools, "move_chat").handler({
      corner: "top-left",
    })) as Record<string, unknown>;

    expect(String(first["reason"])).toContain("turned off");
    expect(String(first["reason"])).not.toContain("floating");
    expect(String(second["reason"])).toContain("sidebar");
  });

  it("minimises, and restores", async () => {
    await tool(built.tools, "minimise_chat").handler({});
    await tool(built.tools, "restore_chat").handler({});

    // Announced on the way out and not on the way back: a panel that leaves on
    // its own has to say so, and one arriving is its own announcement.
    expect(built.calls).toEqual(["setCollapsed:true:true", "setCollapsed:false:false"]);
  });

  it("will not minimise a placement with no collapsed state", async () => {
    const page = makeSurface({ collapsible: false, placement: "page" });
    const result = (await tool(page.tools, "minimise_chat").handler({})) as Record<string, unknown>;

    // There is no launcher under that placement, so collapsing would leave the
    // agent having hidden itself with no way back.
    expect(result["minimised"]).toBe(false);
    expect(String(result["reason"])).toContain("no collapsed state");
    expect(page.calls).toEqual([]);
  });

  it("offers no suggestion where minimising is not available either", async () => {
    const stuck = makeSurface({ movable: false, collapsible: false, placement: "page" });
    const result = (await tool(stuck.tools, "move_chat").handler({ corner: "top-left" })) as Record<
      string,
      unknown
    >;

    expect(result["suggestion"]).toBeNull();
  });

  it("stamps none of them destructive, so none raises a confirmation", () => {
    const destructive = built.tools.map(
      (t) => (t.parameters as Record<string, unknown>)[X_DESTRUCTIVE_KEY],
    );

    // Read through the constant rather than its spelling: the guard keys off
    // the same one, so a rename that left this string behind would stop the
    // gate firing while this kept agreeing that nothing is stamped.
    expect(destructive).toEqual([undefined, undefined, undefined, undefined]);
    expect(built.tools).toHaveLength(4);
  });
});
