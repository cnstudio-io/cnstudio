import {
  makeFiles,
  WEB,
  type CodegenTarget,
  type CodegenTargetOptions,
} from "../../generate/codegen";

/**
 * React (DOM) target: one `Name.tsx` per component. The file shape comes from
 * the co-located `template.tsx.tt` (EJS); the generator fills the holes and
 * walks the layer tree. Override the shape with `options.template`.
 */
export function web(options: CodegenTargetOptions): CodegenTarget {
  return {
    platform: "web",
    out: options.out,
    generate: (site, ctx) =>
      makeFiles(site, ctx, WEB, "web", "", options.template),
  };
}
