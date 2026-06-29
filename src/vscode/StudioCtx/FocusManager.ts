import type { Node, NodePath } from "../../engine/model";
import type { Listenable } from "../events";
import type { Arena } from "./ArenaManager";

/** Selection / focus within the current component. */
export interface FocusApi {
  readonly onReset: Listenable;
  readonly arena: Arena;
  /** The selected node path (null = nothing selected). */
  readonly path: NodePath | null;
  /** The selected node. */
  readonly node: Node | undefined;
  selectNode(path: NodePath | null): void;
}
