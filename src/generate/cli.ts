#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generateRegistry, mergeRegistry } from "./index";
import { runCodegen, type CodegenTarget } from "./codegen";
import { parseSite } from "../engine/model";
import type { RegistryFile } from "../engine/schema";

/**
 * Extract the registry from the project's components and write
 * `.studio/registry.json` (non-destructively merged). This is the ONLY thing the
 * Vite plugin runs (on boot + when components change) — it does NOT run codegen.
 */
export async function syncRegistry(
  root = process.cwd()
): Promise<{ out: string; config: StudioConfig; registry: RegistryFile }> {
  const config = await loadConfig(root);
  const studioDir = resolve(root, config.studioDir ?? ".studio");
  const out = join(studioDir, REGISTRY_FILE);

  const next = generateRegistry({ root, components: config.components, tsconfig: config.tsconfig });
  const prev: RegistryFile | null = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  const registry = mergeRegistry(prev, next);

  mkdirSync(studioDir, { recursive: true });
  writeFileSync(out, JSON.stringify(registry, null, 2) + "\n");
  return { out, config, registry };
}

/**
 * `npx cnstudio generate` — sync the registry, then emit platform code from the
 * design model. Codegen runs ONLY here (explicit invocation), never on dev boot.
 */
export async function run(root = process.cwd()): Promise<string> {
  const { out, config, registry } = await syncRegistry(root);

  if (config.codegen?.length) {
    const studioDir = resolve(root, config.studioDir ?? ".studio");
    const sitePath = join(studioDir, SITE_FILE);
    if (existsSync(sitePath)) {
      const site = parseSite(JSON.parse(readFileSync(sitePath, "utf8")));
      // Pass the registry so codegen can resolve code-component imports.
      const files = runCodegen(site, config.codegen, { root, registry });
      console.log(`[cnstudio] codegen wrote ${files.length} file(s)`);
    } else {
      console.warn(`[cnstudio] codegen skipped: no design at ${sitePath}`);
    }
  }
  return out;
}

/** The design document file inside `studioDir` (a serialized `Site`). */
export const SITE_FILE = "site.json";
/** The generated registry file inside `studioDir`. */
export const REGISTRY_FILE = "registry.json";

export interface StudioConfig {
  components?: string[];
  tsconfig?: string;
  studioDir?: string;
  codegen?: CodegenTarget[];
}

/** Load a project's `studio.config.{js,mjs}` (its default export), or `{}`. */
export async function loadConfig(root: string): Promise<StudioConfig> {
  for (const name of ["studio.config.js", "studio.config.mjs"]) {
    const p = join(root, name);
    if (existsSync(p)) {
      const mod = await import(pathToFileURL(p).href);
      return (mod.default ?? mod) as StudioConfig;
    }
  }
  return {};
}

// Run when invoked as a binary.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run()
    .then((out) => console.log(`[cnstudio] wrote ${out}`))
    .catch((e) => {
      console.error("[cnstudio] generate failed:", e);
      process.exit(1);
    });
}

void dirname; // (reserved for future relative resolution)
