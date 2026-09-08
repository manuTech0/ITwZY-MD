import "dotenv/config";
import { logger } from "./infra/logger";
import { createWorkers } from "./queue";
import { createWaConnection } from "./wa/connection";
import { MessageHandler } from "./wa/handler";

try {
	const sock = await createWaConnection();
	const handler = new MessageHandler(sock);
	createWorkers(handler);
} catch (e) {
	logger.error(e);
	process.exit(1);
}
