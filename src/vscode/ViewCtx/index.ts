import type { Component, NodePath } from "../../engine/model";
import type { Rect } from "../../engine/viewport";
import type { Frame } from "../StudioCtx";
import type { HoverApi } from "./Hover";
import type { TextEditingApi } from "./TextEditing";
import type { VariantsApi } from "./Variants";

export * from "./Hover";
export * from "./TextEditing";
export * from "./Variants";

/**
 * Per-frame editing context. Public namespaces are added as they land.
 */
export interface ViewCtx {
  readonly frame: Frame;
  /** The component this frame currently edits (top of its drill-in stack). */
  editedComponent(): Component | undefined;
  /** The latest rect the host reported for `path`. */
  rect(path: NodePath): Rect | undefined;
  /** The node hovered on this frame's canvas. */
  readonly hover: HoverApi;
  /** Inline text editing on this frame's canvas. */
  readonly text: TextEditingApi;
  /** Variants declared on / active for the edited component. */
  readonly variants: VariantsApi;
  dispose(): void;
  readonly isDisposed: boolean;
  /** Whether this is the focused frame's context. */
  readonly isActive: boolean;
}
