import type { NodePath } from "../../engine/model";

/** `viewCtx.text` (also `studio.text` for the active frame) — inline text editing
 * on the canvas. (Mirrors `TextEditing` in cnstudio-extension.) */
export interface TextEditingApi {
  /** The element path being edited, or null. */
  readonly editingPath: NodePath | null;
  /** Whether `path` is the element currently being edited. */
  isEditing(path: NodePath): boolean;
  /** Whether `path` points at an editable text node. */
  canEdit(path: NodePath): boolean;
  /** The live draft text, or undefined when not editing. */
  readonly draft: string | undefined;
  /** Update the draft as the user types. */
  setDraft(text: string): void;
  /** Begin editing the text node at `path` (must satisfy {@link canEdit}). */
  begin(path: NodePath): void;
  /** Commit `value` to the model (undoable) and stop editing. */
  commit(value: string): void;
  /** Commit the current draft and stop editing. */
  tryBlur(): void;
  /** Stop editing without saving. */
  cancel(): void;
}
