/**
 * The app-runtime render path. Real React components give the `$` data-binding
 * env (`$props` / provided `$ctx`) a place to live. This barrel re-exports the
 * pieces, now split across their own files:
 *
 * - {@link NodeWrapper} (`./NodeWrapper`) — one per node; resolves props/events
 *   against the `$` env and renders the component instance / code component /
 *   host element / literal text / slot.
 * - {@link NodeComponent} (`./NodeComponent`) — the branch a wrapper delegates to
 *   for an *instance* node. The instance boundary: it sets `$props` for the
 *   subtree and provides the `$` env down. cnstudio does data binding, not state
 *   — there is no `$state`; reactivity is plain React.
 * - {@link RenderRoot} (`./RenderRoot`) — renders a component as the editable root.
 * - {@link RenderCtx} (`./RenderContext`) — the shared per-render invariants.
 * - `EnvProvider` (`./EnvProvider`) — contributes to `$ctx` for a subtree.
 *
 * This runs in the canvas iframe (and is the basis for codegen). It never runs in
 * the extension.
 */

export { type RenderCtx } from "./RenderContext";
export { NodeWrapper } from "./NodeWrapper";
export { NodeComponent } from "./NodeComponent";
export { RenderRoot } from "./RenderRoot";
export { EnvProvider } from "./EnvProvider";
