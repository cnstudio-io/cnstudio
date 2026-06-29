import type { NodePath } from "../../engine/model";
import type { Frame } from "./index";

/** A 2D point (canvas coordinates). */
export interface Pt {
  x: number;
  y: number;
}

/** A restorable viewport snapshot (zoom + pan + focused frame). */
export interface StudioViewportSnapshot {
  zoom: number;
  pan: Pt;
  focusedFrame: string | null;
}

/** Canvas zoom/pan + fit operations. */
export interface ViewportApi {
  readonly zoom: number;
  readonly offset: Pt;
  isTransforming(): boolean;
  setZoom(z: number): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomToScale(scale: number): void;
  zoomByDirection(dir: -1 | 1): void;
  zoomAtFixed(scale: number, anchor: Pt): void;
  setPan(x: number, y: number): void;
  panBy(dx: number, dy: number): void;
  reset(): void;
  snapshot(): StudioViewportSnapshot;
  restore(snap: StudioViewportSnapshot, restoreFrameFocus?: boolean): void;
  midpoint(): Pt;
  fitFrame(frame: Frame, maxZoom?: number): void;
  fitArena(): void;
  fitTpl(path: NodePath): void;
  fitSelection(): void;
  centerFocusedFrame(maxZoom?: number): void;
}
