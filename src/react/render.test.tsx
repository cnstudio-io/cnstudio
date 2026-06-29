import { describe, it, expect, beforeAll } from "vitest";
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Component, Site } from "../engine/model";
import { EnvProvider, RenderRoot, type RenderCtx } from "./render";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function markup(
  comp: Component,
  site: Site,
  opts: Partial<RenderCtx> & { activeVariant?: string | null } = {}
): string {
  const ctx: RenderCtx = {
    site,
    tagPaths: opts.tagPaths ?? true,
    editing: opts.editing ?? null,
    resolveCode: opts.resolveCode,
  };
  return renderToStaticMarkup(
    createElement(RenderRoot, { comp, ctx, activeVariant: opts.activeVariant ?? null })
  );
}

// ── Gate 1: structural port — every render branch in a components-only tree ──
// There are NO host/DOM tags in the model: a node's `type` always names a
// component, and a node's PROP VALUES are JS expressions (evaluated against the
// `$` env). DOM leaves come from *code components* whose own JSX makes elements.
describe("structural port", () => {
  // A code component that spreads props onto a div — our DOM leaf for the test.
  const Box: ComponentType<Record<string, unknown>> = ({ children, ...rest }) =>
    createElement("div", rest, children as ReactNode);
  const resolveCode = (t: string) => (t === "Box" ? Box : undefined);

  const site: Site = {
    components: [
      {
        // A component IS a node: type/props/children live directly on it.
        name: "Page",
        variantNames: ["Hover"],
        type: "Box",
        // `title` is a JS expression evaluated at render; the active variant
        // overrides a second prop. Both flow through Box onto the div.
        props: { title: "'A' + 'lice'" },
        variants: { Hover: { "data-h": "1" } },
        children: [
          "Hello", // literal text child
          { type: "Card", props: {}, children: ["slotted"] },
          // A custom component — `type` isn't a code component, so it renders
          // dynamically as <section …>{children}</section>.
          { type: "section", props: { "data-x": "'y'" }, children: ["inside"] },
        ],
      },
      {
        name: "Card",
        type: "Box",
        props: {},
        children: [{ type: "slot", props: {}, children: ["default"] }],
      },
    ],
  };
  const page = site.components[0];
  const html = markup(page, site, { resolveCode });

  it("tags the editable root by path", () => {
    expect(html).toContain('data-spath=""');
  });
  it("renders a literal text child and evaluates a prop expression", () => {
    expect(html).toContain("Hello"); // literal text, verbatim
    expect(html).toContain('title="Alice"'); // the prop expression, evaluated
  });
  it("expands a model-component instance, with provided slot content", () => {
    expect(html).toContain("slotted"); // slot content from the instance's children
    expect(html).not.toContain("default"); // slot default replaced
  });
  it("renders a custom component dynamically as its element", () => {
    expect(html).toContain("<section"); // the custom component's tag
    expect(html).toContain('data-x="y"'); // its prop expression, evaluated
    expect(html).toContain("inside"); // its children
  });
  it("applies the active variant only when set", () => {
    expect(html).not.toContain('data-h="1"');
    expect(markup(page, site, { resolveCode, activeVariant: "Hover" })).toContain('data-h="1"');
  });
});

// ── Gate 2: action binding — an event expr wired to a handler ──
describe("event action binding", () => {
  const calls: string[] = [];
  const Btn: ComponentType<Record<string, unknown>> = (props) =>
    createElement("button", { onClick: props.onClick as () => void }, "go");

  const site: Site = {
    components: [
      {
        name: "Page",
        type: "Btn",
        // Action binds to a $ctx-provided handler — no $state involved.
        props: { onClick: "$ctx.handle('hi')" },
        children: [],
      },
    ],
  };

  it("invokes the bound action against the $ctx env", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ctx: RenderCtx = { site, tagPaths: false, editing: null, resolveCode: (t) => (t === "Btn" ? Btn : undefined) };
    act(() => {
      root.render(
        createElement(
          EnvProvider,
          { ctx: { handle: (m: string) => calls.push(m) } },
          createElement(RenderRoot, { comp: site.components[0], ctx, activeVariant: null })
        )
      );
    });
    container.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual(["hi"]);
    act(() => root.unmount());
  });
});

// ── Gate 3: provider — a component contributes $ctx, a child binds it ──
describe("$ctx provider", () => {
  const Provider: ComponentType<Record<string, unknown>> = ({ children }) =>
    createElement(EnvProvider, { ctx: { greeting: { data: "hi there" } }, children: children as ReactNode });
  // A code component that binds a $ctx value onto a div title (DOM leaf).
  const Label: ComponentType<Record<string, unknown>> = (props) =>
    createElement("div", { title: props.title as string }, props.children as ReactNode);

  const site: Site = {
    components: [
      {
        name: "Page",
        type: "Provider",
        props: {},
        children: [{ type: "Label", props: { title: "$ctx.greeting.data" }, children: ["x"] }],
      },
    ],
  };

  it("resolves a $ctx binding supplied by an ancestor component", () => {
    const html = markup(site.components[0], site, {
      tagPaths: false,
      resolveCode: (t) => (t === "Provider" ? Provider : t === "Label" ? Label : undefined),
    });
    expect(html).toContain('title="hi there"');
  });
});
