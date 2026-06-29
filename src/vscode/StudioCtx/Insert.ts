import type { Node, NodePath } from "../../engine/model";

/** An entry in the Insert catalog (a component / code item to insert). */
export interface InsertItem {
  /** Display label. */
  label: string;
  /** Build a fresh node to insert. */
  make(): Node;
}

/** The Insert catalog. */
export interface InsertApi {
  readonly components: InsertItem[];
  readonly code: InsertItem[];
  readonly catalog: InsertItem[];
  /** Insert an item at (or appended under) `target`; returns the new node path. */
  add(item: InsertItem, target?: NodePath | null): NodePath;
}
