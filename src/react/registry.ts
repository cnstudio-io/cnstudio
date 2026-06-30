import type { RuntimeRegistry } from "../engine/schema";

/**
 * The runtime gets its `name → real component` map from a VIRTUAL module that the
 * Vite plugin synthesizes from `.studio/registry.json` (it emits one
 * `import { Button } from "@/components/ui/button"` per entry). See
 * `src/vite/index.ts` → `virtual:cnstudio/registry`.
 *
 * Kept behind this indirection so the runtime has no static import of project code.
 */
// Declared in ./virtual.d.ts; provided at build time by the cnstudio Vite plugin.
import generated from "virtual:cnstudio/registry";
import { primitives } from "../primitives";

// Built-in studio primitives are merged on top of the project's components, so a
// project never needs to register them and can't accidentally shadow them.
export const registry: RuntimeRegistry = { ...(generated as RuntimeRegistry), ...primitives };

/** resolveCode for renderNode: model node type → real component (a registered
 *  code component). A `type` that resolves to neither a code component nor a
 *  model component is a UI-created component ("Custom"), composed by the render
 *  path. */
export const resolveCode = (type: string) => registry[type]?.component;
