import { createElement, type ReactNode } from "react";
import { type Component } from "../engine/model";
import { RenderContext, type RenderCtx } from "./RenderContext";
import { NodeComponent } from "./NodeComponent";

/** Render a component as the editable root (the first, non-frozen NodeComponent). */
export function RenderRoot({
  comp,
  ctx,
  activeVariant,
}: {
  comp: Component;
  ctx: RenderCtx;
  activeVariant: string | null;
}): ReactNode {
  return createElement(
    RenderContext.Provider,
    { value: ctx },
    createElement(NodeComponent, {
      name: comp.name,
      instanceProps: {},
      fills: undefined,
      tagPath: ctx.tagPaths ? [] : null,
      frozen: false,
      activeVariant,
      depth: 0,
    })
  );
}
