import { cloneElement, createElement, useContext, type ReactNode } from "react";
import {
  effectiveProps,
  instanceOf,
  pathEquals,
  type Node,
  type NodePath,
} from "../engine/model";
import { evalAction, resolveValue, type Env } from "./expr";
import { EnvContext } from "./EnvProvider";
import { RenderContext } from "./RenderContext";
import { NodeComponent } from "./NodeComponent";

/**
 * One per node: resolves props/events against the `$` env and renders the
 * component instance / code component / host element / literal text / slot. The
 * instance branch delegates to {@link NodeComponent} (the env/hook boundary),
 * which renders the instance's root back through this wrapper — the two recurse
 * mutually and import each other.
 */

const MAX_RENDER_DEPTH = 50;

/** Props on {@link NodeWrapper} — the varying per-node render state. */
interface NodeWrapperProps {
  node: Node;
  /** This node's `data-spath` path, or null (untagged / frozen subtree). */
  tagPath: NodePath | null;
  /** Inside a frozen instance subtree — children render untagged. */
  freeze: boolean;
  /** The active variant whose overrides apply. */
  activeVariant: string | null;
  /** The enclosing instance's DEFAULT-slot content (its `children`). */
  slot: Node[] | undefined;
  /** The enclosing instance's NAMED-slot content (its `slots`), keyed by slot name. */
  slots: Record<string, Node[]> | undefined;
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
  const { node, tagPath, freeze, activeVariant, slot, slots, depth } = props;
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
      slots,
      depth: depth + 1,
    });

  // Slot marker: render the enclosing instance's fill for this slot — the named
  // slot (`props.name`) from `slots`, or the default slot (`children`) when
  // unnamed — falling back to the marker's own children as placeholder content.
  if (node.type === "Slot") {
    const name = typeof node.props?.name === "string" ? (node.props.name as string) : undefined;
    const fill = name ? slots?.[name] : slot;
    const content = fill && fill.length ? fill : node.children;
    return content.map((c, i) => childWrapper(c, i, null));
  }

  // Loop: `data.map(...)`, rendering this node's children once per element with
  // the element bound under `$loop.<name>` (`.current` / `.index` / `.all`). Only
  // the first iteration is path-tagged — the children are ONE editable template,
  // so duplicate `data-spath`s across iterations would break canvas selection.
  if (node.type === "Loop") {
    const data = resolveValue(node.props?.data, env);
    const all = Array.isArray(data) ? data : [];
    const name = typeof node.props?.name === "string" ? (node.props.name as string) : "item";
    return all.map((current, index) => {
      const loopEnv: Env = {
        ...env,
        $loop: { ...(env.$loop ?? {}), [name]: { current, index, all } },
      };
      const tag = (i: number): NodePath | null =>
        index === 0 && !freeze && tagPath !== null ? [...tagPath, i] : null;
      return createElement(
        EnvContext.Provider,
        { key: index, value: loopEnv },
        ...node.children.map((c, i) => childWrapper(c, i, tag(i)))
      );
    });
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
    // Inject the selection attributes onto the component's OWN root element instead
    // of wrapping it in a span — no extra DOM box, so nothing constrains layout and
    // measurement reads the real element directly. Relies on the component spreading
    // unknown props onto its root DOM node (DomElement and shadcn components do); one
    // that doesn't forward props won't carry `data-spath` and won't be selectable.
    return cloneElement(inner, {
      "data-spath": tagPath.join("."),
      draggable: tagPath.length > 0,
    });
  }

  // Component instance: hand off to NodeComponent (the env/hook boundary).
  const comp = rc.site ? instanceOf(node, rc.site) : undefined;
  if (comp) {
    const instanceProps = resolveProps(node, activeVariant, env);
    return createElement(NodeComponent, {
      name: node.type,
      instanceProps,
      slot: node.children,
      namedSlots: node.slots,
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
