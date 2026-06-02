import { describe, expect, it, vi } from "vitest";
import { createRouteTools, type RouteMap } from "../src/tools/route_map.js";

const ROUTES: RouteMap = [
  { id: "users", path: "/admin/auth/user/", title: "Users", group: "Auth" },
  { id: "books", path: "/admin/shop/book/" },
  { id: "book", path: "/admin/shop/book/:pk/change/", title: "Edit book" },
  { id: "nested", path: "/projects/:id/users/:userId/" },
];

function tools(navigate: ((p: string) => void) | null = null) {
  return createRouteTools(
    () => ROUTES,
    () => navigate,
  );
}

describe("createRouteTools", () => {
  it("list_routes returns the routes enriched with derived pathParams", async () => {
    const [list] = tools();
    expect(await list?.handler({})).toEqual([
      { id: "users", path: "/admin/auth/user/", title: "Users", group: "Auth", pathParams: [] },
      { id: "books", path: "/admin/shop/book/", pathParams: [] },
      { id: "book", path: "/admin/shop/book/:pk/change/", title: "Edit book", pathParams: ["pk"] },
      { id: "nested", path: "/projects/:id/users/:userId/", pathParams: ["id", "userId"] },
    ]);
  });

  it("navigate_to_route routes client-side when a navigate callback is set", async () => {
    const calls: string[] = [];
    const [, nav] = tools((p) => calls.push(p));
    const result = await nav?.handler({ route_id: "users" });
    expect(calls).toEqual(["/admin/auth/user/"]);
    expect(result).toEqual({ navigated: true, path: "/admin/auth/user/" });
  });

  it("navigate_to_route appends params as a query string", async () => {
    const calls: string[] = [];
    const [, nav] = tools((p) => calls.push(p));
    await nav?.handler({ route_id: "books", params: { status: "draft" } });
    expect(calls).toEqual(["/admin/shop/book/?status=draft"]);
  });

  it("navigate_to_route leaves the path untouched for empty params", async () => {
    const calls: string[] = [];
    const [, nav] = tools((p) => calls.push(p));
    await nav?.handler({ route_id: "books", params: {} });
    expect(calls).toEqual(["/admin/shop/book/"]);
  });

  it("navigate_to_route substitutes a dynamic path param", async () => {
    const calls: string[] = [];
    const [, nav] = tools((p) => calls.push(p));
    const result = await nav?.handler({ route_id: "book", params: { pk: 42 } });
    expect(calls).toEqual(["/admin/shop/book/42/change/"]);
    expect(result).toEqual({ navigated: true, path: "/admin/shop/book/42/change/" });
  });

  it("navigate_to_route fills multiple path params and encodes values", async () => {
    const calls: string[] = [];
    const [, nav] = tools((p) => calls.push(p));
    await nav?.handler({ route_id: "nested", params: { id: "a/b", userId: 7 } });
    expect(calls).toEqual(["/projects/a%2Fb/users/7/"]);
  });

  it("navigate_to_route sends leftover (non-path) params to the query string", async () => {
    const calls: string[] = [];
    const [, nav] = tools((p) => calls.push(p));
    await nav?.handler({ route_id: "book", params: { pk: 9, tab: "meta" } });
    expect(calls).toEqual(["/admin/shop/book/9/change/?tab=meta"]);
  });

  it("navigate_to_route throws when a required path param is missing", () => {
    const [, nav] = tools();
    expect(() => nav?.handler({ route_id: "book", params: {} })).toThrow(
      'route "book" requires path param "pk"',
    );
  });

  it("navigate_to_route throws when a path param is empty", () => {
    const [, nav] = tools();
    expect(() => nav?.handler({ route_id: "book", params: { pk: "" } })).toThrow(
      'route "book" requires path param "pk"',
    );
  });

  it("navigate_to_route falls back to window.location without a callback", async () => {
    const spy = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    const [, nav] = tools(null);
    await nav?.handler({ route_id: "users" });
    expect(spy).toHaveBeenCalledWith("/admin/auth/user/");
    spy.mockRestore();
  });

  it("navigate_to_route throws on an unknown route", () => {
    const [, nav] = tools();
    expect(() => nav?.handler({ route_id: "nope" })).toThrow('unknown route "nope"');
  });

  it("navigate_to_route is marked x-navigates", () => {
    const [, nav] = tools();
    expect(nav?.parameters["x-navigates"]).toBe(true);
  });

  it("carries friendly x-summary labels for the built-in route tools", () => {
    const [list, nav] = tools();
    expect(list?.parameters["x-summary"]).toBe("List pages");
    expect(nav?.parameters["x-summary"]).toBe("Navigate");
  });
});
