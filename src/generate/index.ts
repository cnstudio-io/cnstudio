import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { withCustomConfig } from "react-docgen-typescript";
import { parse as babelParse } from "@babel/parser";
import _traverse from "@babel/traverse";
import { globSync } from "tinyglobby";
import type { ComponentMeta, PropSchema, RegistryFile } from "../engine/schema";

// @babel/traverse ships CJS; interop default.
const traverse = (_traverse as unknown as { default: typeof _traverse }).default ?? _traverse;

export interface GenerateConfig {
  /** Globs of component files to register (default: shadcn ui dir). */
  components?: string[];
  /** Project tsconfig — REQUIRED for VariantProps<typeof …> to resolve (else `any`). */
  tsconfig?: string;
  /** Project root (cwd). */
  root?: string;
}

// Recurse `src/components` so shadcn blocks (installed to `src/components/*.tsx`)
// are registered too, not just the `ui/` primitives.
const DEFAULTS = { components: ["src/components/**/*.tsx"], tsconfig: "./tsconfig.json" };

/**
 * Enumerate `.studio/registry.json` from the project's component source — the
 * import map the runtime needs to render the canvas (export name → module).
 *
 * This is a CHEAP Babel-only pass: it finds the exported PascalCase components
 * but deliberately does NOT extract prop schemas. Prop extraction needs the real
 * TS checker (`react-docgen-typescript`, so `VariantProps<typeof buttonVariants>`
 * expands to real unions) which is an order of magnitude slower — doing it for
 * every component at boot is wasted work, since the runtime only needs `import`.
 * Schemas are extracted lazily, per-component, via {@link extractComponentProps}
 * when the Properties panel actually asks for one.
 */
export function generateRegistry(config: GenerateConfig = {}): RegistryFile {
  const root = config.root ?? process.cwd();
  const globs = config.components ?? DEFAULTS.components;
  const files = globSync(globs, { cwd: root, absolute: true });

  // Keyed by a UNIQUE id (`module#name`), not the bare export name — two files can
  // export the same name (e.g. ui/avatar.tsx and ui/8bit/avatar.tsx both export
  // `Avatar`); keying by name would let one overwrite the other.
  const components: Record<string, ComponentMeta> = {};
  for (const file of files) {
    const module = moduleSpecifier(root, file);
    for (const { name, default: isDefault } of enumerateExports(file)) {
      components[`${module}#${name}`] = {
        import: { module, name, ...(isDefault ? { default: true } : {}) },
        props: {}, // populated lazily — see extractComponentProps
        displayName: name,
      };
    }
  }
  return { components };
}

/**
 * Lazily extract ONE component's prop schema with the real TS checker — the slow
 * path {@link generateRegistry} skips. Locates the file that exports `name` (last
 * match wins, matching the runtime registry's name-keying), parses just that file,
 * and recovers destructuring defaults (`variant = "default"`) the checker misses.
 * Returns null if no component exports `name`. Called on demand by the dev
 * plugin's `/__cnstudio/props` route when the Properties panel selects a node.
 */
export function extractComponentProps(config: GenerateConfig, name: string): Record<string, PropSchema> | null {
  const root = config.root ?? process.cwd();
  const tsconfig = config.tsconfig ?? DEFAULTS.tsconfig;
  const files = globSync(config.components ?? DEFAULTS.components, { cwd: root, absolute: true });

  let target: string | undefined;
  for (const file of files) {
    if (enumerateExports(file).some((c) => c.name === name)) target = file;
  }
  if (!target) return null;

  const doc = makeParser(tsconfig)
    .parse(target)
    .find((d) => d.displayName === name);
  if (!doc) return {}; // e.g. an anonymous default export the checker can't name
  const defaults = destructuringDefaults(target)[name];
  const props: Record<string, PropSchema> = {};
  for (const [pname, info] of Object.entries(doc.props)) {
    const schema = toPropSchema(pname, info as unknown as DocProp, defaults?.[pname]);
    if (schema) props[pname] = schema;
  }
  return props;
}

/** react-docgen-typescript configured to expand variant/size unions and drop native HTML attrs. */
function makeParser(tsconfig: string) {
  return withCustomConfig(tsconfig, {
    shouldExtractLiteralValuesFromEnum: true, // variant/size unions → enum option list
    shouldExtractValuesFromUnion: true,
    // Drop the flood of native button attrs from React.ComponentProps<"button">.
    propFilter: (prop) =>
      prop.declarations?.length
        ? prop.declarations.some((d) => !d.fileName.includes("node_modules"))
        : !prop.parent || !prop.parent.fileName.includes("node_modules"),
  });
}

/** Merge a freshly generated registry over the existing one, preserving hand edits. */
export function mergeRegistry(prev: RegistryFile | null, next: RegistryFile): RegistryFile {
  if (!prev) return next;
  const components = { ...next.components };
  for (const [name, prevMeta] of Object.entries(prev.components)) {
    const nextMeta = components[name];
    if (!nextMeta) continue; // component removed from source → drop
    // Per-prop: a hand-authored prop the extractor didn't produce is preserved;
    // shared keys keep the generated shape but the existing `default`/`label`.
    const props: Record<string, PropSchema> = { ...nextMeta.props };
    for (const [pk, pv] of Object.entries(prevMeta.props)) {
      props[pk] = props[pk] ? ({ ...props[pk], ...pick(pv, ["default", "label"]) } as PropSchema) : pv;
    }
    components[name] = { ...nextMeta, props, displayName: prevMeta.displayName ?? nextMeta.displayName };
  }
  return { components };
}

