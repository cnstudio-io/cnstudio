import type { NodePath } from "./model";
import type { Rect } from "./viewport";

/**
 * The host ⇄ extension message contract. There is a JSON Schema FILE per message
 * under `@cnstudio-io/cnstudio/schemas/` and every message carries a `schema` property that
 * LINKS to its own file (the `$schema` convention). These TS types mirror those
 * schemas — in the real build they are generated from them; here they are
 * hand-written so the draft is readable.
 *
 * NOTE: the version lives in the URL path (`/v1/`); bump it for any breaking change.
 */
export const SCHEMA_BASE =
  "https://raw.githubusercontent.com/cnstudio-io/cnstudio/main/schemas/v1";

/** Every message type → the URL of its schema file. */
export type MsgType =
  | "render"
  | "capture"
  | "ready"
  | "rendered"
  | "captured"
  | "rects"
  | "pointer"
  | "wheel"
  | "space"
  | "key"
  | "click"
  | "dblclick"
  | "textCommit"
  | "textCancel"
  | "dragStart"
  | "drop"
  | "dragOver";

/** The schema-file URL for a message type. */
export const schemaUrl = (t: MsgType): string => `${SCHEMA_BASE}/${t}.json`;

/** Common envelope: every message links to its schema file + names its type. */
interface Envelope<T extends MsgType> {
  schema: string; // === schemaUrl(type)
  type: T;
}

/** A drop indicator the host draws while dragging. */
export interface DropIndicator {
  path: NodePath;
  pos: "before" | "after" | "inside";
}

/** extension → host: the complete state to render. */
export interface RenderMsg extends Envelope<"render"> {
  rev: number;
  modelRev: number;
  siteJson: unknown;
  componentName: string;
  activeVariant: string | null;
  selection: NodePath | null;
  hover: NodePath | null;
  editingPath: NodePath | null;
  dropIndicator: DropIndicator | null;
  interactive: boolean;
}

/** extension → host: ask the host to rasterize the rendered component to a PNG
 * (it replies with a `captured` message). Carries no payload — the host captures
 * whatever it is currently showing. */
export interface CaptureMsg extends Envelope<"capture"> {}

/** host → extension: raw input + measurements (the extension interprets it). */
export type HostMsg =
  | Envelope<"ready">
  | (Envelope<"rendered"> & { rev: number; height: number })
  | (Envelope<"captured"> & { dataUrl: string; width: number; height: number })
  | (Envelope<"rects"> & { rev: number; rects: Record<string, Rect> })
  | (Envelope<"pointer"> & {
      rev: number;
      phase: "down" | "move" | "up";
      path: NodePath | null;
      x: number;
      y: number;
      button: number;
    })
  | (Envelope<"wheel"> & { rev: number; deltaX: number; deltaY: number; x: number; y: number; ctrl: boolean; shift: boolean })
  | (Envelope<"space"> & { rev: number; down: boolean })
  | (Envelope<"key"> & { rev: number; key: string; mod: boolean; shift: boolean })
  | (Envelope<"click"> & { rev: number; path: NodePath | null })
  | (Envelope<"dblclick"> & { rev: number; path: NodePath | null })
  | (Envelope<"textCommit"> & { rev: number; path: NodePath; value: string })
  | (Envelope<"textCancel"> & { rev: number })
  | (Envelope<"dragStart"> & { rev: number; path: NodePath })
  | (Envelope<"dragOver"> & { rev: number; path: NodePath; relY: number })
  | (Envelope<"drop"> & { rev: number });

/** Omit that distributes over a union (plain `Omit` collapses to the shared keys). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A host message body without its `schema` link — what call sites construct. */
export type HostMsgInput = DistributiveOmit<HostMsg, "schema">;

/** Stamp the `schema` link onto a message body (omit `schema` at the call site). */
export function host(msg: HostMsgInput): HostMsg {
  return { ...msg, schema: schemaUrl(msg.type) } as HostMsg;
}

/** A render-message body without its envelope (`schema`/`type`) — what the
 * extension constructs; {@link render} stamps the envelope on. */
export type RenderMsgInput = Omit<RenderMsg, "schema" | "type">;

/** Stamp the envelope (`schema` link + `type`) onto a render-message body — the
 * {@link RenderMsg} counterpart to {@link host}. The engine owns the protocol
 * convention, so the extension never hand-writes `schema`/`type`. */
export function render(msg: RenderMsgInput): RenderMsg {
  return { ...msg, type: "render", schema: schemaUrl("render") };
}

/** Type guard for messages arriving from the host. */
export function isHostMsg(v: unknown): v is HostMsg {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as HostMsg).type === "string" &&
    typeof (v as HostMsg).schema === "string"
  );
}

/** Type guard for the render message arriving from the extension. */
export function isRenderMsg(v: unknown): v is RenderMsg {
  return !!v && typeof v === "object" && (v as RenderMsg).type === "render";
}

/** Stamp the envelope onto a capture request — the extension's counterpart to
 * {@link render} for the (payload-free) capture command. */
export function capture(): CaptureMsg {
  return { type: "capture", schema: schemaUrl("capture") };
}

/** Type guard for the capture request arriving from the extension. */
export function isCaptureMsg(v: unknown): v is CaptureMsg {
  return !!v && typeof v === "object" && (v as CaptureMsg).type === "capture";
}
