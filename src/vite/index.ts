import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Plugin } from "vite";
import { syncRegistry, loadConfig, SITE_FILE, REGISTRY_FILE } from "../generate/cli";
import { extractComponentProps } from "../generate/index";
import { parseSite } from "../engine/model";
import { makeFiles, WEB } from "../generate/codegen";
import type { PropSchema, RegistryFile } from "../engine/schema";
import { primitiveSchemas } from "../primitives";

export interface CnstudioOptions {
  /** Globs of component files to register. */
  components?: string[];
  /** Project tsconfig (for prop extraction). */
  tsconfig?: string;
  /** Where `.studio/` lives, relative to project root. */
  studioDir?: string;
  /** The project CSS to load into the canvas (real theme/fonts). */
  css?: string;
  /** Path the extension's `studio.appUrl` points at. */
  route?: string;
  /**
   * Directory (relative to root) where the plugin lazily generates one real
   * `.tsx` per design page — on first import, NOT eagerly. e.g. `"app/javascript/
   * generated"`, then the app imports `@/generated/<name>`. The file is (re)written
   * to disk and regenerated on every site-model change (HMR). Omit to disable
   * on-demand generation (use the `cnstudio generate` CLI instead).
   */
  pages?: string;
}

const V_REGISTRY = "virtual:cnstudio/registry";
const V_ENTRY = "virtual:cnstudio/entry";
const resolved = (id: string) => "\0" + id;

/**
 * The cnstudio plugin. It (1) runs the generator → `.studio/registry.json` and
 * re-runs it when components change, (2) synthesizes a virtual module that imports
 * the project's REAL components for the runtime, (3) serves the injected
 * canvas-host entry the Studio extension loads as its iframe (dev only), and
 * (4) codegens design pages on import (when `options.pages` is set).
 *
 * Runs in BOTH serve and build: the canvas host is naturally dev-only (its
 * `configureServer` middleware and entry module are only reachable in serve), but
 * page codegen must also run during `vite build` so production bundles the
 * generated `.tsx` without a separate `cnstudio generate` step.
 */
