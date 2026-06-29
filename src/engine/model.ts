import type { PropSchema } from "./schema";

/**
 * The document model. A node is a component instance — `{ type, props, children }`
 * — or a plain string (literal text content). Data binding lives in `props`: a
 * prop VALUE is a JavaScript expression source, evaluated at render against the
 * `$` env (`$props`/`$ctx`). There is no separate "binding" node or wrapper.
 *
 * The render path (turning a {@link Node} tree into React elements, evaluating
 * prop expressions against the `$` env) lives in `../react/render.tsx` — it runs
 * in the app, never the extension. This module stays pure data + helpers.
 */
/**
 * A node in the document tree: a component instance — `{ type, props, children }`
 * — or a string of literal text. Dynamic/bound content is NOT a node; it's a prop
 * value (a JS expression). Literal text strings render exactly as written.
 */
export type Node =
  | string
  | {
      /**
       * The name of the component this node instantiates — a UI-created component
       * or a registered code component (both live by name). Nodes are always
       * component instances; raw host elements live inside the user's
       * hand-authored `.tsx`, never as nodes. Two reserved names: `"slot"` (a slot
       * placeholder) and `"Custom"` (the root of a UI-created component — see
       * {@link Component}).
       */
      type: string;
      /**
       * Base props, excluding children. Each VALUE is a JavaScript expression
       * source (a string), evaluated at render against the `$` env —
       * `"$props.title"`, `"'Open'"`, `"42"`. A non-string value is taken as an
       * already-resolved literal. Event props (`onX`) are statement bodies run
       * with `$event` in scope.
       */
      props: Record<string, unknown>;
      /** Child nodes: component instances and literal text strings. */
      children: Node[];
      /** Per-variant prop overrides: variant name → props that override the base. */
      variants?: Record<string, Record<string, unknown>>;
    };

/** Address of a node within a component tree. */
export type NodePath = number[];

/**
 * A named component. A component IS a node — it carries `type`/`props`/`children`
 * directly (there is no separate `root` wrapper). A UI-created component's root
 * carries the reserved type `"Custom"`; `children` is the content it composes
 * (instances of other components). `variantNames` are the alternative
 * presentations it declares ("Hover", "Mobile"); the base is implicit.
 * (Per-variant prop overrides live in the node's own `variants`.)
 */
export type Component = Exclude<Node, string> & {
  name: string;
  variantNames?: string[];
  /**
   * The component's DECLARED props — its input interface, the same
   * `name → {@link PropSchema}` shape imported components publish in
   * `registry.json`. Imported components have theirs extracted from source; a
   * custom component's are DEFINED in the Properties panel and saved here. When
   * the component is instantiated, these are the props an instance can set.
   */
  propSchema?: Record<string, PropSchema>;
};

/** The whole document: a set of components. */
export type Site = { components: Component[] };

/** Whether a node is a component instance (vs. a literal text string). */
export function isElement(n: Node): n is Exclude<Node, string> {
  return typeof n !== "string";
}

/** Resolve the node at `path` (the empty path is the root). */
export function nodeAt(root: Node, path: NodePath): Node | undefined {
  let cur: Node | undefined = root;
  for (const i of path) {
    if (cur === undefined || !isElement(cur)) return undefined;
    cur = cur.children[i];
  }
  return cur;
}

/** Whether two paths are equal (with `a` possibly null). */
export function pathEquals(a: NodePath | null, b: NodePath): boolean {
  return a !== null && a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Validate arbitrary JSON into a {@link Node} tree. Throws on malformed input. */
export function parseNode(value: unknown): Node {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "type" in value) {
    const v = value as Record<string, unknown>;
    if (typeof v.type !== "string") {
      throw new Error("node.type must be a string");
    }
    const props =
      v.props && typeof v.props === "object"
        ? (v.props as Record<string, unknown>)
        : {};
    const children = Array.isArray(v.children) ? v.children.map(parseNode) : [];
    const node: Exclude<Node, string> = { type: v.type, props, children };
    if (v.variants && typeof v.variants === "object") {
      node.variants = v.variants as Exclude<Node, string>["variants"];
    }
    return node;
  }
  throw new Error("Invalid node: " + JSON.stringify(value));
}

/** Serialize a {@link Node} tree back to plain JSON. */
export function serializeNode(n: Node): unknown {
  if (typeof n === "string") return n;
  const out: Record<string, unknown> = {
    type: n.type,
    props: n.props,
    children: n.children.map(serializeNode),
  };
  if (n.variants) out.variants = n.variants;
  return out;
}

/** Validate arbitrary JSON into a {@link Site}. Throws on malformed input. */
export function parseSite(value: unknown): Site {
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { components?: unknown }).components)
  ) {
    const comps = (value as { components: unknown[] }).components.map((c) => {
      const cc = c as Record<string, unknown>;
      if (typeof cc.name !== "string") {
        throw new Error("component.name must be a string");
      }
      // A component IS a node (type/props/children) plus a name + declared
      // variant names — there is no `root` wrapper.
      const node = parseNode(cc);
      if (typeof node === "string") {
        throw new Error("component must be a node, not text");
      }
      const comp: Component = { ...node, name: cc.name };
      if (Array.isArray(cc.variantNames)) comp.variantNames = cc.variantNames as string[];
      if (cc.propSchema && typeof cc.propSchema === "object") {
        comp.propSchema = cc.propSchema as Record<string, PropSchema>;
      }
      return comp;
    });
    return { components: comps };
  }
  throw new Error("Invalid site: expected { components: [...] }");
}

/** Serialize a {@link Site} back to plain JSON. */
export function serializeSite(s: Site): unknown {
  return {
    components: s.components.map((c) => {
      const node = serializeNode(c) as Record<string, unknown>;
      const out: Record<string, unknown> = { name: c.name, ...node };
      if (c.variantNames && c.variantNames.length) out.variantNames = c.variantNames;
      if (c.propSchema && Object.keys(c.propSchema).length) out.propSchema = c.propSchema;
      return out;
    }),
  };
}

/**
 * Whether a node may contain children. Every element (a component instance or a
 * slot) can nest content — only literal text strings cannot. Whether a given
 * component actually accepts children is a schema concern resolved elsewhere.
 */
export function isContainer(n: Node): boolean {
  return isElement(n);
}

/** A slot placeholder inside a component's tree. */
export function isSlot(n: Node): boolean {
  return isElement(n) && n.type === "slot";
}

/** Whether `n` is an instance of a component in `site` (type = a component name). */
export function instanceOf(n: Node, site: Site): Component | undefined {
  if (!isElement(n)) return undefined;
  return site.components.find((c) => c.name === n.type);
}

/**
 * The props of `node` with the active variant's overrides applied on top of the
 * base. `style` is merged (not replaced) so a variant can tweak one style key.
 */
export function effectiveProps(
  node: Exclude<Node, string>,
  activeVariant: string | null
): Record<string, unknown> {
  const ov = activeVariant ? node.variants?.[activeVariant] : undefined;
  if (!ov) return node.props;
  const merged = { ...node.props, ...ov };
  const base = node.props.style;
  const vs = ov.style;
  if (base && vs && typeof base === "object" && typeof vs === "object") {
    merged.style = { ...(base as object), ...(vs as object) };
  }
  return merged;
}
