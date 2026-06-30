import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  effectiveProps,
  instanceOf,
  pathEquals,
  type Component,
  type Node,
  type NodePath,
  type Site,
} from "../engine/model";
import { evalAction, resolveValue, type Env } from "./expr";

/**
 * The app-runtime render path. Replaces the old one-pass `renderNode` with real
 * React components so the `$` data-binding env (`$props` / provided `$ctx`) has a
 * place to live:
 *
 * - {@link NodeWrapper} — one per node; resolves props/events against the `$` env
 *   and renders the component instance / code component / host element / literal
 *   text / slot.
 * - {@link NodeComponent} — the branch a wrapper delegates to for an *instance*
 *   node (its `type` is a model {@link Component}). The instance boundary: it sets
 *   `$props` for the subtree and provides the `$` env down. cnstudio does data
 *   binding, not state — there is no `$state`; reactivity is plain React.
 *
 * This runs in the canvas iframe (and is the basis for codegen). It never runs in
 * the extension.
 */

const MAX_RENDER_DEPTH = 50;

/** Per-render invariants (the old `renderNode` opts), shared via context. */
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

const RenderContext = createContext<RenderCtx>({
  site: undefined,
  editing: null,
  tagPaths: false,
});

/** The base `$` data-binding env. */
const emptyEnv: Env = { $props: {}, $ctx: {} };
const EnvContext = createContext<Env>(emptyEnv);

/** Props on {@link NodeWrapper} — the varying per-node render state. */
interface NodeWrapperProps {
  node: Node;
  /** This node's `data-spath` path, or null (untagged / frozen subtree). */
  tagPath: NodePath | null;
  /** Inside a frozen instance subtree — children render untagged. */
  freeze: boolean;
  /** The active variant whose overrides apply. */
  activeVariant: string | null;
  /** Slotted content for `slot` nodes (the enclosing instance's children). */
  slot: Node[] | undefined;
  /** Recursion depth (bounds runaway instance recursion). */
  depth: number;
}

/**
 * Resolve a node's effective props against the `$` env. Each string value is a
 * JavaScript expression: an `onX` handler is a statement body (run with `$event`
 * in scope), every other string is evaluated to its value. Non-string values are
 * already-resolved literals and pass through.
 */
function resolveProps(
  node: Exclude<Node, string>,
  activeVariant: string | null,
  env: Env
): Record<string, unknown> {
  const eff = effectiveProps(node, activeVariant);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(eff)) {
    if (/^on[A-Z]/.test(k) && typeof v === "string") {
      const code = v;
      out[k] = (event: unknown) => evalAction(code, env, event);
    } else {
      out[k] = resolveValue(v, env);
    }
  }
  return out;
}

