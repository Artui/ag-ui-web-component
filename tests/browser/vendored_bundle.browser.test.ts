/**
 * The vendored bundle, loaded the way a page loads it.
 *
 * Every other browser test mounts the element from `src/` through Vite, which
 * serves each module as written and tree-shakes nothing. The file
 * django-admin-agent vendors, and a page embeds with one script tag, is a
 * different artefact: esbuild inlines every dependency, minifies the lot and
 * drops whatever it can prove unused. A build option that dropped something the
 * component needs would pass every other test in this suite, because none of
 * them runs what the build produced.
 *
 * `build_vendored_bundle.ts` builds it from the options `esbuild.config.mjs`
 * exports, so this is the build `pnpm build` runs, and it is imported here from
 * a `blob:` URL: no Vite transform and no module resolution, which is what a
 * page has. A bare import left unbundled fails the import itself.
 *
 * **What it pins.** Adopting `@ag-ui/client` and `@ag-ui/core` 1.0 grew this
 * bundle by 254 KB, and 155 KB of that was zod code neither package calls: every
 * locale zod ships, and its JSON Schema generator. zod is a peer of the
 * protocol packages that this package does not declare, so the zod the bundle
 * is built from is whatever the install resolved: the lock's 3.25, or the
 * newest 4.x for the scheduled unpinned resolve. From zod 4.2.0 part of the
 * JSON Schema code is called by every schema and stays, about 42 KB minified. The build now resolves zod's
 * namespace statically so that code drops (`zodNamespaceImport` says how), which
 * is only safe if everything the protocol packages do call survives -- the
 * decode, the enforcement stage that strips undeclared keys, the schema check
 * that rejects a malformed event, and the English messages a rejection is
 * reported in. Each of those is asserted below against the built bundle.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type * as Bundle from "../../src/index.js";
import {
  corrupt,
  ENDPOINT,
  framesOf,
  replay,
  shadow,
  stubFetch,
  text,
} from "../helpers/recorded_wire.js";

/** The bundle's exports; its types are `src/index.ts`'s, which it is built from. */
let bundle: typeof Bundle;

beforeAll(async () => {
  const url = URL.createObjectURL(
    new Blob([inject("vendoredBundle")], { type: "text/javascript" }),
  );
  try {
    // A dynamic import, because the module under test does not exist until the
    // global setup has built it and has no path Vite could resolve statically.
    bundle = (await import(/* @vite-ignore */ url)) as typeof Bundle;
  } finally {
    URL.revokeObjectURL(url);
  }
  bundle.defineAgUiChat();
});

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Mount the bundle's `<ag-ui-chat>`, with the agent factory it ships. */
function mount(): AgUiChat {
  const el = document.createElement(bundle.ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", ENDPOINT);
  document.body.appendChild(el);
  return el;
}

describe("what the bundle carries", () => {
  it("is the element the package defines", () => {
    // The tag resolves to the bundle's own class, not to one another file in
    // this project registered: this file's iframe registers nothing else.
    expect(customElements.get(bundle.ELEMENT_TAG)).toBe(bundle.AgUiChat);
  });

  it("carries no zod locale but English", () => {
    const zod = bundledZod();
    // zod is there -- the protocol packages validate with it -- so an empty
    // match below means the code was dropped, not that the path moved.
    expect(zod.length).toBeGreaterThan(0);
    const locales = zod.filter((path) => /[\\/]locales[\\/]/.test(path));
    expect(locales.map((path) => path.replace(/^.*[\\/]/, ""))).toEqual(["en.js"]);
  });

  it("draws on one zod", () => {
    // Two copies would mean the protocol packages each resolved their own,
    // which doubles what is asserted below rather than failing it.
    expect(inject("vendoredZodVersions")).toHaveLength(1);
  });

  it("carries only the JSON Schema code zod's own schemas call", () => {
    const [version = ""] = inject("vendoredZodVersions");
    const jsonSchema = bundledZod()
      .filter((path) => /json-schema/.test(path))
      .map((path) => path.replace(/^.*[\\/]zod[\\/]/, ""))
      .sort();
    // From zod 4.2.0 every schema's constructor attaches its Standard JSON
    // Schema method and its own JSON Schema processor (classic/schemas.js
    // imports both), so the two modules are live code and no build can drop
    // them. The generator class and the from-JSON-Schema parser are not, and
    // still drop. Before 4.2.0 none of it is reachable.
    expect(jsonSchema).toEqual(
      zodSchemasCallJsonSchema(version)
        ? ["v4/core/json-schema-processors.js", "v4/core/to-json-schema.js"]
        : [],
    );
  });
});

/** Every bundled module under a zod package. */
function bundledZod(): string[] {
  return inject("vendoredBundleInputs").filter((path) => /[\\/]zod[\\/]/.test(path));
}

/** Whether a zod version's schema constructors reach its JSON Schema code. */
function zodSchemasCallJsonSchema(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 4 || (major === 4 && minor >= 2);
}

describe("a recorded run, through the bundle's own HttpAgent", () => {
  it("decodes and renders an ordinary run", async () => {
    const el = mount();
    el.enableCharts(["activity"]);
    await replay(el, framesOf("ordinary"));

    expect(text(el, ".tool-call-name")).toContain("Query orders");
    expect(text(el, ".tool-call-result")).toContain("3 orders on Mon");
    expect(text(el, ".chart-title")).toBe("Orders this week");
    const bubbles = shadow(el).querySelectorAll(".message");
    const answer = bubbles[bubbles.length - 1];
    expect(answer?.textContent).toContain("Orders are up on Tuesday.");
    expect(answer?.querySelector("strong")?.textContent).toBe("up");
  });

  it("fails a run on a rejected event, and says why in English", async () => {
    // The schema check is what fails the run, and its issue text is what the
    // failure bubble shows. zod writes that text from its English locale, which
    // the bundle keeps only because the build installs it explicitly: without
    // that call every issue here would read "Invalid input" and nothing more.
    const drifted = corrupt(framesOf("ordinary"), "TOOL_CALL_RESULT", (payload) => {
      delete payload["content"];
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount();
    await replay(el, drifted);

    const failed = shadow(el).querySelector(".message--failed")?.textContent ?? "";
    expect(failed).toContain("expected string, received undefined");
    expect(text(el, ".tool-call-result")).not.toContain("3 orders on Mon");
  });
});

describe("the enforcement stage, in the bundle", () => {
  it("strips a key the protocol does not declare before any subscriber sees it", async () => {
    const drifted = corrupt(framesOf("ordinary"), "TEXT_MESSAGE_CONTENT", (payload) => {
      payload["undeclared"] = "not part of the protocol";
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: Record<string, unknown>[] = [];
    const agent = bundle.createHttpAgent({ endpoint: ENDPOINT });
    const restore = stubFetch(drifted);
    try {
      await agent.runAgent(
        {},
        {
          onEvent: ({ event }) => {
            if (event.type === "TEXT_MESSAGE_CONTENT") {
              seen.push(event as unknown as Record<string, unknown>);
            }
          },
        },
      );
    } finally {
      restore();
    }

    // Non-vacuous: the run did deliver the events the key was written onto.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((event) => "undeclared" in event)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Removed unrecognised material"));
  });
});
