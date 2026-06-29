import {
  makeFiles,
  reactNativePlatform,
  type CodegenTarget,
  type CodegenTargetOptions,
} from "../../generate/codegen";

/**
 * React Native (iOS) target: one `Name.ios.tsx` per component (Metro keys on the
 * suffix; the import stays `./Name`). The file shape comes from the co-located
 * `template.tsx.tt`; tags/props are mapped for RN.
 */
export function ios(options: CodegenTargetOptions): CodegenTarget {
  const p = reactNativePlatform();
  return {
    platform: "ios",
    out: options.out,
    generate: (site, ctx) =>
      makeFiles(site, ctx, p, "ios", ".ios", options.template),
  };
}
