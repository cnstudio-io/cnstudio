/**
 * The hard-coded public type for the Studio engine (`StudioCtx`) — its trunk and
 * its manager namespaces, one file per node, mirroring `cnstudio-extension/src/StudioCtx`.
 *
 * The extension implements this and returns the live instance; consumers get a
 * fully-enumerated, documented surface WITHOUT any dependency on the engine's
 * (closed) implementation. Only the shared model types are imported.
 */
import type { Component } from "../../engine/model";
import type { Transaction } from "../Transaction";
import type { ModelApi } from "./ModelIo";
import type { ArenasApi } from "./ArenaManager";
import type { FocusApi } from "./FocusManager";
import type { HistoryApi } from "./HistoryManager";
import type { InsertApi } from "./Insert";
import type { ClipboardApi } from "./Clipboard";
import type { ViewportApi } from "./Viewport";
import type { CodeComponentsApi } from "./CodeComponentRegistry";
import type { InteractionApi } from "./InteractionManager";
import type { PanelsApi } from "./Panels";
import type { HoverApi, TextEditingApi, VariantsApi } from "../ViewCtx";

export * from "./ModelIo";
export * from "./ArenaManager";
export * from "./FocusManager";
export * from "./HistoryManager";
export * from "./Insert";
export * from "./Clipboard";
export * from "./Viewport";
export * from "./InteractionManager";
export * from "./CodeComponentRegistry";
export * from "./Panels";

/** An ephemeral render instance (artboard) of an arena's component. */
export interface Frame {
  id: string;
  arena: string;
}

export type ChangeFn = (tx: Transaction) => void;
export interface ChangeOpts {
  /** Skip writing the undo log for this change. */
  unlogged?: boolean;
  /** Run even when {@link ChangeApi.blockChanges} is set. */
  unsafe?: boolean;
}

/** The callable `change` namespace: `studio.change(tx => …)`. */
export interface ChangeApi {
  /** Run a tracked, undoable edit on the current component. */
  (f: ChangeFn, opts?: ChangeOpts): void;
  /** Run a change bypassing the read-only gate. */
  unsafe(f: ChangeFn, opts?: ChangeOpts): void;
  /** Run a change without writing the undo log. */
  unlogged(f: ChangeFn): void;
  /** Await canvas eval settling after a change. */
  awaitEval(): Promise<void>;
  readonly isChanging: boolean;
  readonly hasPendingModelChanges: boolean;
  /** Hard read-only gate: when set, `change(f)` is a no-op (bypass via `unsafe`). */
  blockChanges: boolean;
}

/**
 * The Studio engine. Every operation hangs off a namespace; mutations go through
 * `change(tx => …)`. The extension returns the live instance from `activate()`.
 */
export interface StudioCtx {
  /** Run a tracked, undoable edit: `studio.change(tx => tx.setProp(...))`. */
  readonly change: ChangeApi;
  readonly model: ModelApi;
  readonly arenas: ArenasApi;
  readonly focus: FocusApi;
  readonly history: HistoryApi;
  readonly insert: InsertApi;
  readonly clipboard: ClipboardApi;
  readonly viewport: ViewportApi;
  readonly codeComponents: CodeComponentsApi;
  readonly interaction: InteractionApi;
  /** Editor shell: side panels, command palette, edit/preview mode. */
  readonly panels: PanelsApi;
  /** Hover on the active (focused) frame, or undefined when none is focused. */
  readonly hover: HoverApi | undefined;
  /** Inline text editing on the active frame, or undefined when none is focused. */
  readonly text: TextEditingApi | undefined;
  /** Variants of the active frame's edited component, or undefined when none. */
  readonly variants: VariantsApi | undefined;
  /** The component backing the current arena. */
  currentComponent(): Component | undefined;
}

/** What the extension returns from `activate()`: the live engine. */
export interface StudioExports {
  /** The live `StudioCtx` — control the entire Studio through it. */
  studio: StudioCtx;
}
