import { readFileSync } from "node:fs";
import ms, { type StringValue } from "ms";
import yaml from "yaml";
import z from "zod";
import { ENV } from "./env";
/* -------------------------------- utils -------------------------------- */

export const isMsFormat = (val: string): val is StringValue => {
	try {
		return ms(val as StringValue) !== undefined;
	} catch {
		return false;
	}
};

/* ------------------------------- schema --------------------------------- */

export const AppConfigSchema = z.object({
	profile: z.object({
		botnumber: z.coerce.string(),
		adminnumber: z.coerce.string(),
	}),
	settings: z.object({
		adminOnly: z.coerce.boolean(),
		prefix: z.coerce.string().default(".")
	}),
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

export const WEB_VERSION = 1;

// INFO: Ganti ke prodya untuk menonaktifkan stack error dan devya untuk mengaktifkan
export const isDev: "devya" | "prodya" = "devya";

export const appConfig = loadAppConfig();
