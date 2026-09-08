import "dotenv/config";
import { ENV } from "../configs/env";
import { logger } from "../infra/logger";
import { buildApiServer } from "./server";

const app = await buildApiServer();

try {
	await app.listen({ port: ENV.API_PORT, host: ENV.API_HOST });
} catch (e) {
	logger.error(e);
	process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		void app.close().then(() => process.exit(0));
	});
}
