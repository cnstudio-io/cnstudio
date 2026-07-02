import { parentPort } from "node:worker_threads";
import { extractComponentProps, locateComponentFile, type GenerateConfig } from "./index";

// Prop-extraction worker. react-docgen-typescript builds a full TypeScript
// program per parse — seconds of CPU-bound work that would otherwise run ON the
// Vite dev server's event loop and stall every module request behind it (the
// canvas iframe's whole page load). Running it here keeps the server responsive;
// the plugin correlates requests by `id`. See vite/index.ts (componentProps).
parentPort!.on("message", ({ id, config, name }: { id: number; config: GenerateConfig; name: string }) => {
  try {
    const file = locateComponentFile(config, name);
    const props = file ? extractComponentProps(config, name, file) : null;
    parentPort!.postMessage({ id, file, props });
  } catch (e) {
    parentPort!.postMessage({ id, props: null, error: String(e) });
  }
});
