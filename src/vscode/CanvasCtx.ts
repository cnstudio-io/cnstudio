import type { Rect } from "../engine/viewport";
import type { HostMsg, RenderMsg } from "../engine/protocol";

/**
 * The studio-side postMessage channel to one frame's canvas-host iframe. Owns no
 * DOM and runs no React — it points the iframe at the host bundle, posts render
 * payloads, and fans out host events. (Mirrors `CanvasCtx` in cnstudio-extension.)
 */
export interface CanvasCtx {
  readonly name: string;
  /** Latest element rects the host reported, keyed by `path.join(".")`. */
  rects: Record<string, Rect>;
  /** Point the iframe at the host bundle and start listening. */
  bind(iframe: HTMLIFrameElement): void;
  /** The current payload revision (echoed back by the host on every event). */
  readonly rev: number;
  /** Bump + return the next revision. */
  nextRev(): number;
  /** studio → host. */
  post(msg: RenderMsg): void;
  /** Subscribe to host → studio events. Returns an unsubscribe. */
  onMessage(handler: (m: HostMsg) => void): () => void;
  readonly isReady: boolean;
  readonly isDisposed: boolean;
  dispose(): void;
}
