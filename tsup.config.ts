import { defineConfig } from "tsup"
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node22",
  clean: true,
  sourcemap: false,
  splitting: false,
  bundle: true,
  noExternal: ["baileysauth"],
  external: ["yaml", "libsignal", "crypto"]
})
