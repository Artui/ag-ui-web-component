import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { TestProject } from "vitest/node";
import { VENDORED_BUNDLE } from "../../esbuild.config.mjs";

declare module "vitest" {
  interface ProvidedContext {
    /** The vendored bundle's code, as `pnpm build` writes it. */
    vendoredBundle: string;
    /** Every module that contributes at least one byte to it. */
    vendoredBundleInputs: string[];
  }
}

/** The repository root, which `VENDORED_BUNDLE`'s relative paths are written against. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Build the vendored bundle for `vendored_bundle.browser.test.ts`.
 *
 * A global setup because the build runs in Node and the test runs in the
 * browser; the result crosses by `provide`, so nothing is written to `dist/`
 * and a test run cannot leave a stale bundle behind for a release to pick up.
 * The options are the ones `esbuild.config.mjs` builds with, not a copy, plus
 * the two that only change where the output goes and what is reported about
 * it.
 */
export default async function setup(project: TestProject): Promise<void> {
  const result = await build({
    ...VENDORED_BUNDLE,
    absWorkingDir: ROOT,
    write: false,
    metafile: true,
  });
  const code = result.outputFiles.find((file) => file.path.endsWith(".bundle.js"));
  const output = Object.entries(result.metafile.outputs).find(([path]) =>
    path.endsWith(".bundle.js"),
  );
  if (code === undefined || output === undefined) {
    throw new Error("the vendored build wrote no .bundle.js");
  }
  project.provide("vendoredBundle", code.text);
  project.provide(
    "vendoredBundleInputs",
    Object.entries(output[1].inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([path]) => path),
  );
}
