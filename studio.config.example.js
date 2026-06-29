// studio.config.js — configures the cnstudio plugin + CLI. NO registration data
// lives here (that is generated into .studio/registry.json). Copy into a project.
import { web, android, ios } from "cnstudio/codegen";

export default {
  // Component files to register (extract props from).
  components: ["src/components/**/*.tsx"],

  // Project tsconfig — REQUIRED so VariantProps<typeof buttonVariants> resolves to
  // real enums instead of collapsing to `any`.
  tsconfig: "./tsconfig.json",

  // Where the design model + registry live.
  studioDir: ".studio",

  // The real theme/fonts to load into the canvas iframe (so it renders for-real).
  css: "/src/index.css",

  // Code generation targets. `web` emits React (DOM); `android`/`ios` emit React
  // Native. Each runs on `cnstudio generate` against the design model
  // (.studio/site.json), writing files under its `out` dir.
  //
  // Generated files are AUTO-GENERATED and carry a DO-NOT-EDIT banner — they are
  // overwritten on every run. Their SHAPE comes from a `.tt` template. The
  // built-ins live in cnstudio/src/generators/{web,android,ios}/template.tsx.tt
  // and are EJS. Output is code, so use the RAW tag `<%- … %>` (not `<%= %>`,
  // which HTML-escapes the JSX). Holes:
  //   <%- imports %>  <%- name %>  <%- propsSig %>  <%- setup %>  <%- tree %>
  // Control flow can branch on the boolean holes (needsCtx / needsProps); use
  // EJS slurp-mode tags `<%_ … _%>` so the control lines leave no blank lines:
  //   <%_ if (needsCtx) { _%>\n  const $ctx = useDataEnv();\n<%_ } _%>
  // Override a target's `template` with a path to your own .tt file (relative to
  // this project) or a (parts) => string function:
  //   web({ out: "./dist", template: "./codegen/web.tsx.tt" })
  codegen: [
    web({ out: "./dist" }),
    android({ out: "./android" }),
    ios({ out: "./ios" }),
  ],
};
