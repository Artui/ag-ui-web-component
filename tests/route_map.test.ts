import { describe, expect, it, vi } from "vitest";
import { createRouteTools, type RouteMap } from "../src/route_map.js";

const ROUTES: RouteMap = [
  { id: "users", path: "/admin/auth/user/", title: "Users", group: "Auth" },
  { id: "books", path: "/admin/shop/book/" },
];

function tools(navigate: ((p: string) => void) | null = null) {
  return createRouteTools(
    () => ROUTES,
    () => navigate,
  );
}

describe("createRouteTools", () => {
  it("list_routes returns the route map", async () => {
    const [list] = tools();
    expect(await list?.handler({})).toEqual(ROUTES);
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
});
