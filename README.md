# cnstudio

The thing app projects install. A **Vite plugin + injected runtime** that turns a
real React/Tailwind project into a canvas the Studio extension can edit — plus a
generator that extracts component registrations from source.

> This is the package apps install. The VS Code extension is a separate package.

## What's in here

```
schemas/                 one JSON Schema FILE per host⇄extension message — the contract
  _defs.json             shared $defs (NodePath, Rect, DropIndicator, RemotePresence)
  render.json            extension → host
  ready/rendered/rects/pointer/wheel/space/key/click/dblclick/
  textCommit/textCancel/dragStart/dragOver/drop.json   host → extension

src/
  engine/   the SHARED, non-closed core only: model.ts (renderNode/parseSite) ·
            protocol.ts (message types + schema links) · viewport.ts (Rect) ·
            schema.ts (PropSchema). The engine implementation is NOT here.
  runtime/  CanvasHost.tsx · main.tsx (auto-mounting iframe entry) · registry.ts ·
            host.css        — renders the model with the project's REAL components
  generate/ index.ts (react-docgen-typescript + Babel defaults) · cli.ts (`npx cnstudio generate`)
  vite/     index.ts        — the plugin: generate · virtual registry · serve host entry
  vscode/   studio-ctx.ts   — the hard-coded `StudioCtx` interface (every namespace +
            operation, documented) · index.ts (`getStudioApi`) · types.ts. The extension
            implements StudioCtx and returns the live instance; nothing here imports it.

examples/
  registry.json          a generated registry, for reference
  vscode-extension.ts    a consumer extension using cnstudio/vscode

studio.config.example.js   plugin config (copied into each project as studio.config.js)
```

## Message contract: every message links its schema

Each message that crosses the iframe boundary carries a **`schema` property that
links to its actual `.json` schema file** (the `$schema` convention, like shadcn's
`components.json` → `"$schema": "https://ui.shadcn.com/schema.json"`):

```json
{ "schema": "https://raw.githubusercontent.com/general-intelligence-systems/cnstudio/main/schemas/v1/render.json",
  "type": "render", "rev": 12 }
```

- The URL is a **GitHub raw URL**; the version lives in the path (`/v1/`).
- Outgoing host messages are stamped via `host()` in `src/engine/protocol.ts`.
- The receiver resolves the link and validates against the file (ajv). These TS
  types will be **generated from** the schema files in the real build.

## The three files in a consuming project

| File | Role | Origin |
|---|---|---|
| `studio.config.js` | plugin/CLI config only | hand-written |
| `.studio/project.json` | the design model (edited in Studio) | edited |
| `.studio/registry.json` | component registrations (names + prop schemas + import) | **generated** |

`registry.json` is pure data → the extension reads it from disk for Insert/Properties.
The plugin turns the same file's `import` specifiers into a **virtual module** that
gives the runtime the real component implementations to render.

## Extending the extension (`cnstudio/vscode`)

The extension hands back the **live `StudioCtx`** — the whole engine — so another
extension can drive everything the Studio does: the model, tracked `change(tx => …)`
edits, `arenas`, `focus`, `history`, `insert`, `data`, `codeComponents`, and more.

```ts
import { getStudioApi } from "cnstudio/vscode";

const studio = await getStudioApi(vscode.extensions); // finds + activates → StudioCtx
const names = studio?.model.site.components.map((c) => c.name);
studio?.codeComponents.register("Chart", { kind: "line" });
studio?.change((tx) => { /* tx.insertChild / tx.setProp / … */ });
```

`cnstudio/vscode` re-exports the engine types (`StudioCtx` and its namespace managers,
`Site`/`Node`, `Tx`, `ComponentMeta`/`PropSchema`), so consumers get a fully-typed
handle. The extension returns `{ studio }` from its `activate()` — see
`examples/vscode-extension.ts`.

## Prop extraction (the shadcn/cva case)

`react-docgen-typescript` runs the real TS checker, so
`variant: VariantProps<typeof buttonVariants>` expands to its real enum — AST-only
tools can't. Requires the project `tsconfig` (else it collapses to `any`). A Babel
pass recovers destructuring defaults (`variant = "default"`). See `src/generate/index.ts`.

## Status: FIRST DRAFT

Not yet built/installed. Known rough edges, called out in code comments:
- `protocol.ts` types are hand-written (should be generated from `schemas/`).
- `moduleSpecifier()` assumes `@/` → `src/`; needs to read tsconfig `paths` (Next uses `@/*` → `./*`).
- No ajv validation wired yet; no tests.
- The schema GitHub URL owner/repo is a placeholder.
