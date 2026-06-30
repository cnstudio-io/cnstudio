import { createContext, type ComponentType } from "react";
import { type NodePath, type Site } from "../engine/model";

/**
 * Per-render invariants (the old `renderNode` opts), shared via context by the
 * render-path components ({@link NodeWrapper}, {@link NodeComponent},
 * {@link RenderRoot}). Lives on its own so those mutually-recursive components
 * can each import it without a cycle through one another.
 */
export interface RenderCtx {
  /** The document — needed to resolve component instances. */
  site: Site | undefined;
  /** Resolve a node `type` to a registered code component. */
  resolveCode?: (type: string) => ComponentType<Record<string, unknown>> | undefined;
  /** The path being inline-edited (renders `contentEditable`), or null. */
  editing: NodePath | null;
  /** Editor mode — tag nodes with `data-spath` for canvas selection. */
  tagPaths: boolean;
}

export const RenderContext = createContext<RenderCtx>({
  site: undefined,
  editing: null,
  tagPaths: false,
});