export function NodeWrapper(props: NodeWrapperProps): ReactNode {
  const { node, tagPath, freeze, activeVariant, slot, depth } = props;
  const rc = useContext(RenderContext);
  // The data-binding env ($props/$ctx). Reactivity is plain React: $props flows
  // from parents, $ctx from providers (EnvContext) — both re-render naturally.
  const env = useContext(EnvContext);

  // Text node.
  if (typeof node === "string") {
    if (tagPath === null) return node;
    const spanProps: Record<string, unknown> = { "data-spath": tagPath.join(".") };
    if (rc.editing !== null && pathEquals(rc.editing, tagPath)) {
      spanProps["contentEditable"] = true;
      spanProps["suppressContentEditableWarning"] = true;
      return createElement("span", spanProps);
    }
    return createElement("span", spanProps, node);
  }

  if (depth > MAX_RENDER_DEPTH) return null;

  const childWrapper = (c: Node, i: number, childTag: NodePath | null) =>
    createElement(NodeWrapper, {
      key: i,
      node: c,
      tagPath: childTag,
      freeze,
      activeVariant,
      slot,
      depth: depth + 1,
    });

  // Slot placeholder: provided content, else the slot's own default children.
  if (node.type === "slot") {
    const content = slot && slot.length ? slot : node.children;
    return content.map((c, i) => childWrapper(c, i, null));
  }

  // Code component: `type` resolves to a real React component.
  const code = rc.resolveCode ? rc.resolveCode(node.type) : undefined;
  if (code) {
    const cprops = resolveProps(node, activeVariant, env);
    if (cprops.hidden) return null;
    delete cprops.hidden;
    // Children composed inside a code component are still THIS component's nodes —
    // tag them with their real paths so they're selectable in the canvas (frozen
    // instance subtrees and untagged parents stay untagged).
    const childTag = (i: number): NodePath | null =>
      freeze || tagPath === null ? null : [...tagPath, i];
    const kids = node.children.map((c, i) => childWrapper(c, i, childTag(i)));
    const inner = createElement(code, cprops, ...kids);
    if (tagPath === null) return inner;
    return createElement(
      "span",
      { "data-spath": tagPath.join("."), draggable: tagPath.length > 0 },
      inner
    );
  }

  // Component instance: hand off to NodeComponent (the env/hook boundary).
  const comp = rc.site ? instanceOf(node, rc.site) : undefined;
  if (comp) {
    const instanceProps = resolveProps(node, activeVariant, env);
    return createElement(NodeComponent, {
      name: node.type,
      instanceProps,
      slot: node.children,
      tagPath,
      frozen: true,
      // Instance internals render at base variant (the active variant is the
      // edited component's, not the instance's).
      activeVariant: null,
      depth: depth + 1,
    });
  }

  // Nothing resolved this `type`: not a slot, not a code component, not a model
  // component. Per the model a node ALWAYS instances a registered component; the
  // sole exception is the reserved `Custom` (a UI-created component's root). Any
  // other `type` here is an unregistered node — a raw host tag (`<div>`, `<span>`,
  // `<a>`…) that was hand-written or imported into site.json. These are NOT valid
  // nodes: surface them as a visible error instead of silently materializing the
  // host element. The node stays tagged so it is selectable/deletable in the canvas.
  if (node.type !== "Custom") {
    const errProps: Record<string, unknown> = {
      "data-cnstudio-invalid": node.type,
      style: {
        display: "inline-block",
        outline: "1px dashed #e5484d",
        color: "#e5484d",
        background: "#e5484d14",
        font: "11px/1.4 ui-monospace, monospace",
        padding: "1px 4px",
        borderRadius: "3px",
      },
    };
    if (tagPath !== null) {
      errProps["data-spath"] = tagPath.join(".");
      if (tagPath.length > 0) errProps["draggable"] = true;
    }
    return createElement(
      "span",
      errProps,
      `⚠ <${node.type}> is not a registered component`
    );
  }

  // UI-created component (reserved type "Custom"): a composition of its children,
  // rendered in a plain <div> wrapper that carries its props (className/style) and
  // tags itself + its children with `data-spath` for canvas selection.
  const dom = resolveProps(node, activeVariant, env);
  if (dom.hidden) return null;
  delete dom.hidden;
  if (tagPath !== null) {
    dom["data-spath"] = tagPath.join(".");
    if (tagPath.length > 0) dom["draggable"] = true;
  }
  const childTag = (i: number): NodePath | null =>
    freeze || tagPath === null ? null : [...tagPath, i];
  const kids = node.children.map((c, i) => childWrapper(c, i, childTag(i)));
  return createElement("div", dom, ...kids);
}

/** Props on {@link NodeComponent} — the instance boundary. */
interface NodeComponentProps {
  /** The model component's name (the instance node's `type`). */
  name: string;
  /** The instance node's resolved props → `$props`. */
  instanceProps: Record<string, unknown>;
  /** The instance node's children → slotted content. */
  slot: Node[];
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
  const { name, instanceProps, slot, tagPath, frozen, activeVariant, depth } = props;
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
      slot,
      depth,
    })
  );
}

/**
 * Lets a (data-provider) code component contribute to `$ctx` for its subtree —
 * the one primitive behind "queries". A component fetches with its own hook and
 * wraps its children: `<EnvProvider ctx={{ products: result }}>`.
 */
export function EnvProvider({
  ctx,
  children,
}: {
  ctx: Record<string, unknown>;
  children: ReactNode;
}): ReactNode {
  const parent = useContext(EnvContext);
  const env: Env = { ...parent, $ctx: { ...parent.$ctx, ...ctx } };
  return createElement(EnvContext.Provider, { value: env }, children);
}

/** Render a component as the editable root (the first, non-frozen NodeComponent). */
export function RenderRoot({
  comp,
  ctx,
  activeVariant,
}: {
  comp: Component;
  ctx: RenderCtx;
  activeVariant: string | null;
}): ReactNode {
  return createElement(
    RenderContext.Provider,
    { value: ctx },
    createElement(NodeComponent, {
      name: comp.name,
      instanceProps: {},
      slot: [],
      tagPath: ctx.tagPaths ? [] : null,
      frozen: false,
      activeVariant,
      depth: 0,
    })
  );
}
