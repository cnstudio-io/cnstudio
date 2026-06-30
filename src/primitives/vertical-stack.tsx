import * as React from "react";

const ALIGN = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
} as const;

const JUSTIFY = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
} as const;

/**
 * A vertical flex container — a studio layout primitive. Lays its children out in
 * a column with a configurable gap and alignment. Pairs with HorizontalStack.
 */
export function VerticalStack({
  gap = 8,
  align = "stretch",
  justify = "start",
  style,
  ...props
}: React.ComponentProps<"div"> & {
  /** Space between children, in pixels. */
  gap?: number;
  /** Cross-axis (horizontal) alignment of children. */
  align?: keyof typeof ALIGN;
  /** Main-axis (vertical) distribution of children. */
  justify?: keyof typeof JUSTIFY;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap,
        alignItems: ALIGN[align],
        justifyContent: JUSTIFY[justify],
        ...style,
      }}
      {...props}
    />
  );
}
