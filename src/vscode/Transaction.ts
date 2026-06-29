import type { Node, NodePath } from "../engine/model";

/** The mutation handle passed to {@link ChangeApi}. All edits go through it. */
export interface Transaction {
  /** Change a node's tag/component type. */
  setType(path: NodePath, type: string): void;
  /** Set a prop (on the base, or the active variant). */
  setProp(path: NodePath, key: string, value: unknown): void;
  /** Remove a prop. */
  removeProp(path: NodePath, key: string): void;
  /** Insert a child node (default: append). */
  insertChild(path: NodePath, node: Node, index?: number): void;
  /** Replace a text node's text. */
  setText(path: NodePath, text: string): void;
  /** Delete a node. */
  remove(path: NodePath): void;
  /** Move a node to a new parent + index. */
  move(from: NodePath, toParent: NodePath, index: number): void;
}
