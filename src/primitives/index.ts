import type { ComponentType } from "react";
import type { PropSchema, RuntimeRegistry } from "../engine/schema";
import { DomElement } from "./dom-element";
import { HorizontalStack } from "./horizontal-stack";
import { VerticalStack } from "./vertical-stack";

export { DomElement, HorizontalStack, VerticalStack };

const ALIGN: string[] = ["start", "center", "end", "stretch", "baseline"];
const JUSTIFY: string[] = ["start", "center", "end", "between", "around", "evenly"];

const STACK_PROPS: Record<string, PropSchema> = {
  gap: { type: "number", default: 8 },
  align: { type: "enum", options: ALIGN, default: "stretch" },
  justify: { type: "enum", options: JUSTIFY, default: "start" },
};

/**
 * Built-in studio primitives — layout/structural components that ship WITH
 * cnstudio (not the user's project). They are merged into the runtime registry
 * (see `src/react/registry.ts`) under reserved names, so every project can place
 * them without installing anything. `Slot` is NOT here: it is engine-handled
 * (a reserved node type in the render path), not a code component.
 */
// Each primitive's prop type is its own specific shape; the runtime registry
// stores them under the generic `Record<string, unknown>` component type.
const erase = (c: unknown) => c as ComponentType<Record<string, unknown>>;

export const primitives: RuntimeRegistry = {
  DomElement: {
    component: erase(DomElement),
    props: { tag: { type: "string" } },
  },
  HorizontalStack: {
    component: erase(HorizontalStack),
    props: { ...STACK_PROPS, wrap: { type: "boolean", default: false } },
  },
  VerticalStack: {
    component: erase(VerticalStack),
    props: { ...STACK_PROPS },
  },
};

/**
 * Editor prop schemas for ALL primitives — the renderable ones above plus the
 * engine-handled `Loop` and `slot` (which have no component, but still have props
 * the Properties panel edits). The Vite plugin serves these for primitive names
 * instead of extracting from project source. `data` uses the Tier-1 `data-source`
 * custom control.
 */
export const primitiveSchemas: Record<string, Record<string, PropSchema>> = {
  DomElement: primitives.DomElement.props,
  HorizontalStack: primitives.HorizontalStack.props,
  VerticalStack: primitives.VerticalStack.props,
  Loop: {
    data: { type: "string", control: "data-source", label: "Data source" },
    name: { type: "string", default: "item", label: "Loop name" },
  },
  Slot: {
    name: { type: "string", label: "Slot name" },
  },
};

/** The reserved primitive names — used to keep project components from shadowing them. */
export const PRIMITIVE_NAMES = Object.keys(primitiveSchemas);
