// Bun bundler plugin for the stylesheet.
//
// Bun's CSS bundler treats every `url()` as a build input and fails on
// root-absolute paths ("Could not resolve: /cursors/point.cur"). Those paths
// are runtime-served by Bun.serve (cursors from public/, sprites from /wz), so
// we mark them `external` — the bundler leaves them alone and the browser
// resolves them against the origin at runtime.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { BunPlugin } from "bun";

const tailwind: BunPlugin = {
  name: "tailwind-css",
  setup(build) {
    // Any url(/...) or src="/..." that is root-absolute is served at runtime.
    build.onResolve({ filter: /^\// }, (args) => {
      if (args.importer.endsWith(".css") || args.importer.endsWith(".html")) {
        return { path: args.path, external: true };
      }
      return undefined;
    });

    build.onLoad({ filter: /\.css$/ }, (args) => {
      const src = readFileSync(args.path, "utf8");
      if (!src.includes('@import "tailwindcss"')) {
        return { contents: src, loader: "css" };
      }
      // Write temp files inside the project root so tailwindcss CLI can
      // resolve the `tailwindcss` package from node_modules.
      const dir = mkdtempSync(join(resolve(import.meta.dir), ".tw-"));
      const input = join(dir, "in.css");
      const output = join(dir, "out.css");
      writeFileSync(input, src);
      const r = spawnSync(
        "bunx",
        ["@tailwindcss/cli", "-i", input, "-o", output, "--minify"],
        { cwd: resolve(import.meta.dir), encoding: "utf8" },
      );
      let result: string;
      if (r.status !== 0) {
        console.error("[tailwind] compile failed:", (r.stderr ?? "").slice(0, 500));
        result = src;
      } else {
        result = readFileSync(output, "utf8");
      }
      rmSync(dir, { recursive: true, force: true });
      return { contents: result, loader: "css" };
    });
  },
};

export default tailwind;
