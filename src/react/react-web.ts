import { createContext, createElement, useContext, type ReactNode } from "react";
import { effectiveProps as engineEffectiveProps, type Node } from "../engine/model";

/**
 * The runtime that GENERATED components import. It is deliberately small: codegen emits the
 * component tree as real JSX/source and leans on these helpers only for data
 * binding — the `$ctx` data environment and variant merge. cnstudio does not
 * manage state; a generated component binds to `$props`/`$ctx`, and any state is
 * the app's own (user-authored) component.
 *
 * A separate entry point from `cnstudio/react` (the canvas iframe host) — they
 * share the `src/react/` directory but build as distinct bundles, so generated
 * code importing this doesn't pull in the host / protocol / DOM-mount machinery.
 */

// ——— $ctx: the data environment provided down the tree ———

/** The data context (`$ctx`) an ancestor data-provider contributes to its subtree. */
const DataEnvContext = createContext<Record<string, any>>({});

/**
 * Read the current `$ctx` — the merged data provided by ancestor
 * {@link DataProvider}s. Generated components call this to source `$ctx` (the
 * codegen counterpart of the canvas runtime's `EnvContext`). Returns `{}` when no provider is above.
 */
export function useDataEnv(): Record<string, any> {
  return useContext(DataEnvContext);
}

/**
 * A data-provider component wraps its children with this to contribute keys to
 * `$ctx` (e.g. `<DataProvider value={{ products }}>`). Values merge over the
 * ancestor context, matching `react/render.tsx`'s `EnvProvider`.
 */
export function DataProvider({
  value,
  children,
}: {
  value: Record<string, any>;
  children?: ReactNode;
}): ReactNode {
  const parent = useContext(DataEnvContext);
  return createElement(DataEnvContext.Provider, { value: { ...parent, ...value } }, children);
}

/**
 * Merge a node's base props with the active variant's overrides (the codegen
 * counterpart of the model's `effectiveProps`). Emitted only for nodes that carry
 * variant overrides; `active` is the component's currently active variant name.
 */
export function applyVariant(
  base: Record<string, unknown>,
  active: string | null | undefined,
  variants: Exclude<Node, string>["variants"]
): Record<string, any> {
  return engineEffectiveProps({ type: "", props: base, children: [], variants }, active ?? null);
}
