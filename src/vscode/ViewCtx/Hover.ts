import type { Node, NodePath } from "../../engine/model";

/** `viewCtx.hover` (also `studio.hover` for the active frame) — the node hovered
 * on the canvas. Overlay-only: changing it repaints the hover box without
 * rebuilding the rendered DOM. (Mirrors `Hover` in cnstudio-extension.) */
export interface HoverApi {
  /** The hovered node path, or null. */
  readonly path: NodePath | null;
  /** The hovered model node, or undefined. */
  readonly node: Node | undefined;
  /** Set the hovered path (null clears). */
  set(path: NodePath | null): void;
  /** Clear the hover. */
  clear(): void;
}
