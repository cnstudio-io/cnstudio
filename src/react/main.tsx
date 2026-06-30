import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import { CanvasHost } from "./CanvasHost";
import { DataProvider } from "./DataProvider";
import { host, isCaptureMsg, isRenderMsg, render, type HostMsgInput, type RenderMsg } from "../engine/protocol";
import "./host.css";

// Example `$ctx` the Vite plugin injects from `.studio/dev-context.json` so the
// canvas renders `$ctx`-reading components (which call `useDataEnv()`) with
// realistic data while editing. Provided via `<DataProvider>` around the host.
const DEV_CTX: Record<string, unknown> =
  (window as unknown as { __CNSTUDIO_DEVCTX__?: Record<string, unknown> }).__CNSTUDIO_DEVCTX__ ?? {};

/** The standalone payload the Vite plugin injects for a `?component=` page. */
interface Standalone {
  siteJson: unknown;
  componentName: string;
  activeVariant: string | null;
}

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

  // Rasterize the rendered component to a PNG and post it back. Captures just the
  // model subtree (`.__studio_root`), so editor chrome — selection/hover/drop
  // overlays drawn by the host — never lands in the screenshot. An empty `dataUrl`
  // signals failure (a broken render, a tainted resource) to the editor.
  const capture = async () => {
    const target = el.querySelector<HTMLElement>(".__studio_root") ?? el;
    try {
      const rect = target.getBoundingClientRect();
      const dataUrl = await toPng(target, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
      post({ type: "captured", dataUrl, width: Math.round(rect.width), height: Math.round(rect.height) });
    } catch (err) {
      console.error("[cnstudio] screenshot capture failed", err);
      post({ type: "captured", dataUrl: "", width: 0, height: 0 });
    }
  };

  window.addEventListener("message", (e: MessageEvent) => {
    if (isCaptureMsg(e.data)) {
      void capture();
      return;
    }
    if (!isRenderMsg(e.data)) return;
    const msg = e.data as RenderMsg;
    lastRev = msg.rev;
    interactive = msg.interactive;
    root.render(
      <DataProvider value={DEV_CTX}>
        <CanvasHost msg={msg} post={post} />
      </DataProvider>
    );
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

/**
 * Standalone mount: render the component directly from the plugin-injected site
 * model, with no editor driving it over postMessage. Used when the host page is
 * opened on its own (the "Open in browser" button → `?component=Name`). `post` is
 * a no-op — there is no parent editor to report measurements/input to.
 */
function mountStandalone(el: HTMLElement, std: Standalone) {
  const msg: RenderMsg = render({
    rev: 1,
    modelRev: 1,
    siteJson: std.siteJson,
    componentName: std.componentName,
    activeVariant: std.activeVariant,
    selection: null,
    hover: null,
    editingPath: null,
    dropIndicator: null,
    interactive: true,
  });
  createRoot(el).render(
    <DataProvider value={DEV_CTX}>
      <CanvasHost msg={msg} post={() => {}} />
    </DataProvider>
  );
}

// Auto-mount when the plugin serves this as the iframe entry. A `?component=`
// page carries a standalone payload → render it directly; otherwise wait for the
// editor's render messages (the iframe case).
const el = typeof document !== "undefined" && document.getElementById("cnstudio-root");
const standalone = (window as unknown as { __CNSTUDIO_STANDALONE__?: Standalone }).__CNSTUDIO_STANDALONE__;
if (el && standalone) mountStandalone(el, standalone);
else if (el) mount(el);
