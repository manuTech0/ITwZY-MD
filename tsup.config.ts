import { defineConfig } from "tsup";
export default defineConfig([
	{
		entry: ["src/index.ts"],
		format: "esm",
		target: "node22",
		clean: true,
		sourcemap: true,
		splitting: false,
		bundle: true,
		external: ["yaml", "better-sqlite3"],
		outDir: "dist",
	},
]);
