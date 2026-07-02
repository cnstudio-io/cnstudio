import * as esbuild from "esbuild";
import { cpSync } from "node:fs";

// Bundle each package entry point into a single ESM file. We bundle so that
// internal relative imports get inlined (Node's ESM loader rejects the
// extensionless `./index` that `tsc` emits — only a bundler resolves those).
// `packages: "external"` leaves every bare import (`react`, `vite`, `valtio`,
// `react-docgen-typescript`, …) as a runtime `import`, so peer/optional deps are
// never inlined and the CLI bin runs under bare Node. Type declarations are a
// separate `tsc --emitDeclarationOnly` pass (see the `build:types` script).
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

// One entry per `exports` path in package.json (plus the `bin`). `out` is the
// path under `dist/` — it MUST match what `exports`/`bin` point at.
const entryPoints = [
  { in: "src/vite/index.ts", out: "vite/index" },
  { in: "src/react/main.tsx", out: "react/main" },
  { in: "src/generate/index.ts", out: "generate/index" },
  { in: "src/generate/codegen.ts", out: "generate/codegen" },
  { in: "src/react/EnvProvider.tsx", out: "react/EnvProvider" }, // runtime for generated code (the `./react-web` export)
  { in: "src/generate/cli.ts", out: "generate/cli" }, // the `cnstudio` bin
  { in: "src/generate/props-worker.ts", out: "generate/props-worker" }, // worker_thread the vite plugin spawns (not an `exports` path)
  { in: "src/engine/index.ts", out: "engine/index" },
];

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints,
  outdir: "dist",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  jsx: "automatic", // matches tsconfig `jsx: react-jsx`; keeps react/jsx-runtime external
  packages: "external",
  sourcemap: !production,
  minify: false, // a library — keep output readable/debuggable
  logLevel: "info",
};

// Codegen reads its built-in templates from disk at runtime. They are NOT
// bundled — copy the `.tt` tree to dist/generators so the path resolves the same
// relative to import.meta.url in both src (vitest) and dist (the published bin).
function copyTemplates() {
  // Only the .tt templates — the generator .ts sources are bundled into the
  // entry outputs, not shipped as source.
  cpSync("src/generators", "dist/generators", {
    recursive: true,
    filter: (src) => !src.endsWith(".ts"),
  });
  console.log("[esbuild] copied generators/**/*.tt → dist/generators");
}

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  copyTemplates();
  console.log("[esbuild] watching…");
} else {
  await esbuild.build(options);
  copyTemplates();
}
