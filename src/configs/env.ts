import { z } from "zod";

const commonSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	REDIS_URL: z.string(),
	PAIRING_CODE: z.string().transform((val) => val === "true"),
});

const fileAuthState = commonSchema.extend({
	STATE_TYPE: z.literal("file"),
	STATE_PATH: z.string().default("auth_state"),
});
const dbAuthState = commonSchema.extend({
	STATE_TYPE: z.literal("db"),
	DATABASE_URL: z.string(),
});

const envSchema = z.discriminatedUnion("STATE_TYPE", [
	fileAuthState,
	dbAuthState,
]);

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
