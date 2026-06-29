/** Editor view mode. `preview` hides all editor chrome + overlays. */
export type EditorMode = "edit" | "preview";

/** A collapsible side panel. */
export interface ToggleBox {
  readonly collapsed: boolean;
  toggle(): void;
}

/** An openable overlay panel (omnibar, shortcuts modal). */
export interface PanelBox {
  readonly open: boolean;
  show(): void;
  hide(): void;
  toggle(): void;
}

/** The edit/preview view-mode control. */
export interface ModeApi {
  readonly value: EditorMode;
  readonly isPreview: boolean;
  set(m: EditorMode): void;
  toggle(): void;
}

/**
 * `studio.panels` — the editor shell. Pure UI state (not history): collapsible
 * side panels, the command palette (omnibar), a shortcuts modal, and the
 * edit/preview view mode. (Mirrors `Panels` in cnstudio-extension.)
 */
export interface PanelsApi {
  /** The left (components/tree) panel. */
  readonly left: ToggleBox;
  /** The right (properties) panel. */
  readonly right: ToggleBox;
  /** The command palette. */
  readonly omnibar: PanelBox;
  /** The keyboard-shortcuts modal. */
  readonly shortcuts: PanelBox;
  /** The edit/preview view mode. */
  readonly mode: ModeApi;
}