// ——— helpers ———

type DocProp = { type: { name: string; value?: Array<{ value: string }> }; required: boolean; defaultValue?: { value: unknown } | null };

function toPropSchema(name: string, info: DocProp, babelDefault: unknown): PropSchema | null {
  if (name === "children") return { type: "slot" };
  const def = babelDefault ?? info.defaultValue?.value;
  const t = info.type?.name;

  if (t === "enum" && info.type.value) {
    const raw = info.type.value.map((v) => v.value);
    const vals = raw.map((v) => v.replace(/^['"]|['"]$/g, ""));
    // boolean dressed as enum
    if (vals.every((v) => v === "true" || v === "false")) {
      return { type: "boolean", default: typeof def === "boolean" ? def : undefined };
    }
    const options = vals.filter((v) => v !== "undefined" && v !== "null");
    return { type: "enum", options, default: def != null ? String(def) : undefined };
  }
  if (t === "boolean") return { type: "boolean", default: typeof def === "boolean" ? def : undefined };
  if (t === "number") return { type: "number", default: typeof def === "number" ? def : undefined };
  if (t === "string") return { type: "string", default: def != null ? String(def) : undefined };
  // Unhandled (functions, objects, ReactNode-ish): skip rather than emit junk.
  return null;
}

/** A component name is PascalCase (drops cva/helpers like `buttonVariants`, `cn`). */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/** kebab/snake filename → PascalCase (for anonymous default exports). */
function pascalFromFile(file: string): string {
  const base = file.replace(/\\/g, "/").split("/").pop()!.replace(/\.[jt]sx?$/, "");
  return base.split(/[-_.]/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join("");
}

/**
 * Cheap Babel pass: the PascalCase components a file exports (named + default).
 * `export function Foo` / `export const Foo = …` / `export { Foo }` (local only —
 * `export { Foo } from "./x"` re-exports are left to the file that declares Foo,
 * matching the old react-docgen behaviour). The default export is named from its
 * declaration, or PascalCase of the filename when anonymous (forwardRef/memo/arrow).
 */
function enumerateExports(file: string): { name: string; default?: boolean }[] {
  const ast = babelParse(readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx", "typescript"] });
  const named = new Set<string>();
  let def: string | undefined;
  traverse(ast, {
    ExportNamedDeclaration(path: any) {
      const d = path.node.declaration;
      if (d?.type === "FunctionDeclaration" && d.id?.name) named.add(d.id.name);
      else if (d?.type === "VariableDeclaration") {
        for (const decl of d.declarations) if (decl.id?.type === "Identifier") named.add(decl.id.name);
      } else if (!d && !path.node.source) {
        for (const s of path.node.specifiers) {
          if (s.type !== "ExportSpecifier" || !s.exported?.name) continue;
          if (s.exported.name === "default")
            def = s.local?.name ?? def; // `export { Foo as default }`
          else named.add(s.exported.name);
        }
      }
    },
    ExportDefaultDeclaration(path: any) {
      const d = path.node.declaration;
      if (d.type === "FunctionDeclaration" && d.id) def = d.id.name;
      else if (d.type === "Identifier") def = d.name;
      else def = pascalFromFile(file); // arrow / forwardRef(...) / memo(...) / anonymous fn
    },
  });
  const out: { name: string; default?: boolean }[] = [];
  for (const n of named) if (isComponentName(n)) out.push({ name: n });
  if (def && isComponentName(def) && !named.has(def)) out.push({ name: def, default: true });
  return out;
}

/** Babel pass: `{ variant = "default", size = "default" }` → { Component?: { variant: "default" } }. */
function destructuringDefaults(file: string): Record<string, Record<string, unknown>> {
  const code = readFileSync(file, "utf8");
  const ast = babelParse(code, { sourceType: "module", plugins: ["jsx", "typescript"] });
  const out: Record<string, Record<string, unknown>> = {};
  const record = (name: string | undefined, params: unknown) => {
    if (!name) return;
    const param = Array.isArray(params) ? (params[0] as { type?: string; properties?: unknown[] }) : undefined;
    if (!param || param.type !== "ObjectPattern") return;
    const defs: Record<string, unknown> = {};
    for (const p of param.properties as Array<{ type: string; key?: { name?: string }; value?: { type: string; right?: { value?: unknown } } }>) {
      if (p.type === "ObjectProperty" && p.value?.type === "AssignmentPattern" && p.key?.name) {
        defs[p.key.name] = p.value.right?.value;
      }
    }
    if (Object.keys(defs).length) out[name] = defs;
  };
  traverse(ast, {
    FunctionDeclaration(path: any) {
      record(path.node.id?.name, path.node.params);
    },
    VariableDeclarator(path: any) {
      const init = path.node.init;
      if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
        record(path.node.id?.name, init.params);
      }
    },
  });
  return out;
}

/** Map a component file path to the project's import specifier (assumes `@/` → src/). */
function moduleSpecifier(root: string, file: string): string {
  const rel = relative(root, file).replace(/\\/g, "/").replace(/\.[jt]sx?$/, "");
  // TODO: read tsconfig `paths` to resolve the real alias (Next uses `@/*` → `./*`).
  return rel.startsWith("src/") ? `@/${rel.slice(4)}` : `./${rel}`;
}

function pick<T extends object>(o: T, keys: string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in o) out[k] = (o as Record<string, unknown>)[k];
  return out as Partial<T>;
}
