import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	REDIS_URL: z.string(),
	PAIRING_CODE: z.string().transform((val) => val === "true"),
	STATE_PATH: z.string().default("auth_state"),
	API_HOST: z.string().default("0.0.0.0"),
	API_PORT: z.coerce.number().default(3000),
	WEBHOOK_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export async function loadEnv(): Promise<Env> {
	if (process.env.NODE_ENV !== "production") {
		const dotenv = await import("dotenv");
		dotenv.config({
			debug: false,
		});
	}

	const parsed = envSchema.safeParse(process.env);
	if (!parsed.success) {
		console.error("❌ Invalid environment variables");
		console.error(z.prettifyError(parsed.error));
		process.exit(1);
	}

	return Object.freeze(parsed.data);
}

export const ENV = await loadEnv();
