import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { syncRegistry, loadConfig, SITE_FILE, REGISTRY_FILE } from "../generate/cli";
import { extractComponentProps } from "../generate/index";
import type { PropSchema, RegistryFile } from "../engine/schema";

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
}

const V_REGISTRY = "virtual:cnstudio/registry";
const V_ENTRY = "virtual:cnstudio/entry";
const resolved = (id: string) => "\0" + id;

/**
 * The cnstudio dev plugin. It (1) runs the generator → `.studio/registry.json` and
 * re-runs it when components change, (2) synthesizes a virtual module that imports
 * the project's REAL components for the runtime, and (3) serves the injected
 * canvas-host entry the Studio extension loads as its iframe.
 *
 * Dev-only (`apply: 'serve'`): production ships the extension-generated `.tsx`.
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
    apply: "serve",
    enforce: "pre",

    // The canvas host (cnstudio/react) is served from the cnstudio package via
    // @fs, so without deduping it resolves its OWN react while the project's
    // components resolve the project's — two React copies → "Invalid hook call".
    config() {
      return { resolve: { dedupe: ["react", "react-dom"] } };
    },

    configResolved(c) {
      root = c.root;
    },

    async buildStart() {
      // Sync the registry up front so the virtual module has something to import.
      // (Registry only — codegen runs solely via `cnstudio generate`.)
      await syncRegistry(root).catch((e) => this.warn(`registry sync failed: ${e}`));
    },

    resolveId(id) {
      if (id === V_REGISTRY) return resolved(V_REGISTRY);
      if (id === V_ENTRY) return resolved(V_ENTRY);
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
        // Keyed by the EXPORT NAME (node.type), not the registry id. Same-named
        // components from different files collide here (last wins at render time);
        // both are kept in registry.json for the extension's library tree.
        const body = entries
          .map(([, m]) => {
            const pick = m.import.default ? "m.default" : `m[${JSON.stringify(m.import.name)}]`;
            const loader = `() => import(${JSON.stringify(m.import.module)}).then((m) => ({ default: ${pick} }))`;
            return `  ${JSON.stringify(m.import.name)}: { component: L(${loader}), props: ${JSON.stringify(m.props)} }`;
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
        return `${css}import "cnstudio/react.css";\nimport "cnstudio/react";\n`;
      }
    },

    configureServer(server) {
      // Re-sync the registry when a component file changes (HMR the virtual module).
      const onChange = async (file: string) => {
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
          void componentProps(name).then((props) => {
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
        const html =
          `<!doctype html><html><head><meta charset="utf-8" />` +
            `<style>html,body,#cnstudio-root{margin:0;height:100%}</style>` +
            // Report load/transform failures (a broken import, a 500'd module) to
            // the embedding canvas tab so it can show an error instead of a blank
            // page. Capture phase catches failed module-script loads.
            `<script>` +
            `window.__cnlog=function(l,m){try{fetch(${JSON.stringify(`${configRoute}/log`)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({level:l,message:m})})}catch(e){}};` +
            `addEventListener('error',function(e){var m=String((e&&e.message)||'Failed to load');parent.postMessage({type:'cnstudio:error',message:m},'*');__cnlog('error',m)},true);` +
            `addEventListener('unhandledrejection',function(e){var m=String(e&&e.reason);parent.postMessage({type:'cnstudio:error',message:m},'*');__cnlog('error',m)});` +
            `</script></head>` +
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
