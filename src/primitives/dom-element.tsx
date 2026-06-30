import * as React from "react";

/**
 * Renders a single plain HTML element of any `tag` — a studio layout primitive.
 * Lets the visual editor author raw DOM structure (wrappers, headers, lists, …)
 * that would otherwise need hand-written JSX, forwarding className, children, and
 * every standard HTML attribute/event onto the element.
 */
export function DomElement({
  tag,
  ...props
}: React.ComponentProps<"div"> & {
  /** The HTML tag to render. */
  tag: string;
}) {
  // No tag yet (e.g. a freshly-inserted node) — render nothing rather than
  // `<undefined>`, which React rejects.
  if (!tag) return null;
  const Tag = tag as React.ElementType;
  return <Tag {...props} />;
}
