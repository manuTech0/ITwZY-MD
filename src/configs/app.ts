import { readFileSync } from "node:fs";
import yaml from "yaml";
import z from "zod";
import { ENV } from "./env";

/* ------------------------------- schema --------------------------------- */

export const AppConfigSchema = z.object({
	profile: z.object({
		botnumber: z.coerce.string(),
	}),
	webhook: z
		.object({
			url: z.string().url(),
		})
		.optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/* ------------------------------- loader --------------------------------- */

export function loadAppConfig(): AppConfig {
	const path = "configs/app.yml";
	const isProd = ENV.NODE_ENV === "production";
	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch (err: any) {
		throw new Error(
			isProd
				? "Configuration file not found"
				: `Failed to read app.yaml: ${err.message}`,
		);
	}

	let parsed: unknown;
	try {
		parsed = yaml.parse(raw);
	} catch (err: any) {
		throw new Error(
			isProd ? "Invalid YAML format" : `YAML parse error: ${err.message}`,
		);
	}

	const result = AppConfigSchema.safeParse(parsed);
	if (!result.success) {
		throw new Error(
			isProd
				? "Configuration validation failed"
				: z.prettifyError(result.error),
		);
	}

	return Object.freeze(result.data);
}

export const appConfig = loadAppConfig();
