/** Side-effect CSS imports (e.g. `import "./host.css"`) — esbuild bundles these. */
declare module "*.css";

/** The virtual module the cnstudio Vite plugin provides (see src/vite/index.ts). */
declare module "virtual:cnstudio/registry" {
  import type { RuntimeRegistry } from "../engine/schema";
  const registry: RuntimeRegistry;
  export default registry;
}
