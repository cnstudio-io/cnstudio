import { createRoot } from "react-dom/client";
import { CanvasHost } from "./CanvasHost";
import { host, isRenderMsg, type HostMsgInput, type RenderMsg } from "../engine/protocol";
import "./host.css";

// Mirror the canvas's console errors/warnings to the dev terminal (the host HTML
// defines `window.__cnlog`, which POSTs to the cnstudio Vite plugin's /log route).
// React/runtime errors log via console.error, so this surfaces them in the
// terminal without needing the iframe's devtools open.
const str = (a: unknown) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === "object" ? safeJson(a) : String(a));
function safeJson(a: unknown): string {
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}
/** Apply console printf substitution (%s/%d/%o/%c/…) like the browser does. */
function formatConsole(args: unknown[]): string {
  const [first, ...rest] = args;
  if (typeof first !== "string" || !/%[sdifoOc%]/.test(first)) return args.map(str).join(" ");
  let i = 0;
  const out = first.replace(/%([sdifoOc%])/g, (m, spec: string) => {
    if (spec === "%") return "%";
    if (i >= rest.length) return m;
    const a = rest[i++];
    if (spec === "c") return ""; // CSS styling directive — drop it (and its arg)
    if (spec === "d" || spec === "i") return String(Math.trunc(Number(a)));
    if (spec === "f") return String(Number(a));
    return str(a); // %s / %o / %O
  });
  const extra = rest.slice(i).map(str);
  return [out, ...extra].join(" ").trim();
}

const cnlog = (window as unknown as { __cnlog?: (level: string, message: string) => void }).__cnlog;
if (cnlog) {
  for (const level of ["error", "warn"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      cnlog(level, formatConsole(args));
      orig(...args);
    };
  }
}

/**
 * The injected canvas-host entry. The Vite plugin serves this as the iframe the
 * Studio extension loads (`studio.appUrl`). It renders RenderMsg payloads with the
 * project's real components and forwards RAW input back to the extension — every
 * outgoing message is stamped with its `schema` link via `host()`.
 *
 * `mount()` is also exported so a project can host the canvas at a custom route.
 */
export function mount(el: HTMLElement) {
  const root = createRoot(el);
  let lastRev = 0;
  let interactive = false;

  /** Stamp the `schema` link, then post to the parent (the extension's webview). */
  const post = (m: HostMsgInput) => window.parent.postMessage(host(m), "*");

  window.addEventListener("message", (e: MessageEvent) => {
    if (!isRenderMsg(e.data)) return;
    const msg = e.data as RenderMsg;
    lastRev = msg.rev;
    interactive = msg.interactive;
    root.render(<CanvasHost msg={msg} post={post} />);
  });

  const pathAt = (el: EventTarget | null): number[] | null => {
    let cur = el instanceof Element ? el : null;
    while (cur) {
      const sp = cur.getAttribute("data-spath");
      if (sp !== null) return sp === "" ? [] : sp.split(".").map(Number);
      cur = cur.parentElement;
    }
    return null;
  };
  const inEditable = (): boolean => {
    const t = document.activeElement as HTMLElement | null;
    return !!t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA");
  };

  window.addEventListener(
    "wheel",
    (e) => {
      if (interactive) return;
      e.preventDefault();
      post({ type: "wheel", rev: lastRev, deltaX: e.deltaX, deltaY: e.deltaY, x: e.clientX, y: e.clientY, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
    },
    { passive: false }
  );
  window.addEventListener("mousedown", (e) => {
    if (interactive) return;
    post({ type: "pointer", rev: lastRev, phase: "down", path: pathAt(e.target), x: e.clientX, y: e.clientY, button: e.button });
  });
  window.addEventListener("mousemove", (e) => {
    if (interactive) return;
    post({ type: "pointer", rev: lastRev, phase: "move", path: pathAt(e.target), x: e.clientX, y: e.clientY, button: e.button });
  });
  window.addEventListener("mouseup", (e) => {
    if (interactive) return;
    post({ type: "pointer", rev: lastRev, phase: "up", path: pathAt(e.target), x: e.clientX, y: e.clientY, button: e.button });
  });
  window.addEventListener("click", (e) => {
    if (interactive || inEditable()) return;
    post({ type: "click", rev: lastRev, path: pathAt(e.target) });
  });
  window.addEventListener("dblclick", (e) => {
    if (interactive) return;
    post({ type: "dblclick", rev: lastRev, path: pathAt(e.target) });
  });
  window.addEventListener("keydown", (e) => {
    if (interactive) return;
    if (e.code === "Space" && !inEditable()) {
      e.preventDefault();
      post({ type: "space", rev: lastRev, down: true });
      return;
    }
    if (inEditable()) return;
    post({ type: "key", rev: lastRev, key: e.key, mod: e.metaKey || e.ctrlKey, shift: e.shiftKey });
    if (e.metaKey || e.ctrlKey || e.key === "Delete" || e.key === "Backspace") e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") post({ type: "space", rev: lastRev, down: false });
  });
  window.addEventListener("blur", () => post({ type: "space", rev: lastRev, down: false }));

  post({ type: "ready" });
}

// Auto-mount when the plugin serves this as the iframe entry.
const el = typeof document !== "undefined" && document.getElementById("cnstudio-root");
if (el) mount(el);
