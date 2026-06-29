/**
 * The `$` environment expressions evaluate against — cnstudio's data-binding env.
 * Built per component boundary by the render path and provided down via
 * `EnvContext`. There is intentionally no `$state`: cnstudio does data binding,
 * not state management. If an app needs reactive state, that's a user-authored
 * component that manages its own React state and provides values into `$ctx`.
 */
export interface Env {
  /** The resolved props of the enclosing component instance. */
  $props: Record<string, unknown>;
  /** Read-only data provided by an ancestor provider component. */
  $ctx: Record<string, unknown>;
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
