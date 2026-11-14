import type { Metafile } from "esbuild";
import { describe, expect, it } from "vitest";
import { zodJsonSchemaInputs } from "../esbuild.config.mjs";

const PNPM_ZOD = "node_modules/.pnpm/zod@4.6.7/node_modules/zod/v4";

/** A metafile with one output and the given inputs, each with its bytes in that output. */
function metafile(outfile: string, inputs: Record<string, number>): Metafile {
  return {
    inputs: {},
    outputs: {
      [outfile]: {
        bytes: 0,
        imports: [],
        exports: [],
        inputs: Object.fromEntries(
          Object.entries(inputs).map(([path, bytesInOutput]) => [path, { bytesInOutput }]),
        ),
      },
    },
  };
}

describe("zodJsonSchemaInputs", () => {
  it("names the JSON Schema modules a bundle built against zod 4.2 or later carries", () => {
    const built = metafile("dist/ag-ui-web-component.bundle.js", {
      [`${PNPM_ZOD}/classic/schemas.js`]: 40_000,
      [`${PNPM_ZOD}/core/to-json-schema.js`]: 9_000,
      [`${PNPM_ZOD}/core/json-schema-processors.js`]: 12_000,
      [`${PNPM_ZOD}/locales/en.js`]: 3_000,
    });
    expect(zodJsonSchemaInputs(built)).toEqual([
      `${PNPM_ZOD}/core/to-json-schema.js`,
      `${PNPM_ZOD}/core/json-schema-processors.js`,
    ]);
  });

  it("ignores a module the build dropped", () => {
    const built = metafile("dist/ag-ui-web-component.bundle.js", {
      [`${PNPM_ZOD}/core/to-json-schema.js`]: 0,
    });
    expect(zodJsonSchemaInputs(built)).toEqual([]);
  });

  it("reads only the vendored bundle, not the library build or a source map", () => {
    const library = metafile("dist/index.js", { [`${PNPM_ZOD}/core/to-json-schema.js`]: 9_000 });
    const map = metafile("dist/ag-ui-web-component.bundle.js.map", {
      [`${PNPM_ZOD}/core/to-json-schema.js`]: 9_000,
    });
    expect(zodJsonSchemaInputs(library)).toEqual([]);
    expect(zodJsonSchemaInputs(map)).toEqual([]);
  });

  it("names nothing outside zod, whatever its file is called", () => {
    const built = metafile("dist/ag-ui-web-component.bundle.js", {
      "src/tools/json-schema-predicates.js": 500,
    });
    expect(zodJsonSchemaInputs(built)).toEqual([]);
  });
});
