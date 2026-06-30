import { createContext, createElement, type ReactNode, useContext } from "react";

/**
 * `$ctx` for GENERATED app code: the data environment an ancestor data-provider
 * contributes to its subtree. Split out from `react-web.ts` so the provider
 * component lives on its own; `react-web` re-exports {@link DataProvider} and
 * sources `useDataEnv` from {@link DataEnvContext} here. The canvas-runtime
 * counterpart is `EnvProvider` in `./EnvProvider`.
 */

/** The data context (`$ctx`) an ancestor data-provider contributes to its subtree. */
export const DataEnvContext = createContext<Record<string, any>>({});

/**
 * A data-provider component wraps its children with this to contribute keys to
 * `$ctx` (e.g. `<DataProvider value={{ products }}>`). Values merge over the
 * ancestor context, matching `react/EnvProvider.tsx`'s `EnvProvider`.
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