export function cnstudio(options: CnstudioOptions = {}): Plugin {
  const studioDir = options.studioDir ?? ".studio";
  const route = options.route ?? "/__cnstudio/";
  let root = process.cwd();

  // The JSON-config endpoint is `route` without its trailing slash (e.g.
  // `/__cnstudio`); the HTML host is served at `route` (`/__cnstudio/`).
  const configRoute = route.replace(/\/+$/, "");

  const registryPath = () => join(root, studioDir, REGISTRY_FILE);
  const readRegistry = (): RegistryFile =>
    existsSync(registryPath()) ? JSON.parse(readFileSync(registryPath(), "utf8")) : { components: {} };

  const sitePath = () => join(root, studioDir, SITE_FILE);
  const readSite = (): unknown =>
    existsSync(sitePath()) ? JSON.parse(readFileSync(sitePath(), "utf8")) : { components: [] };

  // Example `$ctx` for the canvas (`.studio/dev-context.json`): realistic data so
  // components that read `$ctx` (e.g. a `$ctx.supabase`-driven login form) render
  // while editing. Injected into the canvas host as `window.__CNSTUDIO_DEVCTX__`
  // and provided via `<EnvProvider>` by the runtime. Optional; `{}` when absent.
  const devContextPath = () => join(root, studioDir, "dev-context.json");
  const readDevContext = (): Record<string, unknown> =>
    existsSync(devContextPath()) ? JSON.parse(readFileSync(devContextPath(), "utf8")) : {};

  // On-demand page codegen (opt-in via `options.pages`). A page is generated only
  // when its module is first imported (see resolveId/load), so nothing is emitted
  // during dev until the app actually asks for it.
  const pagesDir = options.pages;
  const pagesAbs = () => join(root, pagesDir!);
  const isPageId = (id: string) => !!pagesDir && id.split("?")[0].startsWith(pagesAbs() + "/");
  // A page id's component name: its path under the pages dir, extension
  // stripped. Component names may be PATH-LIKE (`page/calendar` →
  // `<pagesDir>/page/calendar.tsx`), so this is NOT just the basename.
  const pageName = (id: string): string =>
    relative(pagesAbs(), id.split("?")[0]).replace(/\.(tsx|ts|jsx|js)$/, "");
  /** Generate one design page's `.tsx`, write it to disk (for visibility), return its source. */
  const generatePage = (name: string): string | null => {
    const site = parseSite(readSite());
    const file = makeFiles(site, { root, registry: readRegistry() }, WEB, "web", "", undefined)
      .find((f) => f.path === `${name}.tsx`);
    if (!file) return null; // no design page by that name
    const dest = join(pagesAbs(), `${name}.tsx`);
    // Only write when changed — rewriting identical content would churn the watcher.
    if (!existsSync(dest) || readFileSync(dest, "utf8") !== file.content) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, file.content);
    }
    return file.content;
  };

  // Lazy per-component prop schemas. The registry is generated WITHOUT props (a
  // cheap Babel enumeration — see generateRegistry); the slow TS extraction runs
  // here, for one component at a time, only when the Properties panel asks for it.
  // Cached until a component file changes (`onChange` clears it).
  const propsCache = new Map<string, Record<string, PropSchema> | null>();
  const componentProps = async (name: string): Promise<Record<string, PropSchema> | null> => {
    if (propsCache.has(name)) return propsCache.get(name)!;
    const cfg = (await loadConfig(root).catch(() => ({}))) as { components?: string[]; tsconfig?: string };
    const props = extractComponentProps({ root, components: cfg.components, tsconfig: cfg.tsconfig }, name);
    propsCache.set(name, props);
    return props;
  };

  /**
   * The project config the extension reads from `/__cnstudio`: the resolved
   * `studio.config` value plus the studio dir and the relative paths of the
   * design (`site`) and `registry` files. The extension reads those files from
   * disk, relative to the project folder.
   */
  const serverConfig = async () => {
    const cfg = await loadConfig(root).catch(() => ({}));
    const dir = (cfg as { studioDir?: string }).studioDir ?? studioDir;
    return {
      ...cfg, // functions (codegen `generate`) drop out under JSON.stringify
      root,
      studioDir: dir,
      site: `${dir}/${SITE_FILE}`,
      registry: `${dir}/${REGISTRY_FILE}`,
    };
  };

  return {
    name: "cnstudio",
    enforce: "pre",

    // The canvas host (@cnstudio-io/cnstudio/react) is served from the cnstudio package via
    // @fs, so without deduping it resolves its OWN react while the project's
    // components resolve the project's — two React copies → "Invalid hook call".
    config() {
      return { resolve: { dedupe: ["react", "react-dom"] } };
    },

    configResolved(c) {
      root = c.root;
    },

    async buildStart() {
      // Sync the registry up front so the virtual module — and any page codegen
      // (see `load`) — has the component import map to draw from.
      await syncRegistry(root).catch((e) => this.warn(`registry sync failed: ${e}`));
    },

    resolveId(id) {
      if (id === V_REGISTRY) return resolved(V_REGISTRY);
      if (id === V_ENTRY) return resolved(V_ENTRY);
      // A page import (e.g. `@/generated/home`, alias-resolved to an absolute path
      // under the pages dir) — claim it with a `.tsx` extension even when no file
      // exists yet, so `load` can generate it on first request.
      if (isPageId(id)) {
        const name = pageName(id);
        if (name && !name.startsWith("..")) return join(pagesAbs(), `${name}.tsx`);
      }
    },

    load(id) {
      // The runtime imports this to get `name → real component`. Each component is
      // LAZY (a dynamic import), so only the components a design actually renders
      // get loaded — not all of them — and a broken/optional component can never
      // crash the canvas just by existing. A failed load resolves to a no-op so it
      // doesn't take down the rest of the tree.
      if (id === resolved(V_REGISTRY)) {
        const reg = readRegistry();
        const entries = Object.entries(reg.components);
        // Keyed by the REGISTRY ID (`@/module#Export`) — the qualified form a
        // node's `type` uses to address a code component. Bare names are the
        // design's own namespace (custom components + built-in primitives), so
        // same-named exports from different files never collide here.
        const body = entries
          .map(([id, m]) => {
            const pick = m.import.default ? "m.default" : `m[${JSON.stringify(m.import.name)}]`;
            const loader = `() => import(${JSON.stringify(m.import.module)}).then((m) => ({ default: ${pick} }))`;
            return `  ${JSON.stringify(id)}: { component: L(${loader}), props: ${JSON.stringify(m.props)} }`;
          })
          .join(",\n");
        return (
          `import { lazy } from "react";\n` +
          `const L = (load) => lazy(() => load().catch((e) => { console.error("[cnstudio] component failed to load", e); return { default: () => null }; }));\n` +
          `export default {\n${body}\n};\n`
        );
      }
      // The iframe entry: load the real theme, the canvas-host styles (selection /
      // hover / drop overlays — esbuild emits these as a sibling stylesheet that
      // the JS bundle does NOT auto-inject, so the entry must import it; without it
      // the overlays render but lack `pointer-events: none` and swallow clicks),
      // then the auto-mounting runtime.
      if (id === resolved(V_ENTRY)) {
        const css = options.css ? `import ${JSON.stringify(options.css)};\n` : "";
        return `${css}import "@cnstudio-io/cnstudio/react.css";\nimport "@cnstudio-io/cnstudio/react";\n`;
      }
      // Lazily codegen a design page on first import (and on every site change).
      if (isPageId(id) && id.split("?")[0].endsWith(".tsx")) {
        const src = generatePage(pageName(id));
        if (src != null) return src;
      }
    },

    configureServer(server) {
      // Re-sync the registry when a component file changes (HMR the virtual module).
      const onChange = async (file: string) => {
        // The design model changed → regenerate every page already imported (HMR).
        if (pagesDir && file === sitePath()) {
          for (const mod of server.moduleGraph.idToModuleMap.values()) {
            if (mod.id && isPageId(mod.id) && mod.id.endsWith(".tsx")) server.reloadModule(mod);
          }
          return;
        }
        if (!/components\/.*\.[jt]sx?$/.test(file)) return;
        propsCache.clear(); // a component's props may have changed → re-extract on next ask
        await syncRegistry(root).catch((e) => server.config.logger.warn(`[cnstudio] ${e}`));
        const mod = server.moduleGraph.getModuleById(resolved(V_REGISTRY));
        if (mod) server.reloadModule(mod);
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);

      // `/__cnstudio` → JSON project config (the extension polls this for
      // liveness and to locate the design/registry files); `/__cnstudio/` and
      // below → the injected canvas-host iframe.
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (url === configRoute || url === `${configRoute}/config.json`) {
          void serverConfig().then((cfg) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(cfg));
          });
          return;
        }
        // Lazy prop schema for ONE component (`?name=Button`); the extension's
        // Properties panel calls this when a node is selected. `props` is null if
        // no component by that name exists.
        if (url === `${configRoute}/props`) {
          const name = new URL(req.url ?? "", "http://localhost").searchParams.get("name") ?? "";
          // Built-in studio primitives have no project source — serve their schemas
          // directly (this is also where the Tier-1 `data-source` control on Loop
          // reaches the Properties panel).
          if (primitiveSchemas[name]) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ name, props: primitiveSchemas[name] }));
            return;
          }
          // A qualified id (`@/module#Export`) extracts by its export name — the
          // TS extraction resolves the file itself.
          void componentProps(name.includes("#") ? name.split("#").pop()! : name).then((props) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ name, props }));
          });
          return;
        }
        // The canvas host forwards its console errors/warnings here so they show
        // in THIS terminal (they otherwise only appear in the iframe's devtools).
        if (url === `${configRoute}/log` && req.method === "POST") {
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", () => {
            try {
              const { level, message } = JSON.parse(body) as { level?: string; message?: string };
              const line = `[cnstudio:canvas] ${message ?? ""}`;
              if (level === "warn") server.config.logger.warn(line);
              else server.config.logger.error(line);
            } catch {
              /* ignore malformed log */
            }
            res.statusCode = 204;
            res.end();
          });
          return;
        }
        if (!url.startsWith(route)) return next();
        // Standalone render: `?component=Name` (optionally `&variant=`) makes the
        // page render that component on its own — no editor / postMessage driver —
        // so it can be opened directly in a browser (the "Open in browser" button).
        // The site model is read from disk and injected for the runtime to mount.
        const q = new URL(req.url ?? "", "http://localhost").searchParams;
        const component = q.get("component");
        const standalone = component
          ? `<script>window.__CNSTUDIO_STANDALONE__=${JSON.stringify({
              siteJson: readSite(),
              componentName: component,
              activeVariant: q.get("variant"),
            }).replace(/</g, "\\u003c")};</script>`
          : "";
        // Example `$ctx` for the canvas (so `$ctx`-reading components render with
        // realistic data while editing). Empty object when no dev-context.json.
        const devCtx = `<script>window.__CNSTUDIO_DEVCTX__=${JSON.stringify(readDevContext()).replace(
          /</g,
          "\\u003c"
        )};</script>`;
        // Title the page (the browser tab) after the component so it reads as the
        // component name instead of the raw URL; fall back to the product name.
        const escapeHtml = (s: string) =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const title = component ? escapeHtml(component) : "CnStudio";
        const html =
          `<!doctype html><html><head><meta charset="utf-8" />` +
            `<title>${title}</title>` +
            `<style>html,body,#cnstudio-root{margin:0;height:100%}</style>` +
            // Report load/transform failures (a broken import, a 500'd module) to
            // the embedding canvas tab so it can show an error instead of a blank
            // page. Capture phase catches failed module-script loads.
            `<script>` +
            `window.__cnlog=function(l,m){try{fetch(${JSON.stringify(`${configRoute}/log`)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({level:l,message:m})})}catch(e){}};` +
            `addEventListener('error',function(e){var m=String((e&&e.message)||'Failed to load');parent.postMessage({type:'cnstudio:error',message:m},'*');__cnlog('error',m)},true);` +
            `addEventListener('unhandledrejection',function(e){var m=String(e&&e.reason);parent.postMessage({type:'cnstudio:error',message:m},'*');__cnlog('error',m)});` +
            `</script>${devCtx}${standalone}</head>` +
            `<body><div id="cnstudio-root"></div>` +
            `<script type="module" src="/@id/${V_ENTRY}"></script></body></html>`;
        // Run through Vite's HTML pipeline so plugins inject what they need —
        // critically @vitejs/plugin-react's refresh preamble + the HMR client.
        // (Serving raw HTML skips this → "plugin-react can't detect preamble".)
        void server.transformIndexHtml(req.url ?? route, html).then((out) => {
          res.setHeader("Content-Type", "text/html");
          res.end(out);
        });
      });
    },
  };
}

export default cnstudio;
