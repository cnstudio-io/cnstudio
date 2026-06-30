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
 * A horizontal flex container — a studio layout primitive. Lays its children out
 * in a row with a configurable gap and alignment. Pairs with VerticalStack.
 */
export function HorizontalStack({
  gap = 8,
  align = "stretch",
  justify = "start",
  wrap = false,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  /** Space between children, in pixels. */
  gap?: number;
  /** Cross-axis (vertical) alignment of children. */
  align?: keyof typeof ALIGN;
  /** Main-axis (horizontal) distribution of children. */
  justify?: keyof typeof JUSTIFY;
  /** Allow children to wrap onto multiple rows. */
  wrap?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap,
        alignItems: ALIGN[align],
        justifyContent: JUSTIFY[justify],
        flexWrap: wrap ? "wrap" : "nowrap",
        ...style,
      }}
      {...props}
    />
  );
}
