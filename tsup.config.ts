import { defineConfig } from "tsup";
export default defineConfig({
	entry: ["src/bootstrap.ts", "src/api/bootstrap.ts"],
	format: "esm",
	target: "node22",
	clean: true,
	sourcemap: false,
	splitting: false,
	bundle: true,
	external: ["yaml", "libsignal", "crypto"],
});
