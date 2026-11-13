// esbuild bundle config. Run via `node esbuild.config.mjs` (invoked by
// `make build` / `pnpm build`). Produces two ESM .js outputs:
//   - dist/index.js          — ESM, externals (@ag-ui/*) NOT bundled (npm-consumer build)
//   - dist/ag-ui-web-component.bundle.js  — ESM, @ag-ui/* INLINED (vendored-bundle build)
//
// The vendored bundle is what django-admin-agent ships under its
// static/ directory. Its options are exported so the browser test that loads
// the built bundle (tests/browser/vendored_bundle.browser.test.ts) builds it
// exactly as this file does, rather than from a copy that could drift.
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

/** @type {import("esbuild").BuildOptions} */
const SHARED = {
  bundle: true,
  format: "esm",
  target: ["es2022", "chrome123", "firefox120", "safari17.5"],
  platform: "browser",
  sourcemap: true,
  loader: { ".css": "css" },
};

/**
 * The one spelling both `@ag-ui/core` and `@ag-ui/client` 1.0 use to reach
 * zod: `import { z } from "zod/v4"`, minified or not, aliased or not.
 */
const ZOD_NAMED_IMPORT = /import\s*\{\s*z(?:\s+as\s+([\w$]+))?\s*\}\s*from\s*"zod\/v4";?/;

/**
 * Resolve zod's namespace at build time, so the vendored bundle carries only
 * the parts of zod the protocol packages call.
 *
 * `import { z } from "zod/v4"` binds a namespace object that zod re-exports as
 * a *value*, and esbuild cannot see which members of a value are read, so it
 * keeps all of them: every locale zod ships (144 KB minified, for a chat whose
 * only use of them is English) and the JSON Schema generator, which neither
 * package calls. Spelled `import * as z`, the same property reads resolve
 * statically and the rest drops -- 191 KB of the 254 KB that adopting 1.0
 * added. Neither package reads `z` other than through a property, so the two
 * spellings bind the same functions.
 *
 * They differ in one respect, which is why the English locale is installed
 * explicitly. zod sets its messages with a top-level `config(en())` in a
 * module none of whose exports is read once the namespace resolves, and zod's
 * `sideEffects: false` lets esbuild drop that module whole. Without the call
 * every issue reads "Invalid input", and a rejected event's issues are the
 * error text the chat shows when a run fails on one.
 *
 * The named import is blanked to spaces of the same length and the
 * replacement appended, rather than spliced in place: `@ag-ui/client` is one
 * minified line, and a longer import at its head would shift every column its
 * source map points at. An ES import is hoisted wherever it is written.
 *
 * A file this does not recognise is loaded untouched, which costs size and
 * never correctness; the browser test fails if the locales come back.
 *
 * @type {import("esbuild").Plugin}
 */
export const zodNamespaceImport = {
  name: "zod-namespace-import",
  setup(pluginBuild) {
    pluginBuild.onLoad(
      { filter: /[\\/]@ag-ui[\\/][^\\/]+[\\/]dist[\\/][^\\/]+\.mjs$/ },
      async (args) => {
        const source = await readFile(args.path, "utf8");
        const match = ZOD_NAMED_IMPORT.exec(source);
        if (match === null) {
          return undefined;
        }
        const binding = match[1] ?? "z";
        const blanked =
          source.slice(0, match.index) +
          " ".repeat(match[0].length) +
          source.slice(match.index + match[0].length);
        const appended = [
          `import * as ${binding} from "zod/v4";`,
          `import __agUiZodEnglish from "zod/v4/locales/en.js";`,
          `${binding}.config(__agUiZodEnglish());`,
        ].join("\n");
        return {
          contents: `${blanked}\n${appended}\n`,
          loader: "js",
          resolveDir: dirname(args.path),
        };
      },
    );
  },
};

/**
 * The vendored bundle: every dependency inlined. Suitable for direct
 * `<script type="module">` embedding.
 *
 * @type {import("esbuild").BuildOptions}
 */
export const VENDORED_BUNDLE = {
  ...SHARED,
  entryPoints: ["src/index.ts"],
  outfile: "dist/ag-ui-web-component.bundle.js",
  minify: true,
  plugins: [zodNamespaceImport],
};

/**
 * zod's JSON Schema modules that contribute code to a vendored bundle.
 *
 * zod is a peer of the protocol packages this package does not declare, and
 * from zod 4.2.0 every schema constructor calls into its JSON Schema code, so
 * a bundle built against zod 4.2 or later carries about 42 KB more. The
 * published bundle is built from the lock's zod 3, where none of it is
 * reachable; the build below refuses one that carries any, so a lock refresh
 * cannot grow it unnoticed. The scheduled unpinned resolve runs the tests,
 * not this build, and still takes the newest zod 4.
 *
 * @param {import("esbuild").Metafile} metafile
 * @returns {string[]}
 */
export function zodJsonSchemaInputs(metafile) {
  return Object.entries(metafile.outputs)
    .filter(([path]) => path.endsWith(".bundle.js"))
    .flatMap(([, output]) => Object.entries(output.inputs))
    .filter(([path, input]) => input.bytesInOutput > 0 && /[\\/]zod[\\/].*json-schema/.test(path))
    .map(([path]) => path);
}

// Build only when run as a script, so the test above can import the options.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [, vendored] = await Promise.all([
    // Library build — peer deps stay external so npm consumers dedupe @ag-ui/* themselves.
    build({
      ...SHARED,
      entryPoints: ["src/index.ts"],
      outfile: "dist/index.js",
      external: ["@ag-ui/client", "@ag-ui/core"],
    }),
    build({ ...VENDORED_BUNDLE, metafile: true }),
  ]);
  const jsonSchema = zodJsonSchemaInputs(vendored.metafile);
  if (jsonSchema.length > 0) {
    throw new Error(
      `the vendored bundle carries zod's JSON Schema code (${jsonSchema.join(", ")}): ` +
        "it was built against zod 4.2 or later, and the published bundle is built from zod 3",
    );
  }
}
