/**
 * `@cnstudio-io/cnstudio/vscode` — the typed API for driving the cnstudio VS Code extension.
 *
 *   import { getStudioApi } from "@cnstudio-io/cnstudio/vscode";
 *   const studio = await getStudioApi(vscode.extensions); // the live StudioCtx
 *   studio?.change((tx) => { ... });
 *
 * The contract is organized to mirror `cnstudio-extension/src`: the `StudioCtx`
 * trunk + its manager namespaces under `./StudioCtx`, plus `./ViewCtx`,
 * `./CanvasCtx`, `./RenderTree`, `./Transaction`, `./events`. See
 * `@cnstudio-io/cnstudio/examples/vscode-extension.ts`.
 */
export * from "./StudioCtx";
export * from "./ViewCtx";
export * from "./CanvasCtx";
export * from "./RenderTree";
export * from "./Transaction";
export * from "./events";
export type { Site, Component, Node, NodePath } from "../engine/model";
export type { ComponentMeta, PropSchema, ImportSpec } from "../engine/schema";

// Aliased so these local bindings don't shadow the `export *` re-exports above.
import type { StudioCtx as StudioCtxRef, StudioExports as StudioExportsRef } from "./StudioCtx";
import type { ViewCtx as ViewCtxRef } from "./ViewCtx";
import type { CanvasCtx as CanvasCtxRef } from "./CanvasCtx";
import type { RenderTree as RenderTreeRef, RenderNode as RenderNodeRef } from "./RenderTree";

/**
 * `CnStudio` — the DayPilot-style namespace grouping the four top-level surfaces
 * (`DayPilot.Calendar`/`Scheduler` → `CnStudio.StudioCtx`/…). Mirrors the engine's
 * `CnStudio` barrel in `cnstudio-extension/src/index.ts`; the engine classes
 * implement these contracts.
 */
export namespace CnStudio {
  export type StudioCtx = StudioCtxRef;
  export type ViewCtx = ViewCtxRef;
  export type CanvasCtx = CanvasCtxRef;
  export type RenderTree = RenderTreeRef;
  export type RenderNode = RenderNodeRef;
}

/** The published id of the cnstudio extension (`<publisher>.<name>`). */
export const STUDIO_EXTENSION_ID = "cnstudio-io.cnstudio";

/** The minimal slice of `vscode.extensions` this helper needs (so we don't import vscode). */
export interface ExtensionsHost {
  getExtension(id: string):
    | { isActive: boolean; activate(): PromiseLike<unknown>; exports: unknown }
    | undefined;
}

/**
 * Resolve the live `StudioCtx`: find the extension, activate it if needed, and
 * return its `exports.studio`. Returns `undefined` if the extension isn't installed.
 */
export async function getStudioApi(extensions: ExtensionsHost): Promise<StudioCtxRef | undefined> {
  const ext = extensions.getExtension(STUDIO_EXTENSION_ID);
  if (!ext) return undefined;
  if (!ext.isActive) await ext.activate();
  const exports = ext.exports as Partial<StudioExportsRef> | undefined;
  return exports?.studio;
}
