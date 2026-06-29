import type { Node } from "../../engine/model";
import type { PropSchema } from "../../engine/schema";

/** Undo/redo + component-level operations (all history-tracked). */
export interface HistoryApi {
  /** Monotonic model revision — bumps on every model change. Distinguishes a real
   * edit (the canvas host rebuilds its DOM) from an overlay-only repaint. */
  readonly rev: number;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly isAtTip: boolean;
  readonly isDirty: boolean;
  markSaved(): void;
  reset(): void;
  recordViewState(): void;
  addComponent(name: string, root: Exclude<Node, string>): void;
  renameComponent(oldName: string, newName: string): void;
  addVariantToComponent(componentName: string, variant: string): void;
  removeVariantFromComponent(componentName: string, variant: string): void;
  /** Define (or re-type) a declared prop on a component's input interface. */
  defineComponentProp(componentName: string, propName: string, schema: PropSchema): void;
  /** Rename a declared prop (and the prop wherever instances set it). */
  renameComponentProp(componentName: string, from: string, to: string): void;
  /** Remove a declared prop from a component's input interface. */
  undefineComponentProp(componentName: string, propName: string): void;
  removeComponent(name: string): void;
}
