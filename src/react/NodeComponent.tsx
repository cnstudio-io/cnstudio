import { createElement, useContext, type ReactNode } from "react";
import { type Component, type NodePath } from "../engine/model";
import { type Env, EnvContext } from "./EnvProvider";
import { RenderContext } from "./RenderContext";
import { NodeWrapper } from "./NodeWrapper";

/**
 * The branch a {@link NodeWrapper} delegates to for an *instance* node (its
 * `type` is a model {@link Component}). The instance boundary: it sets `$props`
 * for the subtree and provides the `$` env down, then renders the component's
 * root back through {@link NodeWrapper}. cnstudio does data binding, not state —
 * there is no `$state`; reactivity is plain React.
 */

/** Props on {@link NodeComponent} — the instance boundary. */
interface NodeComponentProps {
  /** The model component's name (the instance node's `type`). */
  name: string;
  /** The instance node's resolved props → `$props`. */
  instanceProps: Record<string, unknown>;
  /**
   * The instance's slot content, PRE-RENDERED at the instance site (lexical
   * scoping) and keyed by slot name (`""` = the default slot).
   */
  fills: Record<string, ReactNode> | undefined;
  /** Path shared by the whole instance subtree (or null). */
  tagPath: NodePath | null;
  /** Frozen (nested instance, untagged internals) vs. the editable root. */
  frozen: boolean;
  /** The variant to render this component's root with (root = active; nested = null). */
  activeVariant: string | null;
  /** Depth at which to render the component's root. */
  depth: number;
}

export function NodeComponent(props: NodeComponentProps): ReactNode {
  const { name, instanceProps, fills, tagPath, frozen, activeVariant, depth } = props;
  const rc = useContext(RenderContext);
  const parent = useContext(EnvContext);
  const comp: Component | undefined = rc.site?.components.find((c) => c.name === name);
  if (!comp) return null;
  // The instance boundary: set `$props` for the subtree; `$ctx` flows from above.
  const env: Env = { $props: instanceProps, $ctx: parent.$ctx };
  return createElement(
    EnvContext.Provider,
    { value: env },
    createElement(NodeWrapper, {
      // A component IS its root node (type/props/children) — render it directly.
      node: comp,
      tagPath,
      freeze: frozen,
      activeVariant,
      fills,
      depth,
    })
  );
}
