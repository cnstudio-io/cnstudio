import type { Site } from "../../engine/model";

/** Document model I/O. */
export interface ModelApi {
  /** The current document. */
  readonly site: Site;
  /** Serialize the whole document to JSON. */
  toJSON(): unknown;
  /** Replace the whole document from JSON (resets history). */
  fromJSON(json: unknown): void;
}
