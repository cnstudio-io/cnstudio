import { describe, it, expect, beforeAll } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { EnvProvider, useDataEnv } from "./EnvProvider";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("useDataEnv / EnvProvider ($ctx)", () => {
  function Consumer() {
    const $ctx = useDataEnv();
    return createElement("span", null, `user: ${$ctx.user ?? "none"}`);
  }

  it("returns {} with no provider, and the merged value under one", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(createElement(Consumer)));
    expect(host.querySelector("span")!.textContent).toBe("user: none");

    act(() =>
      root.render(
        createElement(EnvProvider, { ctx: { user: "ada" } }, createElement(Consumer))
      )
    );
    expect(host.querySelector("span")!.textContent).toBe("user: ada");
    act(() => root.unmount());
  });
});
