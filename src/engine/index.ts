/**
 * `@cnstudio-io/cnstudio/engine` — the SHARED, non-closed core. The document model + renderer,
 * the host⇄extension message types, the canvas Rect, and the registration schema.
 *
 * This is everything that ships in the runtime AND is imported by the (separate)
 * extension. The engine's own implementation (StudioCtx + managers) is NOT here.
 */
export * from "./model";
export * from "./viewport";
export * from "./protocol";
export * from "./schema";
