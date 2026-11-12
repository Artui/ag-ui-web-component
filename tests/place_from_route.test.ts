import { describe, expect, it } from "vitest";
import { placeFromRoute } from "../src/ui/place/place_from_route.js";

/** The route map standing in for a host that sets no getPlace. */

const ROUTES = [
  { id: "orders", path: "/orders/", title: "Orders", group: "Sales" },
  { id: "order", path: "/orders/:id/", title: "Order", group: "Sales" },
  { id: "report", path: "/reports/q1.csv" },
];

describe("placeFromRoute", () => {
  it("names the first route whose template matches the whole path", () => {
    expect(placeFromRoute(ROUTES, "/orders/7/")).toEqual({
      label: "Order",
      detail: "Sales",
      href: "/orders/7/",
    });
    expect(placeFromRoute(ROUTES, "/orders/")).toEqual({
      label: "Orders",
      detail: "Sales",
      href: "/orders/",
    });
  });

  it("takes the id when the route has no title, and no detail without a group", () => {
    expect(placeFromRoute(ROUTES, "/reports/q1.csv")).toEqual({
      label: "report",
      href: "/reports/q1.csv",
    });
  });

  it("matches a placeholder against one segment only", () => {
    expect(placeFromRoute(ROUTES, "/orders/7/lines/")).toBeNull();
  });

  it("reads a dot in a template literally", () => {
    expect(placeFromRoute(ROUTES, "/reports/q1xcsv")).toBeNull();
  });

  it("is null when nothing matches or there are no routes", () => {
    expect(placeFromRoute(ROUTES, "/nowhere/")).toBeNull();
    expect(placeFromRoute([], "/orders/")).toBeNull();
  });
});
