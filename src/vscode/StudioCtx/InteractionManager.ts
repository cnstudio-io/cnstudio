import type { NodePath } from "../../engine/model";
import type { Pt } from "./Viewport";

/** Pointer interaction state. */
export type PointerState = "up" | "down" | "dragging";

/** Low-level canvas interaction state (drag/pointer). */
export interface InteractionApi {
  readonly isDraggingObject: boolean;
  setDragging(v: boolean): void;
  setDragInsert(t: { parent: NodePath; index: number } | null): void;
  endDrag(): void;
  readonly pointer: PointerState;
  setPointer(s: PointerState): void;
  readonly isResizeDragging: boolean;
  readonly isTransformingObject: boolean;
  setCursorClientPt(pt: Pt): void;
}
