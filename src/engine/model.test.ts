// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fillSlot, parseNode, serializeNode, slotName, type Node } from "./model";

describe("slot routing helpers", () => {
  it("reads a marker's raw literal name ('' = the default slot)", () => {
    expect(slotName({ type: "Slot", props: { name: "header" }, children: [] })).toBe("header");
    expect(slotName({ type: "Slot", props: {}, children: [] })).toBe("");
    expect(slotName("text")).toBe("");
  });
  it("reads a fill's raw literal routing key ('' = the default slot)", () => {
    expect(fillSlot({ type: "Card", props: { slot: "header" }, children: [] })).toBe("header");
    expect(fillSlot({ type: "Card", props: {}, children: [] })).toBe("");
    expect(fillSlot("text")).toBe("");
  });
});

describe("legacy named-slot record migration", () => {
  it("folds a pre-0.3.6 `slots` record into `children` with the routing prop", () => {
    const n = parseNode({
      type: "Shell",
      props: {},
      children: ["body"],
      slots: { header: [{ type: "Card", props: {}, children: [] }, "loose text"] },
    }) as Exclude<Node, string>;
    expect(n.children).toEqual([
      "body",
      { type: "Card", props: { slot: "header" }, children: [] },
      // A loose text fill can't carry a prop — it's wrapped in a Custom node.
      { type: "Custom", props: { slot: "header" }, children: ["loose text"] },
    ]);
    // The record never round-trips back out.
    expect(serializeNode(n)).not.toHaveProperty("slots");
  });
});
