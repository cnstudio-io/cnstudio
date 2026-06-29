/**
 * Canvas geometry. The per-frame DOM↔model mapping lives on `vc.internal`
 * (see {@link ViewCtx} in `view-ctx.ts`); this module only carries the shared
 * {@link Rect} shape.
 */

/** A box relative to the canvas origin. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
