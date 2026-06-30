import { createContext, createElement, type ReactNode, useContext } from "react";
import { type Env } from "./expr";

/**
 * `$ctx` for the CANVAS runtime: the `$` data-binding env threaded down via
 * `EnvContext`, and the provider a (data-provider) code component uses to
 * contribute to it. Split out from `./render` so the provider lives on its own;
 * `render.tsx` imports {@link EnvContext} for its node boundaries and re-exports
 * {@link EnvProvider}. The generated-code counterpart is `DataProvider` in
 * `./DataProvider`.
 */

/** The base `$` data-binding env. */
export const emptyEnv: Env = { $props: {}, $ctx: {} };

/** The `$` env threaded down the canvas render tree (`$props` / provided `$ctx`). */
export const EnvContext = createContext<Env>(emptyEnv);

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
