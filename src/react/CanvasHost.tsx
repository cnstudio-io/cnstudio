import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import { parseSite, type NodePath, type Site } from "../engine/model";
import type { HostMsgInput, RenderMsg } from "../engine/protocol";
import { RenderRoot } from "./render";
import { resolveCode } from "./registry";

/** Post a message body; `main.tsx` stamps the `schema` link before sending. */
type Post = (m: HostMsgInput) => void;

/** Walk up from a DOM node to the nearest `data-spath`, bounded by `root`. */
function nodeAtEl(root: HTMLElement, el: Element): NodePath | undefined {
  let cur: Element | null = el;
  while (cur && (cur === root || root.contains(cur))) {
    const sp = cur.getAttribute("data-spath");
    if (sp !== null) return sp === "" ? [] : sp.split(".").map(Number);
    cur = cur.parentElement;
  }
  return undefined;
}

/** Local (unscaled) rect of `path` relative to `root`, or null. */
function rectOf(root: HTMLElement, path: NodePath) {
  const el = root.querySelector(`[data-spath="${path.join(".")}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  return { left: r.left - rr.left, top: r.top - rr.top, width: r.width, height: r.height };
}

/**
 * The canvas-host React tree (the only React in this bundle's iframe). Renders the
 * model from the {@link RenderMsg} payload using the project's REAL components
 * (via {@link resolveCode}), draws every overlay itself, and reports raw user
 * intent back through {@link Post}.
 */
export function CanvasHost({ msg, post }: { msg: RenderMsg; post: Post }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { rev, selection, hover, editingPath, dropIndicator } = msg;

  const site: Site | undefined = msg.siteJson ? parseSite(msg.siteJson) : undefined;
  const comp = site?.components.find((c) => c.name === msg.componentName);

  // Render the model ONLY when the model itself changes (keyed on modelRev +
  // variant + edit target + data). Overlay-only updates reuse this cached tree.
  const content = useMemo(
    () =>
      comp ? (
        <RenderRoot
          comp={comp}
          activeVariant={msg.activeVariant}
          ctx={{
            site,
            resolveCode,
            editing: editingPath,
            tagPaths: true,
          }}
        />
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [msg.modelRev, msg.activeVariant, editingPath ? editingPath.join(".") : ""]
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    post({ type: "rendered", rev, height: root.scrollHeight });

    root.querySelectorAll<HTMLElement>("[draggable]").forEach((el) => el.removeAttribute("draggable"));
    if (selection && !editingPath && selection.length) {
      const el = root.querySelector<HTMLElement>(`[data-spath="${selection.join(".")}"]`);
      if (el) el.setAttribute("draggable", "true");
    }
    const rects: Record<string, ReturnType<typeof rectOf>> = {};
    if (selection) rects[selection.join(".")] = rectOf(root, selection);
    post({ type: "rects", rev, rects: rects as Record<string, never> });

    if (editingPath) {
      const el = root.querySelector<HTMLElement>(`[data-spath="${editingPath.join(".")}"]`);
      if (el && document.activeElement !== el) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  });

  if (!comp) return null;

  const root = rootRef.current;
  const selBox = root && selection ? rectOf(root, selection) : null;
  const hovBox =
    root && hover && hover.join(".") !== selection?.join(".") ? rectOf(root, hover) : null;
  const dropBox = root && dropIndicator ? rectOf(root, dropIndicator.path) : null;

  return (
    <div
      ref={rootRef}
      className="host-stage"
      onDragStart={(e) => {
        const r = rootRef.current;
        const path = r ? nodeAtEl(r, e.target as Element) : undefined;
        if (path && path.length) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", "");
          post({ type: "dragStart", rev, path });
        } else {
          e.preventDefault();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        const r = rootRef.current;
        if (!r) return;
        const path = nodeAtEl(r, e.target as Element) ?? [];
        const el = path.length ? r.querySelector(`[data-spath="${path.join(".")}"]`) : null;
        const box = el?.getBoundingClientRect();
        const relY = box && box.height ? (e.clientY - box.top) / box.height : 0.5;
        post({ type: "dragOver", rev, path, relY });
      }}
      onDrop={(e) => {
        e.preventDefault();
        post({ type: "drop", rev });
      }}
    >
      <div
        className="__studio_root"
        onBlur={(e) => {
          const sp = (e.target as HTMLElement).getAttribute("data-spath");
          if (editingPath && sp === editingPath.join(".")) {
            post({
              type: "textCommit",
              rev,
              path: editingPath,
              value: (e.target as HTMLElement).textContent ?? "",
            });
          }
        }}
        onKeyDown={(e) => {
          if (!editingPath) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLElement).blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            post({ type: "textCancel", rev });
          }
        }}
      >
        {/* Code components are lazy (loaded on demand), so they need a Suspense
            boundary while their module imports. */}
        <Suspense fallback={null}>{content}</Suspense>
      </div>

      {hovBox && !dropBox && <div className="hover-box" style={boxStyle(hovBox)} />}
      {selBox && <div className="sel-box" style={boxStyle(selBox)} />}
      {dropBox && dropIndicator?.pos === "inside" && (
        <div className="drop-inside" style={boxStyle(dropBox)} />
      )}
      {dropBox && dropIndicator && dropIndicator.pos !== "inside" && (
        <div
          className="drop-line"
          style={{
            position: "absolute",
            left: dropBox.left,
            top: dropIndicator.pos === "before" ? dropBox.top : dropBox.top + dropBox.height,
            width: dropBox.width,
          }}
        />
      )}
    </div>
  );
}

function boxStyle(b: { left: number; top: number; width: number; height: number }) {
  return { position: "absolute" as const, left: b.left, top: b.top, width: b.width, height: b.height };
}
