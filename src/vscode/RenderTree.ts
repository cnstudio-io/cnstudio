import type { NodePath } from "../engine/model";

/**
 * A node in the evaluated render tree: the model resolved to its render shape —
 * instances expanded, slots filled, variant applied — with expressions left raw.
 */
export interface RenderNode {
  /** Source path in the edited component (instance subtrees share the instance path). */
  path: NodePath;
  /** What this resolved to. */
  kind: "custom" | "text" | "component" | "code" | "slot";
  /** Component name, "Custom" (a UI-created component's root), "slot", or "#text". */
  type: string;
  /** Resolved props (active variant applied). */
  props: Record<string, unknown>;
  /** Text content for text nodes / the raw source for expr nodes. */
  text?: string;
  children: RenderNode[];
}

/**
 * A component evaluated into its resolved render shape, with path-based lookups.
 * Pure model eval: built headless, without a rendered DOM.
 */
export interface RenderTree {
  /** The resolved root. */
  root(): RenderNode;
  /** The first node whose source path equals `path`. */
  valAt(path: NodePath): RenderNode | undefined;
  /** Every node, depth-first. */
  all(): RenderNode[];
  /** Count of resolved nodes. */
  readonly size: number;
}
