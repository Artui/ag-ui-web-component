// esbuild bundle config. Run via `node esbuild.config.mjs` (invoked by
// `make build` / `pnpm build`). Produces two ESM .js outputs:
//   - dist/index.js          — ESM, externals (@ag-ui/*) NOT bundled (npm-consumer build)
//   - dist/ag-ui-web-component.bundle.js  — ESM, @ag-ui/* INLINED (vendored-bundle build)
//
// The vendored bundle is what django-admin-agent ships under its
// static/ directory.
import { build } from "esbuild";

const SHARED = {
  bundle: true,
  format: "esm",
  target: ["es2022", "chrome120", "firefox120", "safari17"],
  platform: "browser",
  sourcemap: true,
  loader: { ".css": "css" },
};

await Promise.all([
  // Library build — peer deps stay external so npm consumers dedupe @ag-ui/* themselves.
  build({
    ...SHARED,
    entryPoints: ["src/index.ts"],
    outfile: "dist/index.js",
    external: ["@ag-ui/client", "@ag-ui/core"],
  }),
  // Vendored bundle — every dependency inlined. Suitable for direct <script> embedding.
  build({
    ...SHARED,
    entryPoints: ["src/index.ts"],
    outfile: "dist/ag-ui-web-component.bundle.js",
    minify: true,
  }),
]);
