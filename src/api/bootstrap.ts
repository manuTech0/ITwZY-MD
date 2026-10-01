import "dotenv/config";
import { ENV } from "../configs/env";
import { logger } from "../infra/logger";
import { buildApiServer } from "./server";

const app = await buildApiServer();

try {
	const address = await app.listen({ port: ENV.API_PORT, host: ENV.API_HOST });
	logger.info(`API listening on ${address}`);
	logger.info(`Routes registered:\n${app.printRoutes()}`);
} catch (e) {
	logger.error(e);
	process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		void app.close().then(() => process.exit(0));
	});
}
