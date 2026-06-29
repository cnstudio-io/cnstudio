import {
  makeFiles,
  reactNativePlatform,
  type CodegenTarget,
  type CodegenTargetOptions,
} from "../../generate/codegen";

/**
 * React Native (Android) target: one `Name.android.tsx` per component (Metro
 * keys on the suffix; the import stays `./Name`). The file shape comes from the
 * co-located `template.tsx.tt`; tags/props are mapped for RN.
 */
export function android(options: CodegenTargetOptions): CodegenTarget {
  const p = reactNativePlatform();
  return {
    platform: "android",
    out: options.out,
    generate: (site, ctx) =>
      makeFiles(site, ctx, p, "android", ".android", options.template),
  };
}
