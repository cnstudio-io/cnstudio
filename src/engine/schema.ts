import type { ComponentType } from "react";

/**
 * The component-registration vocabulary. The PROP SCHEMA is serializable data
 * (it is written to `.studio/registry.json` and read by the extension to build
 * the Properties panel). The COMPONENT implementation is needed only by the
 * runtime to render — it never crosses to the extension.
 */

/** A single prop's editor schema. */
export type PropSchema = (
  | { type: "string"; default?: string; label?: string }
  | { type: "number"; default?: number; min?: number; max?: number }
  | { type: "boolean"; default?: boolean }
  | { type: "enum"; options: string[]; default?: string }
  | { type: "color"; default?: string }
  | { type: "slot" }
) & {
  /**
   * Tier-1 custom control: overrides the default type-driven input with a named
   * editor widget from the Properties panel's control registry (e.g.
   * `"data-source"`). Authored via a `@control <name>` JSDoc tag on the prop.
   */
  control?: string;
  /** Optional human label shown for the prop (overrides the prop key). */
  label?: string;
};

/** Where the runtime imports a component's implementation from. */
export interface ImportSpec {
  /** Module specifier, e.g. "@/components/ui/button". */
  module: string;
  /** Export name, e.g. "Button" (the local name when it's a default export). */
  name: string;
  /** True when it's the module's default export (`import Name from "…"`). */
  default?: boolean;
}

/** One component's serializable registration (what lands in registry.json). */
export interface ComponentMeta {
  import: ImportSpec;
  props: Record<string, PropSchema>;
  displayName?: string;
}

/** The on-disk `.studio/registry.json` shape. */
export interface RegistryFile {
  components: Record<string, ComponentMeta>;
}

/**
 * The runtime registry: the same component names mapped to their real React
 * implementations (resolved via the plugin's virtual import module). `props` is
 * carried along so the runtime can apply defaults without re-reading disk.
 */
export type RuntimeRegistry = Record<
  string,
  { component: ComponentType<Record<string, unknown>>; props: Record<string, PropSchema> }
>;
