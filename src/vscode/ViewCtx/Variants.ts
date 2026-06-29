/** `viewCtx.variants` (also `studio.variants` for the active frame) — declare and
 * activate variants on the edited component. (Mirrors `Variants` in
 * cnstudio-extension.) */
export interface VariantsApi {
  /** Variants declared by the edited component (excludes base). */
  readonly available: string[];
  /** The active variant, or null for base. */
  readonly active: string | null;
  /** Activate a declared variant, or null for base. */
  activate(name: string | null): void;
  /** Declare a new variant (undoable) and activate it. */
  add(name: string): void;
}
