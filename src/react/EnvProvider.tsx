import {
  Children,
  cloneElement,
  createContext,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import { effectiveProps as engineEffectiveProps, type Node } from "../engine/model";

/**
 * The `$` environment expressions evaluate against — cnstudio's ONE data-binding
 * env. There is no second env: the canvas interpreter and generated app code both
 * thread `$ctx` down through {@link EnvContext} and read it through the same
 * accessor. There is intentionally no `$state`: cnstudio does data binding, not
 * state management. If an app needs reactive state, that's a user-authored
 * component that manages its own React state and provides values into `$ctx`.
 */
export interface Env {
  /** The resolved props of the enclosing component instance. */
  $props: Record<string, unknown>;
  /** Read-only data provided by an ancestor provider component. */
  $ctx: Record<string, unknown>;
  /**
   * Loop variables, keyed by each enclosing `<Loop>`'s `name` prop. A child reads
   * `$loop.<name>.current` (the current element), `$loop.<name>.index`, and
   * `$loop.<name>.all` (the whole array). Nested loops accumulate distinct names
   * (`$loop.product`, `$loop.tag`).
   */
  $loop?: Record<string, { current: unknown; index: number; all: unknown[] }>;
}

/** The base `$` data-binding env. */
export const emptyEnv: Env = { $props: {}, $ctx: {} };

/** The single `$` env threaded down the render tree (`$props` / provided `$ctx`). */
export const EnvContext = createContext<Env>(emptyEnv);

/**
 * Lets a (data-provider) code component contribute to `$ctx` for its subtree —
 * the one primitive behind "queries". A component fetches with its own hook and
 * wraps its children: `<EnvProvider ctx={{ products: result }}>`. Values merge
 * over the ancestor `$ctx`; `$props`/`$loop` flow through unchanged.
 */
export function EnvProvider(
  { ctx, children }: { ctx: Record<string, unknown>; children: ReactNode; }
): ReactNode {

  const parent = useContext(EnvContext);
  const env: Env = { ...parent, $ctx: { ...parent.$ctx, ...ctx } };
  return createElement(EnvContext.Provider, { value: env }, children);
}

/** A compiled expression / action. `$` is the {@link Env}; `$event` only for actions. */
type Compiled = (env: Env, $event?: unknown) => unknown;

/**
 * Compile cache — keyed by mode + source. Uses a sloppy-mode `Function` so `with`
 * is permitted: every `$props`/`$ctx` (and `$` itself) becomes a bare identifier
 * in scope. This is the app-runtime evaluator; it never runs in the extension.
 * (Codegen will emit these as real source instead of `new Function`.)
 */
const cache = new Map<string, Compiled>();

function compile(code: string, action: boolean): Compiled {
  const key = (action ? "a:" : "v:") + code;
  let fn = cache.get(key);
  if (!fn) {
    const body = action
      ? `with($){ ${code}\n; }`
      : `with($){ return (${code}); }`;
    // eslint-disable-next-line no-new-func
    fn = new Function("$", "$event", body) as Compiled;
    cache.set(key, fn);
  }
  return fn;
}

/** Evaluate a value expression against `env`; returns `fallback` if it throws. */
export function evalExpr(code: string, env: Env, fallback?: unknown): unknown {
  try {
    return compile(code, false)(env);
  } catch (e) {
    console.warn(`[cnstudio] expression failed: ${code}`, e);
    return fallback;
  }
}

/** Run an action (statements; may write `$state`) with the DOM `$event` in scope. */
export function evalAction(code: string, env: Env, $event?: unknown): void {
  try {
    compile(code, true)(env, $event);
  } catch (e) {
    console.warn(`[cnstudio] action failed: ${code}`, e);
  }
}

/**
 * Resolve a prop value against `env`. A string is a JavaScript expression source
 * — evaluated (`"$props.title"`, `"'Open'"`, `"42"`). Any non-string value is an
 * already-resolved literal and is returned as-is.
 */
export function resolveValue(v: unknown, env: Env): unknown {
  return typeof v === "string" ? evalExpr(v, env) : v;
}

/**
 * Read the current `$ctx` — the merged data provided by ancestor `<EnvProvider>`s.
 * Generated components call this to source `$ctx`. Returns `{}` when no provider
 * is above. This module is the `@cnstudio-io/cnstudio/react-web` entry: a generated app
 * imports it for data binding without pulling in the canvas host / protocol / DOM
 * mount machinery (those live in `./main` behind the `@cnstudio-io/cnstudio/react` entry).
 */
export function useDataEnv(): Record<string, any> {
  return useContext(EnvContext).$ctx;
}

// Built-in layout primitives. Generated code references them by bare name
// (`DomElement`, `HorizontalStack`, `VerticalStack`) the same way the canvas
// runtime merges them into its registry — so codegen emits an import from here
// rather than from project source (they ship with cnstudio, not the project).
export { DomElement, HorizontalStack, VerticalStack } from "../primitives";

/**
 * A generated component's slot filter. cnstudio routes slot content by the
 * reserved `slot` prop on an instance's children: codegen emits each named
 * `Slot` marker as `{pickSlot($props.children, "name")}` and the fills as JSX
 * children carrying `slot="name"`. This picks the children whose `slot`
 * matches (`""` = the default slot: children with no `slot`), stripping the
 * routing prop so it never reaches the DOM.
 */
export function pickSlot(children: ReactNode, name: string): ReactNode {
  const slotOf = (c: ReactNode): string => {
    if (!isValidElement(c)) return "";
    const s = (c.props as Record<string, unknown>).slot;
    return typeof s === "string" ? s : "";
  };
  return Children.toArray(children)
    .filter((c) => slotOf(c) === name)
    .map((c) =>
      isValidElement(c) && (c.props as Record<string, unknown>).slot !== undefined
        ? cloneElement(c as ReactElement<{ slot?: string }>, { slot: undefined })
        : c
    );
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
