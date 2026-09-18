// One vitest run for the whole monorepo. The workspace packages point at their
// TypeScript sources so tests resolve without a build first.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@texma-stitch/geometry": resolve(root, "packages/geometry/src/index.ts"),
      "@texma-stitch/engine": resolve(root, "packages/engine/src/index.ts"),
      "@texma-stitch/fonts": resolve(root, "packages/fonts/src/index.ts"),
      "@texma-stitch/formats": resolve(root, "packages/formats/src/index.ts"),
      "@texma-stitch/render": resolve(root, "packages/render/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "test/**/*.test.ts"],
    // Clipper2 loads its WASM on first use — the first test in a worker needs room.
    testTimeout: 20_000,
  },
});
