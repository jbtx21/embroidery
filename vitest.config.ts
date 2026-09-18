// Ein Vitest-Lauf fuer das ganze Monorepo. Die Workspace-Pakete zeigen auf ihre
// TS-Quelle, damit Tests ohne vorherigen Build aufloesen (Muster aus dem ERP).
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@texma-stitch/geometry": resolve(root, "packages/geometry/src/index.ts"),
      "@texma-stitch/engine": resolve(root, "packages/engine/src/index.ts"),
      "@texma-stitch/formats": resolve(root, "packages/formats/src/index.ts"),
      "@texma-stitch/render": resolve(root, "packages/render/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts"],
    // Clipper2 laedt WASM beim ersten Zugriff — der erste Test eines Workers
    // braucht dafuer Luft.
    testTimeout: 20_000,
  },
});
