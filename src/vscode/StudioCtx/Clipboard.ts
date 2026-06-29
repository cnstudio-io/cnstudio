import type { NodePath } from "../../engine/model";

/** Copy/cut the selected subtree. */
export interface ClipboardApi {
  readonly hasContent: boolean;
  copy(path: NodePath): void;
  cut(path: NodePath): void;
}
